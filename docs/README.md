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

| Layer       | Technology                            |
| ----------- | ------------------------------------- |
| Runtime     | Node.js (ES Modules)                  |
| Framework   | Express 5                             |
| ORM         | Prisma 7                              |
| Database    | PostgreSQL                            |
| Cache       | Redis                                 |
| Auth        | JWT (jsonwebtoken)                    |
| Password    | bcrypt                                |
| Security    | helmet, cors, xss, express-rate-limit |
| File Upload | multer + sharp + Cloudinary           |
| Cron Jobs   | node-cron                             |
| Dev Tools   | nodemon, ESLint, Prettier             |

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
├── utils/            # Shared helpers and cron modules (pricing, discounts, pagination, RBAC)
├── docs/             # This file and other documentation
├── server.js         # App entry point
└── task.js           # Legacy/unused entry point
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

| Model                    | Key Fields                                                            |
| ------------------------ | --------------------------------------------------------------------- |
| **User**                 | id, roleId, name, phone (unique), email (unique), password, isDeleted |
| **Role**                 | id, name (ADMIN / STAFF / CUSTOMER / OWNER / DEVELOPER)               |
| **Permission**           | id, name (unique) — e.g. `CREATE-SESSIONS`                            |
| **RolePermission**       | roleId + permissionId                                                 |
| **UserPermission**       | userId + permissionId + isAllowed (grant/deny override)               |
| **BranchUserPermission** | userId + branchId + permissionId + isAllowed (most specific)          |
| **BlacklistedToken**     | token + expiredAt (logout enforcement)                                |

### Business & Branches

| Model                | Key Fields                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Business**         | id, name, ownerId, planId                                                                                                                                                                    |
| **BusinessSettings** | businessId (unique), defaultLanguage (EN/AR), notificationsEnabled, autoApprovePayroll                                                                                                       |
| **Branch**           | id, businessId, name, address, image, isActive, openingTime, closingTime                                                                                                                     |
| **Plan**             | id, name, type (FREE/PRO/ENTERPRISE), price, billingInterval, trialDays, maxStaff, maxBranches, maxSpaces, ...                                                                               |
| **Subscription**     | id, businessId, planId, status (TRIALING/ACTIVE/PAST_DUE/CANCELLED/EXPIRED), priceSnapshot, currentPeriodStart, currentPeriodEnd, trialEndsAt, cancelAtPeriodEnd, cancelledAt, cancelledById |

### Resources

| Model           | Key Fields                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Space**       | id, branchId, name, type (PRIVATE/PUBLIC/DESK/MEETING/VIP/OTHER), capacity (display-only), bookingCapacity (availability), availableNumber, priceType, price, isActive, isBusy                                           |
| **Device**      | id, branchId, spaceId?, name, type (PC/PS5_4/XBOX_SERIES_X/VR_HEADSET/...), priceType, price, isActive, isBusy                                                            |
| **Unit**        | id, branchId, spaceId?, name, type (BILLIARD_TABLE/TABLE_TENNIS_TABLE/VR_POD/...), priceType, price, isActive, isBusy                                                     |
| **Equipment**   | id, branchId, name, type (CONTROLLER/STEERING_WHEEL/KEYBOARD/...), priceType, price, quantity, isActive                                                                   |
| **PricingRule** | id, branchId, name, pricingType, pricingMode (TIME_RANGE/PER_HOUR/FIXED_PRICE), price, minDurationMinutes, maxDurationMinutes, minPlayers, maxPlayers, priority, isActive |

### Customers

| Model              | Key Fields                                                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Customer**       | id, businessId, seqNumber, name, phone, email, tags (VIP/Regular/Blacklisted/New/Loyal), isBlocked, blockedReason, hasDiscount, discountType (FLAT/PERCENT), discountAmount, discountStartsAt, discountEndsAt, discountStartTime, discountEndTime |
| **CustomerBranch** | customerId + branchId + firstVisitAt                                                                                                                                                                                                              |

### Visits & Sessions

