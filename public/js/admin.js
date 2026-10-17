/**
 * ShopEasy Administrator Portal Logic
 * Protects admin views and executes statistics, product CRUD, and order management
 */

// Verify admin access upon loading
document.addEventListener('DOMContentLoaded', () => {
    if (Auth.requireAdmin()) {
        const path = window.location.pathname;
        if (path.includes('dashboard.html')) {
            initAdminDashboard();
        } else if (path.includes('products.html')) {
            initAdminProducts();
        } else if (path.includes('orders.html')) {
            initAdminOrders();
        }
    }
});

/**
 * ----------------------------------------------------
 * Admin Dashboard
 * ----------------------------------------------------
 */
async function initAdminDashboard() {
    try {
        const data = await apiFetch('/admin/stats');
        const stats = data.stats;

        const valProducts = document.getElementById('stat-total-products');
        const valOrders = document.getElementById('stat-total-orders');
        const valCustomers = document.getElementById('stat-total-customers');
        const valSales = document.getElementById('stat-total-sales');
        const valLowStock = document.getElementById('stat-low-stock');

        if (valProducts) valProducts.textContent = stats.total_products;
        if (valOrders) valOrders.textContent = stats.total_orders;
        if (valCustomers) valCustomers.textContent = stats.total_customers;
        if (valSales) valSales.textContent = formatRupees(stats.total_sales);
        if (valLowStock) valLowStock.textContent = stats.low_stock_count;

        // Render recent orders table
        const recentTableBody = document.getElementById('recent-orders-tbody');
        if (recentTableBody) {
            if (!stats.recent_orders || stats.recent_orders.length === 0) {
                recentTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2rem;">No orders placed yet.</td></tr>`;
            } else {
                let rowsHtml = '';
                stats.recent_orders.forEach(o => {
                    const dateStr = new Date(o.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                    });

                    rowsHtml += `
                        <tr>
                            <td><strong>#${o.id}</strong></td>
                            <td>${escapeHtml(o.customer_name)}<br><small style="color:var(--text-muted);">${escapeHtml(o.customer_email)}</small></td>
                            <td>${dateStr}</td>
                            <td><strong>${formatRupees(o.total_amount)}</strong></td>
                            <td>
                                <span class="status-badge status-${o.status.toLowerCase()}">
                                    ● ${escapeHtml(o.status)}
                                </span>
                            </td>
                        </tr>
                    `;
                });
                recentTableBody.innerHTML = rowsHtml;
            }
        }
    } catch (err) {
        console.error('Error loading admin dashboard stats:', err);
        showToast('Failed to load dashboard metrics.', 'error');
    }
}

/**
 * ----------------------------------------------------
 * Admin Product Management
 * ----------------------------------------------------
 */
let adminCategoriesList = [];
let adminProductSearchDebounce = null;

async function initAdminProducts() {
    setupAdminProductFilters();
    await loadAdminCategories();
    await loadAdminProductsTable();
}

function setupAdminProductFilters() {
    const searchInput = document.getElementById('admin-product-search');
    const catFilter = document.getElementById('admin-product-category-filter');
    const statusFilter = document.getElementById('admin-product-status-filter');

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(adminProductSearchDebounce);
            adminProductSearchDebounce = setTimeout(() => loadAdminProductsTable(), 250);
        });
    }

    if (catFilter) {
        catFilter.addEventListener('change', () => loadAdminProductsTable());
    }

    if (statusFilter) {
        statusFilter.addEventListener('change', () => loadAdminProductsTable());
    }
}

async function loadAdminCategories() {
    try {
        const data = await apiFetch('/categories');
        adminCategoriesList = data.categories || [];

        const catSelect = document.getElementById('product-category-input');
        if (catSelect) {
            let html = '<option value="">Select Category</option>';
            adminCategoriesList.forEach(c => {
                html += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
            });
            catSelect.innerHTML = html;
        }

        const catFilter = document.getElementById('admin-product-category-filter');
        if (catFilter) {
            let filterHtml = '<option value="">All Categories</option>';
            adminCategoriesList.forEach(c => {
                filterHtml += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
            });
            catFilter.innerHTML = filterHtml;
        }
    } catch (err) {
        console.error('Error fetching categories for admin:', err);
    }
}

