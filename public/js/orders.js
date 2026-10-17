/**
 * ShopEasy Order History & Order Confirmation Logic
 */

/**
 * Initialize My Orders Page
 */
async function initOrdersPage() {
    if (!Auth.requireAuth()) return;

    const container = document.getElementById('orders-list-container');
    if (!container) return;

    container.innerHTML = `<p style="text-align:center; padding:3rem;">⏳ Loading your order history...</p>`;

    try {
        const data = await apiFetch('/orders');
        const orders = data.orders || [];

        if (orders.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📦</div>
                    <h3>No Orders Yet</h3>
                    <p>You haven't placed any orders with ShopEasy yet. Once you make a purchase, it will appear here!</p>
                    <a href="/index.html" class="btn btn-primary btn-lg">Browse Products</a>
                </div>
            `;
            return;
        }

        let html = '';
        orders.forEach(order => {
            const dateStr = new Date(order.created_at).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const statusClass = `status-${order.status.toLowerCase()}`;
            const canCancel = order.status === 'Placed';

            html += `
                <div class="card" style="background:#fff; border-radius:var(--radius-lg); border:1px solid var(--border-color); padding:1.5rem; margin-bottom:1.5rem; box-shadow:var(--shadow-sm);">
                    <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:1rem; border-bottom:1px solid #f1f5f9; padding-bottom:1rem; margin-bottom:1rem;">
                        <div>
                            <span style="font-weight:800; font-size:1.1rem; color:var(--dark);">Order #${order.id}</span>
                            <span style="font-size:0.85rem; color:var(--text-muted); margin-left:0.75rem;">Placed on ${dateStr}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:0.75rem;">
                            <span class="status-badge ${statusClass}">
                                ● ${escapeHtml(order.status)}
                            </span>
                            <span style="font-size:0.85rem; color:var(--text-muted); background:#f8fafc; padding:0.25rem 0.5rem; border-radius:var(--radius-sm); border:1px solid #e2e8f0;">
                                ${escapeHtml(order.payment_method)}
                            </span>
                        </div>
                    </div>

                    ${renderOrderTimeline(order.status)}

                    <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:1rem; margin-top:1rem;">
                        <div>
                            <div style="font-size:0.9rem; color:var(--text-muted);">
                                Delivery to: <strong>${escapeHtml(order.shipping_name)}</strong>, ${escapeHtml(order.shipping_city)}
                            </div>
                            <div style="font-size:0.9rem; color:var(--text-muted); margin-top:0.25rem;">
                                Items: <strong>${order.item_count} product(s)</strong>
                            </div>
                        </div>

                        <div style="text-align:right;">
                            <div style="font-size:0.8rem; color:var(--text-muted); text-transform:uppercase;">Total Amount</div>
                            <div style="font-size:1.4rem; font-weight:800; color:var(--primary);">${formatRupees(order.total_amount)}</div>
                        </div>
                    </div>

                    <div style="margin-top:1.25rem; display:flex; justify-content:flex-end; gap:0.75rem; border-top:1px solid #f1f5f9; padding-top:1rem;">
                        <button class="btn btn-outline btn-sm" onclick="viewOrderDetails(${order.id})">
                            🔍 View Details
                        </button>
                        ${canCancel ? `
                            <button class="btn btn-danger btn-sm" onclick="cancelOrder(${order.id})">
                                ✕ Cancel Order
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⚠️</div>
                <h3>Failed to load orders</h3>
                <p>${escapeHtml(err.message)}</p>
                <button class="btn btn-primary" onclick="initOrdersPage()">Retry</button>
            </div>
        `;
    }
}

/**
 * Render visual order status timeline
 */
function renderOrderTimeline(status) {
    if (status === 'Cancelled') {
        return `
            <div class="order-timeline-wrapper">
                <div class="order-timeline">
                    <div class="timeline-step completed">
                        <div class="timeline-circle">✓</div>
                        <div class="timeline-label">Placed</div>
                    </div>
                    <div class="timeline-step cancelled">
                        <div class="timeline-circle">✕</div>
                        <div class="timeline-label">Cancelled</div>
                    </div>
                </div>
                <p style="text-align:center; font-size:0.8rem; color:var(--danger); margin-top:0.5rem; font-weight:600;">
                    Order cancelled • Product stock restored to inventory
                </p>
            </div>
        `;
    }

    const isShipped = status === 'Shipped';
    const isDelivered = status === 'Delivered';
    const progressWidth = isDelivered ? '100%' : (isShipped ? '50%' : '0%');

    return `
        <div class="order-timeline-wrapper">
            <div class="order-timeline">
                <div class="timeline-connector">
                    <div class="timeline-connector-progress" style="width: ${progressWidth};"></div>
                </div>
                <div class="timeline-step ${isDelivered || isShipped ? 'completed' : 'active'}">
                    <div class="timeline-circle">${isDelivered || isShipped ? '✓' : '1'}</div>
                    <div class="timeline-label">Placed</div>
                </div>
                <div class="timeline-step ${isDelivered ? 'completed' : (isShipped ? 'active' : '')}">
                    <div class="timeline-circle">${isDelivered ? '✓' : '2'}</div>
                    <div class="timeline-label">Shipped</div>
                </div>
                <div class="timeline-step ${isDelivered ? 'completed active' : ''}">
                    <div class="timeline-circle">${isDelivered ? '✓' : '3'}</div>
                    <div class="timeline-label">Delivered</div>
                </div>
            </div>
        </div>
    `;
}

/**
 * View Detailed Modal for an Order
 */
async function viewOrderDetails(orderId) {
    try {
        const data = await apiFetch(`/orders/${orderId}`);
        const order = data.order;

        const dateStr = new Date(order.created_at).toLocaleString('en-IN');
        const modal = document.getElementById('order-modal');
        const content = document.getElementById('order-modal-content');
        if (!modal || !content) return;

        let itemsHtml = '';
        (order.items || []).forEach(item => {
            const fallbackImg = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600";
            const imgUrl = item.image_url || fallbackImg;

            itemsHtml += `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:0.75rem 0; border-bottom:1px solid var(--border-color);">
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        <img src="${escapeHtml(imgUrl)}" style="width:48px; height:48px; border-radius:var(--radius-sm); object-fit:cover;" onerror="this.src='${fallbackImg}';">
                        <div>
                            <div style="font-weight:700; color:var(--dark); font-size:0.95rem;">${escapeHtml(item.name || item.product_name)}</div>
                            <div style="font-size:0.8rem; color:var(--text-muted);">${item.quantity} × ${formatRupees(item.unit_price)}</div>
                        </div>
                    </div>
                    <div style="font-weight:700; color:var(--dark);">${formatRupees(item.quantity * item.unit_price)}</div>
                </div>
            `;
        });

        content.innerHTML = `
            <h2 style="font-size:1.4rem; font-weight:800; color:var(--dark); margin-bottom:0.5rem;">
                Order Details #${order.id}
            </h2>
            <div style="display:flex; gap:0.5rem; align-items:center; margin-bottom:1rem;">
                <span class="status-badge status-${order.status.toLowerCase()}">● ${escapeHtml(order.status)}</span>
                <span style="font-size:0.85rem; color:var(--text-muted);">Placed on ${dateStr}</span>
            </div>

            ${renderOrderTimeline(order.status)}

            <div style="background:#f8fafc; border-radius:var(--radius-md); padding:1rem; margin-bottom:1.5rem; border:1px solid var(--border-color); font-size:0.9rem;">
                <h4 style="font-weight:700; color:var(--dark); margin-bottom:0.4rem;">Delivery Address</h4>
                <p><strong>Recipient:</strong> ${escapeHtml(order.shipping_name)}</p>
                <p><strong>Phone:</strong> ${escapeHtml(order.shipping_phone)}</p>
                <p><strong>Address:</strong> ${escapeHtml(order.shipping_address)}, ${escapeHtml(order.shipping_city)} - ${escapeHtml(order.shipping_pincode)}</p>
                <p><strong>Payment Method:</strong> ${escapeHtml(order.payment_method)}</p>
            </div>

            <h4 style="font-weight:700; color:var(--dark); margin-bottom:0.75rem;">Items Purchased</h4>
            <div style="margin-bottom:1.5rem;">
                ${itemsHtml}
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; border-top:2px solid var(--border-color); padding-top:1rem; font-size:1.15rem; font-weight:800;">
                <span>Total Amount:</span>
                <span style="color:var(--primary); font-size:1.4rem;">${formatRupees(order.total_amount)}</span>
            </div>

            ${order.status === 'Placed' ? `
                <div style="margin-top:1.5rem; text-align:right;">
                    <button class="btn btn-danger btn-sm" onclick="cancelOrder(${order.id})">
                        ✕ Cancel This Order
                    </button>
                </div>
            ` : ''}
        `;

        modal.classList.add('open');
    } catch (err) {
        showToast(err.message || 'Failed to fetch order details.', 'error');
    }
}

function closeOrderModal() {
    const modal = document.getElementById('order-modal');
    if (modal) modal.classList.remove('open');
}

/**
 * Cancel Placed Order with accessible confirmation dialog
 */
async function cancelOrder(orderId) {
    const confirmed = await showConfirmDialog({
        title: `Cancel Order #${orderId}?`,
        message: 'Are you sure you want to cancel this order? Stock will be immediately restored to the store catalog.',
        confirmText: 'Yes, Cancel Order',
        cancelText: 'Keep Order',
        type: 'danger'
    });

    if (!confirmed) return;

    try {
        const res = await apiFetch(`/orders/${orderId}/cancel`, {
            method: 'PATCH'
        });
        showToast(res.message || 'Order cancelled successfully. Stock restored.', 'info');
        initOrdersPage();
        closeOrderModal();
    } catch (err) {
        showToast(err.message || 'Failed to cancel order.', 'error');
    }
}

/**
 * Initialize Success Confirmation Page
 */
async function initSuccessPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('orderId');
    const container = document.getElementById('success-container');
    if (!container) return;

    if (!orderId) {
        window.location.href = '/index.html';
        return;
    }

    try {
        const data = await apiFetch(`/orders/${orderId}`);
        const order = data.order;

        container.innerHTML = `
            <div style="background:#fff; border-radius:var(--radius-lg); padding:3rem 2rem; border:1px solid var(--border-color); box-shadow:var(--shadow-lg); text-align:center; max-width:650px; margin:2rem auto;">
                <div style="width:72px; height:72px; border-radius:50%; background:var(--success-light); color:var(--success); font-size:2.5rem; display:flex; align-items:center; justify-content:center; margin:0 auto 1.5rem auto;">
                    ✓
                </div>
                <h1 style="font-size:2rem; font-weight:800; color:var(--dark); margin-bottom:0.5rem;">Order Confirmed!</h1>
                <p style="color:var(--text-muted); margin-bottom:2rem;">
                    Thank you, <strong>${escapeHtml(order.shipping_name)}</strong>. Your Cash on Delivery order <strong>#${order.id}</strong> has been successfully placed.
                </p>

                <div style="background:#f8fafc; border-radius:var(--radius-md); padding:1.5rem; margin-bottom:2rem; text-align:left; border:1px solid var(--border-color); font-size:0.92rem;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem;">
                        <span style="color:var(--text-muted);">Order Number:</span>
                        <strong style="color:var(--dark);">#${order.id}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem;">
                        <span style="color:var(--text-muted);">Payment Method:</span>
                        <strong>Cash on Delivery (COD)</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem;">
                        <span style="color:var(--text-muted);">Total Payable on Delivery:</span>
                        <strong style="color:var(--primary); font-size:1.2rem;">${formatRupees(order.total_amount)}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">Delivery Address:</span>
                        <span style="text-align:right;">${escapeHtml(order.shipping_address)}, ${escapeHtml(order.shipping_city)} (${escapeHtml(order.shipping_pincode)})</span>
                    </div>
                </div>

                <div style="display:flex; justify-content:center; gap:1rem; flex-wrap:wrap;">
                    <a href="/orders.html" class="btn btn-primary btn-lg">View My Orders</a>
                    <a href="/index.html" class="btn btn-outline btn-lg">Continue Shopping</a>
                </div>
            </div>
        `;
    } catch (err) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⚠️</div>
                <h3>Unable to find order details</h3>
                <p>${escapeHtml(err.message)}</p>
                <a href="/index.html" class="btn btn-primary">Return Home</a>
            </div>
        `;
    }
}