| Model                | Key Fields                                                                                                                                                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Visit**            | id, branchId, customerId, status (ACTIVE/INVOICED/CANCELLED), totalPrice (sessions + orders), startedAt, endedAt, durationMinutes, cancelledAt, cancelledById                                                                                                                                 |
| **Session**          | id, branchId, visitId, status (ACTIVE/ENDED/CANCELLED), totalPrice (sum of components), startedAt, endedAt, durationMinutes                                                                                                                                                                   |
| **SessionComponent** | id, sessionId, resourceType (SPACE/DEVICE/UNIT/EQUIPMENT), resourceId, priceType, unitPrice (snapshot), quantity, gamesCount, players?, modeLabel? (device/unit mode label e.g. "SGL"/"DBL" — explicit from request, else matched rule name), startedAt, endedAt, durationMinutes, totalPrice |

### Products & Orders

| Model               | Key Fields                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **CategoryProduct** | id, branchId, name                                                                                                  |
| **Product**         | id, categoryId, branchId, name, sku, price, stock, isActive                                                         |
| **Order**           | id, visitId?, branchId?, customerId?, status (OPEN/COMPLETED), discountType, discountAmount, totalPrice, finalPrice |
| **OrderItem**       | id, orderId, productId, quantity, unitPrice, totalPrice                                                             |

### Invoices & Analytics

| Model                  | Key Fields                                                                                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Invoice**            | id, visitId?, orderId?, branchId?, totalAmount, discountAmount, customerDiscountAmount, finalAmount, status (UNPAID/PAID), paymentMethod? (CASH/BANK/INSTAPAY/CARD — captured at payment), paidAt                                                                         |
| **BranchMonthlyStats** | branchId, month, year, newCustomers, activeCustomers, totalRevenue, avgSpendPerCustomer                                                                                                                                                                                   |
| **BranchDailyReport**  | branchId + date (unique), totalRevenue, sessionRevenue, productRevenue, paidInvoiceCount, grossRevenueBeforeDiscount, discountGiven, cash/card/instapay/bank/unknownPaymentTotal, newCustomers, activeCustomers — nightly per-branch snapshot powering the reports module |
| **StorageUsage**       | businessId (unique), currentBranches, currentSpaces, currentDevices, currentUnits, currentEquipment, currentStaff                                                                                                                                                         |

### Staff & Payroll

| Model            | Key Fields                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **StaffProfile** | id, userId, branchId, baseSalary, hireDate, position, department                                                                                       |
| **NationalId**   | id, staffProfileId, number, frontImage, backImage                                                                                                      |
| **Payroll**      | id, staffProfileId, month, year, grossSalary, bonus, overtime, deductions, netSalary, method (CASH/BANK/INSTAPAY/CARD), status (PENDING/APPROVED/PAID) |

### Shifts & Attendance

| Model                   | Key Fields                                                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Shift**               | id, branchId, date (local day), shiftNumber (per branch/day), status (OPEN/CLOSED), openedAt, closedAt, openedById, closedById, handoverNotes, incidentNotes, openingCash, actualCash?, expectedCash?, variance? — `@@unique([branchId, date, shiftNumber])` |
| **ShiftAttendance**     | id, shiftId, staffProfileId, status (PRESENT/LATE/ABSENT/LEFT_EARLY), checkInTime, checkOutTime, notes — `@@unique([shiftId, staffProfileId])`                                                                                                               |
| **ShiftExpense**        | id, shiftId, createdById, category, amount, reason, createdAt — petty-cash payouts during a shift, feeds `Shift.expectedCash`                                                                                                                                |
| **Plan** (new field)    | `maxShiftsPerDay Int?` — max shifts a branch may open per day (`null` = unlimited)                                                                                                                                                                           |
| **Invoice** (new field) | `shiftId String?` — the shift that was open when the invoice was paid (set at payment time, not creation)                                                                                                                                                    |

---

## API Reference

Base URL: `/api/v1`

### Auth — `/auth`

| Method | Path        | Description              |
| ------ | ----------- | ------------------------ |
| POST   | `/register` | Register a new user      |
| POST   | `/login`    | Login, returns JWT       |
| POST   | `/logout`   | Blacklist token          |
| POST   | `/refresh`  | Refresh JWT              |
| GET    | `/profile`  | Get current user profile |

