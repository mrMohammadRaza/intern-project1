const request = require('supertest');
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
});
