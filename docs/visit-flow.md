# Visit Flow — Frontend Guide

This document explains the full lifecycle of a visit from creation to invoice payment, including every special case the frontend needs to handle.

---

## Status Overview

### Visit statuses

| Status | Meaning |
|---|---|
| `ACTIVE` | Visit is open — sessions and orders can be added |
| `INVOICED` | Visit is closed — invoice created, awaiting payment |
| `CANCELLED` | Visit was voided — no charge, no invoice |

### Session statuses

| Status | Meaning |
|---|---|
| `ACTIVE` | Session is running — resources are busy |
| `ENDED` | Session finished normally — price calculated |
| `CANCELLED` | Session voided — zero price, resources released |

---

## The Full Flow

```
START VISIT
    │
    ├──▶ [customer blocked?] ──▶ 403 — show blocked message + reason
    ├──▶ [already has ACTIVE visit at this branch?] ──▶ 409 — show active visit warning
    │
    ▼
VISIT ACTIVE
    │
    ├──▶ CREATE SESSION (repeat as needed)
    │        │
    │        ├── Smart mode: pass deviceId or unitId
    │        │     └─ backend resolves space + all devices/units inside it automatically
    │        │
    │        └── Manual mode: pass components[] array
    │              └─ each item: { resourceType, resourceId }
    │
    ├──▶ ADD ORDERS (optional, repeat as needed)
    │
    ├──▶ END SESSION (per session, when customer is done)
    │        └─ price calculated, resources freed
    │
    ├──▶ CANCEL SESSION (if session was a mistake — zero price, resources freed)
    │
    ▼
CLOSE VISIT
    │
    ├──▶ backend auto-ends any remaining ACTIVE sessions
    ├──▶ sums all session totals + order totals
    ├──▶ applies customer discount (if active)
    ├──▶ applies manual discount (passed in close request body)
    ├──▶ creates Invoice (status: UNPAID)
    │
    ▼
VISIT INVOICED
    │
    ▼
PAY INVOICE ──▶ Invoice status: PAID
```

---

## Step-by-Step API Calls

### 1 — Start a visit

```
POST /api/v1/visits/start
```

**Body:**
```json
{
  "branchId": "...",
  "customerId": "...",
  "notes": "Customer requested VIP room setup",   ← optional
  "startedAt": "2026-06-28T20:00:00.000Z"         ← optional, defaults to now
}
```

**Errors to handle:**
| Code | Meaning | What to show |
|---|---|---|
| `403` | Customer is blocked | Show `error` message from response (includes reason) |
| `409` | Customer already has an active visit at this branch | Offer to navigate to the existing visit |
| `404` | Branch or customer not found | — |

---

### 2 — Create a session

```
POST /api/v1/sessions/create/:branchId
```

**Body — Smart mode (recommended):**
```json
{
  "visitId": "...",
  "deviceId": "..."      ← OR "unitId": "..."  (pick one)
}
```
The backend will automatically detect the parent space and include all devices/units in it as components. Use this when the customer sits at a specific device or unit.

**Body — Manual mode:**
```json
{
  "visitId": "...",
  "components": [
    { "resourceType": "SPACE",  "resourceId": "..." },
    { "resourceType": "DEVICE", "resourceId": "..." }
  ]
}
```
Use this when you want full control over which resources to charge.

**Rules:**
- You must pass exactly one of: `deviceId`, `unitId`, or `components[]` — never two at once
- The visit must be `ACTIVE`
- The customer must not be blocked

---

### 3 — Add an order (optional)

```
POST /api/v1/orders/create
```

**Body:**
```json
{
  "visitId": "...",
  "branchId": "...",
  "items": [
    { "productId": "...", "quantity": 2 }
  ]
}
```

Orders can be added at any point while the visit is `ACTIVE`.

---

### 4 — End a session

```
PATCH /api/v1/sessions/end/:sessionId
```

No body required. Calculates and locks the session price. Resources are freed (device/unit becomes available again).

**Price formula per component:**
| Price type | Formula |
|---|---|
| `PER_HOUR` | `unitPrice × quantity × (durationMinutes / 60)` |
| `PER_SESSION` | `unitPrice × quantity` |
| `PER_GAME` | `unitPrice × quantity × gamesCount` |

