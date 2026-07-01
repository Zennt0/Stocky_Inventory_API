# 📱 Stocky API — Backend

> RESTful API backend for **Stocky**, an AI-powered phone store inventory management system built with Express.js, Prisma, and PostgreSQL.

---

## ✨ Features

- **Authentication & Authorization** — JWT-based auth with access/refresh tokens, role-based access control (Admin / Staff)
- **Email Verification** — OTP-based email verification & password reset via SMTP (Nodemailer)
- **Product Management** — Full CRUD with IMEI tracking, supplier linking, stock history, and status management
- **AI-Powered Specs Lookup** — Automatically fetch phone specifications via Google Gemini API
- **AI Chatbot (Stocky)** — Intelligent assistant with intent detection for inventory queries, sales insights, and general conversation
- **Sales Tracking** — Record and query sales with statistics (revenue, profit, top brands)
- **Stock History** — Automatic audit trail for product creation, sales, and manual stock adjustments
- **Supplier Management** — Auto find-or-create suppliers by name
- **Security** — Helmet, CORS, rate limiting, request validation (Zod), account lockout on failed logins

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| **Node.js** | Runtime |
| **Express.js v5** | Web framework |
| **Prisma** | ORM & database migrations |
| **PostgreSQL** | Database |
| **JWT** | Authentication (access + refresh tokens) |
| **Zod** | Request validation |
| **Nodemailer** | Email (verification, password reset) |
| **Google Gemini API** | AI chatbot & phone specs lookup |
| **Pino** | Structured logging |
| **Helmet** | HTTP security headers |
| **express-rate-limit** | Rate limiting |
| **bcryptjs** | Password hashing |

---

## 📁 Project Structure

```
backend/
├── server.js                     # Entry point — Express app setup
├── package.json
├── prisma.config.js
├── .env.example                  # Environment variable template
└── src/
    ├── config/
    │   ├── db.js                 # Database connection & graceful shutdown
    │   ├── prisma.js             # Prisma client singleton
    │   ├── env.js                # Environment variable validation
    │   ├── logger.js             # Pino logger configuration
    │   └── mail.js               # Nodemailer transporter & email templates
    ├── controller/
    │   ├── auth.controller.js    # Register, login, verify, reset password
    │   ├── product.controller.js # CRUD, IMEI lookup, AI specs, stats
    │   ├── sales.controller.js   # Create sale, query sales, statistics
    │   └── chat.controller.js    # AI chatbot with intent detection
    ├── services/
    │   ├── auth.service.js       # User DB operations
    │   ├── product.service.js    # Product DB operations & stock history
    │   ├── sales.service.js      # Sales DB operations & aggregations
    │   └── chat.service.js       # Chat history & Gemini API integration
    ├── middleware/
    │   ├── auth.js               # JWT authentication & role authorization
    │   ├── validation.js         # Zod schemas for all endpoints
    │   ├── rateLimit.js          # Rate limiter configs (API, auth, AI)
    │   └── errorHandler.js       # Global error handler
    ├── routes/
    │   ├── auth.routes.js
    │   ├── product.routes.js
    │   ├── sales.routes.js
    │   └── chat.routes.js
    └── prisma/
        ├── schema.prisma         # Database schema
        └── seed.js               # Database seeder
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [PostgreSQL](https://www.postgresql.org/) database
- [Google Gemini API Key](https://aistudio.google.com/apikey) (for AI features)
- SMTP credentials (for email features — e.g., Gmail App Password)

### 1. Clone the repository

```bash
git clone https://github.com/Iano023/stocky-api.git
cd stocky-api
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

```env
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/inventory_db?schema=public
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
GEMINI_API_KEY=your_gemini_api_key

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM="Stocky Support" <your-email@gmail.com>
```

### 4. Set up the database

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# (Optional) Seed sample data
npm run seed
```

### 5. Start the server

```bash
# Development (with hot-reload)
npm run dev

# Production
npm start
```

The API will be available at `http://localhost:3000`.

---

## 📚 API Endpoints

All endpoints (except auth) require a valid JWT in the `Authorization: Bearer <token>` header.

