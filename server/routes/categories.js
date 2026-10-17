const express = require('express');
const router = express.Router();
const { db } = require('../db');
const authenticateToken = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { isStrictPositiveInteger, parseStrictInteger } = require('../middleware/validate');

/**
 * GET /api/categories
 * Public: List all categories with product count
 */
router.get('/', (req, res) => {
    try {
        const query = `
            SELECT c.id, c.name, COUNT(p.id) as product_count
            FROM categories c
            LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
            GROUP BY c.id
            ORDER BY c.name ASC
        `;
        const categories = db.prepare(query).all();
        return res.status(200).json({ categories });
    } catch (err) {
        console.error('Error fetching categories:', err);
        return res.status(500).json({ error: 'Failed to retrieve categories.' });
    }
});

/**
 * POST /api/categories
 * Admin only: Create a new category
 */
router.post('/', authenticateToken, adminOnly, (req, res) => {
    try {
        const { name } = req.body;
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: 'Category name is required.' });
        }

        const trimmedName = name.trim();
        const existing = db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)').get(trimmedName);
        if (existing) {
            return res.status(409).json({ error: 'A category with this name already exists.' });
        }

        const stmt = db.prepare('INSERT INTO categories (name) VALUES (?)');
        const result = stmt.run(trimmedName);
        const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);

        return res.status(201).json({
            message: 'Category created successfully.',
            category
        });
    } catch (err) {
        console.error('Error creating category:', err);
        return res.status(500).json({ error: 'Failed to create category.' });
    }
});

/**
 * PUT /api/categories/:id
 * Admin only: Update existing category
 */
router.put('/:id', authenticateToken, adminOnly, (req, res) => {
    try {
        if (!isStrictPositiveInteger(req.params.id)) {
            return res.status(400).json({ error: 'Invalid category ID.' });
        }
        const categoryId = parseStrictInteger(req.params.id);

        const { name } = req.body;
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: 'Category name is required.' });
        }

        const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId);
        if (!category) {
            return res.status(404).json({ error: 'Category not found.' });
        }

        const trimmedName = name.trim();
        const duplicate = db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND id != ?').get(trimmedName, categoryId);
        if (duplicate) {
            return res.status(409).json({ error: 'Another category with this name already exists.' });
        }

        db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(trimmedName, categoryId);
        const updatedCategory = db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId);

        return res.status(200).json({
            message: 'Category updated successfully.',
            category: updatedCategory
        });
    } catch (err) {
        console.error('Error updating category:', err);
        return res.status(500).json({ error: 'Failed to update category.' });
    }
});

/**
 * DELETE /api/categories/:id
 * Admin only: Delete category safely (prevent if products are assigned)
 */
router.delete('/:id', authenticateToken, adminOnly, (req, res) => {
    try {
        if (!isStrictPositiveInteger(req.params.id)) {
            return res.status(400).json({ error: 'Invalid category ID.' });
        }
        const categoryId = parseStrictInteger(req.params.id);

        const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId);
        if (!category) {
            return res.status(404).json({ error: 'Category not found.' });
        }

        // Check if any products are associated with this category
        const productsCount = db.prepare('SELECT COUNT(*) as count FROM products WHERE category_id = ?').get(categoryId).count;
        if (productsCount > 0) {
            return res.status(400).json({
                error: `Cannot delete category "${category.name}". It is currently assigned to ${productsCount} product(s). Please reassign or delete those products first.`
            });
        }

        db.prepare('DELETE FROM categories WHERE id = ?').run(categoryId);
        return res.status(200).json({ message: 'Category deleted successfully.' });
    } catch (err) {
        console.error('Error deleting category:', err);
        return res.status(500).json({ error: 'Failed to delete category.' });
    }
});

module.exports = router;
