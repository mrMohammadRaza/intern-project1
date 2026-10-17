/**
 * ShopEasy Product Catalog & Details Logic
 */

let currentFilters = {
    search: '',
    category: 'all',
    sort: 'newest',
    page: 1,
    limit: 8
};

let searchDebounceTimeout = null;
let currentFetchSequence = 0;

/**
 * Initialize Catalog Page
 */
async function initCatalogPage() {
    await loadCategories();
    setupEventListeners();
    await fetchProducts();
}

/**
 * Load Category Filter Pills & Selects
 */
async function loadCategories() {
    const pillsContainer = document.getElementById('category-pills');
    const selectElement = document.getElementById('category-select');

    try {
        const data = await apiFetch('/categories');
        const categories = data.categories || [];

        if (pillsContainer) {
            let pillsHtml = `
                <button type="button" class="pill-btn active" data-category="all">
                    All Products
                </button>
            `;
            categories.forEach(cat => {
                pillsHtml += `
                    <button type="button" class="pill-btn" data-category="${cat.id}">
                        ${escapeHtml(cat.name)} (${cat.product_count})
                    </button>
                `;
            });
            pillsContainer.innerHTML = pillsHtml;
        }

        if (selectElement) {
            let selectHtml = `<option value="all">All Categories</option>`;
            categories.forEach(cat => {
                selectHtml += `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`;
            });
            selectElement.innerHTML = selectHtml;
        }
    } catch (err) {
        console.error('Error loading categories:', err);
    }
}

/**
 * Setup Event Listeners on Search and Sort Controls
 */
function setupEventListeners() {
    const pillsContainer = document.getElementById('category-pills');
    if (pillsContainer && !pillsContainer.dataset.delegated) {
        pillsContainer.dataset.delegated = 'true';
        pillsContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.pill-btn');
            if (btn && btn.dataset.category) {
                selectCategory(btn.dataset.category, btn);
            }
        });
    }

    const grid = document.getElementById('products-grid');
    if (grid && !grid.dataset.delegated) {
        grid.dataset.delegated = 'true';
        grid.addEventListener('click', (e) => {
            const addBtn = e.target.closest('.action-add-to-cart');
            if (addBtn && !addBtn.disabled) {
                const pid = Number(addBtn.dataset.productId);
                handleAddToCart(pid, 1, addBtn);
                return;
            }
            const resetBtn = e.target.closest('.action-reset-filters');
            if (resetBtn) {
                resetFilters();
                return;
            }
            const retryBtn = e.target.closest('.action-retry-products');
            if (retryBtn) {
                fetchProducts();
                return;
            }
        });
    }

    const paginationContainer = document.getElementById('pagination-container');
    if (paginationContainer && !paginationContainer.dataset.delegated) {
        paginationContainer.dataset.delegated = 'true';
        paginationContainer.addEventListener('click', (e) => {
            const pageBtn = e.target.closest('.page-btn');
            if (pageBtn && !pageBtn.disabled && pageBtn.dataset.page) {
                goToPage(Number(pageBtn.dataset.page));
            }
        });
    }

    const searchInput = document.getElementById('product-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchDebounceTimeout);
            searchDebounceTimeout = setTimeout(() => {
                currentFilters.search = e.target.value.trim();
                currentFilters.page = 1;
                fetchProducts();
            }, 300);
        });
    }

    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentFilters.sort = e.target.value;
            currentFilters.page = 1;
            fetchProducts();
        });
    }

    const categorySelect = document.getElementById('category-select');
    if (categorySelect) {
        categorySelect.addEventListener('change', (e) => {
            selectCategory(e.target.value);
        });
    }
}

/**
 * Filter by Category
 */
function selectCategory(categoryId, element) {
    currentFilters.category = categoryId;
    currentFilters.page = 1;

    // Update active pill styling
    const pills = document.querySelectorAll('.pill-btn');
    pills.forEach(p => p.classList.remove('active'));
    if (element) {
        element.classList.add('active');
    } else {
        const matchingPill = document.querySelector(`.pill-btn[data-category="${categoryId}"]`);
        if (matchingPill) matchingPill.classList.add('active');
    }

    const selectElement = document.getElementById('category-select');
    if (selectElement && selectElement.value !== categoryId) {
        selectElement.value = categoryId;
    }

    fetchProducts();
}

/**
 * Fetch and Render Products with Pagination
 */
