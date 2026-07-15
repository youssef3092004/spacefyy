# Shift Report System — Build Plan (Backend)

Manual shift lifecycle for supervisors: **open a shift → run it → close it with a handover form**. No timers, no scheduling. Number of shifts per day is **dynamic, capped by the business's subscription plan**. Includes staff attendance and a revenue-per-shift closing report.

Backend only (Express + Prisma, matching the existing house style). Frontend is out of scope for this plan.

---

## Key design decisions (locked)

- **One `OPEN` shift per branch at a time.** A branch runs multiple shifts across a day, but only one can be open at any moment — must close before opening the next.
- **Per branch, not global.** Two branches can each have an open shift simultaneously. Every table is `branchId`-scoped; the uniqueness is `[branchId, date, shiftNumber]`.
- **Dynamic shift count, plan-gated.** No fixed "3 shifts". A branch can open 1..N shifts/day where N = its plan's `maxShiftsPerDay` (`null` = unlimited). Enforced with a direct per-day `prisma.shift.count(...)` compared to the plan limit — **not** via `StorageUsage` (that's for cumulative counts, not per-day).
- **Reuse existing models.** Attendance references `StaffProfile` (not a new `Staff` model). `openedById`/`closedById` reference `User` (from `req.user.id`), same pattern as `Visit.cancelledById`.
- **Two states only.** `OPEN` / `CLOSED` (drop the `CLOSING` state — that's just the modal being open on the client; it never needs persisting).
- **Opening creates the row.** No pre-seeded CLOSED rows; `POST /open` creates the shift. `shiftNumber` = today's shift count for the branch + 1, assigned inside a transaction.
- **Timezone-safe `date`.** The shift's day is computed server-side (local midnight derived from `openedAt`), never client-supplied — avoids the UTC-vs-local bug we already hit in the reports feature.
- **Closed shifts are read-only** (including their attendance).

---

## Phase 1 — Schema (`prisma/schema.prisma`)

- [ ] Add `maxShiftsPerDay Int?` to `model Plan` (mirrors the other `maxX Int?` limits; `null` = unlimited).
- [ ] Add enums `ShiftStatus { OPEN, CLOSED }` and `AttendanceStatus { PRESENT, LATE, ABSENT, LEFT_EARLY }`.
- [ ] Add `model Shift`: `id`, `branchId`, `date DateTime`, `shiftNumber Int`, `status ShiftStatus @default(OPEN)`, `openedAt`, `closedAt`, `openedById`, `closedById`, `handoverNotes String?`, `incidentNotes String?`, relations to `Branch` / `User` (opened/closed) / `ShiftAttendance[]`. Constraints: `@@unique([branchId, date, shiftNumber])`, `@@index([branchId, date])`, `@@index([branchId, status])`.
- [ ] Add `model ShiftAttendance`: `id`, `shiftId`, `staffProfileId`, `status AttendanceStatus @default(PRESENT)`, `checkInTime`, `checkOutTime`, `notes String?`, relations to `Shift` / `StaffProfile`. Constraint: `@@unique([shiftId, staffProfileId])`.
- [ ] Add reverse relations: `Branch.shifts`, `User.shiftsOpened` / `shiftsClosed` (named relations), `StaffProfile.shiftAttendance`.
- [ ] Apply with `npx prisma db push` then `npx prisma generate` (same path we used before — the DB has migration drift, so `migrate dev` would demand a reset).
- [ ] Set `maxShiftsPerDay` on existing plans (seed or a one-off update): e.g. FREE = 1, PRO = 3, ENTERPRISE = `null`.

## Phase 2 — Permissions (`seeds/permissions.js`)

- [ ] Add to the `PERMISSIONS` array (kebab style, matching payroll): `OPEN-SHIFTS`, `CLOSE-SHIFTS`, `VIEW-SHIFTS`, `MANAGE-ATTENDANCE`.
- [ ] Add those four to `STAFF_PERMISSIONS` (supervisors are STAFF). OWNER/DEVELOPER are auto-granted — no edit needed.
- [ ] Re-seed: `POST /api/v1/seed-permissions/seed` then `POST /api/v1/seed-permissions/assign/staff` (DEVELOPER token). `skipDuplicates` means only the new ones insert.

## Phase 3 — Shift controller + routes

- [ ] `controllers/shift.js`:
  - `openShift` — resolve branch → business → `plan.maxShiftsPerDay`; inside a `prisma.$transaction`: count today's shifts for the branch, reject if `maxShiftsPerDay` reached (`AppError(403, { typeError: "limit" })`), reject if another shift is `OPEN` for the branch today (400), else create with `shiftNumber = count + 1`, `status: OPEN`, `openedAt: now`, `openedById: req.user.id`. Mirror the count+create transaction in `controllers/order.js:350`.
  - `closeShift` — read shift; guard `if (status !== "OPEN") → 400 "Only OPEN shifts can be closed"`; require `handoverNotes` (400 if missing); set `status: CLOSED`, `closedAt: now`, `closedById: req.user.id`, save `handoverNotes`/`incidentNotes`. Include the shift revenue block (Phase 5) in the response.
  - `getTodayShifts` — all shifts for a branch for today (with attendance + counts).
  - `getShiftById` — one shift with attendance and its revenue block.
- [ ] `routes/shift.js` — chain per house style: `verifyToken → checkPermission("...", true) → checkOwnership({ model: "shift"|"branch", paramId, scope: "branch" }) → [cacheMiddleware on GETs] → controller`. Open = `checkPermission("OPEN-SHIFTS", true)` on `:branchId`; close = `checkPermission("CLOSE-SHIFTS", true)` on the shift.
- [ ] `server.js` — import `shiftRouter`, mount `app.use("/api/v1/shifts", shiftRouter)` next to the reports router (~line 131).

## Phase 4 — Attendance controller + routes

- [ ] `controllers/shiftAttendance.js`:
  - `addAttendance` — add a staff member to an OPEN shift (`@@unique` guards dupes); reject if the shift is CLOSED.
  - `updateAttendance` — change status / set `checkOutTime` / notes; reject if the shift is CLOSED (read-only).
  - `getShiftAttendance` — list attendance for a shift.
  - (Optional) `bulkSetAttendance` — set the whole roster in one call.
- [ ] `routes/shiftAttendance.js` — `MANAGE-ATTENDANCE` for writes, `VIEW-SHIFTS` for reads; mount at `/api/v1/shift-attendance` in `server.js`. Guard every write with "shift must be OPEN".

## Phase 5 — Revenue + daily shift report

- [ ] In `closeShift` and `getShiftById`, compute the shift's money by calling `computeDailyBranchAggregate(branchId, openedAt, closedAt)` from `utils/reportAggregation.js` — yields revenue collected, payment breakdown (Cash/Card/InstaPay/Bank), and invoice count for the open→close window. Attach as `shift.revenue`.
- [ ] `getDailyShiftReport(branchId, date)` — all shifts for the day with: per-shift attendance totals (present/late/absent/left-early), per-shift revenue, and day totals (staff counts + total revenue). Route: `GET /api/v1/shifts/report/daily/:branchId?date=`.

## Phase 6 — Verification (Postman / curl)

- [ ] Open a shift → 200, `shiftNumber: 1`, `status: OPEN`. Open a 2nd while the 1st is open → 400 "already open".
- [ ] On a FREE-plan business (`maxShiftsPerDay: 1`): close shift 1, try to open shift 2 → 400 limit reached. On PRO (3) it succeeds up to 3.
- [ ] Two branches each open a shift at once → both succeed (per-branch isolation).
- [ ] Close without `handoverNotes` → 400. Close with notes → 200; response includes `revenue` block.
- [ ] Add/patch attendance on an OPEN shift → 200; same on a CLOSED shift → 400 read-only.
- [ ] `GET /shifts/report/daily/:branchId?date=today` → attendance totals + revenue totals reconcile with the individual shifts.
- [ ] Concurrency sanity check: two near-simultaneous opens don't both create `shiftNumber: 1` (transaction + `@@unique` backstop).

## Phase 7 — Docs (optional, matches existing pattern)

- [ ] `docs/shifts.md` — endpoints, lifecycle, plan-gating, attendance, the shift report shape.
- [ ] Add the `/api/v1/shifts` row to `README.md` + `docs/README.md` API tables and the model tables.

---

## Reference patterns to copy (from existing code)

- Plan-limit check shape → `utils/storageUsage.js` `incrementStorageUsage` (`if (maxLimit && count >= maxLimit) throw AppError(403, { typeError: "limit" })`).
- `branchId → business → plan` → `business.findUnique({ where: { id }, include: { plan: true } })`.
- Route middleware chain + branch-scoped permission → `routes/payroll.js`.
- Status-transition guard → `controllers/invoice.js:143-160` (read, check status, reject).
- Count+create transaction for `shiftNumber` → `controllers/order.js:350-373`.
- Controller house style (response shape, `AppError`, `req.user`) → `controllers/payroll.js`.
- Revenue aggregation over a window → `utils/reportAggregation.js` `computeDailyBranchAggregate`.

---

# Part 2 — True Z-Report: Gating, Till Reconciliation, Expenses

Part 1 above built the shift skeleton (open/close, attendance, revenue-by-time-window). It does **not** yet make the dashboard actually require an open shift, and it has no till-counting or petty-cash tracking — both of which are the actual point of a "daily closure report." This part closes those gaps, in dependency order.

## Known gap driving this work

Right now, staff can start visits, run sessions, add orders, and **pay invoices** at any time — whether or not they have an open shift. The open/close buttons exist but nothing enforces them. This also means a payment made in the gap between one shift closing and the next opening silently falls outside every shift's time window and disappears from the daily shift report (though it still shows in the general `/reports` revenue for the day).

## Phase 8 — Fix the broken pay-invoice params bug (blocking prerequisite) ✅ DONE

Everything below assumes `paymentMethod` is actually being recorded on payment. It currently isn't — real API calls to pay an invoice return 400.

- [x] `controllers/invoice.js` — `payInvoice` and `payInvoiceById`: changed `const { paymentMethod } = req.params ?? {};` to `req.body ?? {}`. Also reverted `routes/invoice.js`'s `/pay/:visitId/:paymentMethod` and `/payById/:invoiceId/:paymentMethod` (someone had added `:paymentMethod` as a URL segment to match the old `req.params` read) back to plain `/pay/:visitId` / `/payById/:invoiceId`, matching every doc/Postman reference already written for this endpoint.
- [x] Verified: `PATCH /invoices/pay/:visitId` and `PATCH /invoices/payById/:invoiceId` with `{ "paymentMethod": "CASH" }` in the body → 200, invoice PAID with `paymentMethod` stored. Missing/invalid `paymentMethod` → 400.

## Phase 9 — Shift gating (the core structural fix) ✅ DONE

- [x] `utils/requireOpenShift.js` (new) — exports `assertOpenShift(branchId, roleName)` (the core check, throws `AppError(400)` if no `OPEN` shift for the branch, bypassed for `OWNER`/`DEVELOPER`) and `requireOpenShift()` (Express middleware wrapping it, reading `req.branchId` set by a prior `checkOwnership({scope:"branch"})`, and attaching the result as `req.openShift`).
- [x] Applied to every money-touching write route/controller:
  - `routes/visit.js` — `POST /start`, `PATCH /close/:visitId`, `PATCH /cancel/:visitId` (middleware, `req.branchId` from `checkOwnership`).
  - `routes/session.js` — `POST /create/:branchId`, `PATCH /end/:sessionId`, `PATCH /cancel/:sessionId` (middleware).
  - `routes/order.js` — `PATCH /visit/:visitId/complete`, `PATCH /complete/:orderId` (middleware, both already had `checkOwnership`).
  - `controllers/order.js` — `addOrderItems` (`POST /orders/create`): no `checkOwnership` exists on this route (branch is resolved dynamically — visit order vs. takeaway), so `assertOpenShift(resolvedBranchId, req.user?.roleName)` is called directly in the controller once `resolvedBranchId` is known.
  - `controllers/orderItem.js` — `createOrderItem`, `updateOrderItemQuantity`, `deleteOrderItem`: this route file has **no `checkOwnership` at all** (pre-existing gap, not fixed here beyond what's needed for gating) — added `branchId`/`visit.branchId` to `ensureOrderItemExists`'s select and call `assertOpenShift` directly in each controller.
  - `routes/invoice.js` — `POST /create/:visitId`, `POST /createOrder/:orderId`, `PATCH /pay/:visitId`, `PATCH /payById/:invoiceId` (middleware).
- [x] Role exception implemented: `OWNER`/`DEVELOPER` bypass in `assertOpenShift` (mirrors `checkOwnership`/`checkPermission`). Verified live: STAFF blocked with no open shift (400), OWNER succeeds regardless (bypass, `shiftId` stays `null` on any invoice they pay — expected, since they never need shift context).
- [x] `Invoice.shiftId String?` added (nullable, set only at payment time, not at invoice creation) + `Shift.invoices` reverse relation. Stamped in `payInvoice`/`payInvoiceById` from `req.openShift?.id`.
- [x] `controllers/shift.js`'s `computeShiftRevenue` now calls the new `computeShiftBoundMetrics(branchId, shiftId, windowStart, windowEnd)` (in `utils/reportAggregation.js`) instead of the plain time-window `computeDailyBranchAggregate`: it matches invoices by `shiftId` (the FK, now the source of truth) **or** `shiftId: null` within the time window (fallback for invoices paid before this migration). Verified live: a STAFF-paid invoice's `shiftId` matched the open shift exactly, and the shift's `revenue` block picked it up via the FK path.

## Phase 10 — Till reconciliation (Opening Balance / Actual Cash / Expected Cash / Variance) ✅ DONE

This is what actually makes "الصافي" mean something — a counted, reconciled number, not just a revenue total.

- [x] `prisma/schema.prisma` — added to `model Shift`: `openingCash Decimal @default(0)`, `actualCash Decimal?`, `expectedCash Decimal?`, `variance Decimal?`. Pushed via `db push` + `generate`.
- [x] `controllers/shift.js` — `openShift` requires `openingCash` (≥ 0) in the body, stores it.
- [x] `controllers/shift.js` — `closeShift` requires `actualCash` (≥ 0). Computes `expectedCash = openingCash + revenue.paymentBreakdown.CASH - expenses.total` and `variance = actualCash - expectedCash`. All four fields stored and returned alongside `revenue`/`expenses`/`attendanceSummary`.
- [x] Cash-variance insight added: `variance !== 0` → `{ severity: variance < 0 ? "critical" : "warning", category: "cash", message }`.

## Phase 11 — Petty cash expenses ✅ DONE

- [x] `prisma/schema.prisma` — new `model ShiftExpense` (`shiftId`, `createdById`, `category`, `amount`, `reason` required, `createdAt`) + `Shift.expenses` relation + `User.shiftExpensesCreated` reverse relation. Pushed.
- [x] `controllers/shiftExpense.js` — `addExpense`/`getShiftExpenses`/`deleteExpense`, gated by the same `ensureShiftOpen`-style guard as attendance; `amount` (> 0) and `reason` both required.
- [x] `routes/shiftExpense.js` — new `MANAGE-EXPENSES` permission (added to `seeds/permissions.js` + `STAFF_PERMISSIONS`, seeded and granted to STAFF directly), mounted at `/api/v1/shift-expenses` in `server.js`.
- [x] Expenses wired into `closeShift`'s `expectedCash` formula, and into `getShiftById`/`getDailyShiftReport`'s per-shift `expenses` block and day `totals.totalExpenses`/`totals.totalVariance`.

## Phase 12 — Verification ✅ DONE (all passed live)

- [x] `openingCash` missing on open → 400. `actualCash`/`handoverNotes` missing on close → 400.
- [x] Full scenario: `openingCash: 200`, paid a 500 CASH invoice, added a 50 expense with a reason, closed with `actualCash: 650` → `expectedCash: 650`, `variance: 0`, no insight.
- [x] Same shape, second shift: `openingCash: 100`, paid a 300 CASH invoice, closed with `actualCash: 350` → `expectedCash: 400`, `variance: -50`, `critical` cash-shortfall insight with the exact expected message.
- [x] Expense without `reason` → 400. Expense on a CLOSED shift → 400 read-only.
- [x] Paid invoice's `shiftId` matched the currently open shift exactly; `getDailyShiftReport` totals (`totalRevenue: 800`, `totalExpenses: 50`, `totalVariance: -50`, 2 shifts) reconciled with the two individual shifts.
- [x] Regression: plan shift limit (FREE=1) still blocks a 3rd open after 2 were used that day. All test shifts/expenses/attendance deleted and the invoices' paid state reverted afterward.

## Phase 13 — Docs ✅ DONE

- [x] `docs/shifts.md` rewritten: gating section (which routes are gated + role bypass + `Invoice.shiftId` attribution), till-reconciliation section with the formula and a worked example, petty-cash expenses section, updated response shapes (cash fields, `expenses` blocks), updated errors/permissions tables.
- [x] `README.md`: Shifts section rewritten to cover gating, till reconciliation, and expenses; `/api/v1/shift-expenses` added to the endpoint table.
- [x] `docs/README.md`: `ShiftExpense` and `Invoice.shiftId` added to the model tables; `Shift Expenses — /shift-expenses` section added to the API reference; gating note added above the Shifts section; related-docs description updated.

---

**Note on test data:** during Phase 12 verification, two real seeded invoices had their `finalAmount` temporarily overwritten (to 500 and 300) to get clean round numbers for the reconciliation math. Their paid/shiftId state was reverted, but the original `finalAmount` values were **not** recorded beforehand and so were not restored — if that seeded data matters for demos, it may need re-seeding.

---

## Reference patterns to copy (Part 2)

- Middleware that resolves branch from various resource types → `middleware/checkOwnership.js` (the `model === "visit" ? ... : model === "order" ? ...` branching) — mirror this for `requireOpenShift`'s branch resolution.
- Role bypass for OWNER/DEVELOPER → `middleware/checkOwnership.js:33-36`.
- Required-field + reason validation → the `handoverNotes` requirement already in `closeShift` (Part 1, Phase 3).
- Rule-based insight objects (`{severity, category, message}`) → `controllers/report.js` `computeInsights`.
- Read-only-while-open/closed guard → `controllers/shiftAttendance.js` `ensureShiftOpen`.