---

### 5 — Close the visit and create the invoice

```
PATCH /api/v1/visits/close/:visitId
```

**Body (optional discounts):**
```json
{
  "discountType": "PERCENT",   ← "FLAT" or "PERCENT"
  "discountAmount": 10
}
```

**What happens automatically:**
- Any sessions still `ACTIVE` are ended immediately (price calculated up to now)
- All session totals + all order totals are summed
- Customer's profile discount is applied first (if active)
- Manual discount from the request body is applied second
- An Invoice is created with status `UNPAID`
- Visit transitions to `INVOICED`

You do **not** need to end sessions manually before closing — the close endpoint handles it.

---

### 6 — Pay the invoice

```
PATCH /api/v1/invoices/pay/:visitId
```
or
```
PATCH /api/v1/invoices/payById/:invoiceId
```

No body required. Sets invoice to `PAID`, records `paidAt`.

---

## Special Cases

### Manual visit cancellation

```
PATCH /api/v1/visits/cancel/:visitId
```

**Rules (all must be true):**
- Visit is `ACTIVE`
- Less than **15 minutes** have passed since `startedAt`
- The visit has **no orders**

**What happens:**
- Any active sessions are cancelled automatically (zero price, resources freed)
- Visit transitions to `CANCELLED`
- No invoice is created
- The customer can immediately start a new visit

**Errors:**
| Code | Meaning |
|---|---|
| `400` | More than 15 minutes have passed — show "Cancellation window expired" |
| `400` | Visit has orders — show "Cannot cancel a visit that has orders" |
| `400` | Visit is not ACTIVE |

> **UI tip:** Show the cancel button only while `minutesSinceStart < 15` and `orderCount === 0`. Hide or disable it otherwise to avoid confusion.

---

### Auto-cancellation (system, no user action needed)

A background job runs **every 5 minutes** and automatically cancels any visit that meets all of these conditions:

- Status is `ACTIVE`
- Started more than **30 minutes** ago
- Has **zero sessions** ever created
- Has **zero orders**

These are abandoned visits — no one ever used the space. The system cleans them up silently.

**Frontend implication:** If a visit appears `ACTIVE` on a list and then disappears or shows `CANCELLED` without any staff action, this is why. Refresh the visit list periodically (or use the WebSocket) to reflect the current state.

---

### Session cancellation (not the same as visit cancellation)

```
PATCH /api/v1/sessions/cancel/:sessionId
```

Cancels a single session inside an active visit — zeroes its price and frees its resources. The visit itself stays `ACTIVE` and you can create new sessions or close it normally.

Use this when a session was opened by mistake.

---

### Customer is blocked

If a customer is blocked, these will return `403`:
- `POST /visits/start`
- `POST /sessions/create/:branchId`

The response error message includes the block reason. Show it to the staff.

---

## State Transition Rules (quick reference)

```
Visit:
  ACTIVE ──close──▶ INVOICED
  ACTIVE ──cancel (< 15 min, no orders)──▶ CANCELLED
  ACTIVE ──auto-cancel (30 min, empty)──▶ CANCELLED   [background]

Session:
  ACTIVE ──end──▶ ENDED
  ACTIVE ──cancel──▶ CANCELLED
  ACTIVE ──visit close──▶ ENDED  (auto)
  ACTIVE ──visit cancel──▶ CANCELLED  (auto)

Invoice:
  UNPAID ──pay──▶ PAID
```

---

## Filtering visits (list endpoint)

```
GET /api/v1/visits/getAllByBranchId/:branchId
```

**Available query params:**

| Param | Values | Description |
|---|---|---|
| `status` | `ACTIVE` / `INVOICED` / `CANCELLED` | Filter by status |
| `startDate` | ISO date e.g. `2026-06-01` | Visits that started on or after this date |
| `endDate` | ISO date e.g. `2026-06-28` | Visits that started on or before this date (inclusive, end of day) |
| `page` | number | Default `1` |
| `limit` | number | Default `10` |
| `sort` | field name | Default `createdAt` |
| `order` | `asc` / `desc` | Default `desc` |

**Example — today's active visits:**
```
GET /visits/getAllByBranchId/:branchId?status=ACTIVE&startDate=2026-06-28&endDate=2026-06-28
```
