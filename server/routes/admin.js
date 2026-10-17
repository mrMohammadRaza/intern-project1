const express = require('express');
const router = express.Router();
const { db } = require('../db');
const authenticateToken = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { isStrictPositiveInteger, parseStrictInteger } = require('../middleware/validate');

// Enforce admin authentication on all admin endpoints
router.use(authenticateToken, adminOnly);

/**
 * GET /api/admin/stats
 * Admin dashboard aggregated business metrics
 * Total sales is computed from non-cancelled orders: WHERE status != 'Cancelled'
 */
router.get('/stats', (req, res) => {
    try {
        const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
        const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
        const totalCustomers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'customer'").get().count;
        
        // Sales revenue excludes Cancelled orders
        const salesRow = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE status != 'Cancelled'").get();
        const totalSales = salesRow.total;

        // Low stock count (stock < 5)
        const lowStockCount = db.prepare("SELECT COUNT(*) as count FROM products WHERE stock < 5 AND is_active = 1").get().count;

        // Breakdown by order status
        const statusBreakdown = db.prepare(`
            SELECT status, COUNT(*) as count 
            FROM orders 
            GROUP BY status
        `).all();

        // 5 most recent orders
        const recentOrders = db.prepare(`
            SELECT 
                o.id,
                o.total_amount,
                o.status,
                o.created_at,
                u.name as customer_name,
                u.email as customer_email
            FROM orders o
            JOIN users u ON o.user_id = u.id
            ORDER BY o.created_at DESC
            LIMIT 5
        `).all();

        return res.status(200).json({
            stats: {
                total_products: totalProducts,
                total_orders: totalOrders,
                total_customers: totalCustomers,
                total_sales: totalSales, // in paise
                low_stock_count: lowStockCount,
                status_breakdown: statusBreakdown,
                recent_orders: recentOrders
            }
        });
    } catch (err) {
        console.error('Error fetching admin statistics:', err);
        return res.status(500).json({ error: 'Failed to retrieve dashboard statistics.' });
    }
});

/**
 * GET /api/admin/orders
 * Admin: View all customer orders with customer details and filters
 */
router.get('/orders', (req, res) => {
    try {
        const { status, search } = req.query;

        const conditions = [];
        const params = [];

        if (status && ['Placed', 'Shipped', 'Delivered', 'Cancelled'].includes(status)) {
            conditions.push('o.status = ?');
            params.push(status);
        }

        if (search && search.trim() !== '') {
            conditions.push('(u.name LIKE ? OR u.email LIKE ? OR CAST(o.id AS TEXT) = ?)');
            const term = `%${search.trim()}%`;
            params.push(term, term, search.trim());
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
            SELECT 
                o.id,
                o.user_id,
                o.total_amount,
                o.status,
                o.shipping_name,
                o.shipping_phone,
                o.shipping_address,
                o.shipping_city,
                o.shipping_pincode,
                o.payment_method,
                o.created_at,
                u.name as customer_name,
                u.email as customer_email,
                COUNT(oi.id) as item_count
            FROM orders o
            JOIN users u ON o.user_id = u.id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            ${whereClause}
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `;

        const orders = db.prepare(query).all(...params);

        return res.status(200).json({ orders });
    } catch (err) {
        console.error('Error fetching admin orders:', err);
        return res.status(500).json({ error: 'Failed to retrieve orders.' });
    }
});

/**
 * PATCH /api/admin/orders/:id/status
 * Admin: Update order status with lifecycle flow validation
 * Permitted status flow: Placed -> Shipped -> Delivered
 * If order is cancelled, restores stock transactionally
 */
router.patch('/orders/:id/status', (req, res) => {
    try {
        if (!isStrictPositiveInteger(req.params.id)) {
            return res.status(400).json({ error: 'Invalid order ID.' });
        }
        const orderId = parseStrictInteger(req.params.id);

        const { status } = req.body;
        const validStatuses = ['Placed', 'Shipped', 'Delivered', 'Cancelled'];

        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }

        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
        if (!order) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        // Validate state transitions
        const VALID_TRANSITIONS = {
            'Placed': ['Shipped', 'Cancelled'],
            'Shipped': ['Delivered', 'Cancelled'],
            'Delivered': [],
            'Cancelled': []
        };

        if (order.status === status) {
            return res.status(200).json({
                message: `Order status is already "${status}".`,
                order
            });
        }

        if (order.status === 'Delivered') {
            return res.status(400).json({
                error: 'Delivered orders cannot be altered or reopened.'
            });
        }

        if (order.status === 'Cancelled') {
            return res.status(400).json({
                error: 'Cancelled orders cannot be altered or reopened.'
            });
        }

        const allowedNext = VALID_TRANSITIONS[order.status] || [];
        if (!allowedNext.includes(status)) {
            return res.status(400).json({
                error: `Invalid status transition from "${order.status}" to "${status}".`
            });
        }

        // If cancelling, restore stock atomically
        if (status === 'Cancelled') {
            const cancelTx = db.transaction(() => {
                const updateRes = db.prepare("UPDATE orders SET status = 'Cancelled' WHERE id = ? AND status != 'Cancelled'").run(orderId);
                if (updateRes.changes === 0) {
                    throw new Error('Order is already cancelled.');
                }
                const items = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(orderId);
                const restoreStmt = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
                for (const item of items) {
                    restoreStmt.run(item.quantity, item.product_id);
                }
            });
            cancelTx();
        } else {
            db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, orderId);
        }

        const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);

        return res.status(200).json({
            message: `Order #${orderId} status successfully updated to "${status}".`,
            order: updatedOrder
        });
    } catch (err) {
        console.error('Error updating order status:', err);
        return res.status(500).json({ error: 'Failed to update order status.' });
    }
});

module.exports = router;
