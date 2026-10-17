const express = require('express');
const router = express.Router();
const { db } = require('../db');
const authenticateToken = require('../middleware/auth');
const customerOnly = require('../middleware/customerOnly');
const { isStrictPositiveInteger, parseStrictInteger } = require('../middleware/validate');

/**
 * GET /api/cart
 * Customer: Retrieve current user's shopping cart with recalculated totals
 */
router.get('/', authenticateToken, customerOnly, (req, res) => {
    try {
        const userId = req.user.id;

        const query = `
            SELECT 
                ci.id,
                ci.product_id,
                ci.quantity,
                p.name,
                p.description,
                p.price as current_unit_price,
                p.stock as available_stock,
                p.image_url,
                p.is_active,
                c.name as category_name
            FROM cart_items ci
            JOIN products p ON ci.product_id = p.id
            JOIN categories c ON p.category_id = c.id
            WHERE ci.user_id = ?
            ORDER BY ci.created_at DESC
        `;

        const rows = db.prepare(query).all(userId);

        let totalAmountPaise = 0;
        let totalItemsCount = 0;

        const items = rows.map(item => {
            const lineTotal = item.current_unit_price * item.quantity;
            totalAmountPaise += lineTotal;
            totalItemsCount += item.quantity;

            return {
                id: item.id,
                product_id: item.product_id,
                name: item.name,
                description: item.description,
                unit_price: item.current_unit_price,
                quantity: item.quantity,
                line_total: lineTotal,
                available_stock: item.available_stock,
                is_active: item.is_active === 1,
                is_in_stock: item.available_stock > 0 && item.available_stock >= item.quantity,
                category_name: item.category_name,
                image_url: item.image_url
            };
        });

        return res.status(200).json({
            items,
            total_items: totalItemsCount,
            total_amount: totalAmountPaise
        });
    } catch (err) {
        console.error('Error fetching cart:', err);
        return res.status(500).json({ error: 'Failed to retrieve cart items.' });
    }
});

/**
 * POST /api/cart
 * Customer: Add product to cart or increment quantity if already present
 */
router.post('/', authenticateToken, customerOnly, (req, res) => {
    try {
        const userId = req.user.id;
        const { product_id, quantity = 1 } = req.body;

        if (!isStrictPositiveInteger(product_id)) {
            return res.status(400).json({ error: 'Valid product ID is required.' });
        }
        const productId = parseStrictInteger(product_id);

        if (!isStrictPositiveInteger(quantity)) {
            return res.status(400).json({ error: 'Quantity must be a positive integer.' });
        }
        const qtyToAdd = parseStrictInteger(quantity);

        // Fetch product and check active state & stock
        const product = db.prepare('SELECT id, name, price, stock, is_active FROM products WHERE id = ?').get(productId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        if (product.is_active !== 1) {
            return res.status(400).json({ error: 'This product is currently inactive and cannot be purchased.' });
        }

        if (product.stock <= 0) {
            return res.status(400).json({ error: 'Sorry, this product is currently out of stock.' });
        }

        // Check if item is already in cart
        const existingCartItem = db.prepare('SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?').get(userId, productId);

        let finalQuantity = qtyToAdd;
        if (existingCartItem) {
            finalQuantity = existingCartItem.quantity + qtyToAdd;
        }

        if (finalQuantity > product.stock) {
            return res.status(400).json({
                error: `Cannot add ${qtyToAdd} more. You already have ${existingCartItem ? existingCartItem.quantity : 0} in cart and only ${product.stock} units are in stock.`
            });
        }

        if (existingCartItem) {
            db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(finalQuantity, existingCartItem.id);
        } else {
            db.prepare('INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)').run(userId, productId, finalQuantity);
        }

        // Return updated cart summary
        const countRow = db.prepare('SELECT COALESCE(SUM(quantity), 0) as total_count FROM cart_items WHERE user_id = ?').get(userId);

        return res.status(200).json({
            message: `"${product.name}" added to cart.`,
            total_items: countRow.total_count
        });
    } catch (err) {
        console.error('Error adding to cart:', err);
        return res.status(500).json({ error: 'Failed to add item to cart.' });
    }
});

/**
 * PUT /api/cart/:itemId
 * Customer: Update quantity of a specific cart item
 */
router.put('/:itemId', authenticateToken, customerOnly, (req, res) => {
    try {
        const userId = req.user.id;
        if (!isStrictPositiveInteger(req.params.itemId)) {
            return res.status(400).json({ error: 'Invalid cart item ID.' });
        }
        const itemId = parseStrictInteger(req.params.itemId);

        const { quantity } = req.body;
        if (!isStrictPositiveInteger(quantity)) {
            return res.status(400).json({ error: 'Quantity must be a positive integer. To remove, please use delete.' });
        }
        const newQty = parseStrictInteger(quantity);

        // Check ownership of cart item
        const cartItem = db.prepare(`
            SELECT ci.id, ci.product_id, p.name, p.stock, p.is_active, p.price
            FROM cart_items ci
            JOIN products p ON ci.product_id = p.id
            WHERE ci.id = ? AND ci.user_id = ?
        `).get(itemId, userId);

        if (!cartItem) {
            return res.status(404).json({ error: 'Cart item not found or you do not have permission to modify it.' });
        }

        if (cartItem.is_active !== 1) {
            return res.status(400).json({ error: 'This product is no longer active.' });
        }

        if (newQty > cartItem.stock) {
            return res.status(400).json({ error: `Cannot set quantity to ${newQty}. Only ${cartItem.stock} units are in stock.` });
        }

        db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(newQty, itemId);

        return res.status(200).json({
            message: 'Cart updated successfully.',
            item: {
                id: itemId,
                product_id: cartItem.product_id,
                quantity: newQty,
                unit_price: cartItem.price,
                line_total: cartItem.price * newQty
            }
        });
    } catch (err) {
        console.error('Error updating cart item:', err);
        return res.status(500).json({ error: 'Failed to update cart item.' });
    }
});

/**
 * DELETE /api/cart/:itemId
 * Customer: Remove an item from cart
 */
router.delete('/:itemId', authenticateToken, customerOnly, (req, res) => {
    try {
        const userId = req.user.id;
        if (!isStrictPositiveInteger(req.params.itemId)) {
            return res.status(400).json({ error: 'Invalid cart item ID.' });
        }
        const itemId = parseStrictInteger(req.params.itemId);

        // Verify ownership
        const item = db.prepare('SELECT id FROM cart_items WHERE id = ? AND user_id = ?').get(itemId, userId);
        if (!item) {
            return res.status(404).json({ error: 'Cart item not found or permission denied.' });
        }

        db.prepare('DELETE FROM cart_items WHERE id = ?').run(itemId);

        const countRow = db.prepare('SELECT COALESCE(SUM(quantity), 0) as total_count FROM cart_items WHERE user_id = ?').get(userId);

        return res.status(200).json({
            message: 'Item removed from cart.',
            total_items: countRow.total_count
        });
    } catch (err) {
        console.error('Error removing cart item:', err);
        return res.status(500).json({ error: 'Failed to remove item from cart.' });
    }
});

module.exports = router;
