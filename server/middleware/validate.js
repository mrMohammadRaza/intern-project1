/**
 * Validation utilities and middleware for ShopEasy
 * Strictly rejects malformed numeric strings like "12abc"
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

/**
 * Strictly checks if a value is an integer without trailing characters (e.g. rejects "12abc")
 */
function isStrictInteger(val) {
    if (val === null || val === undefined || val === '') return false;
    if (typeof val === 'number') {
        return Number.isInteger(val) && Number.isSafeInteger(val);
    }
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!/^-?\d+$/.test(trimmed)) return false;
        const num = Number(trimmed);
        return Number.isSafeInteger(num);
    }
    return false;
}

/**
 * Strictly checks if a value is a positive integer (> 0)
 */
function isStrictPositiveInteger(val) {
    return isStrictInteger(val) && Number(val) > 0;
}

/**
 * Strictly checks if a value is a non-negative integer (>= 0)
 */
function isStrictNonNegativeInteger(val) {
    return isStrictInteger(val) && Number(val) >= 0;
}

/**
 * Strictly parses an integer, returning null if malformed or invalid
 */
function parseStrictInteger(val) {
    if (isStrictInteger(val)) {
        return Number(val);
    }
    return null;
}

function isValidImageUrl(url) {
    if (url === null || url === undefined || url === '') return true;
    if (typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (trimmed.length === 0) return true;
    if (trimmed.length > 1000) return false;
    if (trimmed.startsWith('/') || trimmed.startsWith('./')) return true;
    try {
        const parsed = new URL(trimmed);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

module.exports = {
    isValidEmail,
    isValidPhone,
    isValidPincode,
    isValidImageUrl,
    isStrictInteger,
    isStrictPositiveInteger,
    isStrictNonNegativeInteger,
    parseStrictInteger,
    // Aliases for compatibility
    isPositiveInteger: isStrictPositiveInteger,
    isNonNegativeInteger: isStrictNonNegativeInteger
};
