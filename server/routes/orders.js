const express = require('express');
const router = express.Router();
const { db } = require('../db');
const authenticateToken = require('../middleware/auth');
const customerOnly = require('../middleware/customerOnly');
const { isValidPhone, isValidPincode, isStrictPositiveInteger, parseStrictInteger } = require('../middleware/validate');

/**
 * POST /api/orders
 * Customer: Place a new Cash on Delivery order from cart
 * Uses SQLite transaction for atomic order creation, stock deduction, and cart clearing.
 */
router.post('/', authenticateToken, customerOnly, (req, res) => {
    try {
        const userId = req.user.id;
        const { shipping_name, shipping_phone, shipping_address, shipping_city, shipping_pincode } = req.body;

        // Validation of shipping fields
        if (!shipping_name || typeof shipping_name !== 'string' || shipping_name.trim().length < 2) {
            return res.status(400).json({ error: 'Recipient full name is required (minimum 2 characters).' });
        }

        if (!shipping_phone || !isValidPhone(shipping_phone)) {
            return res.status(400).json({ error: 'Valid 10-digit delivery phone number is required.' });
        }

        if (!shipping_address || typeof shipping_address !== 'string' || shipping_address.trim().length < 5) {
            return res.status(400).json({ error: 'Detailed delivery address is required (minimum 5 characters).' });
        }

        if (!shipping_city || typeof shipping_city !== 'string' || shipping_city.trim().length < 2) {
            return res.status(400).json({ error: 'City is required.' });
        }

        if (!shipping_pincode || !isValidPincode(shipping_pincode)) {
            return res.status(400).json({ error: 'Valid 6-digit postal PIN code is required.' });
        }

        // Fetch user's cart items from SQLite
        const cartItems = db.prepare(`
            SELECT 
                ci.id as cart_item_id,
                ci.product_id,
                ci.quantity,
                p.name,
                p.price as current_unit_price,
                p.stock as current_stock,
                p.is_active
            FROM cart_items ci
            JOIN products p ON ci.product_id = p.id
            WHERE ci.user_id = ?
        `).all(userId);

        if (!cartItems || cartItems.length === 0) {
            return res.status(400).json({ error: 'Your cart is empty. Add products before placing an order.' });
        }

        // Validate stock and active status for each item
        for (const item of cartItems) {
            if (item.is_active !== 1) {
                return res.status(400).json({
                    error: `Product "${item.name}" is currently inactive. Please remove it from your cart before proceeding.`
                });
            }

            if (item.current_stock < item.quantity) {
                return res.status(409).json({
                    error: `Insufficient stock for "${item.name}". Requested: ${item.quantity}, Available: ${item.current_stock}. Please update your cart.`
                });
            }
        }

        // Compute total amount in paise from verified database unit prices
        let totalAmountPaise = 0;
        for (const item of cartItems) {
            totalAmountPaise += item.current_unit_price * item.quantity;
        }

        // Execute Transaction
        const placeOrderTransaction = db.transaction(() => {
            // 1. Insert into orders table
            const insertOrderStmt = db.prepare(`
                INSERT INTO orders (
                    user_id, total_amount, status, shipping_name, shipping_phone,
                    shipping_address, shipping_city, shipping_pincode, payment_method
                ) VALUES (?, ?, 'Placed', ?, ?, ?, ?, ?, 'Cash on Delivery')
            `);

            const orderResult = insertOrderStmt.run(
                userId,
                totalAmountPaise,
                shipping_name.trim(),
                shipping_phone.toString().trim(),
                shipping_address.trim(),
                shipping_city.trim(),
                shipping_pincode.toString().trim()
            );

            const orderId = orderResult.lastInsertRowid;

            // 2. Insert into order_items and deduct stock
            const insertItemStmt = db.prepare(`
                INSERT INTO order_items (order_id, product_id, quantity, unit_price)
                VALUES (?, ?, ?, ?)
            `);

            const updateStockStmt = db.prepare(`
                UPDATE products 
                SET stock = stock - ? 
                WHERE id = ? AND stock >= ?
            `);

            for (const item of cartItems) {
                insertItemStmt.run(orderId, item.product_id, item.quantity, item.current_unit_price);

                const updateResult = updateStockStmt.run(item.quantity, item.product_id, item.quantity);
                if (updateResult.changes === 0) {
                    throw new Error(`Stock conflict during checkout for product "${item.name}". Please try again.`);
                }
            }

            // 3. Clear user's cart
            db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);

            return orderId;
        });

        // Run the transaction atomically
        const newOrderId = placeOrderTransaction();

        // Fetch placed order details to return
        const createdOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(newOrderId);
        const orderItems = db.prepare(`
            SELECT oi.*, p.name, p.image_url 
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ?
        `).all(newOrderId);

        return res.status(201).json({
            message: 'Order placed successfully! Cash on Delivery.',
            order: {
                ...createdOrder,
                items: orderItems
            }
        });
    } catch (err) {
        console.error('Error placing order (technical details):', err);
        const isConflict = err.message && (err.message.includes('Stock conflict') || err.message.includes('Insufficient stock'));
        return res.status(isConflict ? 409 : 500).json({
            error: isConflict ? err.message : 'Unable to complete checkout. Please review your cart and try again.'
        });
    }
});

