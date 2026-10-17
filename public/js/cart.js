/**
 * ShopEasy Shopping Cart Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    if (Auth.requireAuth()) {
        if (Auth.isAdmin()) {
            showToast('Administrators do not have a customer cart. Redirecting to Admin Dashboard.', 'info');
            setTimeout(() => {
                window.location.href = '/admin/dashboard.html';
            }, 800);
            return;
        }
        loadCart();
    }
});

async function loadCart() {
    const container = document.getElementById('cart-container');
    if (!container) return;

    if (!container.dataset.delegated) {
        container.dataset.delegated = 'true';
        container.addEventListener('click', (e) => {
            const qtyBtn = e.target.closest('.action-cart-qty');
            if (qtyBtn) {
                const itemId = Number(qtyBtn.dataset.itemId);
                const change = Number(qtyBtn.dataset.change);
                const stock = Number(qtyBtn.dataset.stock);
                const qtyInput = qtyBtn.parentElement.querySelector('.qty-input');
                const currentQty = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;
                updateItemQuantity(itemId, currentQty + change, stock);
                return;
            }
            const removeBtn = e.target.closest('.action-remove-item');
            if (removeBtn) {
                const itemId = Number(removeBtn.dataset.itemId);
                removeItem(itemId);
                return;
            }
            const retryBtn = e.target.closest('.action-retry-cart');
            if (retryBtn) {
                loadCart();
                return;
            }
        });
    }

    container.innerHTML = `
        <div style="text-align: center; padding: 4rem;">
            <p>⏳ Loading your cart...</p>
        </div>
    `;

    try {
        const data = await apiFetch('/cart');
        const items = data.items || [];
        const totalAmount = data.total_amount || 0;
        const totalItems = data.total_items || 0;

        if (items.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🛒</div>
                    <h3>Your Shopping Cart is Empty</h3>
                    <p>Looks like you haven't added anything to your cart yet. Explore our awesome collection and find something you love!</p>
                    <a href="/index.html" class="btn btn-primary btn-lg">Start Shopping</a>
                </div>
            `;
            updateCartBadge();
            return;
        }

        let itemsRowsHtml = '';
        let hasStockIssues = false;

        items.forEach(item => {
            const fallbackImg = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600";
            const imgUrl = item.image_url || fallbackImg;
            const isOutOfStock = !item.is_active || item.available_stock < item.quantity;
            if (isOutOfStock) hasStockIssues = true;

            itemsRowsHtml += `
                <tr id="cart-row-${item.id}">
                    <td>
                        <div class="cart-product-info">
                            <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(item.name)}" class="cart-img"
                                 onerror="this.onerror=null; this.src='${fallbackImg}';">
                            <div>
                                <a href="/product.html?id=${item.product_id}" style="font-weight:700; color:var(--dark);">
                                    ${escapeHtml(item.name)}
                                </a>
                                <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(item.category_name)}</div>
                                ${!item.is_active ? '<span class="status-badge status-cancelled">Product Inactive</span>' : ''}
                                ${item.available_stock < item.quantity ? `<span class="status-badge status-shipped">Only ${item.available_stock} in stock!</span>` : ''}
                            </div>
                        </div>
                    </td>
                    <td>
                        <span style="font-weight:600;">${formatRupees(item.unit_price)}</span>
                    </td>
                    <td>
                        <div class="quantity-control" style="margin:0;">
                            <button type="button" class="qty-btn action-cart-qty" data-item-id="${item.id}" data-change="-1" data-stock="${item.available_stock}">-</button>
                            <input type="text" class="qty-input" value="${item.quantity}" readonly>
                            <button type="button" class="qty-btn action-cart-qty" data-item-id="${item.id}" data-change="1" data-stock="${item.available_stock}">+</button>
                        </div>
                    </td>
                    <td>
                        <span style="font-weight:700; color:var(--primary);">${formatRupees(item.line_total)}</span>
                    </td>
                    <td style="text-align:right;">
                        <button type="button" class="btn btn-outline btn-sm action-remove-item" data-item-id="${item.id}" title="Remove item">
                            🗑️
                        </button>
                    </td>
                </tr>
            `;
        });

        container.innerHTML = `
            <div class="cart-layout">
                <div class="cart-items-card">
                    <h2 style="font-size:1.4rem; font-weight:800; margin-bottom:1.25rem;">
                        Shopping Bag (${totalItems} ${totalItems === 1 ? 'item' : 'items'})
                    </h2>

                    ${hasStockIssues ? `
                        <div style="background:var(--warning-light); color:#92400e; padding:0.75rem 1rem; border-radius:var(--radius-md); margin-bottom:1rem; font-size:0.9rem;">
                            ⚠️ One or more items in your cart exceed available stock. Please adjust quantities before checkout.
                        </div>
                    ` : ''}

                    <div class="table-responsive">
                        <table class="cart-table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Price</th>
                                    <th>Quantity</th>
                                    <th>Total</th>
                                    <th style="text-align:right;">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsRowsHtml}
                            </tbody>
                        </table>
                    </div>

                    <div style="margin-top:1.5rem; display:flex; justify-content:space-between; align-items:center;">
                        <a href="/index.html" class="btn btn-outline">&larr; Continue Shopping</a>
                    </div>
                </div>

                <div class="summary-card">
                    <h2 style="font-size:1.3rem; font-weight:800; margin-bottom:1.25rem;">Order Summary</h2>
                    
                    <div class="summary-row">
                        <span>Items Subtotal</span>
                        <span>${formatRupees(totalAmount)}</span>
                    </div>
                    <div class="summary-row">
                        <span>Estimated Shipping</span>
                        <span style="color:var(--success); font-weight:600;">FREE</span>
                    </div>
                    <div class="summary-row">
                        <span>Payment Method</span>
                        <span style="font-weight:600;">Cash on Delivery</span>
                    </div>

                    <div class="summary-row total">
                        <span>Total Due</span>
                        <span style="color:var(--primary);">${formatRupees(totalAmount)}</span>
                    </div>

                    <div style="margin-top:1.5rem;">
                        <a href="/checkout.html" class="btn btn-primary btn-block btn-lg" 
                           ${hasStockIssues ? 'style="pointer-events:none; opacity:0.6;" title="Resolve stock issues first"' : ''}>
                            Proceed to Checkout &rarr;
                        </a>
                    </div>

                    <div style="margin-top:1rem; text-align:center; font-size:0.8rem; color:var(--text-light);">
                        🔒 Safe & Secure Cash on Delivery Checkout
                    </div>
                </div>
            </div>
        `;

        updateCartBadge();
    } catch (err) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⚠️</div>
                <h3>Failed to load cart</h3>
                <p>${escapeHtml(err.message)}</p>
                <button type="button" class="btn btn-primary action-retry-cart">Retry</button>
            </div>
        `;
    }
}

async function updateItemQuantity(itemId, newQty, availableStock) {
    if (newQty < 1) {
        removeItem(itemId);
        return;
    }

    if (newQty > availableStock) {
        showToast(`Cannot increase. Only ${availableStock} units available in stock.`, 'error');
        return;
    }

    try {
        await apiFetch(`/cart/${itemId}`, {
            method: 'PUT',
            body: JSON.stringify({ quantity: newQty })
        });
        showToast('Cart updated.', 'success');
        loadCart();
    } catch (err) {
        showToast(err.message || 'Failed to update item quantity.', 'error');
    }
}

async function removeItem(itemId) {
    const confirmed = await showConfirmDialog({
        title: 'Remove Item',
        message: 'Are you sure you want to remove this item from your shopping bag?',
        confirmText: 'Remove',
        cancelText: 'Keep Item',
        type: 'danger'
    });

    if (!confirmed) return;

    try {
        await apiFetch(`/cart/${itemId}`, {
            method: 'DELETE'
        });
        showToast('Item removed from cart.', 'info');
        loadCart();
    } catch (err) {
        showToast(err.message || 'Failed to remove item.', 'error');
    }
}