async function fetchProducts() {
    const grid = document.getElementById('products-grid');
    const paginationContainer = document.getElementById('pagination-container');
    if (!grid) return;

    const fetchSeq = ++currentFetchSequence;

    // Loading State
    grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;" id="products-loading">
            <div class="empty-icon" style="display: inline-block;">⏳</div>
            <h3>Loading products...</h3>
            <p>Please wait while we fetch the latest items for you.</p>
        </div>
    `;
    if (paginationContainer) {
        paginationContainer.innerHTML = '';
    }

    try {
        const queryParams = new URLSearchParams({
            search: currentFilters.search,
            category: currentFilters.category,
            sort: currentFilters.sort,
            page: currentFilters.page,
            limit: currentFilters.limit
        });

        const data = await apiFetch(`/products?${queryParams.toString()}`);

        // Discard stale responses from older requests (prevents race condition overwrites)
        if (fetchSeq !== currentFetchSequence) {
            return;
        }

        const products = data.products || [];
        const pagination = data.pagination || { page: 1, totalPages: 1 };

        // Empty State
        if (products.length === 0) {
            const isFiltered = Boolean(
                (currentFilters.search && currentFilters.search.trim() !== '') ||
                (currentFilters.category && currentFilters.category !== 'all')
            );

            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;" id="products-empty-state">
                    <div class="empty-icon">${isFiltered ? '🔍' : '📦'}</div>
                    <h3>${isFiltered ? 'No products found' : 'No products available'}</h3>
                    <p>${isFiltered ? "We couldn't find any products matching your search criteria. Try adjusting your filters." : "Our store catalog is currently empty. Please check back soon!"}</p>
                    ${isFiltered 
                        ? '<button type="button" class="btn btn-outline action-reset-filters">Reset All Filters</button>' 
                        : '<button type="button" class="btn btn-primary action-retry-products">Refresh</button>'}
                </div>
            `;
            if (paginationContainer) paginationContainer.innerHTML = '';
            return;
        }

        const fallbackImg = '/images/placeholder.svg';
        let html = '';

        products.forEach(p => {
            const imageUrl = (p.image_url && p.image_url.trim()) ? p.image_url.trim() : fallbackImg;
            const isOutOfStock = p.stock <= 0;
            const isLowStock = p.stock > 0 && p.stock < 5;

            html += `
                <div class="product-card" id="product-${p.id}">
                    <div class="card-image-wrap">
                        <span class="card-badge badge-cat">${escapeHtml(p.category_name || 'General')}</span>
                        ${isOutOfStock ? '<span class="card-badge badge-out-of-stock">Out of Stock</span>' : ''}
                        ${isLowStock ? `<span class="card-badge badge-stock-low">Only ${p.stock} Left!</span>` : ''}
                        <a href="/product.html?id=${p.id}">
                            <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(p.name)}" 
                                 loading="lazy"
                                 onerror="this.onerror=null; this.src='${fallbackImg}';">
                        </a>
                    </div>
                    <div class="card-body">
                        <a href="/product.html?id=${p.id}" class="card-title">${escapeHtml(p.name)}</a>
                        <p class="card-desc">${escapeHtml(p.description || '')}</p>
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
        });

        grid.innerHTML = html;
        renderPagination(pagination);
    } catch (err) {
        // Discard stale error responses
        if (fetchSeq !== currentFetchSequence) {
            return;
        }

        console.error('Error fetching products:', err);
        if (paginationContainer) paginationContainer.innerHTML = '';
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;" id="products-error-state">
                <div class="empty-icon">⚠️</div>
                <h3>Failed to load products</h3>
                <p>${escapeHtml(err.message || 'Unable to connect to the catalog service.')}</p>
                <button type="button" class="btn btn-primary action-retry-products">Retry</button>
            </div>
        `;
    }
}

/**
 * Reset Search and Category Filters
 */
function resetFilters() {
    currentFilters = {
        search: '',
        category: 'all',
        sort: 'newest',
        page: 1,
        limit: 8
    };

    const searchInput = document.getElementById('product-search');
    if (searchInput) searchInput.value = '';

    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) sortSelect.value = 'newest';

    selectCategory('all');
}

/**
 * Render Pagination Controls
 */
function renderPagination(pagination) {
    const container = document.getElementById('pagination-container');
    if (!container) return;

    const { page, totalPages } = pagination;
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = `
        <button type="button" class="page-btn" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">
            &larr; Prev
        </button>
    `;

    for (let i = 1; i <= totalPages; i++) {
        html += `
            <button type="button" class="page-btn ${i === page ? 'active' : ''}" data-page="${i}">
                ${i}
            </button>
        `;
    }

    html += `
        <button type="button" class="page-btn" ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}">
            Next &rarr;
        </button>
    `;

    container.innerHTML = html;
}

function goToPage(page) {
    currentFilters.page = page;
    fetchProducts();
    window.scrollTo({ top: 300, behavior: 'smooth' });
}

/**
 * Universal Add to Cart Handler
 */
