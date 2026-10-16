const request = require('supertest');
const app = require('../server/app');
const { db } = require('../server/db');

describe('Orders & Checkout API Tests', () => {
    let customerToken;
    let otherCustomerToken;
    let adminToken;
    let createdOrderId;
    let initialProductStock;

    beforeAll(async () => {
        // Customer 1
        const custRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'customer@shopeasy.com', password: 'Customer@123' });
        customerToken = custRes.body.token;

        // Customer 2
        const email2 = `order_user_${Date.now()}@example.com`;
        const regRes = await request(app)
            .post('/api/auth/register')
            .send({
                name: 'Second Customer',
                email: email2,
                password: 'Password123!',
                phone: '9811223344'
            });
        otherCustomerToken = regRes.body.token;

        // Admin
        const adminRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@shopeasy.com', password: 'Admin@123' });
        adminToken = adminRes.body.token;
    });

    test('POST /api/orders - Empty cart checkout is rejected (400)', async () => {
        // Empty cart first
        const user1 = db.prepare("SELECT id FROM users WHERE email = 'customer@shopeasy.com'").get();
        db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(user1.id);

        const res = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({
                shipping_name: 'Rahul Sharma',
                shipping_phone: '9812345678',
                shipping_address: '42 Palm Avenue',
                shipping_city: 'Bengaluru',
                shipping_pincode: '560038'
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/empty/i);
    });

    test('POST /api/orders - Invalid address fields rejected', async () => {
        const res = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({
                shipping_name: 'A', // too short
                shipping_phone: '123', // invalid phone
                shipping_address: '',
                shipping_city: '',
                shipping_pincode: '00'
            });

        expect(res.status).toBe(400);
    });

    test('POST /api/orders - Successful checkout creates order and deducts stock transactionally', async () => {
        // Record current stock of product 2
        const p2 = db.prepare('SELECT stock FROM products WHERE id = 2').get();
        initialProductStock = p2.stock;

        // Add 2 units of product 2 to cart
        await request(app)
            .post('/api/cart')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({ product_id: 2, quantity: 2 });

        // Place order
        const res = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({
                shipping_name: 'Rahul Sharma',
                shipping_phone: '9812345678',
                shipping_address: '42 Palm Avenue, Indiranagar',
                shipping_city: 'Bengaluru',
                shipping_pincode: '560038'
            });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('order');
        expect(res.body.order.status).toBe('Placed');
        expect(res.body.order.items.length).toBe(1);
        expect(res.body.order.items[0].quantity).toBe(2);
        createdOrderId = res.body.order.id;

        // Verify product stock decreased by 2
        const updatedP2 = db.prepare('SELECT stock FROM products WHERE id = 2').get();
        expect(updatedP2.stock).toBe(initialProductStock - 2);

        // Verify cart is now empty
        const cartRes = await request(app)
            .get('/api/cart')
            .set('Authorization', `Bearer ${customerToken}`);
        expect(cartRes.body.items.length).toBe(0);
    });

    test('GET /api/orders - Customer sees their own orders', async () => {
        const res = await request(app)
            .get('/api/orders')
            .set('Authorization', `Bearer ${customerToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.orders)).toBe(true);
        expect(res.body.orders.some(o => o.id === createdOrderId)).toBe(true);
    });

    test('GET /api/orders/:id - Customer cannot view other customer order (403)', async () => {
        const res = await request(app)
            .get(`/api/orders/${createdOrderId}`)
            .set('Authorization', `Bearer ${otherCustomerToken}`);

        expect(res.status).toBe(403);
    });

    test('GET /api/orders/:id - Customer can view their own order details', async () => {
        const res = await request(app)
            .get(`/api/orders/${createdOrderId}`)
            .set('Authorization', `Bearer ${customerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.order.id).toBe(createdOrderId);
        expect(Array.isArray(res.body.order.items)).toBe(true);
    });

    test('PATCH /api/admin/orders/:id/status - Admin can update status', async () => {
        const res = await request(app)
            .patch(`/api/admin/orders/${createdOrderId}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'Shipped' });

        expect(res.status).toBe(200);
        expect(res.body.order.status).toBe('Shipped');
    });

    test('PATCH /api/orders/:id/cancel - Cannot cancel Shipped order', async () => {
        const res = await request(app)
            .patch(`/api/orders/${createdOrderId}/cancel`)
            .set('Authorization', `Bearer ${customerToken}`);

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Placed/i);
    });
});
