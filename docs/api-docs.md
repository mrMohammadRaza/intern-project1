# ShopEasy REST API Reference

All requests and responses use JSON. Unauthenticated private requests receive `401 Unauthorized`. Insufficient privileges return `403 Forbidden`.

Base URL: `http://localhost:3000/api`

---

## 1. Authentication Endpoints

### Register Customer
- **Endpoint:** `POST /api/auth/register`
- **Access:** Public
- **Request Body:**
  ```json
  {
    "name": "Rahul Sharma",
    "email": "customer@shopeasy.com",
    "password": "Customer@123",
    "phone": "9812345678",
    "address": "42 Palm Avenue, Indiranagar, Bengaluru"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "message": "Registration successful! Welcome to ShopEasy.",
    "token": "eyJhbGciOi...",
    "user": {
      "id": 2,
      "name": "Rahul Sharma",
      "email": "customer@shopeasy.com",
      "role": "customer",
      "phone": "9812345678",
      "address": "42 Palm Avenue, Indiranagar, Bengaluru"
    }
  }
  ```

### User Login
- **Endpoint:** `POST /api/auth/login`
- **Access:** Public (Rate-Limited: 10 attempts per 15-minute sliding window)
- **Request Body:**
  ```json
  {
    "email": "admin@shopeasy.com",
    "password": "Admin@123"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "message": "Login successful.",
    "token": "eyJhbGciOi...",
    "user": {
      "id": 1,
      "name": "Admin User",
      "email": "admin@shopeasy.com",
      "role": "admin",
      "phone": "9876543210"
    }
  }
  ```
- **Response (429 Too Many Requests):** Returned when exceeding 10 failed or repeated requests in a 15-minute window.
  ```json
  {
    "error": "Too many requests. Please try again in 15 minutes."
  }
  ```

### Get Current User Profile
- **Endpoint:** `GET /api/auth/me`
- **Access:** Authenticated (Bearer Token)
- **Response (200 OK):**
  ```json
  {
    "user": {
      "id": 1,
      "name": "Admin User",
      "email": "admin@shopeasy.com",
      "role": "admin"
    }
  }
  ```

---

## 2. Product Catalog Endpoints

### List Products
- **Endpoint:** `GET /api/products`
- **Access:** Public
- **Query Parameters:**
  - `search` (string): Search in product name or description
  - `category` (integer): Filter by Category ID
  - `sort` (string): `newest` | `price_asc` | `price_desc` | `name_asc` | `name_desc`
  - `page` (integer, default 1)
  - `limit` (integer, default 8)
- **Response (200 OK):**
  ```json
  {
    "products": [
      {
        "id": 1,
        "category_id": 1,
        "category_name": "Electronics",
        "name": "Noise-Cancelling Wireless Headphones",
        "description": "Premium over-ear Bluetooth headphones...",
        "price": 299900,
        "stock": 25,
        "image_url": "https://images.unsplash.com/...",
        "is_active": 1
      }
    ],
    "pagination": {
      "total": 16,
      "page": 1,
      "limit": 8,
      "totalPages": 2
    }
  }
  ```

### Get Single Product
- **Endpoint:** `GET /api/products/:id`
- **Access:** Public
- **Response (200 OK):**
  ```json
  {
    "product": {
      "id": 1,
      "name": "Noise-Cancelling Wireless Headphones",
      "price": 299900,
      "stock": 25,
      "category_name": "Electronics"
    }
  }
  ```

### Create Product
- **Endpoint:** `POST /api/products`
- **Access:** Admin only
- **Request Body:**
  ```json
  {
    "name": "Smart Fitness Band",
    "description": "Tracks heart rate and steps.",
    "price": 149900,
    "stock": 30,
    "category_id": 1,
    "image_url": "https://images.unsplash.com/...",
    "is_active": 1
  }
  ```
- **Response (201 Created)**

### Update Product
- **Endpoint:** `PUT /api/products/:id`
- **Access:** Admin only
- **Response (200 OK)**

### Delete / Deactivate Product
- **Endpoint:** `DELETE /api/products/:id`
- **Access:** Admin only
- **Response (200 OK):** Automatically converts to deactivation if associated with orders.

---

## 3. Categories Endpoints