async function handleAddToCart(productId, quantity = 1, buttonElement) {
    if (!Auth.isLoggedIn()) {
        showToast('Please login to add items to your cart.', 'info');
        setTimeout(() => {
            window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        }, 1200);
        return;
    }

    if (Auth.isAdmin()) {
        showToast('Administrator accounts cannot place shopping orders.', 'error');
        return;
    }

    if (buttonElement) {
        buttonElement.disabled = true;
        buttonElement.textContent = 'Adding...';
    }

    try {
        const response = await apiFetch('/cart', {
            method: 'POST',
            body: JSON.stringify({ product_id: productId, quantity })
        });

        showToast(response.message || 'Item added to your cart!', 'success');
        updateCartBadge();
    } catch (err) {
        showToast(err.message || 'Failed to add item to cart.', 'error');
    } finally {
        if (buttonElement) {
            buttonElement.disabled = false;
            buttonElement.textContent = '+ Cart';
        }
    }
}

/**
 * Initialize Product Detail Page
 */
async function initProductDetailsPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    const detailContainer = document.getElementById('product-detail-container');
    if (!detailContainer) return;

    if (!productId) {
        detailContainer.innerHTML = `
            <div class="empty-state">
                <h3>No Product Specified</h3>
                <p>Please return to the store catalog to select a product.</p>
                <a href="/index.html" class="btn btn-primary">Browse Products</a>
            </div>
        `;
        return;
    }

    detailContainer.innerHTML = `<p style="text-align:center; padding:3rem;">⏳ Loading product details...</p>`;

    try {
        const data = await apiFetch(`/products/${productId}`);
        const p = data.product;

        const fallbackImg = '/images/placeholder.svg';
        const imageUrl = (p.image_url && p.image_url.trim()) ? p.image_url.trim() : fallbackImg;
        const isOutOfStock = p.stock <= 0;
        const isLowStock = p.stock > 0 && p.stock < 5;

        detailContainer.innerHTML = `
            <div class="product-detail-layout">
                <div class="detail-gallery">
                    <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(p.name)}" 
                         onerror="this.onerror=null; this.src='${fallbackImg}';">
                </div>
                <div class="detail-info">
                    <span class="detail-category">${escapeHtml(p.category_name)}</span>
                    <h1 class="detail-title">${escapeHtml(p.name)}</h1>
                    <div class="detail-price">${formatRupees(p.price)}</div>

                    <div class="stock-status ${isOutOfStock ? 'out-of-stock' : (isLowStock ? 'low-stock' : 'in-stock')}">
                        <span>●</span>
                        <span>${isOutOfStock ? 'Out of Stock' : (isLowStock ? `Only ${p.stock} Left In Stock!` : `In Stock (${p.stock} units available)`)}</span>
                    </div>

                    <p class="detail-desc">${escapeHtml(p.description || 'No description available for this item.')}</p>

                    ${!isOutOfStock ? `
                        <div style="margin-bottom: 0.5rem; font-weight:600; font-size: 0.9rem;">Quantity:</div>
                        <div class="quantity-control">
                            <button type="button" class="qty-btn" id="qty-minus-btn" data-stock="${p.stock}">-</button>
                            <input type="number" id="detail-qty" class="qty-input" value="1" min="1" max="${p.stock}" readonly>
                            <button type="button" class="qty-btn" id="qty-plus-btn" data-stock="${p.stock}">+</button>
                        </div>
                    ` : ''}

                    <div style="display:flex; gap:1rem; margin-top: 1rem;">
                        <button type="button" class="btn btn-primary btn-lg" 
                                id="detail-add-btn"
                                data-product-id="${p.id}"
                                ${isOutOfStock ? 'disabled' : ''}>
                            ${isOutOfStock ? 'Currently Unavailable' : '🛒 Add to Cart'}
                        </button>
                        <a href="/index.html" class="btn btn-outline btn-lg">Back to Shop</a>
                    </div>
                </div>
            </div>
        `;

        const minusBtn = document.getElementById('qty-minus-btn');
        const plusBtn = document.getElementById('qty-plus-btn');
        const addBtn = document.getElementById('detail-add-btn');

        if (minusBtn) {
            minusBtn.addEventListener('click', () => adjustQty(-1, Number(minusBtn.dataset.stock)));
        }
        if (plusBtn) {
            plusBtn.addEventListener('click', () => adjustQty(1, Number(plusBtn.dataset.stock)));
        }
        if (addBtn && !isOutOfStock) {
            addBtn.addEventListener('click', () => addCurrentProductToCart(p.id));
        }
    } catch (err) {
        detailContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⚠️</div>
                <h3>Product Not Found</h3>
                <p>${escapeHtml(err.message)}</p>
                <a href="/index.html" class="btn btn-primary">Browse All Products</a>
            </div>
        `;
    }
}

function adjustQty(change, maxStock) {
    const input = document.getElementById('detail-qty');
    if (!input) return;
    let current = parseInt(input.value, 10) || 1;
    current += change;
    if (current < 1) current = 1;
    if (current > maxStock) current = maxStock;
    input.value = current;
}

function addCurrentProductToCart(productId) {
    const input = document.getElementById('detail-qty');
    const qty = input ? parseInt(input.value, 10) : 1;
    const btn = document.getElementById('detail-add-btn');
    handleAddToCart(productId, qty, btn);
}
