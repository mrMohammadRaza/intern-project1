const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
require('dotenv').config();

const dbPath = process.env.NODE_ENV === 'test'
    ? (process.env.TEST_DATABASE_PATH ? path.resolve(process.cwd(), process.env.TEST_DATABASE_PATH) : path.resolve(__dirname, 'shopeasy.test.db'))
    : (process.env.DATABASE_PATH ? path.resolve(process.cwd(), process.env.DATABASE_PATH) : path.resolve(__dirname, 'shopeasy.db'));

// Ensure parent directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable Foreign Keys and WAL Mode for concurrency and data integrity
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

/**
 * Initialize database tables using schema.sql
 */
function initSchema() {
    const schemaFile = path.resolve(__dirname, 'schema.sql');
    if (fs.existsSync(schemaFile)) {
        const schemaSql = fs.readFileSync(schemaFile, 'utf8');
        db.exec(schemaSql);
    }
}

/**
 * Seed database tables using seed.sql (restricted to development/testing)
 */
function seedData(options = {}) {
    if (process.env.NODE_ENV === 'production' && !options.forceInProduction) {
        console.warn('⚠️ NOTICE: Auto-seeding of demo accounts and sample products is disabled in production mode.');
        return false;
    }
    const seedFile = path.resolve(__dirname, 'seed.sql');
    if (fs.existsSync(seedFile)) {
        const seedSql = fs.readFileSync(seedFile, 'utf8');
        db.exec(seedSql);
        return true;
    }
    return false;
}

// Auto-run schema on initial connection if tables don't exist
const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
if (!tableCheck) {
    initSchema();
    // Only auto-seed demo accounts in development or test environments
    if (process.env.NODE_ENV !== 'production') {
        seedData();
    }
} else if (process.env.NODE_ENV !== 'production') {
    // If development database exists but has no products, safely populate demo data without duplicating
    try {
        const prodCount = db.prepare("SELECT COUNT(*) as count FROM products").get();
        if (prodCount && prodCount.count === 0) {
            seedData();
        }
    } catch {
        // Ignore if products table doesn't exist yet
    }
}

module.exports = {
    db,
    dbPath,
    initSchema,
    seedData
};
