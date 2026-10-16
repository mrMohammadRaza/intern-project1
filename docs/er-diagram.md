# ShopEasy — Entity-Relationship (ER) Diagram & Schema Specification

This document details the relational database design for **ShopEasy**, implemented using SQLite with foreign key enforcement (`PRAGMA foreign_keys = ON;`) and WAL journaling mode.

## 1. Entity-Relationship Diagram (Mermaid)

```mermaid
erDiagram
    users ||--o{ cart_items : "owns"
    users ||--o{ orders : "places"
    categories ||--o{ products : "contains"
    products ||--o{ cart_items : "added_to"
    products ||--o{ order_items : "ordered_in"
    orders ||--|{ order_items : "contains"

    users {
        INTEGER id PK "Auto Increment"
        TEXT name "Not Null"
        TEXT email "Unique, Not Null"
        TEXT password_hash "Bcrypt Hash, Not Null"
        TEXT role "Check: customer | admin, Default: customer"
        TEXT phone "Optional Mobile Number"
        TEXT address "Optional Default Address"
        DATETIME created_at "Default CURRENT_TIMESTAMP"
    }

    categories {
        INTEGER id PK "Auto Increment"
        TEXT name "Unique, Not Null"
    }

    products {
        INTEGER id PK "Auto Increment"
        INTEGER category_id FK "References categories(id) ON DELETE RESTRICT"
        TEXT name "Not Null"
        TEXT description "Product details"
        INTEGER price "In Paise, Check >= 0, Not Null"
        INTEGER stock "Integer, Check >= 0, Not Null"
        TEXT image_url "Product image web URL"
        INTEGER is_active "Check: 0 | 1, Default 1"
        DATETIME created_at "Default CURRENT_TIMESTAMP"
    }

    cart_items {
        INTEGER id PK "Auto Increment"
        INTEGER user_id FK "References users(id) ON DELETE CASCADE"
        INTEGER product_id FK "References products(id) ON DELETE CASCADE"
        INTEGER quantity "Check > 0, Not Null"
        DATETIME created_at "Default CURRENT_TIMESTAMP"
    }

    orders {
        INTEGER id PK "Auto Increment"
        INTEGER user_id FK "References users(id) ON DELETE RESTRICT"
        INTEGER total_amount "In Paise, Check >= 0, Not Null"
        TEXT status "Check: Placed | Shipped | Delivered | Cancelled"
        TEXT shipping_name "Recipient Full Name, Not Null"
        TEXT shipping_phone "Recipient Mobile, Not Null"
        TEXT shipping_address "Street Address, Not Null"
        TEXT shipping_city "City, Not Null"
        TEXT shipping_pincode "6-digit Postal PIN Code, Not Null"
        TEXT payment_method "Default: Cash on Delivery"
        DATETIME created_at "Default CURRENT_TIMESTAMP"
    }

    order_items {
        INTEGER id PK "Auto Increment"
        INTEGER order_id FK "References orders(id) ON DELETE CASCADE"
        INTEGER product_id FK "References products(id) ON DELETE RESTRICT"
        INTEGER quantity "Check > 0, Not Null"
        INTEGER unit_price "In Paise, Captured at purchase time, Check >= 0"
    }
```

---

## 2. Table Specifications & Constraints

### `users`
- **Primary Key:** `id`
- **Email Uniqueness:** Case-insensitive lookup and `UNIQUE` constraint prevent multiple accounts with the same email.
- **Role Enforcement:** Constrained by `CHECK(role IN ('customer', 'admin'))`. Default is always `'customer'`. Public registration routes never accept client-supplied role values.
- **Passwords:** Never stored in plain text; hashed using `bcrypt` (10 rounds).

### `categories`
- **Primary Key:** `id`
- **Name:** `UNIQUE NOT NULL`.
- **Integrity:** Safe deletion check: Deletion is rejected if products are currently assigned to the category.

### `products`
- **Primary Key:** `id`
- **Category Reference:** `category_id` references `categories(id)` with `ON DELETE RESTRICT`.
- **Currency Storage:** `price` is strictly stored as an integer representing currency in **paise** (1 Rupee = 100 paise) to eliminate IEEE 754 floating-point rounding errors.
- **Stock Integrity:** `CHECK(stock >= 0)`.
- **Soft Deletion / Deactivation:** When a product has historical orders (`order_items`), attempts to delete it automatically trigger deactivation (`is_active = 0`) instead of hard deletion to preserve historical order logs.

### `cart_items`
- **Primary Key:** `id`
- **Uniqueness Constraint:** `UNIQUE(user_id, product_id)` prevents redundant rows for the same product in a customer's cart.
- **Cascading Deletion:** If a user account or a product is deleted, associated cart rows cascade delete.

### `orders`
- **Primary Key:** `id`
- **User Reference:** `user_id` references `users(id)` with `ON DELETE RESTRICT`.
- **Status Lifecycle:** `CHECK(status IN ('Placed', 'Shipped', 'Delivered', 'Cancelled'))`. Default is `'Placed'`.
- **Payment Method:** Default is `'Cash on Delivery'`.
- **Total Amount:** Stored in paise; validated and calculated on the backend from active product prices.

### `order_items`
- **Primary Key:** `id`
- **Historical Price Capture:** `unit_price` captures the exact price in paise at the time of purchase. Future changes to product catalog prices do not alter historical orders.
- **Quantity:** `CHECK(quantity > 0)`.

---

## 3. Database Indexes

- `idx_products_category`: Optimizes category filter queries (`WHERE category_id = ?`).
- `idx_products_active`: Optimizes catalog queries filtering active items (`WHERE is_active = 1`).
- `idx_cart_user`: Accelerates user cart lookups (`WHERE user_id = ?`).
- `idx_orders_user`: Accelerates customer order history lookups (`WHERE user_id = ?`).
- `idx_orders_status`: Accelerates administrative status filtering (`WHERE status = ?`).
- `idx_order_items_order`: Accelerates order details joining (`WHERE order_id = ?`).
