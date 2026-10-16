const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const authenticateToken = require('../middleware/auth');
const { isValidEmail, isValidPhone } = require('../middleware/validate');

/**
 * POST /api/auth/register
 * Public registration for customers only
 */
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, phone, address } = req.body;

        // Validation
        if (!name || typeof name !== 'string' || name.trim().length < 2) {
            return res.status(400).json({ error: 'Full name is required (minimum 2 characters).' });
        }

        if (!email || !isValidEmail(email)) {
            return res.status(400).json({ error: 'A valid email address is required.' });
        }

        if (!password || typeof password !== 'string' || password.length < 6) {
            return res.status(400).json({ error: 'Password is required and must be at least 6 characters long.' });
        }

        if (phone && !isValidPhone(phone)) {
            return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
        }

        const trimmedEmail = email.trim().toLowerCase();
        const trimmedName = name.trim();
        const cleanPhone = phone ? phone.toString().trim() : null;
        const cleanAddress = address && typeof address === 'string' ? address.trim() : null;

        // Check if email already exists
        const existingUser = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(trimmedEmail);
        if (existingUser) {
            return res.status(409).json({ error: 'An account with this email address already exists.' });
        }

        // Never trust role from client - enforce customer role
        const role = 'customer';

        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Insert new user
        const stmt = db.prepare(`
            INSERT INTO users (name, email, password_hash, role, phone, address)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(trimmedName, trimmedEmail, passwordHash, role, cleanPhone, cleanAddress);

        const newUserId = result.lastInsertRowid;
        const user = db.prepare('SELECT id, name, email, role, phone, address, created_at FROM users WHERE id = ?').get(newUserId);

        // Ensure JWT secret is configured
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            console.error('FATAL: JWT_SECRET environment variable is not defined!');
            return res.status(500).json({ error: 'Server configuration error.' });
        }

        // Sign JWT
        const token = jwt.sign(
            { id: user.id, role: user.role },
            secret,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
        );

        return res.status(201).json({
            message: 'Registration successful! Welcome to ShopEasy.',
            token,
            user
        });
    } catch (err) {
        console.error('Registration error:', err);
        return res.status(500).json({ error: 'Internal server error during registration.' });
    }
});

/**
 * POST /api/auth/login
 * Public authentication for customers and administrators
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const trimmedEmail = email.trim().toLowerCase();
        const user = db.prepare('SELECT id, name, email, password_hash, role, phone, address, created_at FROM users WHERE LOWER(email) = ?').get(trimmedEmail);

        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Ensure JWT secret is configured
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            console.error('FATAL: JWT_SECRET environment variable is not defined!');
            return res.status(500).json({ error: 'Server configuration error.' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, role: user.role },
            secret,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
        );

        // Don't expose password hash
        const { password_hash, ...safeUser } = user;

        return res.status(200).json({
            message: 'Login successful.',
            token,
            user: safeUser
        });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Internal server error during login.' });
    }
});

/**
 * GET /api/auth/me
 * Returns current authenticated user profile
 */
router.get('/me', authenticateToken, (req, res) => {
    return res.status(200).json({
        user: req.user
    });
});

module.exports = router;
