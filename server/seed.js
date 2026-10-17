const { initSchema, seedData, db } = require('./db');

console.log('--- Initializing ShopEasy Database ---');
initSchema();
console.log('✓ Schema applied successfully (foreign keys enabled).');

if (process.env.NODE_ENV === 'production') {
    console.warn('⚠️ NOTICE: Seeding demo accounts is blocked in production mode.');
    console.log('To create an administrator account securely, run: npm run create-admin');
} else {
    seedData();
    console.log('✓ Seed data populated successfully.');
}

const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;

console.log(`Summary: ${userCount} users, ${categoryCount} categories, ${productCount} products.`);
if (process.env.NODE_ENV !== 'production') {
    console.log('NOTICE: Seeded credentials are for LOCAL DEVELOPMENT & TESTING ONLY.');
}
console.log('Database initialization completed.');
