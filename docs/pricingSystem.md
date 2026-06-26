# Pricing System

## Overview

The pricing system covers the full lifecycle from when a customer walks in to when they pay their invoice. It handles three types of billable activity:

1. **Sessions** — time-based usage of spaces, devices, units, and equipment
2. **Orders** — products (food, drinks, etc.) consumed during a visit or as a standalone takeaway
3. **Invoices** — the final bill that combines sessions + orders and applies discounts

---

## Core Concepts

### Visit

A visit is the top-level container for a customer's time at the branch. Everything — sessions, orders, and the invoice — is linked to a visit.

```
Visit (ACTIVE)
  ├── Session 1 (workspace)
  │     └── Component: SPACE (public room)
  ├── Session 2 (gaming)
  │     ├── Component: SPACE (private room)
  │     ├── Component: DEVICE (PS5)
  │     └── Component: EQUIPMENT ×2 (controllers, added mid-session)
  ├── Order (food & drinks)
  └── Invoice (generated on closeVisit)
```

A visit starts with `status: ACTIVE` and transitions to `INVOICED` when closed. Payment status is tracked on the `Invoice` model (`UNPAID` → `PAID`), not on the visit.

---

### Session

A session represents **one continuous activity block** — e.g., "Mohamed playing PS from 14:00 to 17:00". It does not hold any pricing data itself. Pricing lives entirely in its components.

| Field | Description |
|---|---|
| `startedAt` | When the activity started |
| `endedAt` | When it ended (null while active) |
| `durationMinutes` | Calculated on end |
| `totalPrice` | Sum of all component `totalPrice` values |
| `status` | `ACTIVE` → `ENDED` or `CANCELLED` |

---

### SessionComponent

A session component is a **single resource contributing to a session**. One session can have many components. Each component is priced independently and has its own start/end time — enabling mid-session additions (e.g., a friend arriving and adding 2 controllers).

| Field | Description |
|---|---|
| `resourceType` | `SPACE`, `DEVICE`, `UNIT`, or `EQUIPMENT` |
| `resourceId` | The specific resource being used |
| `priceType` | `PER_HOUR`, `PER_SESSION`, or `PER_GAME` |
| `unitPrice` | Price per unit (snapshotted from resource or pricing rule at session start) |
| `quantity` | How many of this resource used simultaneously (e.g., `2` for two controllers). Default `1`. Multiplies the price. |
| `gamesCount` | Number of games played. Default `0`. **Only used when `priceType = PER_GAME`** — ignored for `PER_HOUR` and `PER_SESSION`. |
| `startedAt` | When this component was added |
| `endedAt` | When this component was removed or the session ended |
| `durationMinutes` | Calculated from `startedAt` → `endedAt` |
| `totalPrice` | Final price for this component |

---

## Pricing Rules

### Price Source Priority

When creating a session component, the system resolves the price in this order:

```
1. PricingRule (if one exists for this resource in this branch, ordered by priority desc)
2. Resource base price (Space.price, Device.price, Unit.price, Equipment.price)
```

A `PricingRule` can override the resource's default price and type.

### PricingRule Modes

| `pricingMode` | Behavior |
|---|---|
| `FIXED_PRICE` | Flat fee regardless of time — treated as `PER_SESSION` |
| `PER_HOUR` | Price multiplied by duration in hours |
| `TIME_RANGE` | Time-based with optional min/max duration and player count constraints |

### PricingType

| `pricingType` | Formula |
|---|---|
| `PER_HOUR` | `unitPrice × quantity × (durationMinutes / 60)` |
| `PER_SESSION` | `unitPrice × quantity` (flat, no time factor) |
| `PER_GAME` | `unitPrice × quantity × gamesCount` |

---

## Component Price Calculation

The core formula (`calculateComponentPrice`) is applied per component when it ends:

```
PER_HOUR:    totalPrice = unitPrice × quantity × (durationMinutes / 60)
PER_SESSION: totalPrice = unitPrice × quantity
PER_GAME:    totalPrice = unitPrice × quantity × gamesCount  ← gamesCount must be >= 1
```

