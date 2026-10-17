/**
 * ShopEasy API Client & Shared Utilities
 */

const API_BASE = '/api';

/**
 * Universal API Fetch wrapper
 */
async function apiFetch(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const token = localStorage.getItem('shopeasy_token');

    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(url, {
            ...options,
            headers
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            // If token expired or invalid, clear auth and redirect if on protected page
            if (response.status === 401) {
                if (token) {
                    localStorage.removeItem('shopeasy_token');
                    localStorage.removeItem('shopeasy_user');
                    // If on customer or admin protected page, redirect to login
                    const currentPath = window.location.pathname;
                    if (currentPath.includes('/admin/') || currentPath.includes('cart.html') || currentPath.includes('checkout.html') || currentPath.includes('orders.html')) {
                        window.location.href = '/login.html?session_expired=1';
                    }
                }
            }
            throw new Error(data.error || `Request failed with status ${response.status}`);
        }

        return data;
    } catch (err) {
        throw err;
    }
}

/**
 * Format integer paise to Indian Rupee representation (e.g. 299900 -> ₹2,999.00)
 */
function formatRupees(paise) {
    if (paise === null || paise === undefined || isNaN(paise)) return '₹0.00';
    const rupees = Number(paise) / 100;
    return '₹' + rupees.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/**
 * Escape HTML special characters for safe DOM insertion
 */
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Show a floating Toast Notification
 */
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/**
 * Update Navbar Cart Badge
 */
async function updateCartBadge() {
    const badge = document.getElementById('nav-cart-badge');
    if (!badge) return;

    const token = localStorage.getItem('shopeasy_token');
    if (!token) {
        badge.textContent = '0';
        badge.style.display = 'none';
        return;
    }

    try {
        const data = await apiFetch('/cart');
        const count = data.total_items || 0;
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-flex' : 'none';
    } catch {
        badge.textContent = '0';
        badge.style.display = 'none';
    }
}

/**
 * Show Accessible Confirmation Dialog (replacing browser native confirm)
 * @param {Object} options
 * @param {string} options.title - Dialog heading
 * @param {string} options.message - Confirmation text explanation
 * @param {string} [options.confirmText='Confirm'] - Action button text
 * @param {string} [options.cancelText='Cancel'] - Dismiss button text
 * @param {'danger'|'primary'} [options.type='primary'] - Button theme
 * @returns {Promise<boolean>}
 */
function showConfirmDialog({ title = 'Confirm Action', message, confirmText = 'Confirm', cancelText = 'Cancel', type = 'primary' }) {
    return new Promise((resolve) => {
        const existing = document.getElementById('shopeasy-confirm-dialog');
        if (existing) existing.remove();

        const backdrop = document.createElement('div');
        backdrop.id = 'shopeasy-confirm-dialog';
        backdrop.className = 'confirm-dialog-backdrop';
        backdrop.setAttribute('role', 'dialog');
        backdrop.setAttribute('aria-modal', 'true');
        backdrop.setAttribute('aria-labelledby', 'confirm-dialog-title');

        backdrop.innerHTML = `
            <div class="confirm-dialog-card" tabindex="-1">
                <div class="confirm-dialog-header">
                    <span class="confirm-dialog-icon ${type === 'danger' ? 'danger' : 'primary'}">
                        ${type === 'danger' ? '⚠️' : '❓'}
                    </span>
                    <h3 id="confirm-dialog-title" class="confirm-dialog-title">${escapeHtml(title)}</h3>
                </div>
                <p class="confirm-dialog-message">${escapeHtml(message)}</p>
                <div class="confirm-dialog-actions">
                    <button type="button" class="btn btn-outline" id="confirm-cancel-btn">${escapeHtml(cancelText)}</button>
                    <button type="button" class="btn ${type === 'danger' ? 'btn-danger' : 'btn-primary'}" id="confirm-ok-btn">${escapeHtml(confirmText)}</button>
                </div>
            </div>
        `;

        document.body.appendChild(backdrop);
        setTimeout(() => backdrop.classList.add('open'), 10);

        const cancelBtn = backdrop.querySelector('#confirm-cancel-btn');
        const okBtn = backdrop.querySelector('#confirm-ok-btn');
        okBtn.focus();

        function cleanup(result) {
            backdrop.classList.remove('open');
            setTimeout(() => {
                backdrop.remove();
                resolve(result);
            }, 200);
            document.removeEventListener('keydown', keyHandler);
        }

        function keyHandler(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                cleanup(false);
            }
        }

        document.addEventListener('keydown', keyHandler);
        cancelBtn.addEventListener('click', () => cleanup(false));
        okBtn.addEventListener('click', () => cleanup(true));

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) cleanup(false);
        });
    });
}
