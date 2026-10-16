const express = require('express');
const router = express.Router();
const { db } = require('../db');
const authenticateToken = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { isNonNegativeInteger } = require('../middleware/validate');

/**
 * GET /api/products
 * Public: Browse, search, filter, sort and paginate products
 */
router.get('/', (req, res) => {
    try {
        const {
            search = '',
            category,
            sort = 'newest',
            page = 1,
            limit = 8,
            status // 'all', 'active', 'inactive' - only allowed for admins
        } = req.query;

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 8));
        const offset = (pageNum - 1) * limitNum;

        const conditions = [];
        const params = [];

        // Check if admin is requesting inactive products
        let includeInactive = false;
        if (status === 'all' || status === 'inactive') {
            // Check auth header if provided
            const authHeader = req.headers['authorization'];
            if (authHeader) {
                try {
                    const token = authHeader.split(' ')[1];
                    const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
                    if (decoded && decoded.role === 'admin') {
                        includeInactive = true;
                    }
                } catch {
                    // Not valid admin token, default to active only
                }
            }
        }

        if (!includeInactive) {
            conditions.push('p.is_active = 1');
        } else if (status === 'inactive') {
            conditions.push('p.is_active = 0');
        }

        if (search && search.trim() !== '') {
            conditions.push('(p.name LIKE ? OR p.description LIKE ?)');
            const searchTerm = `%${search.trim()}%`;
            params.push(searchTerm, searchTerm);
        }

        if (category && category !== 'all') {
            const catId = parseInt(category, 10);
            if (!isNaN(catId)) {
                conditions.push('p.category_id = ?');
                params.push(catId);
            }
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Sorting
        let orderBy = 'ORDER BY p.id DESC';
        switch (sort) {
            case 'price_asc':
                orderBy = 'ORDER BY p.price ASC';
                break;
            case 'price_desc':
                orderBy = 'ORDER BY p.price DESC';
                break;
            case 'name_asc':
                orderBy = 'ORDER BY p.name ASC';
                break;
            case 'name_desc':
                orderBy = 'ORDER BY p.name DESC';
                break;
            case 'stock_asc':
                orderBy = 'ORDER BY p.stock ASC';
                break;
            case 'newest':
            default:
                orderBy = 'ORDER BY p.id DESC';
                break;
        }

        // Count total items
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM products p 
            ${whereClause}
        `;
        const total = db.prepare(countQuery).get(...params).total;

        // Fetch products with category name
        const dataQuery = `
            SELECT 
                p.id, 
                p.category_id, 
                c.name as category_name, 
                p.name, 
                p.description, 
                p.price, 
                p.stock, 
                p.image_url, 
                p.is_active, 
                p.created_at
            FROM products p
            JOIN categories c ON p.category_id = c.id
            ${whereClause}
            ${orderBy}
            LIMIT ? OFFSET ?
        `;

        const products = db.prepare(dataQuery).all(...params, limitNum, offset);

        const totalPages = Math.ceil(total / limitNum) || 1;

        return res.status(200).json({
            products,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages
            }
        });
    } catch (err) {
        console.error('Error fetching products:', err);
        return res.status(500).json({ error: 'Failed to retrieve products.' });
    }
});

/**
 * GET /api/products/:id
 * Public: Get single product details
 */
router.get('/:id', (req, res) => {
    try {
        const productId = parseInt(req.params.id, 10);
        if (isNaN(productId)) {
            return res.status(400).json({ error: 'Invalid product ID.' });
        }

        const query = `
            SELECT 
                p.id, 
                p.category_id, 
                c.name as category_name, 
                p.name, 
                p.description, 
                p.price, 
                p.stock, 
                p.image_url, 
                p.is_active, 
                p.created_at
            FROM products p
            JOIN categories c ON p.category_id = c.id
            WHERE p.id = ?
        `;
        const product = db.prepare(query).get(productId);

        if (!product) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        return res.status(200).json({ product });
    } catch (err) {
        console.error('Error fetching product details:', err);
        return res.status(500).json({ error: 'Failed to retrieve product details.' });
    }
});

/**
 * POST /api/products
 * Admin only: Create new product
 */
router.post('/', authenticateToken, adminOnly, (req, res) => {
    try {
        const { name, description, price, stock, category_id, image_url, is_active = 1 } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: 'Product name is required.' });
        }

        const categoryId = parseInt(category_id, 10);
        if (isNaN(categoryId)) {
            return res.status(400).json({ error: 'Valid category ID is required.' });
        }

        const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId);
        if (!category) {
            return res.status(400).json({ error: 'Selected category does not exist.' });
        }

        // Validate price in paise (positive or zero integer)
        const pricePaise = parseInt(price, 10);
        if (isNaN(pricePaise) || pricePaise < 0) {
            return res.status(400).json({ error: 'Price must be a valid non-negative integer (in paise).' });
        }

        // Validate stock
        const stockQty = parseInt(stock, 10);
        if (isNaN(stockQty) || stockQty < 0) {
            return res.status(400).json({ error: 'Stock must be a valid non-negative integer.' });
        }

        const activeStatus = is_active === 0 || is_active === '0' || is_active === false ? 0 : 1;
        const cleanImageUrl = image_url && typeof image_url === 'string' ? image_url.trim() : null;

        const stmt = db.prepare(`
            INSERT INTO products (category_id, name, description, price, stock, image_url, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            categoryId,
            name.trim(),
            description ? description.trim() : null,
            pricePaise,
            stockQty,
            cleanImageUrl,
            activeStatus
        );

        const newProduct = db.prepare(`
            SELECT p.*, c.name as category_name
            FROM products p
            JOIN categories c ON p.category_id = c.id
            WHERE p.id = ?
        `).get(result.lastInsertRowid);

        return res.status(201).json({
            message: 'Product created successfully.',
            product: newProduct
        });
    } catch (err) {
        console.error('Error creating product:', err);
        return res.status(500).json({ error: 'Failed to create product.' });
    }
});

