/**
 * Administrator Authorization Middleware
 * Must be used after authenticateToken middleware
 */
function adminOnly(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required.' });
    }

    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
    }

    next();
}

module.exports = adminOnly;