**`quantity`** — multiplies the price for all types. Use it when a customer takes multiple units of the same resource (e.g. 2 controllers = `quantity: 2`). Default is `1`.

**`gamesCount`** — only meaningful for `PER_GAME`. Default is `0`. Ignored entirely for `PER_HOUR` and `PER_SESSION`. Throws an error if `PER_GAME` is used with `gamesCount < 1`.

**While a session is ACTIVE** (no `endedAt`), `totalPrice` is stored as `0` (placeholder). The real price is calculated when `endSession` or `removeComponent` is called.

The `unitPrice` is a **snapshot** — taken from the resource or pricing rule at the moment the component is created. Changing a resource's price after a session starts does not affect that session.

---

## Real-World Scenarios

### Scenario 1 — PS Cafe, Public Room, Alone

```
Staff sends: { deviceId: "ps5-uuid" }
System detects: PS5 is in a PUBLIC room → adds DEVICE only (no space charge)

Session: 14:00 → 16:00 (120 min)
  Component: DEVICE (PS5) unitPrice=30, qty=1 → 30 × 2h = 60 EGP
──────────────────────────────────────────────────────────────────
Session.totalPrice = 60 EGP
```

### Scenario 2 — PS Cafe, Private Room, Friend Joins with 4 Controllers

```
Staff sends: { deviceId: "ps5-uuid" }
System detects: PS5 is inside a PRIVATE room → auto-adds SPACE + DEVICE

Session: 14:00 → 17:00 (180 min)
  Component: SPACE  (private) unitPrice=50, qty=1, from 14:00 → 50 × 3h  = 150 EGP
  Component: DEVICE (PS5)     unitPrice=30, qty=1, from 14:00 → 30 × 3h  =  90 EGP
  Component: EQUIPMENT (ctrl) unitPrice=10, qty=2, from 15:00 → 10×2×1h  =  20 EGP  ← added manually
─────────────────────────────────────────────────────────────────────────────────────
Session.totalPrice = 260 EGP
```

The 2 controllers were added at 15:00 via `addComponent` — the session was never stopped.

### Scenario 3 — Workspace + Gaming (Full Day)

```
Visit for Mohamed
  Session 1: Work in public office   (staff sends components: [SPACE])
    Component: SPACE (public, 50/hr)  09:00→13:00 = 200 EGP
    ↳ Session 1 ENDED when Mohamed wants to switch to gaming

  Session 2: Play PS alone in public room  (staff sends deviceId: ps5-uuid)
    System detects: PS5 is in PUBLIC room → adds DEVICE only
    Component: DEVICE (PS5, 30/hr)   13:00→14:00 = 30 EGP

  Session 3: Move to private room with friend  (staff sends deviceId: ps5-private-uuid)
    System detects: PS5 is in PRIVATE room → auto-adds SPACE + DEVICE
    Component: SPACE  (private, 50/hr)   14:00→17:00 = 150 EGP
    Component: DEVICE (PS5, 30/hr)       14:00→17:00 =  90 EGP
    Component: EQUIPMENT ×2 (ctrl, 10/hr) 14:00→17:00 = 60 EGP  ← added manually

  Order: Food & drinks = 120 EGP (raw)
────────────────────────────────────────────────────────────────────────────────
Raw total = 200 + 30 + 300 + 120 = 650 EGP
Customer discount: 10% PERCENT → 585 EGP
Manual discount: 35 FLAT → 550 EGP (finalAmount on Invoice)
```

**Key rule:** The workspace session (Session 1) must be **ended** before the gaming session (Session 2) starts — a customer should not be charged for desk space and a gaming device at the same time.

---

## Mid-Session Component Addition

When a customer's friend arrives and they want to add 2 controllers to an already-running session:

```
POST /api/v1/session-components/:branchId/:sessionId
{
  "resourceType": "EQUIPMENT",
  "resourceId": "<controller-id>",
  "quantity": 2,
  "startedAt": "2024-01-01T15:00:00Z"   // optional, defaults to now
}
```

- The session stays `ACTIVE` — it is never stopped
- The new component gets its own `startedAt` (when the friend arrived)
- On `endSession`, each component calculates its price from its own `startedAt` to the session's `endedAt`
- The invoice breakdown shows exactly when each resource was used and for how long