### Roles & Permissions — `/roles`, `/permissions`, `/role-permissions`

| Method | Path                       | Description                 |
| ------ | -------------------------- | --------------------------- |
| POST   | `/roles/create`            | Create role                 |
| GET    | `/roles/getAll`            | List all roles              |
| GET    | `/roles/:id`               | Get role by ID              |
| PATCH  | `/roles/:id`               | Update role                 |
| DELETE | `/roles/:id`               | Delete role                 |
| POST   | `/permissions/create`      | Create permission           |
| GET    | `/permissions/getAll`      | List all permissions        |
| POST   | `/role-permissions/assign` | Assign permission to role   |
| DELETE | `/role-permissions/:id`    | Remove permission from role |

### Users & Access — `/users`, `/user-permissions`, `/branch-user-permissions`

| Method | Path                              | Description                                                                                                           |
| ------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| POST   | `/users/create`                   | Create user                                                                                                           |
| GET    | `/users/getAll`                   | List all users (DEVELOPER only)                                                                                       |
| GET    | `/users/getMe`                    | Current user + `userType` (role name) and `branchId` (from staff profile for STAFF/ADMIN; `null` for OWNER/DEVELOPER) |
| GET    | `/users/:id`                      | Get user                                                                                                              |
| PATCH  | `/users/:id`                      | Update user                                                                                                           |
| DELETE | `/users/:id`                      | Delete user                                                                                                           |
| POST   | `/user-permissions/assign`        | Override user permission (grant/deny)                                                                                 |
| DELETE | `/user-permissions/:id`           | Remove override                                                                                                       |
| POST   | `/branch-user-permissions/assign` | Branch-level permission override                                                                                      |
| PATCH  | `/branch-user-permissions/:id`    | Update branch permission                                                                                              |
| DELETE | `/branch-user-permissions/:id`    | Remove branch permission                                                                                              |

### Plans — `/plans`

| Method | Path      | Description                  |
| ------ | --------- | ---------------------------- |
| POST   | `/create` | Create plan (DEVELOPER only) |
| GET    | `/getAll` | List active plans            |
| GET    | `/:id`    | Get plan details             |
| PATCH  | `/:id`    | Update plan                  |

### Subscriptions — `/subscriptions`

| Method | Path                   | Description                                                                                   |
| ------ | ---------------------- | --------------------------------------------------------------------------------------------- |
| POST   | `/create/:businessId`  | Subscribe a business to a plan — first-time or upgrade/downgrade (DEVELOPER only)             |
| GET    | `/getAll/:businessId`  | Paginated subscription history for a business, newest first (owner or DEVELOPER)              |
| GET    | `/current/:businessId` | The business's most recent subscription (owner or DEVELOPER)                                  |
| GET    | `/getById/:id`         | Get a subscription by ID (owner or DEVELOPER)                                                 |
| PATCH  | `/renew/:id`           | Confirm payment received; extends the current period (DEVELOPER only)                         |
| PATCH  | `/cancel/:businessId`  | Cancel the business's current subscription, immediately or at period end (owner or DEVELOPER) |

Creating a business (`POST /businesses/create`) automatically creates its first subscription. See [subscription.md](subscription.md) for the full lifecycle, permissions, and request/response reference.

### Businesses — `/businesses`

| Method | Path      | Description                      |
| ------ | --------- | -------------------------------- |
| POST   | `/create` | Create business                  |
| GET    | `/getAll` | List businesses (DEVELOPER only) |
| GET    | `/:id`    | Get business                     |
| PATCH  | `/:id`    | Update business                  |
| DELETE | `/:id`    | Delete business                  |

### Business Settings — `/business-settings`

| Method | Path           | Description                                        |
| ------ | -------------- | -------------------------------------------------- |
| GET    | `/:businessId` | Get settings                                       |
| PATCH  | `/:businessId` | Update settings (language, notifications, payroll) |

### Branches — `/branches`

| Method | Path                  | Description   |
| ------ | --------------------- | ------------- |
| POST   | `/create/:businessId` | Create branch |
| GET    | `/getAll/:businessId` | List branches |
| GET    | `/:id`                | Get branch    |
| PATCH  | `/:id`                | Update branch |
| DELETE | `/:id`                | Delete branch |