### 🔐 Authentication — `/api/auth`

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/register` | Create a new account | ✗ |
| `POST` | `/login` | Login & receive tokens | ✗ |
| `POST` | `/verify-email` | Verify email with OTP code | ✗ |
| `POST` | `/resend-verification` | Resend verification email | ✗ |
| `POST` | `/forgot-password` | Send password reset code | ✗ |
| `POST` | `/verify-reset-code` | Verify the reset code | ✗ |
| `POST` | `/reset-password` | Set new password | ✗ |
| `POST` | `/refresh` | Refresh access token | ✗ |
| `POST` | `/logout` | Invalidate refresh token | ✗ |
| `GET` | `/me` | Get current user profile | ✓ |

### 📦 Products — `/api/products`

| Method | Endpoint | Description | Auth | Role |
|---|---|---|---|---|
| `GET` | `/` | List products (search, filter, paginate) | ✓ | Any |
| `GET` | `/low-stock` | Get low/out-of-stock products | ✓ | Any |
| `GET` | `/stats` | Get inventory statistics | ✓ | Any |
| `GET` | `/imei/:imei` | Find product by IMEI | ✓ | Any |
| `GET` | `/lookup-specs/:imei` | AI-powered specs lookup by IMEI | ✓ | Any |
| `GET` | `/:id` | Get product details (with stock history) | ✓ | Any |
| `POST` | `/` | Create a new product | ✓ | Admin, Staff |
| `PUT` | `/:id` | Update a product | ✓ | Admin, Staff |
| `DELETE` | `/:id` | Delete a product | ✓ | Admin |

### 💰 Sales — `/api/sales`

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/` | Record a new sale | ✓ |
| `GET` | `/` | List sales (filter, paginate) | ✓ |
| `GET` | `/stats` | Sales statistics (revenue, profit, top brands) | ✓ |
| `GET` | `/:id` | Get sale details | ✓ |

### 🤖 Chat (AI Assistant) — `/api/chat`

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/` | Get chat history | ✓ |
| `POST` | `/` | Send a message to Stocky AI | ✓ |

---

## 🗄️ Database Schema

```
User ──────────┐
  │             │
  │ (userId)    │ (soldById)
  ▼             ▼
Product ──── Sale
  │
  │ (supplierId)
  ▼
Supplier

Product ──── StockHistory
Product ──── Sale
User ──────── ChatMessage
User ──────── StockHistory
```

### Models

| Model | Description |
|---|---|
| **User** | App users with email/password auth, roles (ADMIN/STAFF) |
| **Product** | Phone inventory items with brand, model, specs, IMEI, pricing |
| **Supplier** | Supplier companies, auto-created when adding products |
| **Sale** | Sales records linked to products and users |
| **StockHistory** | Audit trail — tracks CREATED, SOLD, MANUAL_ADJUSTMENT events |
| **ChatMessage** | Persistent AI chat history per user |

---

## 🔧 Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot-reload (nodemon) |
| `npm start` | Start production server |
| `npm run prisma:migrate` | Run database migrations |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:studio` | Open Prisma Studio (database GUI) |
| `npm run seed` | Seed the database with sample data |
| `npm run render:build` | Build script for Render deployment |

---

## 🌐 Deployment

This project is configured for deployment on [Render](https://render.com):

- **Build Command**: `npm run render:build`
- **Start Command**: `npm start`
- **Environment**: Set all variables from `.env.example` in the Render dashboard

### Environment Variables to set on Render:

- `DATABASE_URL` — Your PostgreSQL connection string
- `JWT_SECRET` — A strong random secret
- `JWT_EXPIRES_IN` — e.g., `7d`
- `JWT_REFRESH_EXPIRES_IN` — e.g., `30d`
- `GEMINI_API_KEY` — Google Gemini API key
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` — Email config

---

## 🔒 Security

- **Helmet** — Sets secure HTTP headers
- **CORS** — Restricts origins (allows mobile apps & configured frontend URL)
- **Rate Limiting** — Global API limit + stricter limits on auth & AI endpoints
- **Zod Validation** — All request bodies and params are validated
- **Password Hashing** — bcryptjs with salt rounds
- **Account Lockout** — Temporary lockout after repeated failed login attempts
- **JWT Refresh Tokens** — Short-lived access tokens with long-lived refresh tokens

---

## 📄 License

ISC

---

<p align="center">
  Built with ❤️ for <strong>Stocky</strong> — AI-Powered Inventory Management
</p>
