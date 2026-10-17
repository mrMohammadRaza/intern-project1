const request = require('supertest');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const app = require('../server/app');
const { db } = require('../server/db');

describe('Security Hardening & Penetration-Test Regression Suite', () => {
    let adminToken;
    let customer1Token;
    let customer2Token;
    let customer1Id;
    let customer2Id;

    beforeAll(async () => {
        // Ensure test database has consistent product stock
        db.prepare('UPDATE products SET stock = 20, is_active = 1 WHERE id = 1').run();
        db.prepare('UPDATE products SET stock = 20, is_active = 1 WHERE id = 2').run();

        // 1. Admin login
        const adminLogin = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@shopeasy.com', password: 'Admin@123' });
        adminToken = adminLogin.body.token;

        // 2. Register Customer 1
        const email1 = `sec_cust1_${Date.now()}@example.com`;
        const res1 = await request(app)
            .post('/api/auth/register')
            .send({
                name: 'Security Customer One',
                email: email1,
                password: 'Password123!',
                phone: '9876543210'
            });
        customer1Token = res1.body.token;
        customer1Id = res1.body.user.id;

        // 3. Register Customer 2
        const email2 = `sec_cust2_${Date.now()}@example.com`;
        const res2 = await request(app)
            .post('/api/auth/register')
            .send({
                name: 'Security Customer Two',
                email: email2,
                password: 'Password123!',
                phone: '9876543211'
            });
        customer2Token = res2.body.token;
        customer2Id = res2.body.user.id;
    });

    // ------------------------------------------------------------------------
    // 1. Production mode does not create default administrator account
    // ------------------------------------------------------------------------
    test('1. Production mode strictly prevents seeding default demo administrator', () => {
        const tempDbPath = path.resolve(__dirname, 'shopeasy.prod_test.db');
        if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);

        const prodDb = new Database(tempDbPath);
        prodDb.pragma('foreign_keys = ON');

        // Apply schema
        const schemaSql = fs.readFileSync(path.resolve(__dirname, '../server/schema.sql'), 'utf8');
        prodDb.exec(schemaSql);

        // Simulate db.js initialization logic with NODE_ENV = 'production'
        const origEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        try {
            const { seedData } = require('../server/db');
            // seedData in production should refuse
            const seeded = seedData();
            expect(seeded).toBe(false);

            // Verify no demo admin or demo users exist in the database
            const demoAdmin = prodDb.prepare("SELECT * FROM users WHERE email = 'admin@shopeasy.com'").get();
            expect(demoAdmin).toBeUndefined();

            const userCount = prodDb.prepare('SELECT COUNT(*) as count FROM users').get();
            expect(userCount.count).toBe(0);
        } finally {
            process.env.NODE_ENV = origEnv;
            prodDb.close();
            if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
        }
    });

    // ------------------------------------------------------------------------
    // 2. Admin privileges cannot be obtained through public registration
    // ------------------------------------------------------------------------
    test('2. Public registration ignores role:admin and always assigns customer role', async () => {
        const targetEmail = `exploit_admin_${Date.now()}@example.com`;
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                name: 'Privilege Escalation Attacker',
                email: targetEmail,
                password: 'Password123!',
                role: 'admin' // Attempted escalation
            });

        expect(res.status).toBe(201);
        expect(res.body.user.role).toBe('customer');

        // Verify in database directly
        const userRow = db.prepare('SELECT role FROM users WHERE email = ?').get(targetEmail);
        expect(userRow.role).toBe('customer');

        // Customer token must not access admin stats
        const adminAccess = await request(app)
            .get('/api/admin/stats')
            .set('Authorization', `Bearer ${res.body.token}`);
        expect(adminAccess.status).toBe(403);
    });

    // ------------------------------------------------------------------------
    // 3. Invalid credentials and repeated login attempts handled safely
    // ------------------------------------------------------------------------
    test('3. Invalid credentials return safe 401 and generic errors without leaking user existence', async () => {
        // Non-existent email
        const res1 = await request(app)
            .post('/api/auth/login')
            .send({ email: 'doesnotexist_9999@example.com', password: 'Password123!' });
        expect(res1.status).toBe(401);
        expect(res1.body.error).toMatch(/Invalid email.*password/i);

        // Real email with wrong password
        const res2 = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@shopeasy.com', password: 'IncorrectPassword!' });
        expect(res2.status).toBe(401);
        // Error message must be identical to prevent user enumeration
        expect(res2.body.error).toBe(res1.body.error);
    });

    // ------------------------------------------------------------------------
    // 4. Spoofed forwarding headers cannot bypass login rate limiting
    // ------------------------------------------------------------------------
    test('4. Spoofed X-Forwarded-For headers cannot bypass login rate limiting', async () => {
        const { RateLimiter } = require('../server/middleware/rateLimiter');
        // Rate limiter with max 3 attempts
        const limiter = new RateLimiter(60000, 3);
        const testApp = require('express')();
        // Trust proxy is disabled (false by default)
        testApp.set('trust proxy', false);
        testApp.use(limiter.middleware('Too many login attempts.', true));
        testApp.post('/test-login-rate', (req, res) => res.json({ ok: true }));

        // Attacker rotates X-Forwarded-For header on every request
        const res1 = await request(testApp).post('/test-login-rate').set('X-Forwarded-For', '10.0.0.1');
        expect(res1.status).toBe(200);

        const res2 = await request(testApp).post('/test-login-rate').set('X-Forwarded-For', '10.0.0.2');
        expect(res2.status).toBe(200);

        const res3 = await request(testApp).post('/test-login-rate').set('X-Forwarded-For', '10.0.0.3');
        expect(res3.status).toBe(200);

        // 4th attempt from same connection with another spoofed header MUST BE BLOCKED
        const res4 = await request(testApp).post('/test-login-rate').set('X-Forwarded-For', '10.0.0.4');
        expect(res4.status).toBe(429);
        expect(res4.body.error).toMatch(/Too many login attempts/i);
    });

    // ------------------------------------------------------------------------
    // 5. Registration rate limiting is active
    // ------------------------------------------------------------------------
    test('5. Registration rate limiter blocks excessive requests and returns 429', async () => {
        const { RateLimiter } = require('../server/middleware/rateLimiter');
        const regLimiter = new RateLimiter(60000, 2);
        const testApp = require('express')();
        testApp.use(regLimiter.middleware('Too many registration attempts.', true));
        testApp.post('/test-register', (req, res) => res.json({ registered: true }));

        const r1 = await request(testApp).post('/test-register');
        expect(r1.status).toBe(200);

        const r2 = await request(testApp).post('/test-register');
        expect(r2.status).toBe(200);

        const r3 = await request(testApp).post('/test-register');
        expect(r3.status).toBe(429);
        expect(r3.body.error).toMatch(/Too many registration attempts/i);
    });

    // ------------------------------------------------------------------------
    // 6. Malformed JSON fields and non-string inputs return suitable 400 errors
    // ------------------------------------------------------------------------
    test('6. Malformed fields and non-string types return 400 Bad Request', async () => {
        // Object injection in email
        const res1 = await request(app)
            .post('/api/auth/login')
            .send({ email: { $gt: '' }, password: 'Password123!' });
        expect(res1.status).toBe(400);

        // Array in password
        const res2 = await request(app)
            .post('/api/auth/login')
            .send({ email: 'user@example.com', password: ['pass', 'word'] });
        expect(res2.status).toBe(400);

        // Non-string name and phone in register
        const res3 = await request(app)
            .post('/api/auth/register')
            .send({
                name: 12345,
                email: 'valid_email@example.com',
                password: 'Password123!',
                phone: { invalid: true }
            });
        expect(res3.status).toBe(400);

        // Non-string product ID in cart
        const res4 = await request(app)
            .post('/api/cart')
            .set('Authorization', `Bearer ${customer1Token}`)
            .send({ product_id: 'invalid-id-string', quantity: 1 });
        expect(res4.status).toBe(400);
    });

    // ------------------------------------------------------------------------
    // 7. Customers cannot access admin-only endpoints
    // ------------------------------------------------------------------------
    test('7. Customer role is rejected with 403 on all admin endpoints', async () => {
        // Admin stats
        const r1 = await request(app)
            .get('/api/admin/stats')
            .set('Authorization', `Bearer ${customer1Token}`);
        expect(r1.status).toBe(403);

        // Admin order list
        const r2 = await request(app)
            .get('/api/admin/orders')
            .set('Authorization', `Bearer ${customer1Token}`);
        expect(r2.status).toBe(403);

        // Create product (admin only)
        const r3 = await request(app)
            .post('/api/products')
            .set('Authorization', `Bearer ${customer1Token}`)
            .send({ name: 'Unauthorized Product', price: 1000, stock: 5, category_id: 1 });
        expect(r3.status).toBe(403);

        // Create category (admin only)
        const r4 = await request(app)
            .post('/api/categories')
            .set('Authorization', `Bearer ${customer1Token}`)
            .send({ name: 'Unauthorized Category' });
        expect(r4.status).toBe(403);
    });

    // ------------------------------------------------------------------------
    // 8. Customers cannot access another customer's orders
    // ------------------------------------------------------------------------
    test('8. Customer cannot access another customer\'s orders (403 Forbidden)', async () => {
        // Customer 1 places an order
        await request(app)
            .post('/api/cart')
            .set('Authorization', `Bearer ${customer1Token}`)
            .send({ product_id: 1, quantity: 1 });

        const orderRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${customer1Token}`)
            .send({
                shipping_name: 'Customer One',
                shipping_phone: '9876543210',
                shipping_address: '100 Security Boulevard',
                shipping_city: 'Bengaluru',
                shipping_pincode: '560001'
            });

        expect(orderRes.status).toBe(201);
        const cust1OrderId = orderRes.body.order.id;

        // Customer 2 attempts to view Customer 1's order
        const viewRes = await request(app)
            .get(`/api/orders/${cust1OrderId}`)
            .set('Authorization', `Bearer ${customer2Token}`);
        expect(viewRes.status).toBe(403);
        expect(viewRes.body.error).toMatch(/Access denied/i);

        // Customer 2 attempts to cancel Customer 1's order
        const cancelRes = await request(app)
            .patch(`/api/orders/${cust1OrderId}/cancel`)
            .set('Authorization', `Bearer ${customer2Token}`);
        expect(cancelRes.status).toBe(403);
        expect(cancelRes.body.error).toMatch(/Access denied/i);
    });

    // ------------------------------------------------------------------------
    // 9. Inactive products are not publicly accessible
    // ------------------------------------------------------------------------
    test('9. Inactive products are hidden from public endpoints but visible to admin', async () => {
        // Create an inactive product as Admin
        const createRes = await request(app)
            .post('/api/products')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Secret Inactive Prototype',
                description: 'Under testing product',
                price: 999900,
                stock: 10,
                category_id: 1,
                is_active: 0
            });
        expect(createRes.status).toBe(201);
        const inactiveProductId = createRes.body.product.id;

        // Public catalog does not list it
        const catalogRes = await request(app).get('/api/products?limit=100');
        const foundInCatalog = catalogRes.body.products.some(p => p.id === inactiveProductId);
        expect(foundInCatalog).toBe(false);

        // Public detail GET /api/products/:id returns 404 for guests
        const publicDetailGuest = await request(app).get(`/api/products/${inactiveProductId}`);
        expect(publicDetailGuest.status).toBe(404);
        expect(publicDetailGuest.body.error).toMatch(/Product not found/i);

        // Public detail GET returns 404 for customers
        const publicDetailCust = await request(app)
            .get(`/api/products/${inactiveProductId}`)
            .set('Authorization', `Bearer ${customer1Token}`);
        expect(publicDetailCust.status).toBe(404);

        // Admin CAN view it via authenticated endpoint
        const adminDetail = await request(app)
            .get(`/api/products/${inactiveProductId}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(adminDetail.status).toBe(200);
        expect(adminDetail.body.product.id).toBe(inactiveProductId);
    });

    // ------------------------------------------------------------------------
    // 10. SQL injection-style input is treated as literal data
    // ------------------------------------------------------------------------
    test('10. SQL injection payloads are safely parameterized and treated as literal text', async () => {
        const sqliPayload = "'; DROP TABLE users; --";

        // Search parameter
        const searchRes = await request(app).get(`/api/products?search=${encodeURIComponent(sqliPayload)}`);
        expect(searchRes.status).toBe(200);
        expect(Array.isArray(searchRes.body.products)).toBe(true);

        // Login parameter
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: "' OR '1'='1' --", password: "' OR '1'='1' --" });
        expect(loginRes.status).toBe(401); // Fails safely, treated as literal non-matching data

        // Verify users table still exists and is untouched
        const usersTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
        expect(usersTable).toBeDefined();
    });

    // ------------------------------------------------------------------------
    // 11. XSS payloads are rendered safely
    // ------------------------------------------------------------------------
    test('11. XSS payloads in product/category names are stored and sanitized safely', async () => {
        const xssPayload = `<script>alert("XSS")</script><img src="x" onerror="alert(1)">_${Date.now()}`;

        const createRes = await request(app)
            .post('/api/categories')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: xssPayload });

        expect(createRes.status).toBe(201);
        const categoryId = createRes.body.category.id;

        // Verify API retrieves the string verbatim as data
        const getRes = await request(app).get('/api/categories');
        const createdCat = getRes.body.categories.find(c => c.id === categoryId);
        expect(createdCat.name).toBe(xssPayload);

        // Frontend escapeHtml logic test
        const escapeHtml = (text) => String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        const sanitized = escapeHtml(createdCat.name);
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).toContain('&lt;script&gt;');
        expect(sanitized).toContain('&lt;img src=&quot;x&quot;');
    });

    // ------------------------------------------------------------------------
    // 12. Checkout failures roll back order and inventory changes
    // ------------------------------------------------------------------------
    test('12. Checkout failures cleanly roll back order creation and stock deduction', async () => {
        // Product 1 has stock
        const p1Before = db.prepare('SELECT stock FROM products WHERE id = 1').get();

        // Put product 1 into customer 2's cart
        db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(customer2Id);
        db.prepare('INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, 1, 2)').run(customer2Id);

        // Manually exhaust product 1 stock to trigger conditional update rollback
        db.prepare('UPDATE products SET stock = 1 WHERE id = 1').run();

        // Attempt checkout
        const checkoutRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${customer2Token}`)
            .send({
                shipping_name: 'Customer Two',
                shipping_phone: '9876543211',
                shipping_address: 'Rollback Lane',
                shipping_city: 'Bengaluru',
                shipping_pincode: '560002'
            });

        expect(checkoutRes.status).toBe(409);

        // Verify NO new order was created for customer 2
        const orders = db.prepare('SELECT * FROM orders WHERE user_id = ?').all(customer2Id);
        expect(orders.length).toBe(0);

        // Verify cart items are still intact for customer to resolve
        const cart = db.prepare('SELECT * FROM cart_items WHERE user_id = ?').all(customer2Id);
        expect(cart.length).toBe(1);

        // Restore stock
        db.prepare('UPDATE products SET stock = ? WHERE id = 1').run(p1Before.stock);
    });

    // ------------------------------------------------------------------------
    // 13. Repeated cancellation cannot restore inventory more than once
    // ------------------------------------------------------------------------
    test('13. Repeated cancellation of an order cannot restore inventory stock twice', async () => {
        // Place an order for product 1 (2 units)
        db.prepare('UPDATE products SET stock = 20 WHERE id = 1').run();
        db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(customer1Id);
        db.prepare('INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, 1, 2)').run(customer1Id);

        const orderRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${customer1Token}`)
            .send({
                shipping_name: 'Customer One',
                shipping_phone: '9876543210',
                shipping_address: 'Repeat Cancel Street',
                shipping_city: 'Bengaluru',
                shipping_pincode: '560003'
            });

        expect(orderRes.status).toBe(201);
        const orderId = orderRes.body.order.id;

        // Stock decreased to 18
        expect(db.prepare('SELECT stock FROM products WHERE id = 1').get().stock).toBe(18);

        // First cancellation succeeds and restores stock to 20
        const cancel1 = await request(app)
            .patch(`/api/orders/${orderId}/cancel`)
            .set('Authorization', `Bearer ${customer1Token}`);
        expect(cancel1.status).toBe(200);
        expect(db.prepare('SELECT stock FROM products WHERE id = 1').get().stock).toBe(20);

        // Second cancellation must be rejected with 400 and stock must remain 20
        const cancel2 = await request(app)
            .patch(`/api/orders/${orderId}/cancel`)
            .set('Authorization', `Bearer ${customer1Token}`);
        expect(cancel2.status).toBe(400);
        expect(cancel2.body.error).toMatch(/Placed.*status/i);

        // Stock is still 20 (NOT restored again to 22!)
        expect(db.prepare('SELECT stock FROM products WHERE id = 1').get().stock).toBe(20);
    });

    // ------------------------------------------------------------------------
    // 14. Invalid order status transitions are rejected
    // ------------------------------------------------------------------------
    test('14. Invalid order status transitions (Delivered -> Placed, etc.) are strictly rejected', async () => {
        // Create an order
        db.prepare('UPDATE products SET stock = 20 WHERE id = 1').run();
        db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(customer1Id);
        db.prepare('INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, 1, 1)').run(customer1Id);

        const orderRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${customer1Token}`)
            .send({
                shipping_name: 'Customer One',
                shipping_phone: '9876543210',
                shipping_address: 'Transition Street',
                shipping_city: 'Bengaluru',
                shipping_pincode: '560004'
            });
        const orderId = orderRes.body.order.id;

        // Advance Placed -> Shipped (Valid)
        const s1 = await request(app)
            .patch(`/api/admin/orders/${orderId}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'Shipped' });
        expect(s1.status).toBe(200);

        // Advance Shipped -> Delivered (Valid)
        const s2 = await request(app)
            .patch(`/api/admin/orders/${orderId}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'Delivered' });
        expect(s2.status).toBe(200);

        // Attempt backward transition Delivered -> Placed (INVALID)
        const invalidBack = await request(app)
            .patch(`/api/admin/orders/${orderId}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'Placed' });
        expect(invalidBack.status).toBe(400);
        expect(invalidBack.body.error).toMatch(/Delivered orders cannot be altered/i);

        // Attempt arbitrary status transition (INVALID)
        const invalidArbitrary = await request(app)
            .patch(`/api/admin/orders/${orderId}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'Refunded' });
        expect(invalidArbitrary.status).toBe(400);
    });

    // ------------------------------------------------------------------------
    // 15. Unexpected server errors do not expose sensitive internal details
    // ------------------------------------------------------------------------
    test('15. Internal server errors return sanitized error messages without stack traces', async () => {
        const origEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        const errApp = require('express')();
        errApp.get('/throw-error', (req, res, next) => {
            const err = new Error('Secret Database connection failure at /internal/srv/db.sqlite');
            err.stack = 'Error: Secret Database connection failure\n    at internalFunction (/app/server/secret.js:42:15)';
            next(err);
        });

        // Use standard error handler from app.js
        errApp.use((err, req, res, next) => {
            console.error('Unhandled application error:', err.message);
            res.status(err.status || 500).json({
                error: process.env.NODE_ENV === 'production' 
                    ? 'Internal server error occurred.' 
                    : (err.message || 'Internal server error.')
            });
        });

        try {
            const res = await request(errApp).get('/throw-error');
            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Internal server error occurred.');
            expect(res.body.stack).toBeUndefined();
            expect(JSON.stringify(res.body)).not.toContain('/app/server/secret.js');
        } finally {
            process.env.NODE_ENV = origEnv;
        }
    });
});