### Spaces — `/spaces`

| Method | Path                              | Description                                                                                                                                                      |
| ------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/create/:branchId`               | Create space (`bookingCapacity` accepted for PUBLIC only; forced to 1 otherwise. `capacity` is an optional display-only value for any type)                                                                                        |
| GET    | `/getAll/:branchId`               | List spaces (filters: type, isActive, isBusy, capacity)                                                                                                          |
| GET    | `/overview/:branchId`             | Live branch floor: all spaces + inner devices/units, busy state, `customer`/`visitId` per busy resource, and metrics. See [space-overview.md](space-overview.md) |
| GET    | `/:spaceId`                       | Get space with analytics                                                                                                                                         |
| GET    | `/byIsActive/:branchId/:isActive` | Filter by active status                                                                                                                                          |
| GET    | `/byType/:branchId/:type`         | Filter by type                                                                                                                                                   |
| GET    | `/history/:spaceId`               | Session history for space                                                                                                                                        |
| PATCH  | `/:spaceId`                       | Update space (non-PUBLIC `bookingCapacity` always 1; `capacity` is display-only)                                                                                                                    |
| DELETE | `/:spaceId`                       | Soft delete space                                                                                                                                                |
| DELETE | `/all/:branchId`                  | Delete all spaces in branch                                                                                                                                      |

Real-time overview push over Socket.IO is served under `/websocket-space-overview` (`/status/:branchId`, `/emit-live/:branchId`, `/emit-test/:branchId`). See [space-overview.md](space-overview.md).

### Devices — `/devices`

| Method | Path                | Description                                    |
| ------ | ------------------- | ---------------------------------------------- |
| POST   | `/create/:branchId` | Create device                                  |
| GET    | `/getAll/:branchId` | List devices (filters: type, isActive, isBusy) |
| GET    | `/:deviceId`        | Get device                                     |
| PATCH  | `/:deviceId`        | Update device                                  |
| DELETE | `/:deviceId`        | Soft delete device                             |

### Units — `/units`

| Method | Path                | Description |
| ------ | ------------------- | ----------- |
| POST   | `/create/:branchId` | Create unit |
| GET    | `/getAll/:branchId` | List units  |
| GET    | `/:unitId`          | Get unit    |
| PATCH  | `/:unitId`          | Update unit |
| DELETE | `/:unitId`          | Delete unit |

### Equipment — `/equipments`

| Method | Path                | Description      |
| ------ | ------------------- | ---------------- |
| POST   | `/create/:branchId` | Create equipment |
| GET    | `/getAll/:branchId` | List equipment   |
| GET    | `/:equipmentId`     | Get equipment    |
| PATCH  | `/:equipmentId`     | Update equipment |
| DELETE | `/:equipmentId`     | Delete equipment |

### Pricing Rules — `/pricing-rules`

| Method | Path                | Description         |
| ------ | ------------------- | ------------------- |
| POST   | `/create/:branchId` | Create pricing rule |
| GET    | `/getAll/:branchId` | List pricing rules  |
| GET    | `/:id`              | Get rule            |
| PATCH  | `/:id`              | Update rule         |
| DELETE | `/:id`              | Delete rule         |

### Customers — `/customers`

| Method | Path                       | Description                                 |
| ------ | -------------------------- | ------------------------------------------- |
| POST   | `/create`                  | Create customer                             |
| GET    | `/getAll/:businessId`      | List customers (supports search)            |
| GET    | `/:customerId`             | Get customer with visit/order history       |
| PATCH  | `/:customerId`             | Update customer                             |
| GET    | `/:customerId/analytics`   | Customer spending analytics                 |
| PATCH  | `/:customerId/block`       | Block customer (with reason)                |
| PATCH  | `/:customerId/unblock`     | Unblock customer                            |
| DELETE | `/:customerId`             | Delete customer                             |
| GET    | `/history/:branchId`       | Branch customer history with monthly trends |
| GET    | `/monthly-stats/:branchId` | Branch monthly stats                        |

### Visits — `/visits`

| Method | Path                          | Description                                                                |
| ------ | ----------------------------- | -------------------------------------------------------------------------- |
| POST   | `/start`                      | Start a visit for a customer at a branch                                   |
| GET    | `/getAllByBranchId/:branchId` | List visits (filter: status ACTIVE / INVOICED / CANCELLED)                 |
| GET    | `/getById/:visitId`           | Get visit with sessions and orders                                         |
| PATCH  | `/close/:visitId`             | Close visit, apply discounts, create invoice                               |
| PATCH  | `/cancel/:visitId`            | Cancel visit (only within 15 min, no orders, auto-cancels active sessions) |

### Sessions — `/sessions`

| Method | Path                         | Description                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/create/:branchId`          | Create session (smart mode or manual components). Optional body `players` + `modeLabel` label the device/unit's mode (e.g. `"SGL"`)                                                                                                                                                                                                                                                                              |
| GET    | `/getAll/:branchId`          | List sessions for branch (paginated)                                                                                                                                                                                                                                                                                                                                                                             |
| GET    | `/getById/:sessionId`        | Get session with all components                                                                                                                                                                                                                                                                                                                                                                                  |
| GET    | `/visit/:branchId/:visitId`  | Get all sessions for a visit                                                                                                                                                                                                                                                                                                                                                                                     |
| PATCH  | `/update/:sessionId`         | Update bookingId, currency, startedAt                                                                                                                                                                                                                                                                                                                                                                            |
| PATCH  | `/end/:sessionId`            | End session, calculate prices                                                                                                                                                                                                                                                                                                                                                                                    |
| PATCH  | `/cancel/:sessionId`         | Cancel session (zero all prices)                                                                                                                                                                                                                                                                                                                                                                                 |
| PATCH  | `/change-mode/:sessionId` | Switch the active device/unit's game mode mid-session (SGL → DBL) — segments the device and **auto-adjusts controllers**. Body `{ gameModeId \| modeCode, switchedAt?, resourceId?, allowOverbook? }`. `409 CONTROLLERS_UNAVAILABLE` when stock is short (whole switch rolls back). Gated by `UPDATE-SESSIONS` + open shift. See [pricingSystem.md](pricingSystem.md#game-modes-sgl--dbl) |
| PATCH  | `/change-players/:sessionId` | Back-compat alias for `/change-mode`. A body carrying only `{ players, modeLabel? }` segments the device and relabels it, without touching controllers. **Note:** unlike before, this path no longer consults `PricingRule` — the new segment is priced from the resource's base rate. |
| DELETE | `/delete/:sessionId`         | Soft delete session                                                                                                                                                                                                                                                                                                                                                                                              |