### List Categories
- **Endpoint:** `GET /api/categories`
- **Access:** Public
- **Response (200 OK):** Array of categories with `product_count`.

### Create Category
- **Endpoint:** `POST /api/categories`
- **Access:** Admin only

### Update Category
- **Endpoint:** `PUT /api/categories/:id`
- **Access:** Admin only

### Delete Category
- **Endpoint:** `DELETE /api/categories/:id`
- **Access:** Admin only (Safely rejected if products belong to it)

---

## 4. Shopping Cart Endpoints

### View Cart
- **Endpoint:** `GET /api/cart`
- **Access:** Authenticated Customer
- **Response (200 OK):**
  ```json
  {
    "items": [
      {
        "id": 1,
        "product_id": 1,
        "name": "Noise-Cancelling Wireless Headphones",
        "unit_price": 299900,
        "quantity": 2,
        "line_total": 599800,
        "available_stock": 25
      }
    ],
    "total_items": 2,
    "total_amount": 599800
  }
  ```

### Add to Cart
- **Endpoint:** `POST /api/cart`
- **Access:** Authenticated Customer
- **Request Body:**
  ```json
  {
    "product_id": 1,
    "quantity": 1
  }
  ```

### Update Item Quantity
- **Endpoint:** `PUT /api/cart/:itemId`
- **Access:** Authenticated Customer
- **Request Body:** `{"quantity": 3}`

### Remove Item from Cart
- **Endpoint:** `DELETE /api/cart/:itemId`
- **Access:** Authenticated Customer

---

## 5. Orders & Checkout Endpoints

### Place Order (Cash on Delivery)
- **Endpoint:** `POST /api/orders`
- **Access:** Authenticated Customer
- **Execution:** Atomic SQLite Database Transaction
- **Request Body:**
  ```json
  {
    "shipping_name": "Rahul Sharma",
    "shipping_phone": "9812345678",
    "shipping_address": "42 Palm Avenue, Indiranagar",
    "shipping_city": "Bengaluru",
    "shipping_pincode": "560038"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "message": "Order placed successfully! Cash on Delivery.",
    "order": {
      "id": 101,
      "total_amount": 599800,
      "status": "Placed",
      "payment_method": "Cash on Delivery",
      "items": [...]
    }
  }
  ```

### Customer Order History
- **Endpoint:** `GET /api/orders`
- **Access:** Authenticated Customer Only

### Get Order Details
- **Endpoint:** `GET /api/orders/:id`
- **Access:** Customer (own orders only) / Admin (any order)

### Cancel Order (Placed Only)
- **Endpoint:** `PATCH /api/orders/:id/cancel`
- **Access:** Authenticated Customer Only
- **Execution:** Atomic check-and-set query (`WHERE id = ? AND status = 'Placed'`) guaranteeing that stock restoration occurs exactly once and cannot be duplicated via repeated requests.

---

## 6. Administrator Endpoints

### Store Statistics
- **Endpoint:** `GET /api/admin/stats`
- **Access:** Admin only
- **Response (200 OK):**
  ```json
  {
    "stats": {
      "total_products": 16,
      "total_orders": 12,
      "total_customers": 8,
      "total_sales": 3298800,
      "low_stock_count": 3,
      "status_breakdown": [...],
      "recent_orders": [...]
    }
  }
  ```

### All Orders
- **Endpoint:** `GET /api/admin/orders`
- **Access:** Admin only
- **Query Params:** `status` (Placed | Shipped | Delivered | Cancelled), `search` (customer name, email, order ID)

### Update Order Status
- **Endpoint:** `PATCH /api/admin/orders/:id/status`
- **Access:** Admin only
- **Request Body:** `{"status": "Shipped"}`
- **Lifecycle Transition Rules:**
  - `Placed` &rarr; `Shipped` or `Cancelled`
  - `Shipped` &rarr; `Delivered` or `Cancelled`
  - `Delivered` &rarr; Terminal (no further changes permitted)
  - `Cancelled` &rarr; Terminal (no further changes permitted)
  - Admin cancellation of a `Placed` or `Shipped` order automatically and atomically restores item quantities back to product stock.
  - Invalid transitions (e.g., `Shipped` &rarr; `Placed`) return `400 Bad Request`.