---

## Order Pricing

### Visit Orders

Products ordered during a visit are linked via `visitId`. **No discount is applied at the order level.** The raw `order.totalPrice` flows into the invoice where discounts are applied once on the grand total.

```
order.totalPrice = SUM(item.unitPrice × item.quantity)
order.finalPrice = order.totalPrice   ← no discount for visit orders
```

### Takeaway Orders

Standalone orders (no visit) apply discounts at the order level:

```
order.totalPrice = SUM(item.unitPrice × item.quantity)
order.finalPrice = totalPrice → apply customerDiscount → apply manualDiscount
```

---

## Discount System

### Two Discount Layers

| Layer | Source | Applied at |
|---|---|---|
| Customer discount | `Customer.discountType/Amount` (with date/time validity) | Invoice (visit) or Order (takeaway) |
| Manual discount | Passed by staff at checkout | Invoice (visit) or Order (takeaway) |

### Application Order

Customer discount is applied first, manual discount on top:

```
step 1: afterCustomer = applyDiscount(rawTotal, customerDiscount.type, customerDiscount.amount)
step 2: finalAmount   = applyDiscount(afterCustomer, manualDiscount.type, manualDiscount.amount)
```

### Discount Types

| `discountType` | Formula |
|---|---|
| `FLAT` | `price - amount` (minimum 0) |
| `PERCENT` | `price × (1 - amount / 100)` |

### Customer Discount Validity

A customer discount is only active when ALL of the following are true:

- `customer.hasDiscount = true`
- `customer.discountAmount > 0`
- Current date is after `discountStartsAt` (if set)
- Current date is before `discountEndsAt` (if set)
- Current time is after `discountStartTime` (if set, format `HH:MM`)
- Current time is before `discountEndTime` (if set, format `HH:MM`)

---

## Invoice

### Structure

| Field | Description |
|---|---|
| `totalAmount` | Raw total before any discounts (sessions + orders) |
| `customerDiscountType` | Type of customer discount applied |
| `customerDiscountAmount` | Amount of customer discount applied |
| `discountType` | Type of manual discount applied by staff |
| `discountAmount` | Amount of manual discount applied by staff |
| `finalAmount` | Amount the customer actually pays |
| `status` | `UNPAID` → `PAID` |

### Visit Invoice Flow

```
closeVisit (PATCH /api/v1/visits/close/:visitId)
  body: { discountType?, discountAmount? }

  1. Sum session.totalPrice  (non-cancelled, non-deleted sessions)
  2. Sum order.totalPrice    (raw, no discount — visit orders only)
  3. rawTotal = sessions + orders
  4. afterCustomer = applyDiscount(rawTotal, customerDiscount)
  5. finalAmount   = applyDiscount(afterCustomer, manualDiscount)
  6. visit.status → INVOICED
  7. Invoice upserted with all fields
```

### Takeaway Order Invoice

```
POST /api/v1/invoices/createOrder/:orderId

  Invoice.totalAmount = order.finalPrice  (discount already applied at order level)
  Invoice.finalAmount = order.finalPrice
```

---

## API Endpoints Reference

### Sessions

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/sessions/create/:branchId` | Create session with initial components |
| `GET` | `/api/v1/sessions/getAll/:branchId` | List all sessions for a branch |
| `GET` | `/api/v1/sessions/getById/:sessionId` | Get a single session with components |
| `GET` | `/api/v1/sessions/visit/:branchId/:visitId` | Get all sessions for a visit |
| `PATCH` | `/api/v1/sessions/end/:sessionId` | End session, calculate all component prices |
| `PATCH` | `/api/v1/sessions/cancel/:sessionId` | Cancel session, zero all prices |
| `PATCH` | `/api/v1/sessions/update/:sessionId` | Update bookingId, currency, startedAt |
| `DELETE` | `/api/v1/sessions/delete/:sessionId` | Soft delete session |

### Session Components

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/session-components/:branchId/:sessionId` | Add a component to an active session |
| `GET` | `/api/v1/session-components/:branchId/:sessionId` | List all components for a session |
| `DELETE` | `/api/v1/session-components/:branchId/remove/:componentId` | End a component early |

