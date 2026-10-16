/**
 * ShopEasy Authentication & Navbar Manager
 */

const Auth = {
    getToken() {
        return localStorage.getItem('shopeasy_token');
    },

    getUser() {
        try {
            const userStr = localStorage.getItem('shopeasy_user');
            return userStr ? JSON.parse(userStr) : null;
        } catch {
            return null;
        }
    },

    setAuth(token, user) {
        localStorage.setItem('shopeasy_token', token);
        localStorage.setItem('shopeasy_user', JSON.stringify(user));
    },

    logout() {
        localStorage.removeItem('shopeasy_token');
        localStorage.removeItem('shopeasy_user');
        showToast('Logged out successfully.', 'info');
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 500);
    },

    isLoggedIn() {
        return !!this.getToken();
    },

    isAdmin() {
        const user = this.getUser();
        return user && user.role === 'admin';
    },

    requireAuth() {
        if (!this.isLoggedIn()) {
            window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.pathname)}`;
            return false;
        }
        return true;
    },

    requireAdmin() {
        if (!this.isLoggedIn()) {
            window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.pathname)}`;
            return false;
        }
        if (!this.isAdmin()) {
            alert('Access denied. Administrator privileges are required.');
            window.location.href = '/index.html';
            return false;
        }
        return true;
    },

    /**
     * Render dynamic navigation based on user role and state
     */
    renderNavbar() {
        const navLinks = document.getElementById('navbar-links');
        if (!navLinks) return;

        const user = this.getUser();
        const loggedIn = this.isLoggedIn();
        const admin = this.isAdmin();
        const currentPath = window.location.pathname;

        let html = `
            <li><a href="/index.html" class="nav-link ${currentPath.endsWith('index.html') || currentPath === '/' ? 'active' : ''}">Products</a></li>
        `;

        if (loggedIn) {
            if (admin) {
                html += `
                    <li><a href="/admin/dashboard.html" class="nav-link ${currentPath.includes('/admin/dashboard') ? 'active' : ''}">📊 Dashboard</a></li>
                    <li><a href="/admin/products.html" class="nav-link ${currentPath.includes('/admin/products') ? 'active' : ''}">📦 Manage Products</a></li>
                    <li><a href="/admin/orders.html" class="nav-link ${currentPath.includes('/admin/orders') ? 'active' : ''}">🚚 Manage Orders</a></li>
                `;
            } else {
                html += `
                    <li><a href="/orders.html" class="nav-link ${currentPath.includes('orders.html') ? 'active' : ''}">My Orders</a></li>
                `;
            }

            // Cart button for non-admins or customers
            if (!admin) {
                html += `
                    <li>
                        <a href="/cart.html" class="cart-btn" id="cart-nav-link" aria-label="Shopping Cart">
                            🛒 Cart
                            <span class="cart-badge" id="nav-cart-badge" style="display:none;">0</span>
                        </a>
                    </li>
                `;
            }

            html += `
                <li>
                    <span class="user-badge">
                        👤 ${escapeHtml(user.name)} (${user.role})
                    </span>
                </li>
                <li>
                    <button class="btn btn-outline btn-sm" id="logout-btn" onclick="Auth.logout()">Logout</button>
                </li>
            `;
        } else {
            html += `
                <li>
                    <a href="/login.html" class="nav-link ${currentPath.includes('login.html') ? 'active' : ''}">Login</a>
                </li>
                <li>
                    <a href="/register.html" class="btn btn-primary btn-sm">Register</a>
                </li>
            `;
        }

        navLinks.innerHTML = html;

        if (loggedIn && !admin) {
            updateCartBadge();
        }
    }
};

// Initialize navbar upon DOM ready
document.addEventListener('DOMContentLoaded', () => {
    Auth.renderNavbar();
});
