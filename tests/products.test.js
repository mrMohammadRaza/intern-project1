const request = require('supertest');
const app = require('../server/app');

describe('Products & Categories API Tests', () => {
    let adminToken;
    let customerToken;
    let createdProductId;

    beforeAll(async () => {
        // Log in admin
        const adminRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@shopeasy.com', password: 'Admin@123' });
        adminToken = adminRes.body.token;

        // Log in customer
        const custRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'customer@shopeasy.com', password: 'Customer@123' });
        customerToken = custRes.body.token;
    });

    test('GET /api/categories - Lists categories with product counts', async () => {
        const res = await request(app).get('/api/categories');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.categories)).toBe(true);
        expect(res.body.categories.length).toBeGreaterThanOrEqual(3);
    });

    test('GET /api/products - Returns paginated product list', async () => {
        const res = await request(app).get('/api/products?page=1&limit=8');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.products)).toBe(true);
        expect(res.body.pagination).toBeDefined();
        expect(res.body.pagination.limit).toBe(8);
    });

    test('GET /api/products - Search by keyword returns matching results', async () => {
        const res = await request(app).get('/api/products?search=Headphones');
        expect(res.status).toBe(200);
        expect(res.body.products.length).toBeGreaterThanOrEqual(1);
        expect(res.body.products[0].name).toMatch(/Headphones/i);
    });

    test('GET /api/products - Filter by category', async () => {
        const res = await request(app).get('/api/products?category=1');
        expect(res.status).toBe(200);
        expect(res.body.products.every(p => p.category_id === 1)).toBe(true);
    });

    test('GET /api/products - Price sorting works (price_asc)', async () => {
        const res = await request(app).get('/api/products?sort=price_asc&limit=10');
        expect(res.status).toBe(200);
        const prices = res.body.products.map(p => p.price);
        for (let i = 1; i < prices.length; i++) {
            expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
        }
    });

    test('GET /api/products/:id - Returns single product details', async () => {
        const res = await request(app).get('/api/products/1');
        expect(res.status).toBe(200);
        expect(res.body.product.id).toBe(1);
    });

    test('GET /api/products/:id - Non-existent ID returns 404', async () => {
        const res = await request(app).get('/api/products/999999');
        expect(res.status).toBe(404);
    });

    test('POST /api/products - Customer cannot create product (403)', async () => {
        const res = await request(app)
            .post('/api/products')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({
                name: 'Unauthorized Product',
                category_id: 1,
                price: 10000,
                stock: 5
            });
        expect(res.status).toBe(403);
    });

    test('POST /api/products - Admin can create product', async () => {
        const res = await request(app)
            .post('/api/products')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Test Smart Gadget',
                description: 'A great test gadget for automated tests',
                category_id: 1,
                price: 149900,
                stock: 15,
                image_url: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=600',
                is_active: 1
            });

        expect(res.status).toBe(201);
        expect(res.body.product).toHaveProperty('id');
        createdProductId = res.body.product.id;
    });

    test('PUT /api/products/:id - Admin can update product', async () => {
        const res = await request(app)
            .put(`/api/products/${createdProductId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Updated Smart Gadget',
                description: 'Updated description',
                category_id: 1,
                price: 179900,
                stock: 20,
                is_active: 1
            });

        expect(res.status).toBe(200);
        expect(res.body.product.name).toBe('Updated Smart Gadget');
        expect(res.body.product.price).toBe(179900);
    });

    test('DELETE /api/products/:id - Admin can delete unused product', async () => {
        const res = await request(app)
            .delete(`/api/products/${createdProductId}`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
    });

    test('POST /api/products - Rejects invalid category reference (400)', async () => {
        const res = await request(app)
            .post('/api/products')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Bad Category Product',
                category_id: 999999,
                price: 10000,
                stock: 10
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/category does not exist/i);
    });

    test('POST /api/products - Rejects negative price or stock (400)', async () => {
        const res = await request(app)
            .post('/api/products')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Negative Price Product',
                category_id: 1,
                price: -500,
                stock: -2
            });

        expect(res.status).toBe(400);
    });

    test('POST /api/categories - Admin can create a new category (201)', async () => {
        const catName = `New Category ${Date.now()}`;
        const res = await request(app)
            .post('/api/categories')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: catName });

        expect(res.status).toBe(201);
        expect(res.body.category.name).toBe(catName);

        const newCatId = res.body.category.id;

        // Duplicate rejection test
        const dupRes = await request(app)
            .post('/api/categories')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: catName });
        expect(dupRes.status).toBe(409);

        // Update category test
        const updateRes = await request(app)
            .put(`/api/categories/${newCatId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: `${catName} Updated` });
        expect(updateRes.status).toBe(200);

        // Delete empty category test
        const delRes = await request(app)
            .delete(`/api/categories/${newCatId}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(delRes.status).toBe(200);
    });

    test('DELETE /api/categories/:id - Safely rejects deletion if category has products (400)', async () => {
        // Category 1 (Electronics) has multiple active products
        const res = await request(app)
            .delete('/api/categories/1')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/assigned to/i);
    });
});