/**
 * PUT /api/products/:id
 * Admin only: Update existing product
 */
router.put('/:id', authenticateToken, adminOnly, (req, res) => {
    try {
        const productId = parseInt(req.params.id, 10);
        if (isNaN(productId)) {
            return res.status(400).json({ error: 'Invalid product ID.' });
        }

        const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
        if (!existing) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        const { name, description, price, stock, category_id, image_url, is_active } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: 'Product name is required.' });
        }

        const categoryId = parseInt(category_id, 10);
        if (isNaN(categoryId)) {
            return res.status(400).json({ error: 'Valid category ID is required.' });
        }

        const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId);
        if (!category) {
            return res.status(400).json({ error: 'Selected category does not exist.' });
        }

        const pricePaise = parseInt(price, 10);
        if (isNaN(pricePaise) || pricePaise < 0) {
            return res.status(400).json({ error: 'Price must be a valid non-negative integer (in paise).' });
        }

        const stockQty = parseInt(stock, 10);
        if (isNaN(stockQty) || stockQty < 0) {
            return res.status(400).json({ error: 'Stock must be a valid non-negative integer.' });
        }

        const activeStatus = is_active === 0 || is_active === '0' || is_active === false ? 0 : 1;
        const cleanImageUrl = image_url && typeof image_url === 'string' ? image_url.trim() : null;

        const stmt = db.prepare(`
            UPDATE products 
            SET category_id = ?, name = ?, description = ?, price = ?, stock = ?, image_url = ?, is_active = ?
            WHERE id = ?
        `);

        stmt.run(
            categoryId,
            name.trim(),
            description ? description.trim() : null,
            pricePaise,
            stockQty,
            cleanImageUrl,
            activeStatus,
            productId
        );

        const updatedProduct = db.prepare(`
            SELECT p.*, c.name as category_name
            FROM products p
            JOIN categories c ON p.category_id = c.id
            WHERE p.id = ?
        `).get(productId);

        return res.status(200).json({
            message: 'Product updated successfully.',
            product: updatedProduct
        });
    } catch (err) {
        console.error('Error updating product:', err);
        return res.status(500).json({ error: 'Failed to update product.' });
    }
});

/**
 * DELETE /api/products/:id
 * Admin only: Deactivate or delete product
 */
router.delete('/:id', authenticateToken, adminOnly, (req, res) => {
    try {
        const productId = parseInt(req.params.id, 10);
        if (isNaN(productId)) {
            return res.status(400).json({ error: 'Invalid product ID.' });
        }

        const product = db.prepare('SELECT id, name FROM products WHERE id = ?').get(productId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        // Check if referenced in order_items
        const orderRefCount = db.prepare('SELECT COUNT(*) as count FROM order_items WHERE product_id = ?').get(productId).count;

        if (orderRefCount > 0) {
            // Deactivate to preserve historical order integrity
            db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(productId);
            return res.status(200).json({
                message: `Product "${product.name}" is associated with existing order records and has been deactivated to preserve transaction history.`,
                deactivated: true
            });
        } else {
            // Safe to delete completely
            db.prepare('DELETE FROM products WHERE id = ?').run(productId);
            return res.status(200).json({
                message: `Product "${product.name}" deleted successfully.`,
                deactivated: false
            });
        }
    } catch (err) {
        console.error('Error deleting/deactivating product:', err);
        return res.status(500).json({ error: 'Failed to delete product.' });
    }
});

module.exports = router;
