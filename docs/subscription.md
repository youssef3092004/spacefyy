# Plans & Subscriptions API Documentation

Base URLs: `/api/v1/plans`, `/api/v1/subscriptions`

---

## Overview

- **Plan** — a catalog entry (`FREE`, `PRO`, `ENTERPRISE`) defining price, billing interval, trial length, and resource limits (`maxBranches`, `maxSpaces`, `maxDevices`, `maxUnits`, `maxEquipment`, `maxStaff`, `maxUsers`).
- **Subscription** — a business's billing history against a Plan: which plan, for how long, in what status. Every business always has zero-or-more `Subscription` rows; the most recent one is the "current" subscription.
- **`Business.planId`** stays a denormalized pointer to the plan currently in effect — everything that enforces plan limits (`utils/storageUsage.js`) reads it directly. The Subscription flow is the only thing allowed to change it, keeping it in sync automatically.

---

## Plan

### Data Model

```json
{
  "id": "uuid",
  "name": "Professional Plan",
  "type": "PRO",
  "description": "For growing businesses",
  "price": 299.99,
  "currency": "EGP",
  "billingInterval": "MONTHLY",
  "trialDays": 14,
  "isActive": true,
  "isPublic": true,
  "maxStaff": 20,
  "maxBranches": 5,
  "maxSpaces": 50,
  "maxDevices": 100,
  "maxUnits": 50,
  "maxEquipment": 100,
  "maxUsers": 20
}
```

**`type`:** `FREE` | `PRO` | `ENTERPRISE`
**`billingInterval`:** `MONTHLY` | `YEARLY`
**`isPublic`:** public plans are self-serve/visible on a pricing page; private plans are custom deals only assigned by a developer.

### Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/create` | Create a plan |
| GET | `/getAll` | List all plans |
| GET | `/getById/:id` | Get a plan |
| GET | `/getByBusinessId/:businessId` | Get the plan currently assigned to a business |
| GET | `/getPublicPlans` | List public plans (pricing page) |
| GET | `/getPrivatePlans` | List private plans (`VIEW-PRIVATE-PLANS` permission) |
| PATCH | `/update/:id` | Update a plan |
| DELETE | `/delete/:id` | Delete a plan |

---

## Subscription

### Data Model

```json
{
  "id": "uuid",
  "businessId": "uuid",
  "planId": "uuid",
  "status": "ACTIVE",
  "priceSnapshot": 299.99,
  "currency": "EGP",
  "billingInterval": "MONTHLY",
  "startDate": "2026-07-06T17:26:26.050Z",
  "currentPeriodStart": "2026-07-06T17:26:26.050Z",
  "currentPeriodEnd": "2026-08-06T17:26:26.050Z",
  "trialEndsAt": null,
  "cancelAtPeriodEnd": false,
  "cancelReason": null,
  "cancelledAt": null,
  "cancelledById": null,
  "createdAt": "2026-07-06T17:26:26.525Z",
  "updatedAt": "2026-07-06T17:26:26.525Z"
}
```

