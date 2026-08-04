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
  - [Shifts & Attendance](#shifts--attendance)
  - [Analytics & Reports](#analytics--reports)
  - [Plans, Subscriptions & Storage](#plans-subscriptions--storage)
- [Pricing System](#pricing-system)
- [API Base URL](#api-base-url)
- [Security](#security)
- [Background Jobs](#background-jobs)
- [Maintenance Scripts](#maintenance-scripts)
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

| Layer        | Technology                     |
| ------------ | ------------------------------ |
| Runtime      | Node.js (ESM)                  |
| Framework    | Express                        |
| Database     | PostgreSQL via Prisma ORM      |
| Cache        | Redis                          |
| Auth         | JWT                            |
| File storage | Cloudinary                     |
| Security     | Helmet, CORS, XSS sanitization |

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

`GET /users/getMe` returns the authenticated user plus a `userType` (their role name) and a `branchId` — the latter is resolved from the user's staff profile for `STAFF` and `ADMIN` (their assigned branch), and is `null` for `OWNER`/`DEVELOPER`.

---

### Business & Branch Management

A business is the top-level entity owned by a user. Each business can have multiple branches. Branches have their own staff, resources, sessions, orders, and invoices — they are fully isolated from each other.

Each business is on a subscription plan that controls limits (max branches, spaces, devices, staff, etc.).

---

### Resources

Resources are the physical things a customer can use during a session. Each resource belongs to a branch and has its own base price and pricing type.

| Resource      | Description                                                                |
| ------------- | -------------------------------------------------------------------------- |
| **Space**     | A room or area (private room, public zone, meeting room, VIP area, etc.)   |
| **Device**    | A hardware device (PS4, PS5, Xbox, PC, VR headset, simulator, etc.)        |
| **Unit**      | A table or station (billiard table, ping-pong table, gaming station, etc.) |
| **Equipment** | An accessory (controller, headset, keyboard, steering wheel, etc.)         |

Every resource has:

- A `priceType` — `PER_HOUR`, `PER_SESSION`, or `PER_GAME`
- A `price` — the base rate
- An `isBusy` flag — automatically updated when sessions start and end

Pricing rules can override any resource's default price with time-range constraints, player count conditions, and priority levels.

**Space capacity:** only **PUBLIC** spaces hold multiple resources and take a `bookingCapacity` from the client. Every other space type (PRIVATE, MEETING, VIP, DESK, OTHER) is **single-use** — its `bookingCapacity` is always `1` and any client-supplied value is ignored on create/update. `bookingCapacity` is the availability logic field (it seeds and caps `availableNumber`). The separate `capacity` field is a **display-only** number the frontend supplies for any space type and is never used in availability logic.

**Live overview:** `GET /spaces/overview/:branchId` returns the whole branch floor — every space (with the devices/units inside PUBLIC spaces), each resource's busy/free state, the `customer` and `visitId` occupying it, and dashboard metrics: `activeVisits`, `spacesOccupied` / `spacesTotal`, `todayOrders`, and `longestSessionSeconds` (plus a pre-formatted `longestSession`, e.g. `"2h 25m"`). Updates are pushed live over Socket.IO — clients don't poll.

→ See [docs/space-overview.md](docs/space-overview.md) for the full overview + real-time reference.

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

**Player-count (mode) pricing:** a console can bill differently by player count — Single (1v1) vs Double (2v2). Pass `players` when creating a session and switch mid-session with `PATCH /sessions/change-players/:sessionId`; each mode becomes its own timed line on the bill (the device is never released during a switch, so it can't be booked mid-swap). Extra controllers for more players are added dynamically by the frontend/staff as equipment components (`addComponent`), not automatically. Optionally, `PricingRule`s with `minPlayers`/`maxPlayers` can make the console's own rate vary by band.

→ See the [Pricing System](docs/pricingSystem.md) for formulas, smart mode logic, player-count pricing, and full scenarios.

---

### Orders

Orders cover products (food, drinks, merchandise) sold at a branch. There are two types:

- **Visit orders** — linked to a visit. No discount applied at the order level. Discounts are applied once at the invoice level when the visit is closed.
- **Takeaway orders** — standalone, no visit. Customer and manual discounts are applied directly at the order level.

Stock is managed automatically — decremented when items are added, restored when items are removed or an order is cancelled.

Every order response includes an `invoice` summary so the frontend can show its billing state at a glance: `{ isInvoiced, invoiceId, status }` — `status` is `null` until the order is invoiced, then `UNPAID` / `PAID`. Paying or deleting an invoice invalidates the cached order lists so the state stays fresh.

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

**Payment method** — when marking an invoice as paid (`PATCH /invoices/pay/:visitId` or `PATCH /invoices/payById/:invoiceId`), the body must include a `paymentMethod` (`CASH`, `CARD`, `INSTAPAY`, `BANK`) — paying without it returns `400`. It is stored on the invoice and powers the payment breakdown in the [Reports](#analytics--reports) module. Invoices paid before this field existed are reported as `UNKNOWN`.

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

### Shifts, Attendance & Till Reconciliation

Supervisors run a branch's day as a sequence of **shifts**, opened and closed manually (no timers). Only one shift can be `OPEN` per branch at a time — the current one is closed with a handover form before the next opens. Shift numbers (1, 2, 3…) are assigned automatically per branch per day.

The number of shifts a branch may run per day is **capped by its subscription plan** (`Plan.maxShiftsPerDay`, `null` = unlimited) — hitting the cap returns `403`.

**No sale, booking, session, order, or payment can happen without an open shift** — every money-touching write (starting/closing a visit, sessions, orders, order items, invoice creation/payment) is blocked with `400` unless the branch currently has one `OPEN`. `OWNER`/`DEVELOPER` bypass this gate. Every invoice paid by a `STAFF`/`ADMIN` user is stamped with the shift that was open at the time (`Invoice.shiftId`), so revenue is provably attributable, not just time-window-guessed.

Opening a shift requires a counted **opening cash** float; closing requires handover notes and a manually counted **actual cash** amount. The system computes what the drawer _should_ contain (`expectedCash = openingCash + cash revenue − expenses`) and flags any **variance** — a shortfall (critical) or overage (warning) — the actual point of a daily cash-closing report. Petty-cash **expenses** paid out of the till during a shift require an amount and a reason, and only exist while the shift is `OPEN`.

Each shift also tracks **staff attendance** (present / late / absent / left-early, with check-in/out times), editable only while the shift is `OPEN`. Closing a shift returns the full picture: revenue with payment-method breakdown, expenses, and the cash reconciliation. `GET /shifts/report/daily/:branchId` rolls all of a day's shifts into attendance, revenue, expense, and variance totals.

**Shift lifecycle:** `OPEN` → `CLOSED` (closed shifts, their attendance, and their expenses are read-only)

→ See [docs/shifts.md](docs/shifts.md) for the full shift, gating, reconciliation, attendance, and expenses API reference.

---

### Analytics & Reports

Analytics are available at the branch and customer level:

- **Branch analytics** — monthly revenue, customer counts, active vs new customers, average spend per customer with month-over-month trends.
- **Customer analytics** — total visits, total spend, average spend per visit, last activity.
- **Order analytics** — top products by revenue and quantity for a branch over a date range.

Historical branch stats are persisted monthly by a background cron job so trend data is always available without expensive live queries.

**Financial reports** (`/api/v1/reports`) go further — full owner-facing reports for any date range, at branch level or business-wide with a per-branch comparison breakdown:

- **Income** — total revenue (what customers actually paid), session vs. product split, daily/weekly trend, and a payment method breakdown (Cash / Card / InstaPay / Bank).
- **Outstanding** — unpaid invoice count and total, with an overdue bucket (> 14 days).
- **Payroll cost** — paid payroll as an expense proxy, plus `netAfterPayroll` (deliberately not called "profit" — rent/utilities/inventory costs aren't tracked yet). Visible to OWNER/ADMIN/DEVELOPER only.
- **Customers, discounts, top products, low-stock products.**
- **Rule-based insights** — automatic `info`/`warning`/`critical` flags: revenue drops vs. the previous period, uncollected invoices piling up, heavy discounting, low stock, overdue payroll, and underperforming branches.

Requesting a single day (`startDate=endDate=today`) doubles as the **Daily Closing Report**: net profit for the day, payment breakdown, branch name. Past days are served from `BranchDailyReport` snapshots persisted nightly by a cron, with automatic live fallback when snapshots have gaps.

→ See [docs/reports.md](docs/reports.md) for the full reports reference.

---

### Plans, Subscriptions & Storage

Every business subscribes to a plan (`FREE`, `PRO`, `ENTERPRISE`) that sets limits on how many branches, spaces, devices, units, equipment, staff, and users are allowed. Storage usage is tracked in real time and compared against plan limits when new resources are created.

A business's billing history is tracked as `Subscription` rows — one per plan period, never mutated in place. A new plan (or a renewal) always adds a new row instead of editing the old one, so `GET /subscriptions/getAll/:businessId` is a full audit trail. Lifecycle: `TRIALING`/`ACTIVE` → `PAST_DUE` (grace period after the billing period lapses with no renewal) → `EXPIRED` (business is downgraded back to the default free/public plan), or → `CANCELLED` (immediately, or deferred to the end of the current period). Creating a business auto-creates its first subscription; billing itself is manual (a developer confirms payment and calls `create`/`renew` — there's no payment gateway).

→ See [docs/subscription.md](docs/subscription.md) for the full Plans + Subscriptions API reference.

---

## Pricing System

The pricing system is the most complex part of Spacefyy. It covers:

- How session components are priced (PER_HOUR, PER_SESSION, PER_GAME)
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

| Prefix                             | Module                                                    |
| ---------------------------------- | --------------------------------------------------------- |
| `/api/v1/auth`                     | Authentication                                            |
| `/api/v1/roles`                    | Roles                                                     |
| `/api/v1/users`                    | Users                                                     |
| `/api/v1/permissions`              | Permissions                                               |
| `/api/v1/role-permissions`         | Role permissions                                          |
| `/api/v1/user-permissions`         | User permissions                                          |
| `/api/v1/businesses`               | Businesses                                                |
| `/api/v1/branches`                 | Branches                                                  |
| `/api/v1/branch-user-permissions`  | Branch-level permission overrides                         |
| `/api/v1/spaces`                   | Spaces                                                    |
| `/api/v1/devices`                  | Devices                                                   |
| `/api/v1/units`                    | Units                                                     |
| `/api/v1/equipments`               | Equipments                                                |
| `/api/v1/pricing-rules`            | Pricing rules                                             |
| `/api/v1/resource-pricing`         | Bulk resource pricing                                     |
| `/api/v1/plans`                    | Plans                                                     |
| `/api/v1/subscriptions`            | Subscriptions                                             |
| `/api/v1/storage-usage`            | Storage usage                                             |
| `/api/v1/customers`                | Customers                                                 |
| `/api/v1/visits`                   | Visits                                                    |
| `/api/v1/sessions`                 | Sessions                                                  |
| `/api/v1/session-components`       | Session components                                        |
| `/api/v1/products`                 | Products                                                  |
| `/api/v1/categories`               | Product categories                                        |
| `/api/v1/orders`                   | Orders                                                    |
| `/api/v1/order-items`              | Order items                                               |
| `/api/v1/invoices`                 | Invoices                                                  |
| `/api/v1/staff-profiles`           | Staff profiles                                            |
| `/api/v1/business-settings`        | Business settings                                         |
| `/api/v1/payrolls`                 | Payroll                                                   |
| `/api/v1/analytics`                | Analytics                                                 |
| `/api/v1/reports`                  | Branch & business financial reports                       |
| `/api/v1/shifts`                   | Shift open/close, till reconciliation, daily shift report |
| `/api/v1/shift-attendance`         | Per-shift staff attendance                                |
| `/api/v1/shift-expenses`           | Per-shift petty-cash expenses                             |
| `/api/v1/websocket-space-overview` | Real-time space overview sockets                          |

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

Five cron jobs run on a schedule (all configurable via env cron expressions):

| Job                   | Default schedule  | What it does                                                                                                                                                                    |
| --------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `branchStatsCron`     | Monthly           | Persists monthly branch statistics (revenue, customer counts) so analytics queries stay fast                                                                                    |
| `dailyReportCron`     | Daily (00:10 UTC) | Persists yesterday's per-branch financial snapshot (`BranchDailyReport`: revenue splits, payment breakdown, discounts, customer counts) so reports over long ranges stay fast   |
| `storageUsageCron`    | Weekly            | Recalculates and persists current resource counts per business for plan limit enforcement                                                                                       |
| `visitAutoCancelCron` | Every 5 min       | Cancels stale `ACTIVE` visits that have no sessions and no orders after a timeout (`AUTO_CANCEL_AFTER_MINUTES`, default 30)                                                     |
| `subscriptionCron`    | Hourly            | Moves lapsed subscriptions `ACTIVE → PAST_DUE → EXPIRED` (or `→ CANCELLED` if deferred cancellation was requested), after a grace period (`SUBSCRIPTION_GRACE_DAYS`, default 3) |

> Cron jobs require a long-running server process and do not run on Vercel serverless functions.

---

## Maintenance Scripts

One-off scripts under `scripts/`, run with `node --env-file=.env scripts/<name>.js`:

| Script                      | What it does                                                                                                                                                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reconcileResourceState.js` | Recomputes every space/device/unit's `isBusy` (and normalizes non-PUBLIC space `bookingCapacity` to `1`) from the live sessions, clearing any drift between the data and the live overview. **Dry-run by default**; pass `--apply` to write, `--branch=<id>` to scope. |

---

## Environment Variables

| Variable                | Description                               |
| ----------------------- | ----------------------------------------- |
| `PORT`                  | Port the server listens on                |
| `DATABASE_URL`          | PostgreSQL connection string              |
| `REDIS_URL`             | Redis connection string                   |
| `JWT_SECRET`            | Secret used to sign and verify JWT tokens |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name for file uploads    |
| `CLOUDINARY_API_KEY`    | Cloudinary API key                        |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret                     |