### Session Components — `/session-components`

| Method | Path                             | Description                           |
| ------ | -------------------------------- | ------------------------------------- |
| POST   | `/:branchId/:sessionId`          | Add component to active session       |
| GET    | `/:branchId/:sessionId`          | List all components for session       |
| DELETE | `/:branchId/remove/:componentId` | End component early, release resource |

### Categories — `/categories`

| Method | Path                | Description                         |
| ------ | ------------------- | ----------------------------------- |
| POST   | `/create/:branchId` | Create product category             |
| GET    | `/getAll/:branchId` | List categories with product counts |
| GET    | `/:categoryId`      | Get category                        |
| PATCH  | `/:categoryId`      | Update category                     |
| DELETE | `/:categoryId`      | Delete category (only if empty)     |

### Products — `/products`

| Method | Path                | Description                      |
| ------ | ------------------- | -------------------------------- |
| POST   | `/create/:branchId` | Create product                   |
| GET    | `/getAll/:branchId` | List products (filter: isActive) |
| GET    | `/:productId`       | Get product                      |
| PATCH  | `/:productId`       | Update product                   |
| DELETE | `/:productId`       | Delete product                   |

### Orders — `/orders`

| Method | Path                          | Description                                          |
| ------ | ----------------------------- | ---------------------------------------------------- |
| POST   | `/create`                     | Add items to an order (visit or takeaway)            |
| PATCH  | `/item/:itemId`               | Update order item quantity                           |
| DELETE | `/item/:itemId`               | Remove order item                                    |
| PATCH  | `/visit/:visitId/complete`    | Complete visit order                                 |
| PATCH  | `/complete/:orderId`          | Complete takeaway order (with discounts)             |
| DELETE | `/:orderId`                   | Cancel order                                         |
| GET    | `/visit/:visitId`             | Get order for a visit                                |
| GET    | `/getById/:orderId`           | Get order details                                    |
| GET    | `/invoice/:orderId`           | Get order invoice                                    |
| GET    | `/getAll`                     | List all orders (filters: branchId, visitId, status) |
| GET    | `/analytics/branch/:branchId` | Branch order analytics                               |

