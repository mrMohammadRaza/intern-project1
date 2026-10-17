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
 * Seed database tables using seed.sql
 */
function seedData() {
    const seedFile = path.resolve(__dirname, 'seed.sql');
    if (fs.existsSync(seedFile)) {
        const seedSql = fs.readFileSync(seedFile, 'utf8');
        db.exec(seedSql);
    }
}

// Auto-run schema and seed on initial connection if tables don't exist
const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
if (!tableCheck) {
    initSchema();
    seedData();
}

module.exports = {
    db,
    dbPath,
    initSchema,
    seedData
};
