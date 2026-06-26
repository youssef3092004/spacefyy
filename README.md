# Spacefyy

Spacefyy is a multi-tenant backend API for managing branch-based businesses — workspaces, gaming cafes, and similar venues. It handles everything from staff and customers to sessions, billing, and analytics.

---

## Table of Contents

- [What Is Spacefyy](#what-is-spacefyy)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Modules](#modules)
  - [Authentication & Authorization](#authentication--authorization)
  - [Business & Branch Management](#business--branch-management)
  - [Resources](#resources)
  - [Customers](#customers)
  - [Visits](#visits)
  - [Sessions & Components](#sessions--components)
  - [Orders](#orders)
  - [Invoices](#invoices)
  - [Pricing](#pricing)
  - [Products & Categories](#products--categories)
  - [Staff & Payroll](#staff--payroll)
  - [Analytics](#analytics)
  - [Plans & Storage](#plans--storage)
- [Pricing System](#pricing-system)
- [API Base URL](#api-base-url)
- [Security](#security)
- [Background Jobs](#background-jobs)
- [Environment Variables](#environment-variables)

---

## What Is Spacefyy

Spacefyy is built for businesses that operate across multiple branches and need to track customer time, resource usage, products, and billing all in one place.

**Target use cases:**
- Gaming cafes (PlayStation, Xbox, VR, simulators)
- Co-working spaces and hot-desking setups
- Billiard halls, table tennis venues, and similar activity spaces
- Any branch-based business that bills customers by time, session, or game

A customer walks in, a visit is opened, one or more sessions are started (each tracking which resources they are using), food and drinks can be ordered, and when they leave the visit is closed and an invoice is generated with all applicable discounts applied.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM) |
| Framework | Express |
| Database | PostgreSQL via Prisma ORM |
| Cache | Redis |
| Auth | JWT |
| File storage | Cloudinary |
| Security | Helmet, CORS, XSS sanitization |

---

## Architecture

The project follows a layered architecture:

```
server.js          → boots the app, connects DB + Redis, registers routes, starts cron jobs
routes/            → route definitions (auth, permissions, resources, billing)
controllers/       → request handling and business logic
middleware/        → auth, permissions, ownership checks, caching, error handling
utils/             → shared utilities (pricing, discounts, availability, pagination)
prisma/schema      → single source of truth for all data models
configs/           → DB and Redis connection setup
```

All routes are versioned under `/api/v1`.

---

## Modules

### Authentication & Authorization

JWT-based authentication. Every protected route requires a valid token. The system supports role-based access control (RBAC) and branch-level permissions.

**Roles:** `DEVELOPER`, `OWNER`, `ADMIN`, `STAFF`, `CUSTOMER`

- `DEVELOPER` bypasses all ownership checks.
- `OWNER` has full access to their own businesses and branches.
- `STAFF` and `ADMIN` are controlled via granular permissions per branch.

Permissions can be granted at the role level or overridden per user at the branch level via `BranchUserPermission`.

---

### Business & Branch Management

A business is the top-level entity owned by a user. Each business can have multiple branches. Branches have their own staff, resources, sessions, orders, and invoices — they are fully isolated from each other.

Each business is on a subscription plan that controls limits (max branches, spaces, devices, staff, etc.).

---

### Resources

Resources are the physical things a customer can use during a session. Each resource belongs to a branch and has its own base price and pricing type.

| Resource | Description |
|---|---|
| **Space** | A room or area (private room, public zone, meeting room, VIP area, etc.) |
| **Device** | A hardware device (PS4, PS5, Xbox, PC, VR headset, simulator, etc.) |
| **Unit** | A table or station (billiard table, ping-pong table, gaming station, etc.) |
| **Equipment** | An accessory (controller, headset, keyboard, steering wheel, etc.) |

Every resource has:
- A `priceType` — `PER_HOUR`, `PER_SESSION`, or `PER_GAME`
- A `price` — the base rate
- An `isBusy` flag — automatically updated when sessions start and end

Pricing rules can override any resource's default price with time-range constraints, player count conditions, and priority levels.

---

### Customers

Customers are scoped per business. Each customer has a sequential number within their business (not global), a profile, tags, notes, and an optional loyalty discount.

Customer discounts are time-aware — they can be limited to a date range and a time-of-day window. A blocked customer cannot start visits or create orders.

→ See [docs/customer.md](docs/customer.md) for the full customer API reference.

---

### Visits

A visit is the container for a customer's time at a branch. Everything that happens — sessions, orders, and the final invoice — is linked to a visit.

**Visit lifecycle:**

```
ACTIVE → INVOICED
```

Payment is tracked on the Invoice (`UNPAID` → `PAID`), not on the visit itself.

- A visit is opened when the customer arrives via `POST /visits/start`.
- Sessions and orders are added while the visit is `ACTIVE`.
- The visit is closed via `PATCH /visits/close/:visitId`, which creates the invoice and applies discounts.
- The invoice is paid via `PATCH /invoices/pay/:visitId`.

A customer can only have one `ACTIVE` visit at a time per branch. Blocked customers cannot start visits.

---

### Sessions & Components

A session represents **one continuous activity block** — for example, "Mohamed playing PS from 14:00 to 17:00." The session itself holds no pricing data; all pricing lives in its components.

A **session component** is a single resource contributing to a session. One session can have many components. Each component is priced independently and has its own start time — enabling mid-session additions without stopping the session.

**Creating a session — three modes:**

- `deviceId` → smart mode: system auto-detects the device's room and adds SPACE + DEVICE if private, DEVICE only if public
- `unitId` → smart mode: same logic for units (billiard table, ping pong, etc.)
- `components[]` → manual mode: staff explicitly lists all resources (used for space-only/workspace sessions)

Equipment is always added mid-session via `addComponent`, never as a session starter.

**Example:** A customer starts playing PS alone in a private room — staff sends `deviceId` and the system auto-adds SPACE + DEVICE. Their friend arrives an hour later — staff adds 2 controllers via `addComponent`. The session stays open the whole time. The controllers have their own `startedAt` so they are only billed from when the friend arrived.

When the session ends, each component calculates its own price and the session total is the sum of all components.

→ See the [Pricing System](docs/pricingSystem.md) for formulas, smart mode logic, and full scenarios.

---

### Orders

Orders cover products (food, drinks, merchandise) sold at a branch. There are two types:

- **Visit orders** — linked to a visit. No discount applied at the order level. Discounts are applied once at the invoice level when the visit is closed.
- **Takeaway orders** — standalone, no visit. Customer and manual discounts are applied directly at the order level.

Stock is managed automatically — decremented when items are added, restored when items are removed or an order is cancelled.

→ See [docs/order.md](docs/order.md) for the full order API reference.

---

### Invoices

An invoice is generated when a visit is closed or when a takeaway order is completed and invoiced separately.

**Visit invoice** contains:
- `totalAmount` — raw total before discounts (sessions + orders)
- `customerDiscountType/Amount` — auto-resolved from the customer's profile
- `discountType/Amount` — manual discount applied by staff at checkout
- `finalAmount` — what the customer actually pays

**Invoice statuses:** `UNPAID` → `PAID`

→ See the [Pricing System](docs/pricingSystem.md) for the full discount calculation flow.

---

### Pricing

The pricing system governs how session components are billed. It supports three pricing types, pricing rules that override resource defaults, and a two-layer discount system.

→ See [docs/pricingSystem.md](docs/pricingSystem.md) for the complete pricing reference including formulas, real-world scenarios, mid-session component additions, and discount logic.

---

### Products & Categories

Products belong to a branch and are organized into categories. Each product has a price, stock level, SKU, and optional low-stock alerts.

Stock is automatically adjusted when order items are added, updated, removed, or when an order is cancelled.

---

### Staff & Payroll

Staff members have profiles linked to a branch with a base salary, hire date, position, and optional national ID. Payroll records are created monthly and go through an approval workflow before being marked as paid.

**Payroll lifecycle:** `PENDING` → `APPROVED` → `PAID` (or `REJECTED`)

---

### Analytics

Analytics are available at the branch and customer level:

- **Branch analytics** — monthly revenue, customer counts, active vs new customers, average spend per customer with month-over-month trends.
- **Customer analytics** — total visits, total spend, average spend per visit, last activity.
- **Order analytics** — top products by revenue and quantity for a branch over a date range.

Historical branch stats are persisted monthly by a background cron job so trend data is always available without expensive live queries.

---

### Plans & Storage

Every business subscribes to a plan (`FREE`, `PRO`, `ENTERPRISE`) that sets limits on how many branches, spaces, devices, units, equipment, staff, and users are allowed. Storage usage is tracked in real time and compared against plan limits when new resources are created.

---

## Pricing System

The pricing system is the most complex part of Spacefyy. It covers:

- How session components are priced (PER\_HOUR, PER\_SESSION, PER\_GAME)
- How pricing rules override resource base prices
- How mid-session resource additions work (e.g., adding controllers while a session is running)
- How discounts are applied — customer discount first, then manual discount on top
- How visit invoices are calculated (sessions + raw order totals, then discounts applied once)
- How takeaway order invoices differ (discounts applied at the order level instead)

→ Full reference: [docs/pricingSystem.md](docs/pricingSystem.md)

---

## API Base URL

All endpoints are versioned under:

```
/api/v1
```

| Prefix | Module |
|---|---|
| `/api/v1/auth` | Authentication |
| `/api/v1/users` | Users |
| `/api/v1/roles` | Roles |
| `/api/v1/permissions` | Permissions |
| `/api/v1/businesses` | Businesses |
| `/api/v1/branches` | Branches |
| `/api/v1/spaces` | Spaces |
| `/api/v1/devices` | Devices |
| `/api/v1/units` | Units |
| `/api/v1/equipment` | Equipment |
| `/api/v1/pricing-rules` | Pricing rules |
| `/api/v1/resource-pricing` | Bulk resource pricing |
| `/api/v1/customers` | Customers |
| `/api/v1/visits` | Visits |
| `/api/v1/sessions` | Sessions |
| `/api/v1/session-components` | Session components |
| `/api/v1/products` | Products |
| `/api/v1/categories` | Product categories |
| `/api/v1/orders` | Orders |
| `/api/v1/invoices` | Invoices |
| `/api/v1/staff` | Staff profiles |
| `/api/v1/payroll` | Payroll |
| `/api/v1/analytics` | Analytics |
| `/api/v1/plans` | Plans |
| `/api/v1/storage-usage` | Storage usage |

---

## Security

- **Helmet** — sets security-related HTTP headers.
- **CORS** — cross-origin request control.
- **XSS sanitization** — all `req.body`, `req.query`, and `req.params` fields are sanitized on every request.
- **Request size limit** — JSON and URL-encoded bodies are limited to 10kb.
- **JWT** — tokens are verified on every protected route. Blacklisted tokens are rejected.
- **Ownership checks** — every resource operation verifies that the requesting user has access to the branch the resource belongs to.
- **Permission checks** — granular permission names are verified per route, with branch-level overrides respected.

---

## Background Jobs

Two cron jobs run on a schedule:

| Job | What it does |
|---|---|
| `branchStatsCron` | Persists monthly branch statistics (revenue, customer counts) so analytics queries stay fast |
| `storageUsageCron` | Recalculates and persists current resource counts per business for plan limit enforcement |

---

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Port the server listens on |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Secret used to sign and verify JWT tokens |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name for file uploads |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
