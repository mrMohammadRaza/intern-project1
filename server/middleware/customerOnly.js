/**
 * Customer Authorization Middleware
 * Must be used after authenticateToken middleware
 * Ensures only users with role 'customer' can perform shopping operations (cart, checkout, etc.)
 */
function customerOnly(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required.' });
    }

    if (req.user.role !== 'customer') {
        return res.status(403).json({ error: 'Access denied. Customer privileges required for this action.' });
    }

    next();
}

module.exports = customerOnly;
