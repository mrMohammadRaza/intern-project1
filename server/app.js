const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Ensure DB is initialized
const { db } = require('./db');

const app = express();

// Configure Express proxy trust safely for deployment topology
if (process.env.TRUST_PROXY) {
    const trustValue = process.env.TRUST_PROXY.trim();
    if (trustValue === 'true') {
        app.set('trust proxy', true);
    } else if (trustValue === 'false') {
        app.set('trust proxy', false);
    } else if (/^\d+$/.test(trustValue)) {
        app.set('trust proxy', parseInt(trustValue, 10));
    } else {
        app.set('trust proxy', trustValue);
    }
} else {
    // Safe default: do not trust unverified upstream proxy headers
    app.set('trust proxy', false);
}

// CORS configuration (restricted in production, permissive in development/testing)
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        const allowedOrigins = process.env.CORS_ORIGIN
            ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
            : [`http://localhost:${process.env.PORT || 3000}`];
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('CORS policy: Access denied for this origin.'));
    },
    credentials: true
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// HTTP Security Headers & Content Security Policy (CSP)
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https://images.unsplash.com; " +
        "connect-src 'self'; " +
        "font-src 'self'; " +
        "object-src 'none'; " +
        "base-uri 'self';"
    );
    next();
});

// Guard against executing state mutations if JWT_SECRET is missing
app.use((req, res, next) => {
    if (!process.env.JWT_SECRET && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        return res.status(500).json({ error: 'Server configuration error: Critical security secrets are not configured.' });
    }
    next();
});

// Static frontend files
const publicDir = path.resolve(__dirname, '..', 'public');
app.use(express.static(publicDir));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/admin', require('./routes/admin'));

// API 404 Handler for unmatched API endpoints
app.use('/api', (req, res) => {
    return res.status(404).json({ error: `API endpoint '${req.originalUrl}' not found.` });
});

// Fallback for HTML routing: send index.html if route not found in public
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(path.join(publicDir, 'index.html'));
    }
    next();
});

// Centralized Error Handling Middleware
// Never exposes raw database errors or stack traces to clients
app.use((err, req, res, next) => {
    console.error('Unhandled Server Error:', err);

    const statusCode = err.status || 500;
    let safeMessage = 'An unexpected internal server error occurred.';

    if (process.env.NODE_ENV !== 'production' && err.message) {
        // Only allow messages that don't contain SQL syntax or file paths
        if (!err.message.includes('SQLITE_') && !err.message.includes('syntax') && !err.message.includes('\\') && !err.message.includes('/')) {
            safeMessage = err.message;
        }
    }

    return res.status(statusCode).json({ error: safeMessage });
});

// Start listening if not running in test mode
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
    if (!process.env.JWT_SECRET) {
        console.error('FATAL CONFIGURATION ERROR: JWT_SECRET environment variable is missing!');
        console.error('Please configure a secure JWT_SECRET in your .env file before starting ShopEasy.');
        process.exit(1);
    }
    app.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(`  ShopEasy E-Commerce Server is running!`);
        console.log(`  URL: http://localhost:${PORT}`);
        console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`====================================================`);
    });
}

module.exports = app;
