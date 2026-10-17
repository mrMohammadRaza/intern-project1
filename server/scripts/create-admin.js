/**
 * ShopEasy Secure Administrator Account Provisioning Script
 * 
 * Usage:
 *   node server/scripts/create-admin.js --email="admin@mydomain.com" --name="Store Manager" [--password="MySecretPassword123"]
 * 
 * Or via environment variables:
 *   ADMIN_EMAIL="admin@mydomain.com" ADMIN_PASSWORD="Password123" npm run create-admin
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const readline = require('readline');
const { db, initSchema } = require('../db');
const { isValidEmail } = require('../middleware/validate');

// Ensure database schema is initialized
initSchema();

function parseArgs() {
    const args = process.argv.slice(2);
    const parsed = {};
    for (const arg of args) {
        if (arg.startsWith('--')) {
            const [key, ...vals] = arg.slice(2).split('=');
            parsed[key] = vals.join('=');
        }
    }
    return parsed;
}

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans.trim());
    }));
}

function generateSecurePassword() {
    // 16-character high-entropy cryptographic password
    return crypto.randomBytes(12).toString('base64url');
}

async function createAdmin() {
    const args = parseArgs();

    let email = args.email || process.env.ADMIN_EMAIL;
    let name = args.name || process.env.ADMIN_NAME;
    let password = args.password || process.env.ADMIN_PASSWORD;
    let phone = args.phone || process.env.ADMIN_PHONE || '9876543210';

    // Interactive fallback if run in a TTY terminal without args
    if (!email && process.stdin.isTTY) {
        email = await askQuestion('Enter administrator email: ');
    }
    if (!name && process.stdin.isTTY) {
        name = await askQuestion('Enter administrator name (e.g. Admin User): ');
    }
    if (!password && process.stdin.isTTY) {
        const customPass = await askQuestion('Enter password (leave empty to generate secure random password): ');
        if (customPass) password = customPass;
    }

    if (!email || !isValidEmail(email)) {
        console.error('❌ Error: A valid administrator email address is required.');
        process.exit(1);
    }

    if (!name || name.trim().length < 2) {
        name = 'Administrator';
    }

    let generatedPassword = null;
    if (!password) {
        password = generateSecurePassword();
        generatedPassword = password;
    }

    if (password.length < 8) {
        console.error('❌ Error: Administrator password must be at least 8 characters.');
        process.exit(1);
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    // Check if account already exists
    const existing = db.prepare('SELECT id, role FROM users WHERE LOWER(email) = ?').get(cleanEmail);
    if (existing) {
        console.error(`❌ Error: An account with email "${cleanEmail}" already exists (role: ${existing.role}).`);
        process.exit(1);
    }

    // Hash password with bcrypt (10 rounds)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const stmt = db.prepare(`
        INSERT INTO users (name, email, password_hash, role, phone, address)
        VALUES (?, ?, ?, 'admin', ?, 'HQ Administration Office')
    `);

    const result = stmt.run(cleanName, cleanEmail, passwordHash, phone);

    console.log('\n======================================================');
    console.log('✓ Administrator account provisioned successfully!');
    console.log('======================================================');
    console.log(`User ID : ${result.lastInsertRowid}`);
    console.log(`Name    : ${cleanName}`);
    console.log(`Email   : ${cleanEmail}`);
    console.log(`Role    : admin`);
    if (generatedPassword) {
        console.log(`Password: ${generatedPassword}`);
        console.log('\n⚠️  IMPORTANT: Store this generated password securely.');
        console.log('Only the bcrypt hash is stored in the database. This password cannot be recovered.');
    } else {
        console.log('Password: [Provided password securely hashed with bcrypt]');
    }
    console.log('======================================================\n');
}

if (require.main === module) {
    createAdmin().catch(err => {
        console.error('Fatal error provisioning admin:', err);
        process.exit(1);
    });
}

module.exports = { createAdmin };
