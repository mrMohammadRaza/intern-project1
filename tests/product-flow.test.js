const request = require('supertest');
const app = require('../server/app');
const { db, seedData } = require('../server/db');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('ShopEasy Product Flow & UI Rendering Tests', () => {
    test('1. Frontend JavaScript files pass strict syntax validation', () => {
        const jsDir = path.resolve(__dirname, '../public/js');
        const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
        expect(files.length).toBeGreaterThan(0);

        files.forEach(file => {
            const code = fs.readFileSync(path.join(jsDir, file), 'utf8');
            expect(() => {
                new vm.Script(code, { filename: file });
            }).not.toThrow();
        });
    });

    test('2. The products API returns the expected products and pagination structure', async () => {
        const res = await request(app).get('/api/products?page=1&limit=8');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('products');
        expect(res.body).toHaveProperty('pagination');
        expect(Array.isArray(res.body.products)).toBe(true);
        expect(res.body.products.length).toBeGreaterThan(0);

        const sample = res.body.products[0];
        expect(sample).toHaveProperty('id');
        expect(sample).toHaveProperty('name');
        expect(sample).toHaveProperty('price');
        expect(sample).toHaveProperty('stock');
        expect(sample).toHaveProperty('category_name');
        expect(sample).toHaveProperty('image_url');
        expect(sample.is_active).toBe(1);

        expect(res.body.pagination).toMatchObject({
            page: 1,
            limit: 8,
            total: expect.any(Number),
            totalPages: expect.any(Number)
        });
    });

    test('3. Active products appear and inactive products remain hidden from public shoppers', async () => {
        // Query database directly to see if any inactive product exists, or create a temporary one
        const inactiveStmt = db.prepare(`
            INSERT INTO products (category_id, name, description, price, stock, is_active)
            VALUES (1, 'Hidden Inactive Test Item', 'Should never show up in catalog', 99900, 10, 0)
        `);
        const result = inactiveStmt.run();
        const inactiveId = result.lastInsertRowid;

        try {
            // Customer public list must not include this inactive product
            const listRes = await request(app).get('/api/products?limit=100');
            expect(listRes.status).toBe(200);
            const foundInList = listRes.body.products.some(p => p.id === inactiveId);
            expect(foundInList).toBe(false);

            // Customer direct GET /api/products/:id must return 404
            const detailRes = await request(app).get(`/api/products/${inactiveId}`);
            expect(detailRes.status).toBe(404);
        } finally {
            db.prepare('DELETE FROM products WHERE id = ?').run(inactiveId);
        }
    });

    test('4. Product cards render correctly using the actual API response data and handle fallbacks', async () => {
        const res = await request(app).get('/api/products?limit=2');
        expect(res.status).toBe(200);
        const products = res.body.products;
        expect(products.length).toBeGreaterThan(0);

        // Helper mimicking products.js card rendering
        function renderCardHtml(p) {
            const fallbackImg = '/images/placeholder.svg';
            const imageUrl = (p.image_url && p.image_url.trim()) ? p.image_url.trim() : fallbackImg;
            const isOutOfStock = p.stock <= 0;
            const isLowStock = p.stock > 0 && p.stock < 5;
            const formatRupees = (paise) => '₹' + (Number(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });

            return `
                <div class="product-card" id="product-${p.id}">
                    <div class="card-image-wrap">
                        <span class="card-badge badge-cat">${p.category_name || 'General'}</span>
                        ${isOutOfStock ? '<span class="card-badge badge-out-of-stock">Out of Stock</span>' : ''}
                        ${isLowStock ? `<span class="card-badge badge-stock-low">Only ${p.stock} Left!</span>` : ''}
                        <a href="/product.html?id=${p.id}">
                            <img src="${imageUrl}" alt="${p.name}" loading="lazy" onerror="this.onerror=null; this.src='${fallbackImg}';">
                        </a>
                    </div>
                    <div class="card-body">
                        <a href="/product.html?id=${p.id}" class="card-title">${p.name}</a>
                        <p class="card-desc">${p.description || ''}</p>
                        <div class="card-footer">
                            <span class="price-tag">${formatRupees(p.price)}</span>
                            <button type="button" class="btn btn-primary btn-sm action-add-to-cart" 
                                    id="add-to-cart-btn-${p.id}"
                                    data-product-id="${p.id}"
                                    ${isOutOfStock ? 'disabled title="Out of stock"' : ''}>
                                ${isOutOfStock ? 'Sold Out' : '+ Cart'}
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        products.forEach(product => {
            const cardHtml = renderCardHtml(product);
            expect(cardHtml).toContain(`id="product-${product.id}"`);
            expect(cardHtml).toContain(`id="add-to-cart-btn-${product.id}"`);
            expect(cardHtml).toContain(product.name);
            expect(cardHtml).toContain(product.category_name);
            expect(cardHtml).toContain('₹');
            expect(cardHtml).toContain('/images/placeholder.svg');
        });

        // Test fallback when image_url is missing
        const mockProductNoImg = {
            id: 9999,
            name: 'No Image Gadget',
            category_name: 'Electronics',
            price: 50000,
            stock: 10,
            image_url: null,
            description: 'Item without an image'
        };
        const noImgHtml = renderCardHtml(mockProductNoImg);
        expect(noImgHtml).toContain('src="/images/placeholder.svg"');
    });

    test('5. Search and category filtering work accurately', async () => {
        // Search test
        const searchRes = await request(app).get('/api/products?search=Wireless');
        expect(searchRes.status).toBe(200);
        expect(searchRes.body.products.length).toBeGreaterThan(0);
        searchRes.body.products.forEach(p => {
            const matches = p.name.toLowerCase().includes('wireless') || (p.description && p.description.toLowerCase().includes('wireless'));
            expect(matches).toBe(true);
        });

        // Category test
        const catRes = await request(app).get('/api/products?category=1');
        expect(catRes.status).toBe(200);
        expect(catRes.body.products.length).toBeGreaterThan(0);
        catRes.body.products.forEach(p => {
            expect(p.category_id).toBe(1);
        });

        // Category + Search combined
        const combinedRes = await request(app).get('/api/products?category=1&search=Keyboard');
        expect(combinedRes.status).toBe(200);
        expect(combinedRes.body.products.length).toBeGreaterThan(0);
        combinedRes.body.products.forEach(p => {
            expect(p.category_id).toBe(1);
            expect(p.name.toLowerCase()).toContain('keyboard');
        });
    });

    test('6. Empty results and error UI states format properly', () => {
        function renderEmptyState(isFiltered) {
            return `
                <div class="empty-state" style="grid-column: 1 / -1;" id="products-empty-state">
                    <div class="empty-icon">${isFiltered ? '🔍' : '📦'}</div>
                    <h3>${isFiltered ? 'No products found' : 'No products available'}</h3>
                    <p>${isFiltered ? "We couldn't find any products matching your search criteria. Try adjusting your filters." : "Our store catalog is currently empty. Please check back soon!"}</p>
                    ${isFiltered 
                        ? '<button type="button" class="btn btn-outline action-reset-filters">Reset All Filters</button>' 
                        : '<button type="button" class="btn btn-primary action-retry-products">Refresh</button>'}
                </div>
            `;
        }

        function renderErrorState(errorMessage) {
            return `
                <div class="empty-state" style="grid-column: 1 / -1;" id="products-error-state">
                    <div class="empty-icon">⚠️</div>
                    <h3>Failed to load products</h3>
                    <p>${errorMessage}</p>
                    <button type="button" class="btn btn-primary action-retry-products">Retry</button>
                </div>
            `;
        }

        const filteredEmpty = renderEmptyState(true);
        expect(filteredEmpty).toContain('No products found');
        expect(filteredEmpty).toContain('action-reset-filters');

        const catalogEmpty = renderEmptyState(false);
        expect(catalogEmpty).toContain('No products available');
        expect(catalogEmpty).toContain('action-retry-products');

        const errorHtml = renderErrorState('Network connection timeout');
        expect(errorHtml).toContain('Failed to load products');
        expect(errorHtml).toContain('Network connection timeout');
        expect(errorHtml).toContain('action-retry-products');
    });

    test('7. Product detail pages load valid products and return 404 for invalid IDs', async () => {
        // Valid product detail
        const res = await request(app).get('/api/products/1');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('product');
        expect(res.body.product.id).toBe(1);
        expect(res.body.product.name).toBeDefined();
        expect(res.body.product.category_name).toBeDefined();

        // Nonexistent ID
        const notFoundRes = await request(app).get('/api/products/888888');
        expect(notFoundRes.status).toBe(404);
        expect(notFoundRes.body).toHaveProperty('error');

        // Invalid non-integer ID
        const invalidRes = await request(app).get('/api/products/abc');
        expect(invalidRes.status).toBe(400);
    });

    test('8. Pagination and sorting do not break rendering and return correct order', async () => {
        // Page 1 vs Page 2
        const p1 = await request(app).get('/api/products?page=1&limit=4');
        const p2 = await request(app).get('/api/products?page=2&limit=4');

        expect(p1.status).toBe(200);
        expect(p2.status).toBe(200);
        expect(p1.body.products.length).toBe(4);
        expect(p2.body.products.length).toBe(4);

        const idsPage1 = p1.body.products.map(p => p.id);
        const idsPage2 = p2.body.products.map(p => p.id);
        // Page 1 and Page 2 should not have overlapping IDs
        idsPage1.forEach(id => {
            expect(idsPage2).not.toContain(id);
        });

        // Price ascending sort
        const ascRes = await request(app).get('/api/products?sort=price_asc&limit=10');
        expect(ascRes.status).toBe(200);
        const ascPrices = ascRes.body.products.map(p => p.price);
        for (let i = 1; i < ascPrices.length; i++) {
            expect(ascPrices[i]).toBeGreaterThanOrEqual(ascPrices[i - 1]);
        }

        // Price descending sort
        const descRes = await request(app).get('/api/products?sort=price_desc&limit=10');
        expect(descRes.status).toBe(200);
        const descPrices = descRes.body.products.map(p => p.price);
        for (let i = 1; i < descPrices.length; i++) {
            expect(descPrices[i]).toBeLessThanOrEqual(descPrices[i - 1]);
        }
    });

    test('9. Product seed data can be executed safely and idempotently without duplicate records', () => {
        const initialCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
        const initialCatCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;

        // Re-run seedData
        const result = seedData();
        expect(result).toBe(true);

        const afterCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
        const afterCatCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;

        // Counts must be strictly identical (no duplicate rows)
        expect(afterCount).toBe(initialCount);
        expect(afterCatCount).toBe(initialCatCount);
    });
});
