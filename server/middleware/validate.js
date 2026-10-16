/**
 * Validation utilities and middleware for ShopEasy
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[6-9]\d{9}$/; // Standard Indian 10-digit mobile starting with 6, 7, 8, or 9
const PINCODE_REGEX = /^\d{6}$/;     // Standard Indian 6-digit postal PIN code

function isValidEmail(email) {
    return typeof email === 'string' && EMAIL_REGEX.test(email.trim());
}

function isValidPhone(phone) {
    if (!phone) return false;
    const cleanPhone = phone.toString().trim().replace(/[-+\s]/g, '');
    // Allow either 10 digits or 12 digits (with country code 91)
    if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
        return PHONE_REGEX.test(cleanPhone.slice(2));
    }
    return PHONE_REGEX.test(cleanPhone);
}

function isValidPincode(pincode) {
    if (!pincode) return false;
    return PINCODE_REGEX.test(pincode.toString().trim());
}

function isPositiveInteger(val) {
    const num = Number(val);
    return Number.isInteger(num) && num > 0;
}

function isNonNegativeInteger(val) {
    const num = Number(val);
    return Number.isInteger(num) && num >= 0;
}

module.exports = {
    isValidEmail,
    isValidPhone,
    isValidPincode,
    isPositiveInteger,
    isNonNegativeInteger
};