Every order response carries an `invoice` summary: `{ isInvoiced, invoiceId, status }` (`status` is `null` until invoiced, then `UNPAID`/`PAID`). Invoice pay/delete invalidates cached order lists.

### Invoices — `/invoices`

| Method | Path                    | Description                                                                                                              |
| ------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/create/:visitId`      | Create invoice for a visit — if still `ACTIVE`, closes it first (ends sessions, releases resources, completes its order) |
| POST   | `/createOrder/:orderId` | Create invoice for a completed takeaway order                                                                            |
| GET    | `/getById/:invoiceId`   | Get invoice                                                                                                              |
| GET    | `/getByVisit/:visitId`  | Get invoice for visit                                                                                                    |
| PATCH  | `/pay/:visitId`         | Mark a visit's invoice PAID — body requires `paymentMethod` (`CASH`/`CARD`/`INSTAPAY`/`BANK`)                            |
| PATCH  | `/payById/:invoiceId`   | Mark an invoice PAID by ID — same required `paymentMethod` body                                                          |
| GET    | `/getAll/:branchId`     | List invoices for branch (filter: status UNPAID/PAID)                                                                    |
| DELETE | `/delete/:invoiceId`    | Delete an UNPAID invoice (reverts its visit to ACTIVE)                                                                   |

### Reports — `/reports`

| Method | Path                    | Description                                                                                                                                                                                                                                                                              |
| ------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| GET    | `/branch/:branchId`     | Branch financial report: income + payment breakdown, trend, outstanding, payroll cost (role-gated), net after payroll, customers, discounts, top products, low stock, and rule-based insights. Query: `startDate`, `endDate` (default: month-to-date), `compare=true`, `trendGroupBy=day | week`. `startDate=endDate=today` = the Daily Closing Report |
| GET    | `/business/:businessId` | Business-wide report (owner/DEVELOPER only): same sections as totals plus a per-branch breakdown with revenue share and per-branch insights for comparing branches                                                                                                                       |

See [reports.md](reports.md) for the full reference including response shapes, insight rules, payroll visibility, and the snapshot/fallback mechanics.

No sale, booking, session, order, or payment can happen without an open shift (`OWNER`/`DEVELOPER` bypass) — see [shifts.md](shifts.md) for the full list of gated routes.

### Shifts — `/shifts`

| Method | Path                            | Description                                                                                                                                                                                                                    |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/open/:branchId`               | Open a new shift for the branch (creates the row; `shiftNumber` auto-assigned). Body requires `openingCash` (≥ 0). Blocked if another shift is open or the plan's `maxShiftsPerDay` is reached                                 |
| POST   | `/close/:shiftId`               | Close an open shift. Body requires `handoverNotes` and `actualCash` (+ optional `incidentNotes`). Returns the shift with `revenue`, `expenses`, computed `expectedCash`/`variance`, and a cash-variance `insights` flag if any |
| GET    | `/today/:branchId`              | All of today's shifts for the branch with attendance summaries and cash fields                                                                                                                                                 |
| GET    | `/getById/:shiftId`             | One shift with attendance, `revenue`, and `expenses` (live window while open)                                                                                                                                                  |
| GET    | `/report/daily/:branchId?date=` | Daily report: every shift for the day + attendance/revenue/expense/variance totals                                                                                                                                             |

### Shift Attendance — `/shift-attendance`

