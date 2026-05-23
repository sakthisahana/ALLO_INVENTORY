# Allo Inventory — Engineering Take-Home
*Submitted by:* SAKTHI SAHANA D &nbsp;|&nbsp; *Register Number:* 22MIS0619

A Next.js (App Router) application for multi-warehouse inventory management with race-condition-safe reservations.

## 🌐 Live Demo
https://allo-inventory-df6u.vercel.app/

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (end-to-end) |
| ORM | Prisma |
| Database | PostgreSQL (Supabase / Neon) |
| Distributed lock | Redis (Upstash) |
| Validation | Zod |
| Styling | Tailwind CSS |

---

## Local Setup (Step-by-Step)

### Prerequisites

- Node.js 18+ installed
- A **Supabase** account (free tier) — for Postgres
- An **Upstash** account (free tier) — for Redis

### Step 1 — Clone and install dependencies

```bash
git clone <your-repo>
cd allo-inventory
npm install
```

### Step 2 — Create Supabase project (Postgres)

1. Go to https://supabase.com → New project
2. Save your **database password** during setup
3. Once created, go to **Settings → Database**
4. Copy the **Connection string (URI)** — it looks like:
   `postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`
5. Append `?sslmode=require` to the end

### Step 3 — Create Upstash Redis instance

1. Go to https://console.upstash.com → Create Database
2. Choose your region, select **TLS enabled**
3. Copy the **Redis URL** (starts with `rediss://` for TLS or `redis://`)

### Step 4 — Create environment file

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.YOUR_REF.supabase.co:5432/postgres?sslmode=require"
REDIS_URL="rediss://default:YOUR_PASSWORD@YOUR_HOST.upstash.io:6379"
CRON_SECRET="any-random-secret-string"
```

### Step 5 — Run Prisma migration

```bash
npx prisma db push
```

This creates all tables in your Supabase database.

### Step 6 — Seed the database

```bash
npm run db:seed
```

This creates 3 warehouses, 5 products, and stock levels across warehouses.

### Step 7 — Start the development server

```bash
npm run dev
```

Open http://localhost:3000

---

## Deploying to Vercel

1. Push your repo to GitHub
2. Import to Vercel: https://vercel.com/new
3. Set environment variables in Vercel dashboard (same as `.env.local`)
4. Deploy — Vercel auto-runs `next build` and Prisma generates the client
5. After deploy, run seed against production DB:

```bash
DATABASE_URL="your-prod-url" npm run db:seed
```

---

## How Concurrency Safety Works

### The Problem

If two simultaneous requests check stock and both see 1 available unit, both will pass the availability check and create reservations — resulting in overselling.

### The Solution: Redis Distributed Lock

Before any reservation is created, we acquire a **Redis lock** keyed on `lock:stock:{productId}:{warehouseId}`:

```
Request A                         Request B
  │                                   │
  ├─ SET lock NX PX 5000 → "OK"       ├─ SET lock NX PX 5000 → nil (blocked)
  ├─ Read stock: 1 available          │   (retries up to 20x with 50ms delay)
  ├─ Create reservation               │
  ├─ Increment reservedUnits          │
  ├─ DEL lock (Lua atomic)            ├─ Acquires lock
  │                                   ├─ Read stock: 0 available
  │                                   └─ Returns 409
```

The lock uses `SET key value NX PX ttl` which is **atomic in Redis** — only one client gets `"OK"`. Lock release uses a **Lua script** to atomically check-then-delete (prevents accidentally releasing another request's lock after a delay).

After acquiring the lock, the stock update uses a **Prisma transaction** so the `Reservation` creation and `StockLevel` increment are atomic at the database level too.

### Why not just use a DB transaction?

A serializable Postgres transaction alone would work but under high load causes many transaction retries and deadlocks. The Redis lock keeps contention narrow (per SKU+warehouse), while the DB transaction provides durability guarantees.

---

## Reservation Expiry Mechanism

### In Production (Vercel Cron)

`vercel.json` defines a cron job that hits `/api/cron/expire-reservations` **every minute**:

```json
{
  "crons": [{ "path": "/api/cron/expire-reservations", "schedule": "0 0 * * *" }]
}
```

The endpoint:
1. Finds all `PENDING` reservations where `expiresAt < NOW()`
2. Sets their status to `RELEASED`
3. Decrements `reservedUnits` on the corresponding `StockLevel`

The cron endpoint is protected by a `CRON_SECRET` bearer token to prevent unauthorized calls.

### Lazy Cleanup on Read

As a secondary safety net, the `confirm` endpoint also detects expired reservations at read time and releases them inline — so even if the cron hasn't run yet, a confirm call on an expired reservation will return 410 and clean up.

---

## Idempotency (Bonus)

Both the `POST /api/reservations` and `POST /api/reservations/:id/confirm` endpoints support an optional `Idempotency-Key` header.

**How it works:**

- `POST /api/reservations`: The key is stored as a unique field on the `Reservation` row. If a duplicate key is received, the existing reservation is returned immediately (no new reservation created).

- `POST /api/reservations/:id/confirm`: The confirmed response is cached in Redis with a 24-hour TTL keyed by the idempotency key. Duplicate calls return the cached response.

**Usage:**
```http
POST /api/reservations
Idempotency-Key: client-generated-uuid-here
Content-Type: application/json

{ "productId": "...", "warehouseId": "...", "quantity": 1 }
```

---

## API Reference

| Method | Path | Description |
|---|---|---|
| GET | `/api/products` | List products with available stock per warehouse |
| GET | `/api/warehouses` | List all warehouses |
| POST | `/api/reservations` | Create a reservation (returns 409 if insufficient stock) |
| GET | `/api/reservations/:id` | Get a single reservation |
| POST | `/api/reservations/:id/confirm` | Confirm reservation (returns 410 if expired) |
| POST | `/api/reservations/:id/release` | Release reservation early |
| GET | `/api/cron/expire-reservations` | Cron: release expired reservations (requires Bearer token) |

---

## Trade-offs & What I'd Do Differently

1. **Polling vs. WebSockets**: The reservation page refreshes state by re-fetching after user actions. With more time, I'd add Server-Sent Events or a WebSocket to push expiry notifications in real time.

2. **Lock granularity**: Locking per (product, warehouse) is fine for this scale. At very high throughput, I'd consider using Postgres `SELECT ... FOR UPDATE SKIP LOCKED` as an alternative that eliminates the Redis dependency entirely.

3. **Cron granularity**: The 1-minute cron means a reservation can stay in `PENDING` state up to 1 minute after expiry. The lazy cleanup in the confirm endpoint mitigates this for the user-facing flow.

4. **No auth**: A production system would have user authentication so reservations are tied to a customer. Currently anyone can confirm/release any reservation by ID.

5. **Error observability**: I'd add structured logging (e.g. Axiom or Sentry) to track failed lock acquisitions and 409 rates per SKU.