/**
 * GET /api/orders
 * Customer: Retrieve order history for current customer
 */
router.get('/', authenticateToken, customerOnly, (req, res) => {
    try {
        const userId = req.user.id;

        const orders = db.prepare(`
            SELECT 
                o.id,
                o.total_amount,
                o.status,
                o.shipping_name,
                o.shipping_city,
                o.payment_method,
                o.created_at,
                COUNT(oi.id) as item_count
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            WHERE o.user_id = ?
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `).all(userId);

        return res.status(200).json({ orders });
    } catch (err) {
        console.error('Error fetching customer orders:', err);
        return res.status(500).json({ error: 'Failed to retrieve order history.' });
    }
});

/**
 * GET /api/orders/:id
 * Customer / Admin: Get detailed order information
 * Enforces ownership: customers can only view their own orders
 */
router.get('/:id', authenticateToken, (req, res) => {
    try {
        if (!isStrictPositiveInteger(req.params.id)) {
            return res.status(400).json({ error: 'Invalid order ID.' });
        }
        const orderId = parseStrictInteger(req.params.id);

        const order = db.prepare(`
            SELECT o.*, u.email as user_email, u.name as customer_name
            FROM orders o
            JOIN users u ON o.user_id = u.id
            WHERE o.id = ?
        `).get(orderId);

        if (!order) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        // Ownership enforcement
        if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied. You can only view your own orders.' });
        }

        const items = db.prepare(`
            SELECT 
                oi.id,
                oi.product_id,
                oi.quantity,
                oi.unit_price,
                (oi.quantity * oi.unit_price) as line_total,
                p.name as product_name,
                p.image_url
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ?
        `).all(orderId);

        return res.status(200).json({
            order: {
                ...order,
                items
            }
        });
    } catch (err) {
        console.error('Error fetching order details:', err);
        return res.status(500).json({ error: 'Failed to retrieve order details.' });
    }
});

/**
 * PATCH /api/orders/:id/cancel
 * Optional P3 Feature: Customer cancellation with transactional stock restoration
 * Allowed only when order status is 'Placed' and belongs to current customer
 */
router.patch('/:id/cancel', authenticateToken, customerOnly, (req, res) => {
    try {
        if (!isStrictPositiveInteger(req.params.id)) {
            return res.status(400).json({ error: 'Invalid order ID.' });
        }
        const orderId = parseStrictInteger(req.params.id);

        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
        if (!order) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        // Must belong to user (or admin)
        if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        if (order.status !== 'Placed') {
            return res.status(400).json({
                error: `Order cannot be cancelled because it is already marked as "${order.status}". Cancellation is only allowed for orders in "Placed" status.`
            });
        }

        // Transaction to cancel order and restore product stock
        const cancelTransaction = db.transaction(() => {
            // Update order status atomically with check
            const updateRes = db.prepare("UPDATE orders SET status = 'Cancelled' WHERE id = ? AND status = 'Placed'").run(orderId);
            if (updateRes.changes === 0) {
                throw new Error('Order is no longer in Placed status or has already been cancelled.');
            }

            // Fetch items to restore stock
            const items = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(orderId);

            const restoreStockStmt = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
            for (const item of items) {
                restoreStockStmt.run(item.quantity, item.product_id);
            }
        });

        try {
            cancelTransaction();
        } catch (txErr) {
            return res.status(400).json({ error: txErr.message || 'Order cannot be cancelled.' });
        }

        return res.status(200).json({
            message: 'Order cancelled successfully. Product stock has been restored.',
            order_id: orderId,
            status: 'Cancelled'
        });
    } catch (err) {
        console.error('Error cancelling order:', err);
        return res.status(500).json({ error: 'Failed to cancel order.' });
    }
});

module.exports = router;