### Visits

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/visits/start` | Start a visit |
| `GET` | `/api/v1/visits/getAllByBranchId/:branchId` | List visits for a branch |
| `PATCH` | `/api/v1/visits/close/:visitId` | Close visit, create invoice with discounts |

### Request body for `closeVisit`

```json
{
  "discountType": "FLAT",      // optional: "FLAT" or "PERCENT"
  "discountAmount": 50         // optional: manual discount by staff
}
```

### Request body for `createSession`

There are two modes. Only one can be used per request.

**Mode 1 — Smart device mode** (staff picks a device, system auto-resolves the space)

```json
{
  "visitId": "uuid",
  "deviceId": "uuid",
  "startedAt": "2024-01-01T14:00:00Z"
}
```

The system checks `device.spaceId` and `space.type`:
- `PUBLIC` or `DESK` → creates session with **DEVICE only**
- `PRIVATE`, `VIP`, `MEETING`, `OTHER` → creates session with **SPACE + DEVICE**

**Mode 2 — Smart unit mode** (staff picks a unit, system auto-resolves the space)

```json
{
  "visitId": "uuid",
  "unitId": "uuid",
  "startedAt": "2024-01-01T14:00:00Z"
}
```

The system checks `unit.spaceId` and `space.type`:
- `PUBLIC` or `DESK` → creates session with **UNIT only**
- `PRIVATE`, `VIP`, `MEETING`, `OTHER` → creates session with **SPACE + UNIT**

**Mode 3 — Manual mode** (staff explicitly lists all components — for space-only or equipment sessions)

```json
{
  "visitId": "uuid",
  "startedAt": "2024-01-01T09:00:00Z",
  "components": [
    { "resourceType": "SPACE", "resourceId": "uuid" }
  ]
}
```

Rules:
- Cannot send `deviceId` and `unitId` together
- Cannot send `deviceId`/`unitId` and `components` together
- Equipment is always added via `addComponent` to an existing session, never as a session starter

### Request body for `addComponent`

```json
{
  "resourceType": "EQUIPMENT",
  "resourceId": "uuid",
  "quantity": 2,
  "gamesCount": 0,               // optional — only set for PER_GAME resources, ignored otherwise
  "startedAt": "2024-01-01T15:00:00Z"  // optional, defaults to now
}
```

---

## Space Types and Smart Session Mode

When staff creates a session using `deviceId` or `unitId` (smart mode), the system automatically decides whether to include a space component based on the space type the resource lives in.

| Space Type | Auto-add to device session? | Reason |
|---|---|---|
| `PUBLIC` | No | Free zone — customers pay device rate only |
| `DESK` | No | Coworking desk — device rate covers the seat |
| `PRIVATE` | Yes | Chargeable room — customer pays space + device |
| `VIP` | Yes | Chargeable room |
| `MEETING` | Yes | Chargeable room |
| `OTHER` | Yes | Treated as chargeable by default |

If the device or unit has no `spaceId` (not assigned to any room), only that resource's component is added.

Equipment has no `spaceId` and is always added as an add-on to an existing session via `addComponent`, never as a session starter.

---

## Resource Availability

When a component is added (session created or `addComponent` called), the resource is marked as busy:

- **SPACE**: `availableNumber` decremented by 1; `isBusy = true` when `availableNumber <= 0`
- **DEVICE**: `isBusy = true`
- **UNIT**: `isBusy = true`
- **EQUIPMENT**: `isBusy = true`

When a component ends (session ended/cancelled or `removeComponent` called), availability is restored:

- **SPACE**: `availableNumber` incremented (capped at `capacity`); `isBusy` recalculated
- **DEVICE / UNIT / EQUIPMENT**: `isBusy = false`

---

## Price Snapshot Guarantee

`unitPrice` and `priceType` are copied from the resource (or pricing rule) **at the moment the component is created** and stored on the `SessionComponent`. This guarantees that:

- Changing a resource's price mid-session does not affect active sessions
- Changing a pricing rule mid-session does not affect active sessions
- The invoice always reflects the price the customer was shown at start
