# Customer API Documentation

Base URL: `/api/v1/customers`

---

## Data Model

```json
{
  "id": "uuid",
  "seqNumber": 1,
  "businessId": "uuid",
  "name": "Ahmed Ali",
  "phone": "01012345678",
  "email": "ahmed@example.com",
  "tags": ["VIP", "Loyal"],
  "notes": "Prefers morning sessions",
  "birthday": "1995-06-15T00:00:00.000Z",
  "block": {
    "isBlocked": false,
    "blockedReason": null
  },
  "discount": {
    "hasDiscount": true,
    "discountType": "PERCENT",
    "discountAmount": 10,
    "discountStartsAt": "2026-05-01T00:00:00.000Z",
    "discountEndsAt": "2026-06-01T00:00:00.000Z",
    "discountStartTime": "10:00",
    "discountEndTime": "18:00"
  },
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-05-01T00:00:00.000Z"
}
```

---

## Endpoints

### POST `/create`
Create a new customer.

**Required fields:**
| Field | Type | Notes |
|-------|------|-------|
| `businessId` | string | Must be a valid existing business |
| `name` | string | Valid name format |
| `phone` | string | Valid phone format, unique per business |

**Optional fields:**
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `email` | string | null | Unique per business |
| `password` | string | null | |
| `tags` | array | [] | Allowed: `VIP`, `Regular`, `Blacklisted`, `New`, `Loyal` |
| `notes` | string | null | |
| `birthday` | ISO date | null | |
| `branchId` | string | null | Registers customer to this branch |
| `hasDiscount` | boolean | false | |
| `discountType` | string | `FLAT` | `FLAT` or `PERCENT` |
| `discountAmount` | number | 0 | Must be ≥ 0. Max 100 if PERCENT |
| `discountStartsAt` | ISO date | null | |
| `discountEndsAt` | ISO date | null | Must be after `discountStartsAt` |
| `discountStartTime` | string | null | `HH:MM` format |
| `discountEndTime` | string | null | `HH:MM` format, must be after `discountStartTime` |

**Response:** `201` — created customer object.

---

### GET `/getAll`
Get all customers across all businesses. **DEVELOPER role only.**

**Query params:** `page`, `limit`, `sort`, `order`

---

### GET `/getByBusinessId/:businessId`
Get all customers for a specific business.

**Query params:**
| Param | Type | Notes |
|-------|------|-------|
| `search` | string | Searches name, phone, email |
| `page` | number | Default 1 |
| `limit` | number | Default 10 |
| `sort` | string | Default `createdAt` |
| `order` | string | `asc` or `desc` |

---

### GET `/getById/:customerId`
Get a single customer with full history — visits, takeaway orders, and analytics.

**Query params (visits pagination):**
| Param | Default | Options |
|-------|---------|---------|
| `visitsPage` | 1 | |
| `visitsLimit` | 10 | Max 100 |
| `visitsSort` | `startedAt` | `startedAt`, `endedAt`, `totalPrice`, `durationMinutes`, `createdAt` |
| `visitsOrder` | `desc` | `asc`, `desc` |

**Query params (takeaway orders pagination):**
| Param | Default | Options |
|-------|---------|---------|
| `ordersPage` | 1 | |
| `ordersLimit` | 10 | Max 100 |
| `ordersSort` | `createdAt` | `createdAt`, `totalPrice`, `finalPrice`, `number` |
| `ordersOrder` | `desc` | `asc`, `desc` |

**Response includes:**
- Customer profile
- `analytics` — total visits, total spend, first/last visit, avg duration
- `visits` — paginated list with sessions and order items per visit
- `orders` — paginated takeaway orders (no visit) only

---

### GET `/getByBranchId/:branchId`
Get all customers registered to a branch with branch-level summary stats.

**Query params:** `page`, `limit`, `sort`, `order`, `search`

**Sortable by computed fields:**
- `totalSpent` — sorted by total spend at this branch
- `lastActivity` — sorted by last visit date

