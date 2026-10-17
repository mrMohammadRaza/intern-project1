const request = require('supertest');
const app = require('../server/app');

describe('Shopping Cart API Tests', () => {
    let customerToken;
    let otherCustomerToken;
    let adminToken;
    let cartItemId;

    beforeAll(async () => {
        // Customer 1
        const custRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'customer@shopeasy.com', password: 'Customer@123' });
        customerToken = custRes.body.token;

        // Customer 2 (for cross-user ownership tests)
        const email2 = `cart_user_${Date.now()}@example.com`;
        const regRes = await request(app)
            .post('/api/auth/register')
            .send({
                name: 'Other Customer',
                email: email2,
                password: 'Password123!',
                phone: '9822334455'
            });
        otherCustomerToken = regRes.body.token;

        // Admin (to verify customerOnly restriction)
        const adminRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@shopeasy.com', password: 'Admin@123' });
        adminToken = adminRes.body.token;
    });

    test('GET /api/cart - Unauthenticated request is rejected (401)', async () => {
        const res = await request(app).get('/api/cart');
        expect(res.status).toBe(401);
    });

    test('POST /api/cart - Customer can add product to cart', async () => {
        const res = await request(app)
            .post('/api/cart')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({
                product_id: 1,
                quantity: 2
            });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('total_items');
    });

    test('GET /api/cart - Fetches cart with recalculated totals', async () => {
        const res = await request(app)
            .get('/api/cart')
            .set('Authorization', `Bearer ${customerToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.items)).toBe(true);
        expect(res.body.items.length).toBeGreaterThanOrEqual(1);

        const item = res.body.items.find(i => i.product_id === 1);
        expect(item).toBeDefined();
        cartItemId = item.id;
        expect(item.line_total).toBe(item.unit_price * item.quantity);
        expect(res.body.total_amount).toBeGreaterThan(0);
    });

    test('POST /api/cart - Adding more than available stock is rejected (400)', async () => {
        const res = await request(app)
            .post('/api/cart')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({
                product_id: 1,
                quantity: 9999
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/stock/i);
    });

    test('PUT /api/cart/:itemId - Cannot modify another user cart item (404/403)', async () => {
        const res = await request(app)
            .put(`/api/cart/${cartItemId}`)
            .set('Authorization', `Bearer ${otherCustomerToken}`)
            .send({ quantity: 3 });

        expect([403, 404]).toContain(res.status);
    });

    test('PUT /api/cart/:itemId - Updates item quantity', async () => {
        const res = await request(app)
            .put(`/api/cart/${cartItemId}`)
            .set('Authorization', `Bearer ${customerToken}`)
            .send({ quantity: 3 });

        expect(res.status).toBe(200);
        expect(res.body.item.quantity).toBe(3);
    });

    test('DELETE /api/cart/:itemId - Customer can remove item', async () => {
        const res = await request(app)
            .delete(`/api/cart/${cartItemId}`)
            .set('Authorization', `Bearer ${customerToken}`);

        expect(res.status).toBe(200);
    });

    test('POST /api/cart - Rejects non-existent product ID (404)', async () => {
        const res = await request(app)
            .post('/api/cart')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({ product_id: 999999, quantity: 1 });

        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/product not found/i);
    });

    test('POST /api/cart - Rejects zero or negative quantity (400)', async () => {
        const res = await request(app)
            .post('/api/cart')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({ product_id: 1, quantity: 0 });

        expect(res.status).toBe(400);
    });

    test('Regression: Malformed numeric values are strictly rejected in cart operations (400)', async () => {
        // 1. Malformed product ID (e.g. "12abc")
        const badProdRes = await request(app)
            .post('/api/cart')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({ product_id: '12abc', quantity: 1 });
        expect(badProdRes.status).toBe(400);

        // 2. Malformed quantity (e.g. "2xyz")
        const badQtyRes = await request(app)
            .post('/api/cart')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({ product_id: 1, quantity: '2xyz' });
        expect(badQtyRes.status).toBe(400);

        // 3. Malformed itemId parameter in PUT
        const badPutRes = await request(app)
            .put('/api/cart/12abc')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({ quantity: 2 });
        expect(badPutRes.status).toBe(400);

        // 4. Malformed itemId parameter in DELETE
        const badDelRes = await request(app)
            .delete('/api/cart/12abc')
            .set('Authorization', `Bearer ${customerToken}`);
        expect(badDelRes.status).toBe(400);
    });

    test('Regression: Admin cannot perform customer-only cart operations (403)', async () => {
        const getRes = await request(app)
            .get('/api/cart')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(getRes.status).toBe(403);

        const postRes = await request(app)
            .post('/api/cart')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ product_id: 1, quantity: 1 });
        expect(postRes.status).toBe(403);
    });
});