| Method | Path                             | Description                                                                               |
| ------ | -------------------------------- | ----------------------------------------------------------------------------------------- |
| POST   | `/create/:shiftId`               | Add a staff member to an OPEN shift (`{ staffProfileId, status?, checkInTime?, notes? }`) |
| PATCH  | `/update/:shiftId/:attendanceId` | Update status / check-out / notes on an OPEN shift                                        |
| GET    | `/getAll/:shiftId`               | List attendance for a shift                                                               |

### Shift Expenses — `/shift-expenses`

| Method | Path                          | Description                                                                                                        |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| POST   | `/create/:shiftId`            | Record a petty-cash payout on an OPEN shift (`{ amount, reason, category? }` — `amount` > 0 and `reason` required) |
| GET    | `/getAll/:shiftId`            | List expenses for a shift, plus their `total`                                                                      |
| DELETE | `/delete/:shiftId/:expenseId` | Remove an expense (only while the shift is OPEN)                                                                   |

Attendance is editable only while the shift is OPEN. See [shifts.md](shifts.md) for the full reference.

### Staff & Payroll — `/staff-profiles`, `/payrolls`

| Method | Path                               | Description                    |
| ------ | ---------------------------------- | ------------------------------ |
| POST   | `/staff-profiles/create/:branchId` | Create staff profile           |
| GET    | `/staff-profiles/getAll/:branchId` | List branch staff              |
| GET    | `/staff-profiles/:id`              | Get staff details              |
| PATCH  | `/staff-profiles/:id`              | Update staff                   |
| POST   | `/payrolls/create/:staffId`        | Create payroll (month/year)    |
| GET    | `/payrolls/getAll/:branchId`       | List payrolls (filter: status) |
| GET    | `/payrolls/:id`                    | Get payroll                    |
| PATCH  | `/payrolls/:id/approve`            | Approve payroll                |
| PATCH  | `/payrolls/:id/mark-paid`          | Mark payroll as PAID           |

### Storage & Analytics — `/storage-usage`

| Method | Path                   | Description                   |
| ------ | ---------------------- | ----------------------------- |
| GET    | `/:businessId`         | Current resource usage counts |
| GET    | `/history/:businessId` | Historical storage usage      |

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

| Role      | Permission check | Branch access            | Business access   |
| --------- | ---------------- | ------------------------ | ----------------- |
| DEVELOPER | Always granted   | Bypassed                 | Bypassed          |
| OWNER     | Always granted   | Bypassed                 | Must own business |
| ADMIN     | Via chain        | Via BranchUserPermission | —                 |
| STAFF     | Via chain        | Must have StaffProfile   | —                 |
| CUSTOMER  | Via chain        | Via BranchUserPermission | —                 |

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

5. PATCH /visits/close/:visitId  (or POST /invoices/create/:visitId on an ACTIVE visit)
   └─ Auto-ends any still-ACTIVE sessions and releases their resources
   └─ Sums all session totals + order totals
   └─ Applies customer discount (FLAT or PERCENT, with date/time window)
   └─ Applies manual discount (staff-entered at checkout)
   └─ Completes the visit's OPEN order (status → COMPLETED)
   └─ Creates/upserts Invoice with finalAmount
   └─ Transitions Visit → INVOICED

6. PATCH /invoices/:id/pay
   └─ Sets Invoice status = PAID, records paidAt
