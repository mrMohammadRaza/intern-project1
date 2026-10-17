-- ============================================================
-- ShopEasy Seed Data
-- NOTICE: The seeded accounts below are strictly for LOCAL
-- DEVELOPMENT & AUTOMATED TESTING ONLY. Never use these
-- credentials in production environments.
--
-- Demo Accounts (Development Only):
--   admin@shopeasy.com    -> Admin@123    (Role: admin)
--   customer@shopeasy.com -> Customer@123 (Role: customer)
--
-- Prices are stored in paise (1 Rupee = 100 paise)
-- ============================================================

-- Seed Users
INSERT OR IGNORE INTO users (id, name, email, password_hash, role, phone, address)
VALUES 
(1, 'Admin User', 'admin@shopeasy.com', '$2b$10$j6ntKCsex/CIadMKxWowEu3Ej88j.1lrfxnC5JSbKDkbeqdU8auxC', 'admin', '9876543210', '101 Admin Towers, Tech City'),
(2, 'Rahul Sharma', 'customer@shopeasy.com', '$2b$10$spViFAF1jp4EkPxAjkwQvOt2YjZiGglPfTRAMyQli0pUZ9v6WJopq', 'customer', '9812345678', '42 Palm Avenue, Indiranagar, Bengaluru');

-- Seed Categories
INSERT OR IGNORE INTO categories (id, name)
VALUES 
(1, 'Electronics'),
(2, 'Fashion & Apparel'),
(3, 'Home & Living'),
(4, 'Books & Stationery');

-- Seed Products (Prices in paise, e.g. 199900 = Rs 1,999.00)
INSERT OR IGNORE INTO products (id, category_id, name, description, price, stock, image_url, is_active)
VALUES 
(1, 1, 'Noise-Cancelling Wireless Headphones', 'Premium over-ear Bluetooth headphones with active noise cancellation, 30-hour battery life, and ultra-comfortable earcups.', 299900, 25, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80', 1),
(2, 1, 'Mechanical Gaming Keyboard', 'RGB backlit mechanical keyboard with tactile blue switches, anti-ghosting keys, and detachable braided USB-C cable.', 189900, 18, 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&auto=format&fit=crop&q=80', 1),
(3, 1, 'Ultra-Slim Smartwatch Pro', 'Fitness and health tracker with AMOLED touch display, heart-rate monitor, SpO2 sensor, and 7-day battery life.', 249900, 12, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80', 1),
(4, 1, 'Fast Wireless Charging Pad 15W', 'Sleek Qi-certified fast wireless charging pad with temperature protection and LED charging indicator.', 79900, 4, 'https://images.unsplash.com/photo-1586816879360-004f5b0c51e5?w=600&auto=format&fit=crop&q=80', 1),

(5, 2, 'Classic Denim Jacket', 'Timeless trucker denim jacket crafted with premium heavy-duty cotton and vintage brass button accents.', 169900, 15, 'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=600&auto=format&fit=crop&q=80', 1),
(6, 2, 'Breathable Running Sneakers', 'Lightweight athletic running shoes featuring cushioned memory foam insole and high-traction rubber outsole.', 219900, 3, 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop&q=80', 1),
(7, 2, 'Pure Cotton Crewneck T-Shirt', 'Soft combed cotton daily casual tee with a tailored fit, ribbed collar, and pre-shrunk fabric.', 49900, 40, 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80', 1),
(8, 2, 'Polarized Aviator Sunglasses', 'Classic metal frame sunglasses with 100% UV400 protective polarized lenses and scratch-resistant coating.', 89900, 20, 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=600&auto=format&fit=crop&q=80', 1),

(9, 3, 'Modern Ceramic Table Lamp', 'Warm ambient table lamp with handcrafted textured ceramic base and linen fabric shade.', 129900, 8, 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600&auto=format&fit=crop&q=80', 1),
(10, 3, 'Stainless Steel Thermal Coffee Mug 500ml', 'Double-wall vacuum insulated travel tumbler that keeps beverages piping hot for 6 hours or icy cold for 12 hours.', 64900, 35, 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80', 1),
(11, 3, 'Aroma Essential Oil Diffuser', 'Ultrasonic quiet cool mist humidifier and aromatherapy diffuser with 7 ambient LED mood light settings.', 109900, 2, 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600&auto=format&fit=crop&q=80', 1),
(12, 3, 'Orthopedic Memory Foam Pillow', 'Contour ergonomic neck support pillow designed to relieve cervical neck pain and improve sleep quality.', 149900, 14, 'https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=600&auto=format&fit=crop&q=80', 1),

(13, 4, 'Hardcover Leather Daily Planner', 'Premium undated goal and productivity planner featuring 100gsm bleed-proof ivory paper and bookmark ribbon.', 59900, 30, 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80', 1),
(14, 4, 'Calligraphy Fountain Pen Set', 'Luxury metallic fountain pen equipped with fine stainless nib, converter, and 6 assorted black/blue ink cartridges.', 79900, 16, 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=600&auto=format&fit=crop&q=80', 1),
(15, 4, 'Desk Organizer & Pen Stand', 'Eco-friendly polished bamboo desktop organizer with multi-compartment storage for stationery, phone, and cards.', 44900, 22, 'https://images.unsplash.com/photo-1585776245991-cf89dd7fc73a?w=600&auto=format&fit=crop&q=80', 1),
(16, 4, 'Atomic Habits - James Clear', 'A proven framework for improving every day. Practical strategies on how to form good habits, break bad ones, and master tiny behaviors.', 39900, 50, 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&auto=format&fit=crop&q=80', 1);
