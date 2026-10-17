/**
 * ShopEasy Checkout Logic (Cash on Delivery)
 */

document.addEventListener('DOMContentLoaded', () => {
    if (Auth.requireAuth()) {
        if (Auth.isAdmin()) {
            showToast('Administrators cannot checkout. Redirecting to admin portal...', 'warning');
            setTimeout(() => { window.location.href = '/admin/dashboard.html'; }, 1200);
            return;
        }
        initCheckout();
    }
});

let currentCartData = null;

async function initCheckout() {
    const summaryContainer = document.getElementById('checkout-summary-items');
    const form = document.getElementById('checkout-form');
    if (!summaryContainer || !form) return;

    try {
        currentCartData = await apiFetch('/cart');
        const items = currentCartData.items || [];

        if (items.length === 0) {
            showToast('Your cart is empty. Please add products before checking out.', 'warning');
            setTimeout(() => { window.location.href = '/index.html'; }, 1200);
            return;
        }

        // Render checkout summary
        let summaryHtml = '';
        items.forEach(item => {
            summaryHtml += `
                <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem; font-size:0.92rem;">
                    <div>
                        <div style="font-weight:600; color:var(--dark);">${escapeHtml(item.name)}</div>
                        <div style="font-size:0.8rem; color:var(--text-muted);">${item.quantity} × ${formatRupees(item.unit_price)}</div>
                    </div>
                    <div style="font-weight:700; color:var(--dark);">${formatRupees(item.line_total)}</div>
                </div>
            `;
        });

        summaryContainer.innerHTML = summaryHtml;

        const totalEl = document.getElementById('checkout-grand-total');
        if (totalEl) {
            totalEl.textContent = formatRupees(currentCartData.total_amount);
        }

        // Pre-fill user details if available
        const user = Auth.getUser();
        if (user) {
            const nameInput = document.getElementById('shipping_name');
            const phoneInput = document.getElementById('shipping_phone');
            const addressInput = document.getElementById('shipping_address');

            if (nameInput && !nameInput.value) nameInput.value = user.name || '';
            if (phoneInput && !phoneInput.value) phoneInput.value = user.phone || '';
            if (addressInput && !addressInput.value) addressInput.value = user.address || '';
        }

        form.addEventListener('submit', handleOrderSubmit);
    } catch (err) {
        console.error('Error loading checkout:', err);
        showToast('Failed to load checkout details.', 'error');
    }
}

async function handleOrderSubmit(e) {
    e.preventDefault();

    const submitBtn = document.getElementById('place-order-btn');
    const errorBox = document.getElementById('checkout-error');
    if (errorBox) {
        errorBox.style.display = 'none';
        errorBox.textContent = '';
    }

    const shipping_name = document.getElementById('shipping_name').value.trim();
    const shipping_phone = document.getElementById('shipping_phone').value.trim();
    const shipping_address = document.getElementById('shipping_address').value.trim();
    const shipping_city = document.getElementById('shipping_city').value.trim();
    const shipping_pincode = document.getElementById('shipping_pincode').value.trim();

    // Client-side validations
    if (shipping_name.length < 2) {
        showError('Please enter a valid full name.');
        return;
    }

    const phoneClean = shipping_phone.replace(/[-+\s]/g, '');
    if (!/^[6-9]\d{9}$/.test(phoneClean) && !(phoneClean.length === 12 && phoneClean.startsWith('91'))) {
        showError('Please enter a valid 10-digit mobile number.');
        return;
    }

    if (shipping_address.length < 5) {
        showError('Please enter a detailed delivery address (house/flat no, street, locality).');
        return;
    }

    if (shipping_city.length < 2) {
        showError('Please enter your city.');
        return;
    }

    if (!/^\d{6}$/.test(shipping_pincode)) {
        showError('Please enter a valid 6-digit postal PIN code.');
        return;
    }

    // Disable button to prevent duplicate submissions
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>⏳ Processing Order...</span>`;
    }

    try {
        const payload = {
            shipping_name,
            shipping_phone: phoneClean,
            shipping_address,
            shipping_city,
            shipping_pincode
        };

        const result = await apiFetch('/orders', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        updateCartBadge();
        showToast('Order placed successfully!', 'success');

        // Redirect to success confirmation page
        setTimeout(() => {
            window.location.href = `/success.html?orderId=${result.order.id}`;
        }, 600);
    } catch (err) {
        showError(err.message || 'Failed to place order. Please check item stock and try again.');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>Confirm & Place Order (Cash on Delivery)</span>`;
        }
    }
}

function showError(msg) {
    const errorBox = document.getElementById('checkout-error');
    if (errorBox) {
        errorBox.textContent = msg;
        errorBox.style.display = 'block';
    } else {
        showToast(msg, 'error');
    }
}
