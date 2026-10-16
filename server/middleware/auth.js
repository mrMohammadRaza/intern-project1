const jwt = require('jsonwebtoken');
const { db } = require('../db');

/**
 * Authentication Middleware
 * Validates JWT token from the Authorization header and attaches req.user
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'Authentication required. No token provided.' });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return res.status(401).json({ error: 'Invalid authorization format. Format must be: Bearer <token>' });
    }

    const token = parts[1];
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        console.error('FATAL: JWT_SECRET environment variable is not defined!');
        return res.status(500).json({ error: 'Server configuration error.' });
    }

    jwt.verify(token, secret, (err, decoded) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Session expired. Please log in again.' });
            }
            return res.status(401).json({ error: 'Invalid or malformed token.' });
        }

        // Fetch fresh user record from database
        try {
            const user = db.prepare('SELECT id, name, email, role, phone, address, created_at FROM users WHERE id = ?').get(decoded.id);
            if (!user) {
                return res.status(401).json({ error: 'User associated with this token no longer exists.' });
            }

            req.user = user;
            next();
        } catch (dbErr) {
            console.error('Error in auth middleware user lookup:', dbErr);
            return res.status(500).json({ error: 'Internal server error during authentication.' });
        }
    });
}

module.exports = authenticateToken;
