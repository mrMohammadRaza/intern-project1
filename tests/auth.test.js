const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server/app');
const { db } = require('../server/db');

describe('Authentication API Tests', () => {
    const testEmail = `testuser_${Date.now()}@example.com`;
    const testPassword = 'Password123!';

    test('POST /api/auth/register - Successfully registers customer', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                name: 'Test Customer',
                email: testEmail,
                password: testPassword,
                phone: '9876543210',
                role: 'admin' // Attempt privilege escalation: must be ignored!
            });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('token');
        expect(res.body.user).toHaveProperty('email', testEmail.toLowerCase());
        expect(res.body.user.role).toBe('customer'); // Escalation prevented
    });

    test('POST /api/auth/register - Rejects duplicate email', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                name: 'Duplicate User',
                email: testEmail,
                password: testPassword
            });

        expect(res.status).toBe(409);
        expect(res.body).toHaveProperty('error');
    });

    test('POST /api/auth/register - Rejects password shorter than 6 chars', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                name: 'Short Pass User',
                email: `short_${Date.now()}@example.com`,
                password: '123'
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/at least 6 characters/i);
    });

    test('POST /api/auth/login - Succeeds with correct credentials', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: testEmail,
                password: testPassword
            });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body.user.email).toBe(testEmail.toLowerCase());
    });

    test('POST /api/auth/login - Rejects incorrect password', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: testEmail,
                password: 'WrongPassword999'
            });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('error');
    });

    test('GET /api/auth/me - Rejects request without token', async () => {
        const res = await request(app).get('/api/auth/me');
        expect(res.status).toBe(401);
    });

    test('GET /api/auth/me - Succeeds with valid token', async () => {
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({
                email: testEmail,
                password: testPassword
            });
        const token = loginRes.body.token;

        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.user.email).toBe(testEmail.toLowerCase());
    });

    test('GET /api/admin/stats - Customer token receives 403 Forbidden', async () => {
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({
                email: testEmail,
                password: testPassword
            });
        const customerToken = loginRes.body.token;

        const res = await request(app)
            .get('/api/admin/stats')
            .set('Authorization', `Bearer ${customerToken}`);

        expect(res.status).toBe(403);
    });

    test('GET /api/admin/stats - Admin token receives 200 OK', async () => {
        const adminLogin = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'admin@shopeasy.com',
                password: 'Admin@123'
            });
        const adminToken = adminLogin.body.token;

        const res = await request(app)
            .get('/api/admin/stats')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('stats');
        expect(res.body.stats).toHaveProperty('total_products');
    });

    test('GET /api/auth/me - Rejects invalid/malformed token signature (401)', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', 'Bearer invalid.tampered.token');

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/invalid or malformed token/i);
    });

    test('GET /api/auth/me - Rejects authorization header without Bearer prefix (401)', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', 'Basic 123456');

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/Bearer/i);
    });

    test('POST /api/auth/register - Rejects invalid email format (400)', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                name: 'Bad Email User',
                email: 'not-an-email',
                password: 'Password123'
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/valid email/i);
    });

    test('POST /api/auth/login - Rejects missing email or password (400)', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@shopeasy.com' });

        expect(res.status).toBe(400);
    });

    test('POST /api/auth/login - Rejects non-existent email (401)', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'nonexistent_user_999@example.com', password: 'Password123' });

        expect(res.status).toBe(401);
    });

    test('GET /api/auth/me - Rejects expired JWT token with 401', async () => {
        const secret = process.env.JWT_SECRET || 'test_secret_for_signing';
        const expiredToken = jwt.sign(
            { id: 1, email: 'admin@shopeasy.com', role: 'admin' },
            secret,
            { expiresIn: '-1s' }
        );

        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${expiredToken}`);

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/expired/i);
    });

    test('POST /api/auth/register - Fails safely if JWT_SECRET is missing (500) and DOES NOT create orphaned user in DB', async () => {
        const originalSecret = process.env.JWT_SECRET;
        delete process.env.JWT_SECRET;
        const targetEmail = `no_secret_${Date.now()}@example.com`;

        try {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'No Secret User',
                    email: targetEmail,
                    password: 'Password123'
                });

            expect(res.status).toBe(500);
            expect(res.body.error).toMatch(/Server configuration error/i);

            // Verify user was NOT created in database
            const userInDb = db.prepare('SELECT id FROM users WHERE email = ?').get(targetEmail);
            expect(userInDb).toBeUndefined();
        } finally {
            process.env.JWT_SECRET = originalSecret;
        }
    });

    test('GET /api/admin/orders - Customer access is forbidden (403)', async () => {
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: testEmail, password: testPassword });
        const customerToken = loginRes.body.token;

        const res = await request(app)
            .get('/api/admin/orders')
            .set('Authorization', `Bearer ${customerToken}`);

        expect(res.status).toBe(403);
    });

    test('GET /api/cart - Admin access is forbidden (403) via customerOnly', async () => {
        const adminLogin = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@shopeasy.com', password: 'Admin@123' });
        const adminToken = adminLogin.body.token;

        const res = await request(app)
            .get('/api/cart')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/Customer privileges required/i);
    });

    test('Regression: Security headers are correctly attached to responses', async () => {
        const res = await request(app).get('/api/products');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toBe('DENY');
        expect(res.headers['x-xss-protection']).toBe('1; mode=block');
        expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });

    test('Regression: Login rate limiter enforces attempt limits and returns 429', async () => {
        const { RateLimiter } = require('../server/middleware/rateLimiter');
        const customLimiter = new RateLimiter(60000, 3);
        const testApp = require('express')();
        testApp.use(customLimiter.middleware('Rate limit reached.', true));
        testApp.post('/test-login', (req, res) => res.json({ ok: true }));

        // 3 allowed hits
        for (let i = 0; i < 3; i++) {
            const okRes = await request(testApp).post('/test-login');
            expect(okRes.status).toBe(200);
        }

        // 4th hit should return 429
        const blockedRes = await request(testApp).post('/test-login');
        expect(blockedRes.status).toBe(429);
        expect(blockedRes.body.error).toMatch(/Rate limit reached/i);
        expect(blockedRes.headers['retry-after']).toBeDefined();
    });
});
