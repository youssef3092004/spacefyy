# Shifts — Manual Shift Lifecycle, Gating, Till Reconciliation & Closing Report

Supervisors run a branch's day as a sequence of **shifts**. A shift is opened manually (with a counted opening cash float), staff attendance and petty-cash expenses are tracked while it runs, and it is closed with a handover form plus a **manually counted cash amount** that the system reconciles against what it expected. There are no timers or auto-open/close — everything is a deliberate supervisor action. The number of shifts a branch can run per day is **capped by its subscription plan**.

Critically: **no sale, booking, session, order, or payment can happen without an open shift** (except for OWNER/DEVELOPER, who can always operate). This is what makes the whole system trustworthy — every euro/pound/dollar taken is provably attributable to a shift and the employee running it.

---

## Table of Contents

1. [Concepts & Rules](#concepts--rules)
2. [Shift Gating (the core structural rule)](#shift-gating-the-core-structural-rule)
3. [Plan-Gated Shift Limit](#plan-gated-shift-limit)
4. [Shift Endpoints](#shift-endpoints)
5. [Till Reconciliation (Opening/Actual/Expected Cash, Variance)](#till-reconciliation-openingactualexpected-cash-variance)
6. [Attendance Endpoints](#attendance-endpoints)
7. [Petty Cash Expenses](#petty-cash-expenses)
8. [Daily Shift Report](#daily-shift-report)
9. [Response Shapes](#response-shapes)
10. [Errors](#errors)
11. [Permissions](#permissions)

---

## Concepts & Rules

- **One `OPEN` shift per branch at a time.** A branch runs several shifts across a day, but only one can be open at any moment — the current one must be closed before the next opens. Two *different* branches can each have an open shift simultaneously.
- **Opening creates the shift row.** There are no pre-seeded shifts. `shiftNumber` is assigned automatically as "today's shift count for the branch + 1" (1, 2, 3, …), inside a transaction so concurrent opens can't collide.
- **Opening requires a counted opening cash float** (`openingCash`) — what's left in the drawer from the previous shift.
- **Closing requires handover notes and a manually counted cash amount** (`actualCash`); `incidentNotes` is optional. The system computes what the drawer *should* contain and flags any difference.
- **Closed shifts are read-only**, including their attendance and expenses.
- **The shift's day is server-derived** (local calendar day from `openedAt`), never client-supplied.
- **Two states:** `OPEN` → `CLOSED`.

---

## Shift Gating (the core structural rule)

Every money-touching write is blocked unless the branch has a currently `OPEN` shift:

| Route | Gated action |
|---|---|
| `POST /visits/start`, `PATCH /visits/close/:visitId`, `PATCH /visits/cancel/:visitId` | Starting/closing/cancelling a visit |
| `POST /sessions/create/:branchId`, `PATCH /sessions/end/:sessionId`, `PATCH /sessions/cancel/:sessionId` | Starting/ending/cancelling a session |
| `POST /orders/create`, `PATCH /orders/visit/:visitId/complete`, `PATCH /orders/complete/:orderId` | Adding items / completing an order |
| `POST /order-items/create`, `PATCH /order-items/update/:orderItemId/:quantity`, `DELETE /order-items/delete/:orderItemId` | Adding/editing/removing an order line item |
| `POST /invoices/create/:visitId`, `POST /invoices/createOrder/:orderId`, `PATCH /invoices/pay/:visitId`, `PATCH /invoices/payById/:invoiceId` | Creating or paying an invoice |

**Blocked** (no open shift, non-owner role):
```json
{ "success": false, "error": "No open shift for this branch. Open a shift before recording sales." }
```
`400`.

**Role exception:** `OWNER` and `DEVELOPER` bypass this gate entirely — they can operate regardless of shift state (same convention as `checkOwnership`/`checkPermission`). Any invoice they pay gets `shiftId: null` since there's no shift context to attribute it to.

**Attribution:** when a `STAFF`/`ADMIN` user pays an invoice, `Invoice.shiftId` is stamped with the currently open shift's id — this is the source of truth for "which shift collected this money," not just a time-window guess. Invoices paid before this field existed have `shiftId: null` and are still correctly attributed by matching them to whichever shift's `[openedAt, closedAt)` window contains their `paidAt`.

---

## Plan-Gated Shift Limit

Each `Plan` has a `maxShiftsPerDay` field (`Int?`, `null` = unlimited). When opening a shift, the branch's business → plan is resolved and today's shift count for the branch is compared to the limit. Hitting it returns `403` with `typeError: "limit"`.

| Plan (seed) | maxShiftsPerDay |
|---|---|
| FREE (Starter) | 1 |
| PRO (Professional) | 3 |
| ENTERPRISE | `null` (unlimited) |

(Adjust per plan as needed — it's a normal plan-limit column like `maxBranches`/`maxStaff`.)

---

## Shift Endpoints

Base: `/api/v1/shifts`. All require a Bearer token.

| Method | Path | Permission | Description |
|---|---|---|---|
| POST | `/open/:branchId` | `OPEN-SHIFTS` | Open a new shift. Body: `{ openingCash* }` (required, ≥ 0 — the counted float in the drawer). |
| POST | `/close/:shiftId` | `CLOSE-SHIFTS` | Close an open shift. Body: `{ handoverNotes*, actualCash*, incidentNotes? }`. Returns the shift with `revenue`, `expenses`, and `insights` (cash variance flag if any). |
| GET | `/today/:branchId` | `VIEW-SHIFTS` | All of today's shifts for the branch (with attendance summaries and cash fields). |
| GET | `/getById/:shiftId` | `VIEW-SHIFTS` | One shift with attendance, `revenue`, and `expenses` (live window if still open). |
| GET | `/report/daily/:branchId?date=` | `VIEW-SHIFTS` | Daily report: every shift for the day + attendance/revenue/expense/variance totals. `date` defaults to today (local `YYYY-MM-DD`). |

**Open example**

```
POST /api/v1/shifts/open/2d5fc02a-1e68-4f11-8515-bcb9a3967632
{ "openingCash": 200 }
→ 201 { data: { shiftNumber: 1, status: "OPEN", openingCash: 200, openedAt, openedBy: { id, name }, ... } }
```
Missing/negative `openingCash` → `400`.

**Close example**

```
POST /api/v1/shifts/close/<shiftId>
{ "handoverNotes": "Station 3 needs restart", "incidentNotes": "AC fixed", "actualCash": 650 }
→ 200 {
  data: {
    status: "CLOSED", closedAt, closedBy,
    openingCash: 200, actualCash: 650, expectedCash: 650, variance: 0,
    revenue: {...}, expenses: { total: 50, count: 1 },
    attendanceSummary: {...},
    insights: []
  }
}
```
Missing `handoverNotes` or `actualCash` → `400`.

---

## Till Reconciliation (Opening/Actual/Expected Cash, Variance)

This is what turns "revenue" into an actual reconciled **"الصافي"** — a counted number, not just a total.

| Field | Set when | Meaning |
|---|---|---|
| `openingCash` | Open | The counted float left in the drawer to start the shift. |
| `actualCash` | Close | The employee's manual count of what's actually in the drawer at close. |
| `expectedCash` | Close (system-computed) | `openingCash + revenue.paymentBreakdown.CASH − expenses.total` — what the drawer *should* contain. |
| `variance` | Close (system-computed) | `actualCash − expectedCash`. `0` = reconciled. Negative = **shortfall** (money missing). Positive = **overage**. |

On close, if `variance !== 0` an insight is included:

```json
{ "severity": "critical", "category": "cash", "message": "Cash shortfall of 50: actual cash (350) is less than expected (400)." }
```
(`severity` is `"critical"` for a shortfall, `"warning"` for an overage.)

**Worked example** (verified): `openingCash: 200`, a 500 CASH invoice paid during the shift, one 50 expense recorded → `expectedCash = 200 + 500 − 50 = 650`. Closing with `actualCash: 650` → `variance: 0`, no insight. Closing the same shift with `actualCash: 600` instead → `variance: -50`, a `critical` insight.

Only `paymentBreakdown.CASH` feeds `expectedCash` — card/InstaPay/bank revenue doesn't pass through the physical till, so it's correctly excluded from the cash count.

---

## Attendance Endpoints

Base: `/api/v1/shift-attendance`. Attendance can only be added or changed while the parent shift is `OPEN`.

| Method | Path | Permission | Description |
|---|---|---|---|
| POST | `/create/:shiftId` | `MANAGE-ATTENDANCE` | Add a staff member to the shift. Body: `{ staffProfileId*, status?, checkInTime?, notes? }`. |
| PATCH | `/update/:shiftId/:attendanceId` | `MANAGE-ATTENDANCE` | Update status / check-out / notes. Body: any of `{ status, checkInTime, checkOutTime, notes }`. |
| GET | `/getAll/:shiftId` | `VIEW-SHIFTS` | List attendance for a shift. |

- `status` ∈ `PRESENT` (default) / `LATE` / `ABSENT` / `LEFT_EARLY`.
- `checkInTime` defaults to now when omitted on create.
- A staff member can appear at most once per shift; the staff must belong to the shift's branch.

**Add example**

```
POST /api/v1/shift-attendance/create/<shiftId>
{ "staffProfileId": "<staffProfileId>", "status": "PRESENT" }
→ 201 { data: { status: "PRESENT", checkInTime, staffProfile: { id, position, user: { id, name } } } }
```

---

## Petty Cash Expenses

Base: `/api/v1/shift-expenses`. Every payout out of the till during a shift must be logged with an amount **and a reason** — this is what makes "petty cash" auditable instead of just a hole in the drawer. Only editable while the parent shift is `OPEN`.

| Method | Path | Permission | Description |
|---|---|---|---|
| POST | `/create/:shiftId` | `MANAGE-EXPENSES` | Record an expense. Body: `{ amount*, reason*, category? }` (`amount` > 0, `reason` required; `category` free text, e.g. `"supplies"`, defaults to `"OTHER"`). |
| GET | `/getAll/:shiftId` | `VIEW-SHIFTS` | List expenses for a shift, plus their `total`. |
| DELETE | `/delete/:shiftId/:expenseId` | `MANAGE-EXPENSES` | Remove an expense (only while `OPEN`). |

**Add example**

```
POST /api/v1/shift-expenses/create/<shiftId>
{ "category": "SUPPLIES", "amount": 50, "reason": "cleaning supplies" }
→ 201 { data: { amount: 50, category: "SUPPLIES", reason: "cleaning supplies", createdBy: { id, name } } }
```

Missing/non-positive `amount` or missing `reason` → `400`. Adding/deleting on a `CLOSED` shift → `400` ("read-only").

---

## Daily Shift Report

`GET /api/v1/shifts/report/daily/:branchId?date=2026-07-11`

Rolls up all of a day's shifts — attendance, revenue, expenses, and cash variance:

```json
{
  "success": true,
  "data": {
    "branchId": "uuid",
    "date": "2026-07-11T00:00:00.000Z",
    "shifts": [
      {
        "id": "uuid", "shiftNumber": 1, "status": "CLOSED",
        "openedAt": "...", "closedAt": "...",
        "openedBy": { "id": "uuid", "name": "Ahmed" },
        "closedBy": { "id": "uuid", "name": "Ahmed" },
        "openingCash": 200, "actualCash": 650, "expectedCash": 650, "variance": 0,
        "attendanceSummary": { "total": 4, "present": 3, "late": 1, "absent": 0, "leftEarly": 0 },
        "revenue": { "totalRevenue": 500, "paidInvoiceCount": 1, "paymentBreakdown": { "CASH": 500, "CARD": 0, "INSTAPAY": 0, "BANK": 0, "UNKNOWN": 0 }, "window": { "from": "...", "to": "..." } },
        "expenses": { "total": 50, "count": 1 }
      }
    ],
    "totals": {
      "shifts": 2, "totalStaff": 7, "present": 6, "late": 1, "absent": 0, "leftEarly": 0,
      "totalRevenue": 800, "paidInvoiceCount": 2,
      "totalExpenses": 50, "totalVariance": -50
    }
  },
  "source": "database"
}
```

Revenue prefers matching invoices by `invoice.shiftId` (the FK, stamped at payment time), falling back to the `openedAt → closedAt` time window only for invoices paid before that field existed — so shift revenue always reconciles with the financial `/reports` figures.

---

## Response Shapes

**Shift object** (`data` on open/getById; `data` items on today):

```json
{
  "id": "uuid",
  "branchId": "uuid",
  "date": "2026-07-11T00:00:00.000Z",
  "shiftNumber": 2,
  "status": "OPEN",
  "openedAt": "2026-07-11T09:36:10.484Z",
  "closedAt": null,
  "openedBy": { "id": "uuid", "name": "Ahmed" },
  "closedBy": null,
  "handoverNotes": null,
  "incidentNotes": null,
  "openingCash": 200,
  "actualCash": null,
  "expectedCash": null,
  "variance": null,
  "attendance": [
    { "id": "uuid", "status": "LATE", "checkInTime": "...", "checkOutTime": null, "notes": "arrived late",
      "staffProfile": { "id": "uuid", "position": "cashier", "user": { "id": "uuid", "name": "Youssef" } } }
  ],
  "attendanceSummary": { "total": 1, "present": 0, "late": 1, "absent": 0, "leftEarly": 0 },
  "revenue": {
    "window": { "from": "...", "to": "..." },
    "totalRevenue": 500, "sessionRevenue": 500, "productRevenue": 0, "paidInvoiceCount": 1,
    "paymentBreakdown": { "CASH": 500, "CARD": 0, "INSTAPAY": 0, "BANK": 0, "UNKNOWN": 0 }
  },
  "expenses": { "total": 50, "count": 1 }
}
```
`actualCash`/`expectedCash`/`variance` stay `null` until the shift is closed.

---

## Errors

| Code | When |
|---|---|
| 400 | No open shift for this branch (any gated write, non-owner role); opening while another shift is already open; missing/negative `openingCash` on open; closing a non-OPEN shift; closing without `handoverNotes` or `actualCash`; adding/updating attendance or expenses on a CLOSED shift; duplicate staff on a shift; staff not in the shift's branch; missing/non-positive expense `amount` or missing `reason`; invalid `status`/date. |
| 401 | Missing/invalid token. |
| 403 | Missing permission, no access to the branch, or plan shift limit reached (`typeError: "limit"`). |
| 404 | Branch / shift / staff profile / attendance record / expense not found. |

---

## Permissions

Seeded in `seeds/permissions.js` and granted to the STAFF role (supervisors are staff); OWNER/DEVELOPER are auto-granted and bypass shift gating entirely.

| Permission | Gates |
|---|---|
| `OPEN-SHIFTS` | Opening shifts |
| `CLOSE-SHIFTS` | Closing shifts |
| `VIEW-SHIFTS` | Reading shifts, attendance/expense lists, and the daily report |
| `MANAGE-ATTENDANCE` | Adding/updating attendance |
| `MANAGE-EXPENSES` | Adding/deleting petty-cash expenses |

Access is always further restricted by branch: a STAFF/ADMIN user can only act on branches they belong to (via `checkOwnership` → `checkBranchAccess`); OWNER is limited to their own business's branches (and bypasses the open-shift requirement everywhere).
