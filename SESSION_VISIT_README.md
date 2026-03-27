# Session And Visit Guide

This document explains how `Visit` and `Session` work in Spacefy, their lifecycle, pricing behavior, and how to call the current API endpoints.

## Base URLs

- Visit routes are mounted under `/api/v1/visits`
- Session routes are mounted under `/api/v1/sessions`

## Core Concept

- A `Visit` represents the customer-level journey in a branch.
- A `Session` represents usage of one concrete resource inside a visit (`SPACE`, `DEVICE`, or `TOOL`).
- Pricing is frozen using snapshots so later pricing-rule edits do not retroactively change existing records.

## Visit Lifecycle

Allowed statuses in practice:

- `ACTIVE` -> `CLOSED` -> `INVOICED` -> `PAID`

Main rules:

- A customer cannot start a new visit while another visit is `ACTIVE`.
- A `PAID` visit cannot be modified.
- A visit can be invoiced only when it is `CLOSED`.
- A visit can be marked paid only when it is `INVOICED`.

## Visit Endpoints

### 1) Start Visit

- Method: `POST`
- URL: `/api/v1/visits/start`
- Permission: `CREATE-VISITS`
- Branch ownership check: by `branchId`

Request body:

```json
{
  "branchId": "branch-uuid",
  "customerId": "customer-uuid",
  "pricingRuleId": "rule-uuid",
  "spaceId": "optional-space-uuid",
  "deviceId": "optional-device-uuid",
  "toolId": "optional-tool-uuid",
  "startedAt": "2026-03-08T18:00:00.000Z"
}
```

Notes:

- `branchId` and `customerId` are required.
- If `pricingRuleId` is missing, exactly one target must be provided from `spaceId`, `deviceId`, `toolId`.
- On start, pricing snapshot fields are frozen into visit: `pricingRuleId`, `pricingMode`, `unitPrice`, and initial `totalPrice`.

### 2) Close Visit

- Method: `PATCH`
- URL: `/api/v1/visits/close/:visitId`
- Permission: `UPDATE-VISITS`

Behavior:

- Allowed only when visit is `ACTIVE`.
- Computes `endedAt`, `durationMinutes`, and `totalPrice` from frozen snapshot fields.
- Returns the updated visit with status `CLOSED`.

### 3) Invoice Visit

- Method: `PATCH`
- URL: `/api/v1/visits/invoice/:visitId`
- Permission: `UPDATE-VISITS`

Behavior:

- Allowed only when visit is `CLOSED`.
- Sets status to `INVOICED`.

### 4) Pay Visit

- Method: `PATCH`
- URL: `/api/v1/visits/pay/:visitId`
- Permission: `UPDATE-VISITS`

Behavior:

- Allowed only when visit is `INVOICED`.
- Sets status to `PAID`.

## Session Lifecycle

Allowed statuses:

- `ACTIVE` -> `ENDED`
- `ACTIVE` -> `CANCELLED`

Main rules:

- Session belongs to a single `branchId`, `visitId`, and `pricingRuleId`.
- `resourceType` must be one of `SPACE`, `DEVICE`, `TOOL`.
- Session resource must exist and belong to the visit branch.
- Session pricing rule must belong to the same branch and target the same resource.
- Session `unitPrice` is taken from `pricingRule.price` (snapshot on creation).

## Session Endpoints

### 1) Create Session

- Method: `POST`
- URL: `/api/v1/sessions/create/:branchId`
- Permission: `CREATE-SESSIONS`

Request body:

```json
{
  "visitId": "visit-uuid",
  "bookingId": "optional-booking-uuid",
  "resourceType": "SPACE",
  "resourceId": "space-uuid",
  "pricingRuleId": "rule-uuid",
  "totalPrice": 120,
  "currency": "EGP",
  "startedAt": "2026-03-08T19:00:00.000Z",
  "endedAt": null,
  "status": "ACTIVE",
  "createdByStaffId": "optional-staff-uuid"
}
```

Notes:

- Required path param: `branchId`
- Required body fields: `visitId`, `resourceType`, `resourceId`, `pricingRuleId`
- `unitPrice` is not accepted from client as source of truth; backend snapshots it from the pricing rule.

### 2) List Sessions

- Method: `GET`
- URL: `/api/v1/sessions/getAll/:branchId`
- Permission: `VIEW-SESSIONS`

Supported query params:

- Pagination: `page`, `limit`
- Sorting: `sort`, `order`
- Filters: `visitId`, `pricingRuleId`, `bookingId`, `resourceId`, `resourceType`, `status`, `startedFrom`, `startedTo`

### 3) Get Session By Id

- Method: `GET`
- URL: `/api/v1/sessions/getById/:sessionId`
- Permission: `VIEW-SESSIONS`

### 4) Update Session

- Method: `PATCH`
- URL: `/api/v1/sessions/update/:sessionId`
- Permission: `UPDATE-SESSIONS`

Updatable fields:

- `bookingId`, `totalPrice`, `currency`, `startedAt`, `endedAt`, `status`

Notes:

- Status transitions are enforced.
- When `endedAt` changes and `totalPrice` is not explicitly sent, total is recalculated from pricing mode + unit price snapshot.

### 5) End Session

- Method: `PATCH`
- URL: `/api/v1/sessions/end/:sessionId`
- Permission: `UPDATE-SESSIONS`

Behavior:

- Forces transition to `ENDED`.
- Sets `endedAt`, computes `durationMinutes`, and recalculates total.

### 6) Cancel Session

- Method: `PATCH`
- URL: `/api/v1/sessions/cancel/:sessionId`
- Permission: `UPDATE-SESSIONS`

Behavior:

- Forces transition to `CANCELLED`.
- Sets `endedAt` to now, `durationMinutes` to `0`, and `totalPrice` to `0`.

### 7) Delete Session

- Method: `DELETE`
- URL: `/api/v1/sessions/delete/:sessionId`
- Permission: `DELETE-SESSIONS`

## Pricing Behavior Summary

- Time-based modes (`PER_HOUR`, `TIME_RANGE`):
  - If session/visit is open, total may remain fallback/manual.
  - On close/end, total = `(unitPrice * durationMinutes) / 60`.
- Non-time-based mode (`FIXED_PRICE`):
  - Total remains fixed (existing total or unit price).

## Quick Troubleshooting

- `Cannot POST /api/v1/sessions/create<id>`:
  - Missing slash. Correct format is `/api/v1/sessions/create/:branchId`.
- `Session does not belong to this branch`:
  - `branchId` mismatch between path and stored session.
- `Pricing rule does not target this ...`:
  - Selected pricing rule target does not match `resourceType/resourceId`.
- `Only CLOSED visits can be invoiced`:
  - You must close the visit first.

## Suggested Flow

1. Start visit.
2. Create one or more sessions under that visit.
3. End or cancel sessions.
4. Close visit.
5. Invoice visit.
6. Mark visit as paid.
