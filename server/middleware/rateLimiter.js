/**
 * In-memory sliding-window rate limiter for sensitive authentication endpoints
 * Protects against brute-force password guessing and registration abuse
 */

class RateLimiter {
    constructor(windowMs = 15 * 60 * 1000, maxAttempts = 10) {
        this.windowMs = windowMs;
        this.maxAttempts = maxAttempts;
        this.hits = new Map();
    }

    getKey(req) {
        // Use client IP address
        const forwarded = req.headers['x-forwarded-for'];
        const ip = forwarded ? forwarded.split(',')[0].trim() : (req.socket.remoteAddress || '127.0.0.1');
        return ip;
    }

    middleware(customMessage = 'Too many requests. Please try again later.', checkInTest = false) {
        return (req, res, next) => {
            // Bypass in test environment unless specifically enabled for testing
            if (process.env.NODE_ENV === 'test' && !checkInTest && !req.headers['x-test-rate-limit']) {
                return next();
            }

            const key = this.getKey(req);
            const now = Date.now();
            let record = this.hits.get(key);

            if (!record) {
                record = [];
                this.hits.set(key, record);
            }

            // Evict expired timestamps
            const cutoff = now - this.windowMs;
            const validHits = record.filter(time => time > cutoff);
            this.hits.set(key, validHits);

            if (validHits.length >= this.maxAttempts) {
                const oldest = validHits[0];
                const retryAfterSec = Math.ceil((oldest + this.windowMs - now) / 1000);
                res.setHeader('Retry-After', retryAfterSec);
                return res.status(429).json({
                    error: customMessage,
                    retry_after_seconds: retryAfterSec
                });
            }

            validHits.push(now);
            next();
        };
    }

    reset(key) {
        if (key) {
            this.hits.delete(key);
        } else {
            this.hits.clear();
        }
    }
}

// Preconfigured instances
const loginLimiter = new RateLimiter(15 * 60 * 1000, 10); // 10 attempts per 15 minutes
const registerLimiter = new RateLimiter(60 * 60 * 1000, 15); // 15 attempts per hour

module.exports = {
    RateLimiter,
    loginLimiter,
    registerLimiter
};