async function loadAdminProductsTable() {
    const tbody = document.getElementById('admin-products-tbody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem;">⏳ Loading products...</td></tr>`;

    const searchQuery = document.getElementById('admin-product-search')?.value.trim().toLowerCase() || '';
    const categoryId = document.getElementById('admin-product-category-filter')?.value || '';
    const statusVal = document.getElementById('admin-product-status-filter')?.value || 'all';

    try {
        const data = await apiFetch('/products?status=all&limit=100');
        let products = data.products || [];

        // Apply in-memory filters for real-time reactivity
        if (searchQuery) {
            products = products.filter(p => 
                p.name.toLowerCase().includes(searchQuery) || 
                (p.description && p.description.toLowerCase().includes(searchQuery)) ||
                String(p.id) === searchQuery
            );
        }

        if (categoryId) {
            products = products.filter(p => String(p.category_id) === String(categoryId));
        }

        if (statusVal === 'active') {
            products = products.filter(p => p.is_active === 1);
        } else if (statusVal === 'inactive') {
            products = products.filter(p => p.is_active === 0);
        }

        if (products.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; padding:3rem;">
                        <div style="font-size:1.5rem; margin-bottom:0.5rem;">🔍</div>
                        <strong style="color:var(--dark);">No products match your filter criteria</strong>
                        <p style="color:var(--text-muted); font-size:0.88rem; margin-top:0.25rem;">Try adjusting your keyword or category filter.</p>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        products.forEach(p => {
            const fallbackImg = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600";
            const imgUrl = p.image_url || fallbackImg;
            const isLowStock = p.stock > 0 && p.stock < 5;
            const isOutStock = p.stock <= 0;

            html += `
                <tr id="admin-prod-row-${p.id}">
                    <td><strong>#${p.id}</strong></td>
                    <td>
                        <div style="display:flex; align-items:center; gap:0.75rem;">
                            <img src="${escapeHtml(imgUrl)}" style="width:44px; height:44px; border-radius:var(--radius-sm); object-fit:cover;" onerror="this.src='${fallbackImg}';">
                            <div>
                                <div style="font-weight:700;">${escapeHtml(p.name)}</div>
                                <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(p.category_name)}</div>
                            </div>
                        </div>
                    </td>
                    <td><strong>${formatRupees(p.price)}</strong></td>
                    <td>
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <span>${p.stock} units</span>
                            ${isOutStock ? '<span class="status-badge status-cancelled">Out of stock</span>' : ''}
                            ${isLowStock ? '<span class="status-badge status-shipped">Low Stock (&lt;5)</span>' : ''}
                        </div>
                    </td>
                    <td>
                        <span class="status-badge ${p.is_active ? 'status-active' : 'status-inactive'}">
                            ${p.is_active ? 'Active' : 'Inactive'}
                        </span>
                    </td>
                    <td>
                        <div style="display:flex; gap:0.5rem;">
                            <button class="btn btn-outline btn-sm" onclick="openEditProductModal(${JSON.stringify(p).replace(/"/g, '&quot;')})">
                                ✏️ Edit
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id}, '${escapeHtml(p.name)}')">
                                🗑️ Remove
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--danger); padding:2rem;">${escapeHtml(err.message)}</td></tr>`;
    }
}

function openAddProductModal() {
    document.getElementById('product-modal-title').textContent = 'Add New Product';
    document.getElementById('product-id-input').value = '';
    document.getElementById('product-name-input').value = '';
    document.getElementById('product-desc-input').value = '';
    document.getElementById('product-price-input').value = '';
    document.getElementById('product-stock-input').value = '10';
    document.getElementById('product-image-input').value = '';
    document.getElementById('product-active-input').value = '1';

    const modal = document.getElementById('product-modal');
    if (modal) modal.classList.add('open');
}

function openEditProductModal(product) {
    document.getElementById('product-modal-title').textContent = `Edit Product #${product.id}`;
    document.getElementById('product-id-input').value = product.id;
    document.getElementById('product-name-input').value = product.name;
    document.getElementById('product-desc-input').value = product.description || '';
    // Display in Rupees (paise / 100)
    document.getElementById('product-price-input').value = (product.price / 100).toFixed(2);
    document.getElementById('product-stock-input').value = product.stock;
    document.getElementById('product-category-input').value = product.category_id;
    document.getElementById('product-image-input').value = product.image_url || '';
    document.getElementById('product-active-input').value = product.is_active ? '1' : '0';

    const modal = document.getElementById('product-modal');
    if (modal) modal.classList.add('open');
}

function closeProductModal() {
    const modal = document.getElementById('product-modal');
    if (modal) modal.classList.remove('open');
}

async function handleSaveProduct(e) {
    e.preventDefault();

    const id = document.getElementById('product-id-input').value;
    const name = document.getElementById('product-name-input').value.trim();
    const description = document.getElementById('product-desc-input').value.trim();
    const priceRupees = parseFloat(document.getElementById('product-price-input').value);
    const stock = parseInt(document.getElementById('product-stock-input').value, 10);
    const category_id = parseInt(document.getElementById('product-category-input').value, 10);
    const image_url = document.getElementById('product-image-input').value.trim();
    const is_active = parseInt(document.getElementById('product-active-input').value, 10);

    if (!name) {
        showToast('Product name is required.', 'error');
        return;
    }
    if (isNaN(priceRupees) || priceRupees < 0) {
        showToast('Please enter a valid price.', 'error');
        return;
    }
    if (isNaN(stock) || stock < 0) {
        showToast('Please enter a valid stock quantity.', 'error');
        return;
    }
    if (isNaN(category_id)) {
        showToast('Please select a category.', 'error');
        return;
    }

    // Convert Rupees to paise integer
    const pricePaise = Math.round(priceRupees * 100);

    const payload = {
        name,
        description,
        price: pricePaise,
        stock,
        category_id,
        image_url,
        is_active
    };

    const isEdit = !!id;
    const url = isEdit ? `/products/${id}` : '/products';
    const method = isEdit ? 'PUT' : 'POST';

    try {
        const result = await apiFetch(url, {
            method,
            body: JSON.stringify(payload)
        });

        showToast(result.message || 'Product saved successfully.', 'success');
        closeProductModal();
        loadAdminProductsTable();
    } catch (err) {
        showToast(err.message || 'Failed to save product.', 'error');
    }
}

async function deleteProduct(productId, productName) {
    const confirmed = await showConfirmDialog({
        title: 'Delete Product',
        message: `Are you sure you want to delete or deactivate "${productName}"?`,
        confirmText: 'Delete Product',
        type: 'danger'
    });
    if (!confirmed) {
        return;
    }

    try {
        const result = await apiFetch(`/products/${productId}`, {
            method: 'DELETE'
        });

        showToast(result.message || 'Product removed.', 'info');
        loadAdminProductsTable();
    } catch (err) {
        showToast(err.message || 'Failed to remove product.', 'error');
    }
}

/**
 * ----------------------------------------------------
 * Admin Orders Management
 * ----------------------------------------------------
 */
async function initAdminOrders() {
    setupAdminOrderFilters();
    await loadAdminOrders();
}

function setupAdminOrderFilters() {
    const statusFilter = document.getElementById('admin-order-status-filter');
    const searchFilter = document.getElementById('admin-order-search');

    if (statusFilter) {
        statusFilter.addEventListener('change', () => loadAdminOrders());
    }

    if (searchFilter) {
        let debounce = null;
        searchFilter.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => loadAdminOrders(), 300);
        });
    }
}

async function loadAdminOrders() {
    const tbody = document.getElementById('admin-orders-tbody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem;">⏳ Loading orders...</td></tr>`;

    const status = document.getElementById('admin-order-status-filter')?.value || '';
    const search = document.getElementById('admin-order-search')?.value.trim() || '';

    try {
        const params = new URLSearchParams();
        if (status) params.append('status', status);
        if (search) params.append('search', search);

        const data = await apiFetch(`/admin/orders?${params.toString()}`);
        const orders = data.orders || [];

        if (orders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem;">No orders matching current filter.</td></tr>`;
            return;
        }

        let html = '';
        orders.forEach(o => {
            const dateStr = new Date(o.created_at).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const isDelivered = o.status === 'Delivered';
            const isCancelled = o.status === 'Cancelled';

            html += `
                <tr>
                    <td><strong>#${o.id}</strong></td>
                    <td>
                        <strong>${escapeHtml(o.customer_name)}</strong><br>
                        <small style="color:var(--text-muted);">${escapeHtml(o.customer_email)}</small><br>
                        <small style="color:var(--text-muted);">📞 ${escapeHtml(o.shipping_phone)}</small>
                    </td>
                    <td>${dateStr}</td>
                    <td>
                        <div style="font-size:0.85rem;">${escapeHtml(o.shipping_address)}, ${escapeHtml(o.shipping_city)} - ${escapeHtml(o.shipping_pincode)}</div>
                    </td>
                    <td><strong>${formatRupees(o.total_amount)}</strong></td>
                    <td>
                        <select class="select-custom" style="padding:0.4rem 1.8rem 0.4rem 0.6rem; font-size:0.85rem;" 
                                onchange="updateOrderStatus(${o.id}, this.value)"
                                ${isDelivered || isCancelled ? 'disabled title="Final state cannot be changed"' : ''}>
                            <option value="Placed" ${o.status === 'Placed' ? 'selected' : ''}>Placed</option>
                            <option value="Shipped" ${o.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                            <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                            <option value="Cancelled" ${o.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                        </select>
                    </td>
                    <td>
                        <button class="btn btn-outline btn-sm" onclick="viewOrderDetails(${o.id})">
                            🔍 Details
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--danger); padding:2rem;">${escapeHtml(err.message)}</td></tr>`;
    }
}

async function updateOrderStatus(orderId, newStatus) {
    try {
        const result = await apiFetch(`/admin/orders/${orderId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: newStatus })
        });

        showToast(result.message || 'Order status updated.', 'success');
        loadAdminOrders();
    } catch (err) {
        showToast(err.message || 'Failed to update order status.', 'error');
        loadAdminOrders();
    }
}

/**
 * ----------------------------------------------------
 * Admin Categories Management Modal & CRUD
 * ----------------------------------------------------
 */
async function openCategoriesModal() {
    const modal = document.getElementById('categories-modal');
    if (modal) modal.classList.add('open');
    await renderCategoriesModalTable();
}

function closeCategoriesModal() {
    const modal = document.getElementById('categories-modal');
    if (modal) modal.classList.remove('open');
}

async function renderCategoriesModalTable() {
    const tbody = document.getElementById('admin-categories-tbody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:1.5rem;">⏳ Loading categories...</td></tr>`;

    try {
        const data = await apiFetch('/categories');
        const categories = data.categories || [];
        adminCategoriesList = categories;

        if (categories.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:1.5rem;">No categories found.</td></tr>`;
            return;
        }

        let html = '';
        categories.forEach(cat => {
            html += `
                <tr>
                    <td><strong>#${cat.id}</strong></td>
                    <td><strong>${escapeHtml(cat.name)}</strong></td>
                    <td><span class="status-badge status-placed">${cat.product_count} active product(s)</span></td>
                    <td style="text-align:right;">
                        <div style="display:inline-flex; gap:0.5rem;">
                            <button class="btn btn-outline btn-sm" onclick="handleEditCategory(${cat.id}, '${escapeHtml(cat.name)}')">
                                ✏️ Edit
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="handleDeleteCategory(${cat.id}, '${escapeHtml(cat.name)}')">
                                🗑️ Delete
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

        // Also refresh product modal category dropdown
        const catSelect = document.getElementById('product-category-input');
        if (catSelect) {
            let optionsHtml = '<option value="">Select Category</option>';
            categories.forEach(c => {
                optionsHtml += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
            });
            catSelect.innerHTML = optionsHtml;
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--danger); padding:1.5rem;">${escapeHtml(err.message)}</td></tr>`;
    }
}

async function handleCreateCategory(event) {
    event.preventDefault();
    const input = document.getElementById('new-category-name');
    const name = input ? input.value.trim() : '';

    if (!name) {
        showToast('Category name cannot be empty.', 'error');
        return;
    }

    try {
        const result = await apiFetch('/categories', {
            method: 'POST',
            body: JSON.stringify({ name })
        });

        showToast(result.message || 'Category created successfully.', 'success');
        if (input) input.value = '';
        await renderCategoriesModalTable();
    } catch (err) {
        showToast(err.message || 'Failed to create category.', 'error');
    }
}

async function handleEditCategory(categoryId, currentName) {
    const newName = prompt(`Enter new name for category "${currentName}":`, currentName);
    if (!newName || newName.trim() === '' || newName.trim() === currentName) {
        return;
    }

    try {
        const result = await apiFetch(`/categories/${categoryId}`, {
            method: 'PUT',
            body: JSON.stringify({ name: newName.trim() })
        });

        showToast(result.message || 'Category updated.', 'success');
        await renderCategoriesModalTable();
        await loadAdminProductsTable();
    } catch (err) {
        showToast(err.message || 'Failed to update category.', 'error');
    }
}

async function handleDeleteCategory(categoryId, categoryName) {
    const confirmed = await showConfirmDialog({
        title: 'Delete Category',
        message: `Are you sure you want to delete category "${categoryName}"? Deletion will be rejected if products are assigned to this category.`,
        confirmText: 'Delete Category',
        type: 'danger'
    });
    if (!confirmed) {
        return;
    }

    try {
        const result = await apiFetch(`/categories/${categoryId}`, {
            method: 'DELETE'
        });

        showToast(result.message || 'Category deleted.', 'info');
        await renderCategoriesModalTable();
        await loadAdminProductsTable();
    } catch (err) {
        showToast(err.message || 'Failed to delete category.', 'error');
    }
}
