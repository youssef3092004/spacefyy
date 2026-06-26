# Spacefyy — Backend API

Spacefyy is a multi-tenant SaaS backend for managing space rental and time-based service businesses (gaming cafes, coworking spaces, lounges, etc.). It handles the full business workflow: customer check-in, resource sessions, product orders, invoicing, staff payroll, and analytics — all through a single REST API.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [Environment Variables](#environment-variables)
4. [Getting Started](#getting-started)
5. [Database Models](#database-models)
6. [API Reference](#api-reference)
7. [Authentication & RBAC](#authentication--rbac)
8. [Business Logic](#business-logic)
9. [Caching](#caching)
10. [Background Jobs](#background-jobs)
11. [Related Docs](#related-docs)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ES Modules) |
| Framework | Express 5 |
| ORM | Prisma 7 |
| Database | PostgreSQL |
| Cache | Redis |
| Auth | JWT (jsonwebtoken) |
| Password | bcrypt |
| Security | helmet, cors, xss, express-rate-limit |
| File Upload | multer + sharp + Cloudinary |
| Cron Jobs | node-cron |
| Dev Tools | nodemon, ESLint, Prettier |

---

## Project Structure

```
spacefyy/
├── configs/          # DB (Prisma + pg Pool) and Redis client
├── controllers/      # Route handler logic
├── middleware/       # Auth, ownership checks, caching
├── prisma/
│   └── schema.prisma # Full data model
├── routes/           # Express routers
├── seeds/            # Seed scripts for dev data
├── scripts/          # One-off utility scripts
├── utils/            # Shared helpers (pricing, discounts, pagination, RBAC)
├── docs/             # This file and other documentation
├── server.js         # App entry point
└── task.js           # Cron job definitions
```

---

## Environment Variables

Create a `.env` file at the project root:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/spacefyy
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
PORT=3000
```

---

## Getting Started

```bash
# Install dependencies
npm install

# Run Prisma migrations
npx prisma migrate dev

# Seed the database
node seeds/seed.js

# Start dev server
npm run dev

# Start production server
npm start
```

The API runs on `http://localhost:3000/api/v1`.

---

## Database Models

### Users & Access Control

| Model | Key Fields |
|---|---|
| **User** | id, roleId, name, phone (unique), email (unique), password, isDeleted |
| **Role** | id, name (ADMIN / STAFF / CUSTOMER / OWNER / DEVELOPER) |
| **Permission** | id, name (unique) — e.g. `CREATE-SESSIONS` |
| **RolePermission** | roleId + permissionId |
| **UserPermission** | userId + permissionId + isAllowed (grant/deny override) |
| **BranchUserPermission** | userId + branchId + permissionId + isAllowed (most specific) |
| **BlacklistedToken** | token + expiredAt (logout enforcement) |

### Business & Branches

| Model | Key Fields |
|---|---|
| **Business** | id, name, ownerId, planId |
| **BusinessSettings** | businessId (unique), defaultLanguage (EN/AR), notificationsEnabled, autoApprovePayroll |
| **Branch** | id, businessId, name, address, image, isActive, openingTime, closingTime |
| **Plan** | id, name, type (FREE/PRO/ENTERPRISE), price, maxStaff, maxBranches, maxSpaces, ... |

### Resources

| Model | Key Fields |
|---|---|
| **Space** | id, branchId, name, type (PRIVATE/PUBLIC/DESK/MEETING/VIP/OTHER), capacity, availableNumber, priceType, price, isActive, isBusy |
| **Device** | id, branchId, spaceId?, name, type (PC/PS5_4/XBOX_SERIES_X/VR_HEADSET/...), priceType, price, isActive, isBusy |
| **Unit** | id, branchId, spaceId?, name, type (BILLIARD_TABLE/TABLE_TENNIS_TABLE/VR_POD/...), priceType, price, isActive, isBusy |
| **Equipment** | id, branchId, name, type (CONTROLLER/STEERING_WHEEL/KEYBOARD/...), priceType, price, quantity, isActive |
| **PricingRule** | id, branchId, name, pricingType, pricingMode (TIME_RANGE/PER_HOUR/FIXED_PRICE), price, minDurationMinutes, maxDurationMinutes, minPlayers, maxPlayers, priority, isActive |

### Customers

| Model | Key Fields |
|---|---|
| **Customer** | id, businessId, seqNumber, name, phone, email, tags (VIP/Regular/Blacklisted/New/Loyal), isBlocked, blockedReason, hasDiscount, discountType (FLAT/PERCENT), discountAmount, discountStartsAt, discountEndsAt, discountStartTime, discountEndTime |
| **CustomerBranch** | customerId + branchId + firstVisitAt |

### Visits & Sessions

| Model | Key Fields |
|---|---|
| **Visit** | id, branchId, customerId, status (ACTIVE/INVOICED), totalPrice (sessions + orders), startedAt, endedAt, durationMinutes |
| **Session** | id, branchId, visitId, status (ACTIVE/ENDED/CANCELLED), totalPrice (sum of components), startedAt, endedAt, durationMinutes |
| **SessionComponent** | id, sessionId, resourceType (SPACE/DEVICE/UNIT/EQUIPMENT), resourceId, priceType, unitPrice (snapshot), quantity, gamesCount, startedAt, endedAt, durationMinutes, totalPrice |

### Products & Orders

| Model | Key Fields |
|---|---|
| **CategoryProduct** | id, branchId, name |
| **Product** | id, categoryId, branchId, name, sku, price, stock, isActive |
| **Order** | id, visitId?, branchId?, customerId?, status (OPEN/COMPLETED), discountType, discountAmount, totalPrice, finalPrice |
| **OrderItem** | id, orderId, productId, quantity, unitPrice, totalPrice |

### Invoices & Analytics

| Model | Key Fields |
|---|---|
| **Invoice** | id, visitId?, orderId?, branchId?, totalAmount, discountAmount, customerDiscountAmount, finalAmount, status (UNPAID/PAID), paidAt |
| **BranchMonthlyStats** | branchId, month, year, newCustomers, activeCustomers, totalRevenue, avgSpendPerCustomer |
| **StorageUsage** | businessId (unique), currentBranches, currentSpaces, currentDevices, currentUnits, currentEquipment, currentStaff |

### Staff & Payroll

| Model | Key Fields |
|---|---|
| **StaffProfile** | id, userId, branchId, baseSalary, hireDate, position, department |
| **NationalId** | id, staffProfileId, number, frontImage, backImage |
| **Payroll** | id, staffProfileId, month, year, grossSalary, bonus, overtime, deductions, netSalary, method (CASH/BANK/INSTAPAY/CARD), status (PENDING/APPROVED/PAID) |

---

## API Reference

Base URL: `/api/v1`

### Auth — `/auth`

| Method | Path | Description |
|---|---|---|
| POST | `/register` | Register a new user |
| POST | `/login` | Login, returns JWT |
| POST | `/logout` | Blacklist token |
| POST | `/refresh` | Refresh JWT |
| GET | `/profile` | Get current user profile |

### Roles & Permissions — `/roles`, `/permissions`, `/role-permissions`

| Method | Path | Description |
|---|---|---|
| POST | `/roles/create` | Create role |
| GET | `/roles/getAll` | List all roles |
| GET | `/roles/:id` | Get role by ID |
| PATCH | `/roles/:id` | Update role |
| DELETE | `/roles/:id` | Delete role |
| POST | `/permissions/create` | Create permission |
| GET | `/permissions/getAll` | List all permissions |
| POST | `/role-permissions/assign` | Assign permission to role |
| DELETE | `/role-permissions/:id` | Remove permission from role |

### Users & Access — `/users`, `/user-permissions`, `/branch-user-permissions`

| Method | Path | Description |
|---|---|---|
| POST | `/users/create` | Create user |
| GET | `/users/getAll` | List all users (DEVELOPER only) |
| GET | `/users/:id` | Get user |
| PATCH | `/users/:id` | Update user |
| DELETE | `/users/:id` | Delete user |
| POST | `/user-permissions/assign` | Override user permission (grant/deny) |
| DELETE | `/user-permissions/:id` | Remove override |
| POST | `/branch-user-permissions/assign` | Branch-level permission override |
| PATCH | `/branch-user-permissions/:id` | Update branch permission |
| DELETE | `/branch-user-permissions/:id` | Remove branch permission |

### Plans — `/plans`

| Method | Path | Description |
|---|---|---|
| POST | `/create` | Create plan (DEVELOPER only) |
| GET | `/getAll` | List active plans |
| GET | `/:id` | Get plan details |
| PATCH | `/:id` | Update plan |

### Businesses — `/businesses`

| Method | Path | Description |
|---|---|---|
| POST | `/create` | Create business |
| GET | `/getAll` | List businesses (DEVELOPER only) |
| GET | `/:id` | Get business |
| PATCH | `/:id` | Update business |
| DELETE | `/:id` | Delete business |

### Business Settings — `/business-settings`

| Method | Path | Description |
|---|---|---|
| GET | `/:businessId` | Get settings |
| PATCH | `/:businessId` | Update settings (language, notifications, payroll) |

### Branches — `/branches`

| Method | Path | Description |
|---|---|---|
| POST | `/create/:businessId` | Create branch |
| GET | `/getAll/:businessId` | List branches |
| GET | `/:id` | Get branch |
| PATCH | `/:id` | Update branch |
| DELETE | `/:id` | Delete branch |

### Spaces — `/spaces`

| Method | Path | Description |
|---|---|---|
| POST | `/create/:branchId` | Create space |
| GET | `/getAll/:branchId` | List spaces (filters: type, isActive, isBusy, capacity) |
| GET | `/:spaceId` | Get space with analytics |
| GET | `/byIsActive/:branchId/:isActive` | Filter by active status |
| GET | `/byType/:branchId/:type` | Filter by type |
| GET | `/history/:spaceId` | Session history for space |
| PATCH | `/:spaceId` | Update space |
| DELETE | `/:spaceId` | Soft delete space |
| DELETE | `/all/:branchId` | Delete all spaces in branch |

### Devices — `/devices`

| Method | Path | Description |
|---|---|---|
| POST | `/create/:branchId` | Create device |
| GET | `/getAll/:branchId` | List devices (filters: type, isActive, isBusy) |
| GET | `/:deviceId` | Get device |
| PATCH | `/:deviceId` | Update device |
| DELETE | `/:deviceId` | Soft delete device |

### Units — `/units`

| Method | Path | Description |
|---|---|---|
| POST | `/create/:branchId` | Create unit |
| GET | `/getAll/:branchId` | List units |
| GET | `/:unitId` | Get unit |
| PATCH | `/:unitId` | Update unit |
| DELETE | `/:unitId` | Delete unit |

### Equipment — `/equipments`

| Method | Path | Description |
|---|---|---|
| POST | `/create/:branchId` | Create equipment |
| GET | `/getAll/:branchId` | List equipment |
| GET | `/:equipmentId` | Get equipment |
| PATCH | `/:equipmentId` | Update equipment |
| DELETE | `/:equipmentId` | Delete equipment |

### Pricing Rules — `/pricing-rules`

| Method | Path | Description |
|---|---|---|
| POST | `/create/:branchId` | Create pricing rule |
| GET | `/getAll/:branchId` | List pricing rules |
| GET | `/:id` | Get rule |
| PATCH | `/:id` | Update rule |
| DELETE | `/:id` | Delete rule |

### Customers — `/customers`

| Method | Path | Description |
|---|---|---|
| POST | `/create` | Create customer |
| GET | `/getAll/:businessId` | List customers (supports search) |
| GET | `/:customerId` | Get customer with visit/order history |
| PATCH | `/:customerId` | Update customer |
| GET | `/:customerId/analytics` | Customer spending analytics |
| PATCH | `/:customerId/block` | Block customer (with reason) |
| PATCH | `/:customerId/unblock` | Unblock customer |
| DELETE | `/:customerId` | Delete customer |
| GET | `/history/:branchId` | Branch customer history with monthly trends |
| GET | `/monthly-stats/:branchId` | Branch monthly stats |

### Visits — `/visits`

| Method | Path | Description |
|---|---|---|
| POST | `/start` | Start a visit for a customer at a branch |
| GET | `/getAllByBranchId/:branchId` | List visits (filter: status ACTIVE/INVOICED) |
| PATCH | `/close/:visitId` | Close visit, apply discounts, create invoice |

### Sessions — `/sessions`

| Method | Path | Description |
|---|---|---|
| POST | `/create/:branchId` | Create session (smart mode or manual components) |
| GET | `/getAll/:branchId` | List sessions for branch (paginated) |
| GET | `/getById/:sessionId` | Get session with all components |
| GET | `/visit/:branchId/:visitId` | Get all sessions for a visit |
| PATCH | `/update/:sessionId` | Update bookingId, currency, startedAt |
| PATCH | `/end/:sessionId` | End session, calculate prices |
| PATCH | `/cancel/:sessionId` | Cancel session (zero all prices) |
| DELETE | `/delete/:sessionId` | Soft delete session |

### Session Components — `/session-components`

| Method | Path | Description |
|---|---|---|
| POST | `/:branchId/:sessionId` | Add component to active session |
| GET | `/:branchId/:sessionId` | List all components for session |
| DELETE | `/:branchId/remove/:componentId` | End component early, release resource |

### Categories — `/categories`

| Method | Path | Description |
|---|---|---|
| POST | `/create/:branchId` | Create product category |
| GET | `/getAll/:branchId` | List categories with product counts |
| GET | `/:categoryId` | Get category |
| PATCH | `/:categoryId` | Update category |
| DELETE | `/:categoryId` | Delete category (only if empty) |

### Products — `/products`

| Method | Path | Description |
|---|---|---|
| POST | `/create/:branchId` | Create product |
| GET | `/getAll/:branchId` | List products (filter: isActive) |
| GET | `/:productId` | Get product |
| PATCH | `/:productId` | Update product |
| DELETE | `/:productId` | Delete product |

### Orders — `/orders`

| Method | Path | Description |
|---|---|---|
| POST | `/create` | Add items to an order (visit or takeaway) |
| PATCH | `/item/:itemId` | Update order item quantity |
| DELETE | `/item/:itemId` | Remove order item |
| PATCH | `/visit/:visitId/complete` | Complete visit order |
| PATCH | `/complete/:orderId` | Complete takeaway order (with discounts) |
| DELETE | `/:orderId` | Cancel order |
| GET | `/visit/:visitId` | Get order for a visit |
| GET | `/getById/:orderId` | Get order details |
| GET | `/invoice/:orderId` | Get order invoice |
| GET | `/getAll` | List all orders (filters: branchId, visitId, status) |
| GET | `/analytics/branch/:branchId` | Branch order analytics |

### Invoices — `/invoices`

| Method | Path | Description |
|---|---|---|
| POST | `/create/:visitId` | Create invoice for closed visit |
| GET | `/:id` | Get invoice |
| GET | `/visit/:visitId` | Get invoice for visit |
| PATCH | `/:id/pay` | Mark invoice PAID |
| GET | `/unpaid/:branchId` | List unpaid invoices for branch |

### Staff & Payroll — `/staff-profiles`, `/payrolls`

| Method | Path | Description |
|---|---|---|
| POST | `/staff-profiles/create/:branchId` | Create staff profile |
| GET | `/staff-profiles/getAll/:branchId` | List branch staff |
| GET | `/staff-profiles/:id` | Get staff details |
| PATCH | `/staff-profiles/:id` | Update staff |
| POST | `/payrolls/create/:staffId` | Create payroll (month/year) |
| GET | `/payrolls/getAll/:branchId` | List payrolls (filter: status) |
| GET | `/payrolls/:id` | Get payroll |
| PATCH | `/payrolls/:id/approve` | Approve payroll |
| PATCH | `/payrolls/:id/mark-paid` | Mark payroll as PAID |

### Storage & Analytics — `/storage-usage`

| Method | Path | Description |
|---|---|---|
| GET | `/:businessId` | Current resource usage counts |
| GET | `/history/:businessId` | Historical storage usage |

---

## Authentication & RBAC

All protected routes require a Bearer JWT in the `Authorization` header.

**Token payload:** `{ userId, roleId, roleName }`

**Permission resolution chain** (first match wins):

```
1. Role is OWNER or DEVELOPER  →  always granted
2. BranchUserPermission match  →  return isAllowed
3. UserPermission match        →  return isAllowed
4. RolePermission match        →  granted
5. No match                    →  403 Forbidden
```

**Middleware order on routes:**

```
verifyToken → checkPermission("ACTION-RESOURCE") → checkOwnership(...) → controller
```

**Permission naming:** `ACTION-RESOURCE` (e.g. `CREATE-SESSIONS`, `DELETE-CATEGORY`, `VIEW-VISITS`)

**Role behaviour summary:**

| Role | Permission check | Branch access | Business access |
|---|---|---|---|
| DEVELOPER | Always granted | Bypassed | Bypassed |
| OWNER | Always granted | Bypassed | Must own business |
| ADMIN | Via chain | Via BranchUserPermission | — |
| STAFF | Via chain | Must have StaffProfile | — |
| CUSTOMER | Via chain | Via BranchUserPermission | — |

---

## Business Logic

### Full Visit Flow

```
1. POST /visits/start
   └─ Creates Visit (status: ACTIVE, totalPrice: 0)
   └─ Auto-creates CustomerBranch link + sets firstVisitAt

2. POST /sessions/create/:branchId
   └─ Creates Session + SessionComponents
   └─ Snapshots unitPrice/priceType at creation time
   └─ Decrements availableNumber / sets isBusy on resources

3. POST /orders/create
   └─ Adds products to visit Order (status: OPEN)

4. PATCH /sessions/end/:sessionId
   └─ Calculates component prices:
       PER_HOUR    → unitPrice × quantity × (durationMinutes / 60)
       PER_SESSION → unitPrice × quantity
       PER_GAME    → unitPrice × quantity × gamesCount
   └─ Releases resources (isBusy = false, availableNumber++)

5. PATCH /visits/close/:visitId
   └─ Sums all session totals + order totals
   └─ Applies customer discount (FLAT or PERCENT, with date/time window)
   └─ Applies manual discount (staff-entered at checkout)
   └─ Creates/upserts Invoice with finalAmount
   └─ Transitions Visit → INVOICED

6. PATCH /invoices/:id/pay
   └─ Sets Invoice status = PAID, records paidAt
```

### Session Components & Smart Space Detection

When creating a session with a `deviceId` or `unitId`, the system checks the parent space type:

- `PUBLIC` or `DESK` space → charge device/unit only (no space fee)
- `PRIVATE`, `VIP`, `MEETING`, `OTHER` space → charge space + device/unit

Components can be added mid-session via the session-components endpoint (e.g. a friend arrives and needs a controller). Each component tracks its own `startedAt` and `endedAt`.

### Discount System

Two independent discount layers applied in sequence:

1. **Customer discount** — stored on the Customer record. Supports optional date range (`discountStartsAt` / `discountEndsAt`) and time-of-day window (`discountStartTime` / `discountEndTime`).
2. **Manual discount** — entered by staff at visit close (`discountType`, `discountAmount` in request body).

Both support `FLAT` (fixed amount off) or `PERCENT` (percentage off).

### Takeaway Orders

Orders without a `visitId` are standalone takeaway orders. They go through the same discount system and generate their own Invoice on completion.

### Customer Blocking

Blocked customers (`isBlocked: true`) cannot start new visits. Use `PATCH /customers/:id/block` with an optional `blockedReason`, and `PATCH /customers/:id/unblock` to restore access.

### Payroll Flow

```
PENDING → APPROVED (PATCH /payrolls/:id/approve)
        → PAID     (PATCH /payrolls/:id/mark-paid)
```

If `autoApprovePayroll` is enabled in BusinessSettings, payrolls are approved automatically on creation.

---

## Caching

Redis is used to cache read-heavy responses. Cache is automatically invalidated on write operations for the affected resource.

| TTL Constant | Usage |
|---|---|
| `TTL_LIST` | Collection endpoints (getAll) |
| `TTL_BY_ID` | Single-record endpoints (getById) |
| `TTL_DETAIL` | Detail views with relations |
| `TTL_ANALYTICS` | Analytics/stats endpoints |

---

## Background Jobs

Defined in [task.js](../task.js) using `node-cron`.

| Job | Schedule | Description |
|---|---|---|
| `storageUsageCron` | Periodic | Snapshots StorageUsage and appends to StorageUsageHistory |
| `branchStatsCron` | Monthly | Calculates BranchMonthlyStats: new customers, active customers, total revenue, avg spend per customer |

---

## Related Docs

| File | Description |
|---|---|
| [pricingSystem.md](./pricingSystem.md) | Deep dive into pricing formulas, rules, and examples |
| [customer.md](./customer.md) | Customer management, analytics, and discount details |
| [order.md](./order.md) | Order lifecycle and structure |
| [RBAC.md](../RBAC.md) | Full authentication and authorization specification |
| [EQUIPMENT_API_DOCUMENTATION.json](./EQUIPMENT_API_DOCUMENTATION.json) | Equipment endpoint specs (Postman format) |
