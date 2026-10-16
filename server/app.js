const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Ensure DB is initialized
const { db } = require('./db');

const app = express();

// Security and parser middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

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
    const message = process.env.NODE_ENV === 'production'
        ? 'An unexpected internal server error occurred.'
        : (err.message || 'Internal server error.');

    return res.status(statusCode).json({ error: message });
});

// Start listening if not running in test mode
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(`  ShopEasy E-Commerce Server is running!`);
        console.log(`  URL: http://localhost:${PORT}`);
        console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`====================================================`);
    });
}

module.exports = app;
