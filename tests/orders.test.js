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

    test('PATCH /api/orders/:id/cancel - Successfully cancels Placed order and restores stock transactionally', async () => {
        // 1. Add product 4 to cart and record current stock
        const p4Initial = db.prepare('SELECT stock FROM products WHERE id = 4').get();
        await request(app)
            .post('/api/cart')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({ product_id: 4, quantity: 1 });

        // 2. Checkout order
        const placeRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({
                shipping_name: 'Rahul Sharma',
                shipping_phone: '9812345678',
                shipping_address: '42 Palm Avenue',
                shipping_city: 'Bengaluru',
                shipping_pincode: '560038'
            });

        expect(placeRes.status).toBe(201);
        const newOrderId = placeRes.body.order.id;

        // Verify stock decreased by 1
        const p4AfterOrder = db.prepare('SELECT stock FROM products WHERE id = 4').get();
        expect(p4AfterOrder.stock).toBe(p4Initial.stock - 1);

        // 3. Cancel the Placed order
        const cancelRes = await request(app)
            .patch(`/api/orders/${newOrderId}/cancel`)
            .set('Authorization', `Bearer ${customerToken}`);

        expect(cancelRes.status).toBe(200);
        expect(cancelRes.body.status).toBe('Cancelled');

        // 4. Verify stock is restored transactionally
        const p4AfterCancel = db.prepare('SELECT stock FROM products WHERE id = 4').get();
        expect(p4AfterCancel.stock).toBe(p4Initial.stock);
    });

    test('POST /api/orders - Insufficient stock conflict prevents order and rolls back transaction (409)', async () => {
        // Manually insert an item into cart with quantity > available stock
        const user = db.prepare("SELECT id FROM users WHERE email = 'customer@shopeasy.com'").get();
        db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(user.id);

        // Set cart quantity = 100 for product 4 (which only has ~4 stock)
        db.prepare('INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, 4, 100)').run(user.id);

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

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/insufficient stock/i);

        // Verify no order was created
        const ordersCount = db.prepare('SELECT COUNT(*) as count FROM orders WHERE user_id = ? AND total_amount = ?').get(user.id, 79900 * 100).count;
        expect(ordersCount).toBe(0);

        // Clear invalid cart test row
        db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(user.id);
    });

    test('PATCH /api/admin/orders/:id/status - Rejects modifying Delivered order (400)', async () => {
        // First set order to Delivered
        await request(app)
            .patch(`/api/admin/orders/${createdOrderId}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'Delivered' });

        // Attempt to move it back to Placed or Shipped
        const res = await request(app)
            .patch(`/api/admin/orders/${createdOrderId}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'Shipped' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Delivered orders cannot be altered/i);
    });

    test('Regression: Malformed order IDs are strictly rejected across customer and admin routes (400)', async () => {
        // Customer GET order with malformed ID
        const getRes = await request(app)
            .get('/api/orders/12abc')
            .set('Authorization', `Bearer ${customerToken}`);
        expect(getRes.status).toBe(400);

        // Customer PATCH cancel with malformed ID
        const cancelRes = await request(app)
            .patch('/api/orders/12abc/cancel')
            .set('Authorization', `Bearer ${customerToken}`);
        expect(cancelRes.status).toBe(400);

        // Admin PATCH status with malformed ID
        const adminPatchRes = await request(app)
            .patch('/api/admin/orders/12abc/status')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'Shipped' });
        expect(adminPatchRes.status).toBe(400);
    });

    test('Regression: Admin cannot perform customer-only order operations (403)', async () => {
        // Admin cannot place retail orders
        const placeRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                shipping_name: 'Admin User',
                shipping_phone: '9876543210',
                shipping_address: '101 Admin Towers',
                shipping_city: 'Tech City',
                shipping_pincode: '560001'
            });
        expect(placeRes.status).toBe(403);
        expect(placeRes.body.error).toMatch(/Customer privileges required/i);

        // Admin cannot query customer order list directly
        const listRes = await request(app)
            .get('/api/orders')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(listRes.status).toBe(403);
    });

    test('Regression: Invalid order status transitions are rejected with 400', async () => {
        // Place an order
        await request(app)
            .post('/api/cart')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({ product_id: 1, quantity: 1 });

        const placeRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({
                shipping_name: 'Test Customer',
                shipping_phone: '9876543210',
                shipping_address: 'Indiranagar 100ft road',
                shipping_city: 'Bengaluru',
                shipping_pincode: '560038'
            });
        const orderId = placeRes.body.order.id;

        // Transition Placed -> Shipped (Valid)
        const shipRes = await request(app)
            .patch(`/api/admin/orders/${orderId}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'Shipped' });
        expect(shipRes.status).toBe(200);

        // Attempt backward transition: Shipped -> Placed (Invalid!)
        const backRes = await request(app)
            .patch(`/api/admin/orders/${orderId}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'Placed' });
        expect(backRes.status).toBe(400);
        expect(backRes.body.error).toMatch(/Invalid status transition/i);
    });

    test('Regression: Repeated cancellation cannot restore inventory stock more than once', async () => {
        // Record initial stock of product 2
        const p2Initial = db.prepare('SELECT stock FROM products WHERE id = 2').get();

        // 1. Customer adds 2 units to cart and checks out
        await request(app)
            .post('/api/cart')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({ product_id: 2, quantity: 2 });

        const placeRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({
                shipping_name: 'Test Customer',
                shipping_phone: '9876543210',
                shipping_address: '12 Brigade Road',
                shipping_city: 'Bengaluru',
                shipping_pincode: '560025'
            });
        expect(placeRes.status).toBe(201);
        const orderId = placeRes.body.order.id;

        // Stock decreased by 2
        const p2AfterOrder = db.prepare('SELECT stock FROM products WHERE id = 2').get();
        expect(p2AfterOrder.stock).toBe(p2Initial.stock - 2);

        // 2. First cancellation succeeds and restores stock
        const firstCancel = await request(app)
            .patch(`/api/orders/${orderId}/cancel`)
            .set('Authorization', `Bearer ${customerToken}`);
        expect(firstCancel.status).toBe(200);

        const p2AfterCancel1 = db.prepare('SELECT stock FROM products WHERE id = 2').get();
        expect(p2AfterCancel1.stock).toBe(p2Initial.stock);

        // 3. Repeated cancellation MUST be rejected and MUST NOT restore stock again
        const secondCancel = await request(app)
            .patch(`/api/orders/${orderId}/cancel`)
            .set('Authorization', `Bearer ${customerToken}`);
        expect(secondCancel.status).toBe(400);

        // Stock remains identical to initial, NOT over-incremented
        const p2AfterCancel2 = db.prepare('SELECT stock FROM products WHERE id = 2').get();
        expect(p2AfterCancel2.stock).toBe(p2Initial.stock);
    });

    test('Regression: Checkout rollback on stock conflict restores state and does not create order or clear cart', async () => {
        // Customer adds item with stock 3 to cart
        await request(app)
            .post('/api/cart')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({ product_id: 3, quantity: 2 });

        // Count existing orders before attempt
        const ordersBefore = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;

        // Force a stock conflict right before checkout: reduce product 3 stock to 1
        db.prepare('UPDATE products SET stock = 1 WHERE id = 3').run();

        const res = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({
                shipping_name: 'Rollback Tester',
                shipping_phone: '9812345678',
                shipping_address: '42 Palm Avenue, Indiranagar',
                shipping_city: 'Bengaluru',
                shipping_pincode: '560038'
            });

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/insufficient stock/i);

        // Verify NO order was created in DB
        const ordersAfter = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
        expect(ordersAfter).toBe(ordersBefore);

        // Verify cart items are NOT deleted
        const cartRes = await request(app)
            .get('/api/cart')
            .set('Authorization', `Bearer ${customerToken}`);
        expect(cartRes.body.items.some(i => i.product_id === 3)).toBe(true);

        // Restore product 3 stock
        db.prepare('UPDATE products SET stock = 12 WHERE id = 3').run();
        // Clear customer cart
        const custUser = db.prepare("SELECT id FROM users WHERE email = 'customer@shopeasy.com'").get();
        db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(custUser.id);
    });

    test('Regression: Safe checkout errors do not leak SQL, stack traces, or internal paths', async () => {
        // Add valid item to cart
        await request(app)
            .post('/api/cart')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({ product_id: 1, quantity: 1 });

        // Temporarily spy on/mock db.transaction to throw an internal database error
        const originalTransaction = db.transaction;
        db.transaction = () => {
            return () => {
                throw new Error('SQLITE_ERROR: near "SYNTAX_ERROR": syntax error at /var/app/internal/db.sqlite');
            };
        };

        try {
            const res = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${customerToken}`)
                .send({
                    shipping_name: 'Safe Error Tester',
                    shipping_phone: '9812345678',
                    shipping_address: '42 Palm Avenue',
                    shipping_city: 'Bengaluru',
                    shipping_pincode: '560038'
                });

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Unable to complete checkout. Please review your cart and try again.');
            // Crucial: Client response MUST NOT leak SQL, SQLite keywords, or paths
            const rawBody = JSON.stringify(res.body);
            expect(rawBody).not.toMatch(/SQLITE/i);
            expect(rawBody).not.toMatch(/SYNTAX_ERROR/i);
            expect(rawBody).not.toMatch(/\/var\/app/i);
        } finally {
            db.transaction = originalTransaction;
            const custUser = db.prepare("SELECT id FROM users WHERE email = 'customer@shopeasy.com'").get();
            db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(custUser.id);
        }
    });
});