```

### Visit Cancellation

A visit can be cancelled in two ways:

**Manual cancellation** — `PATCH /visits/cancel/:visitId`

Rules:

- Visit must be `ACTIVE`
- Must be within **15 minutes** of `startedAt` — returns `400` if the window has passed
- Visit must have **no orders** — returns `400` if any orders exist
- Any active sessions are **automatically cancelled** with zero price and resources released
- Sets Visit → `CANCELLED`, records `cancelledAt` and `cancelledById`
- Customer can immediately start a new visit after cancellation

**Auto-cancellation** (background job — runs every 5 minutes)

Conditions to trigger:

- Visit is `ACTIVE`
- `startedAt` is more than **30 minutes** ago
- Has **no sessions** (none ever created)
- Has **no orders**

When triggered, sets Visit → `CANCELLED` with `cancelledAt = now`. No actor is recorded (`cancelledById = null`). Configurable via env vars (see Background Jobs).

### Session Components & Smart Space Detection

When creating a session with a `deviceId` or `unitId`, the system checks whether the resource belongs to a space:

- Has a `spaceId` → charge space + device/unit (every space type is chargeable, including `PUBLIC`/`DESK`)
- No `spaceId` → charge device/unit only

Passing `spaceId` directly books the space alone, with no device/unit attached.

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

| TTL Constant    | Usage                             |
| --------------- | --------------------------------- |
| `TTL_LIST`      | Collection endpoints (getAll)     |
| `TTL_BY_ID`     | Single-record endpoints (getById) |
| `TTL_DETAIL`    | Detail views with relations       |
| `TTL_ANALYTICS` | Analytics/stats endpoints         |

---

## Background Jobs

Defined in `utils/*Cron.js` files using `node-cron`, started in `server.js`.

| Job                   | File                           | Default Schedule                | Env Override             | Description                                                                                                                                                                                                          |
| --------------------- | ------------------------------ | ------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storageUsageCron`    | `utils/storageUsageCron.js`    | Weekly (Sunday 00:00)           | `STORAGE_USAGE_CRON`     | Snapshots StorageUsage and appends to StorageUsageHistory                                                                                                                                                            |
| `branchStatsCron`     | `utils/branchStatsCron.js`     | Monthly                         | `BRANCH_STATS_CRON`      | Calculates BranchMonthlyStats: new customers, active customers, total revenue, avg spend                                                                                                                             |
| `dailyReportCron`     | `utils/dailyReportCron.js`     | Daily (`10 0 * * *`, 00:10 UTC) | `DAILY_REPORT_CRON`      | Snapshots yesterday's BranchDailyReport per active branch (revenue splits, payment breakdown, discounts, customer counts) — powers fast date-range reports. Also: `DAILY_REPORT_CRON_TZ`, `RUN_DAILY_REPORT_ON_BOOT` |
| `visitAutoCancelCron` | `utils/visitAutoCancelCron.js` | Every 5 min (`*/5 * * * *`)     | `VISIT_AUTO_CANCEL_CRON` | Auto-cancels ACTIVE visits older than 30 min with no sessions and no orders                                                                                                                                          |
| `subscriptionCron`    | `utils/subscriptionCron.js`    | Hourly (`0 * * * *`)            | `SUBSCRIPTION_CRON`      | Moves lapsed subscriptions ACTIVE → PAST_DUE → EXPIRED (with plan downgrade), or → CANCELLED if deferred cancellation was requested. Grace period before EXPIRED: `SUBSCRIPTION_GRACE_DAYS` (default 3)              |

**Disabling a job:** set its enable env var to `false`:

```env
ENABLE_STORAGE_USAGE_CRON=false
ENABLE_DAILY_REPORT_CRON=false
ENABLE_VISIT_AUTO_CANCEL_CRON=false
ENABLE_SUBSCRIPTION_CRON=false
```

---

## Related Docs

| File                                                                   | Description                                                                                                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [visit-flow.md](./visit-flow.md)                                       | Full visit lifecycle guide for frontend developers — flow, API calls, errors, and special cases                                                         |
| [pricingSystem.md](./pricingSystem.md)                                 | Deep dive into pricing formulas, rules, and examples                                                                                                    |
| [customer.md](./customer.md)                                           | Customer management, analytics, and discount details                                                                                                    |
| [order.md](./order.md)                                                 | Order lifecycle and structure                                                                                                                           |
| [subscription.md](./subscription.md)                                   | Plans + Subscriptions API reference and lifecycle                                                                                                       |
| [reports.md](./reports.md)                                             | Branch & business financial reports — income, payment breakdown, payroll cost, insights, Daily Closing Report                                           |
| [shifts.md](./shifts.md)                                               | Manual shift lifecycle, shift gating, plan-gated shift limits, till reconciliation, staff attendance, petty-cash expenses, and the shift closing report |
| [RBAC.md](../RBAC.md)                                                  | Full authentication and authorization specification                                                                                                     |
| [EQUIPMENT_API_DOCUMENTATION.json](./EQUIPMENT_API_DOCUMENTATION.json) | Equipment endpoint specs (Postman format)                                                                                                               |