**Response includes:**
- `summary` — branch-wide metrics with month-over-month trend:
  - `totalCustomers`
  - `activeCustomers` (visited this month)
  - `newThisMonth`
  - `totalRevenue`
  - `avgSpendPerCustomer`
- `data` — list of customers each with their own `analytics` block

---

### GET `/monthly-stats/:branchId`
Monthly customer stats for a branch — used for charts.

**Response includes:**
- `currentMonth` — live computed stats (marked `isLive: true`)
- `trends` — change percentages vs last month for each metric
- `history` — all historical months from DB + current month

---

### GET `/:customerId/analytics`
Spending and activity summary for a single customer.

**Response:**
```json
{
  "visitCount": 12,
  "takeawayOrderCount": 3,
  "visitRevenue": 1800.00,
  "orderRevenue": 240.50,
  "totalSpend": 2040.50,
  "averageSpendPerVisit": 150.00,
  "lastVisitAt": "2026-05-18T14:30:00.000Z",
  "lastVisitStatus": "PAID"
}
```

---

### PATCH `/update/:customerId`
Update any allowed customer field. Only send fields you want to change.

**Allowed fields:** `name`, `phone`, `email`, `password`, `tags`, `notes`, `birthday`, `hasDiscount`, `discountType`, `discountAmount`, `discountStartsAt`, `discountEndsAt`, `discountStartTime`, `discountEndTime`

All discount validations from create apply here too.

---

### PATCH `/block/:customerId`
Block a customer — prevents them from creating orders or starting visits.

**Body:**
```json
{ "reason": "Unpaid balance" }
```

- Returns `400` if already blocked.
- When a blocked customer is used in an order, the order creation returns `403`.

---

### PATCH `/unblock/:customerId`
Remove block from a customer.

- Returns `400` if not currently blocked.
- Clears `blockedReason` automatically.

---

### DELETE `/delete/:customerId`
Delete a single customer.

---

### DELETE `/deleteAll`
Delete all customers. **DEVELOPER role only.**

---

### DELETE `/deleteByBusinessId/:businessId`
Delete all customers for a business. **DEVELOPER or OWNER role only.**

---

## Business Logic

### Tags
Valid tags: `VIP`, `Regular`, `Blacklisted`, `New`, `Loyal`

Tags are an array — a customer can have multiple tags at the same time.

---

### Discount System

A customer discount is a **profile-level** discount that automatically applies to their orders when active.

**Discount is active when ALL of the following pass:**
1. `hasDiscount` is `true`
2. `discountAmount` > 0
3. Current date is between `discountStartsAt` and `discountEndsAt` (if set)
4. Current time is between `discountStartTime` and `discountEndTime` (if set)

**Example — VIP customer with time-limited discount:**
```json
{
  "hasDiscount": true,
  "discountType": "PERCENT",
  "discountAmount": 10,
  "discountStartsAt": "2026-05-01T00:00:00.000Z",
  "discountEndsAt": "2026-06-01T00:00:00.000Z",
  "discountStartTime": "10:00",
  "discountEndTime": "22:00"
}
```
This gives 10% off any order placed between May 1 and June 1, between 10:00 AM and 10:00 PM.

**Validation rules:**
- `discountType` must be `FLAT` or `PERCENT`
- `discountAmount` must be ≥ 0
- If `PERCENT`, amount must be ≤ 100
- `discountEndsAt` must be after `discountStartsAt`
- `discountEndTime` must be after `discountStartTime`
- Times must be in `HH:MM` format (24-hour)

---

### Blocking
A blocked customer cannot:
- Have a new order created for them (returns `403`)
- Their active discount is ignored even if within date/time range

Blocking requires a `reason` (optional but recommended). Unblocking clears the reason automatically.

---

### Sequence Number (`seqNumber`)
Each customer gets an auto-incremented sequence number **scoped per business** (not global). So business A has customers #1, #2, #3 and business B also starts from #1. Used for human-readable customer IDs.
