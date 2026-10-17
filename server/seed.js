const { initSchema, seedData, db } = require('./db');

console.log('--- Initializing ShopEasy Database ---');
initSchema();
console.log('✓ Schema applied successfully (foreign keys enabled).');

seedData();
console.log('✓ Seed data populated successfully.');

const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;

console.log(`Summary: ${userCount} users, ${categoryCount} categories, ${productCount} products.`);
console.log('NOTICE: Seeded credentials are for LOCAL DEVELOPMENT & TESTING ONLY.');
console.log('Database initialization completed.');