**`status`:** `TRIALING` → `ACTIVE` → `PAST_DUE` → `EXPIRED`, or → `CANCELLED` at any point. See [Lifecycle](#lifecycle) below.

**`priceSnapshot` / `currency` / `billingInterval`:** copied from the Plan at subscribe-time, not read live — if `Plan.price` changes later, past Subscription rows still show what was actually charged (same idea as `SessionComponent.unitPrice` snapshotting).

### Endpoints

| Method | Path | Who | Description |
|---|---|---|---|
| POST | `/create/:businessId` | DEVELOPER only | Subscribe a business to a plan (first-time or upgrade/downgrade) |
| GET | `/getAll/:businessId` | Owner or DEVELOPER | Paginated subscription history for a business, newest first |
| GET | `/current/:businessId` | Owner or DEVELOPER | The business's most recent subscription |
| GET | `/getById/:id` | Owner or DEVELOPER | A single subscription by id |
| PATCH | `/renew/:id` | DEVELOPER only | Confirm payment received; extends the current period |
| PATCH | `/cancel/:businessId` | Owner or DEVELOPER | Cancel the business's current subscription |

`create` and `renew` are DEVELOPER-only regardless of who is logged in — billing is manual (no payment gateway), so only staff/developer can confirm a plan change or a renewal actually happened. `cancel` is the one owner self-service action: a business owner can always cancel their own subscription.

#### POST `/create/:businessId`

**Body:**
```json
{ "planId": "uuid" }
```

- If the business has no prior subscription and the plan has `trialDays > 0`, the new row starts `TRIALING` with `trialEndsAt = now + trialDays`.
- Otherwise it starts `ACTIVE` with `currentPeriodEnd = now + 1 month/year` (per `billingInterval`).
- Any existing `TRIALING` / `ACTIVE` / `PAST_DUE` row for the business is closed (`CANCELLED`, `cancelReason: "Superseded by new subscription"`) in the same transaction.
- `Business.planId` is updated to the new plan.

**Response:** `201` with the new subscription.

#### PATCH `/renew/:id`

No body required. Only valid on a subscription currently `TRIALING` / `ACTIVE` / `PAST_DUE`.

- Extends `currentPeriodEnd` by one billing interval from `max(now, currentPeriodEnd)` (so renewing early doesn't lose remaining paid time).
- Sets `status: "ACTIVE"` and clears `cancelAtPeriodEnd`.

#### PATCH `/cancel/:businessId`

**Body:**
```json
{ "immediate": false, "cancelReason": "too expensive" }
```

- `immediate: true` → `status: "CANCELLED"` right away.
- `immediate: false` (or omitted) → `cancelAtPeriodEnd: true`; status stays as-is until the cron closes it out at `currentPeriodEnd`.
- `404` if the business has no `TRIALING` / `ACTIVE` / `PAST_DUE` subscription to cancel.

---

## Lifecycle

```
TRIALING ──renew──▶ ACTIVE ──(period lapses, no renewal)──▶ PAST_DUE ──(grace period lapses)──▶ EXPIRED
   │                   │                                        │
   └────────cancel (immediate) or cancelAtPeriodEnd──────────▶ CANCELLED
```

- **History, not mutation** — plan changes never edit a row in place. Upgrading/downgrading closes the old row (`CANCELLED`, reason `"Superseded by new subscription"`) and opens a new one. `GET /getAll/:businessId` is the full audit trail.
- **Grace period** — when `currentPeriodEnd` passes with no renewal and no cancellation requested, the subscription enters `PAST_DUE` (still counts as active for permission purposes). After `SUBSCRIPTION_GRACE_DAYS` (default `3`) with still no renewal, it flips to `EXPIRED` and `Business.planId` is downgraded to the first active + public plan (the same fallback used when a business is created without specifying a plan).
- **Deferred cancellation** — `cancelAtPeriodEnd: true` lets a business keep what it already paid for; the cron converts it to `CANCELLED` once `currentPeriodEnd` passes, instead of following the `PAST_DUE` path.
- Driven by `utils/subscriptionCron.js`, running hourly by default (`SUBSCRIPTION_CRON`, disable via `ENABLE_SUBSCRIPTION_CRON=false`).

---

## Business Creation

`POST /businesses/create` automatically subscribes the new business to its resolved plan (the requested `planId`, or the first active + public plan if none was given) — every business has a `Subscription` row from the moment it exists. The creation response includes the new `subscription` alongside `business`, `settings`, and `storage`.

---

## Permissions

| Permission | Who has it by default |
|---|---|
| `CREATE-SUBSCRIPTIONS` | DEVELOPER, OWNER, ADMIN (role-level) — but the controller additionally rejects non-DEVELOPER callers |
| `VIEW-SUBSCRIPTIONS` | DEVELOPER, OWNER, ADMIN |
| `RENEW-SUBSCRIPTIONS` | DEVELOPER, OWNER, ADMIN (role-level) — controller additionally rejects non-DEVELOPER callers |
| `CANCEL-SUBSCRIPTIONS` | DEVELOPER, OWNER, ADMIN |

`VIEW`/`CANCEL` routes are further scoped by `checkOwnership` (`scope: "business"`) — an `OWNER` can only see/cancel their own business's subscriptions; `DEVELOPER` bypasses ownership entirely.
