# Pricing README

## Overview

Pricing is now simple:

- **Resource prices** live on the resource itself:
  - `Space.price`
  - `Device.price`
  - `Tool.price`
- **Optional pricing rules** can override the resource price.
- **Session** stores only the session result:
  - `priceType`
  - `basePrice`
  - `gamesCount`
  - `unitPrice`
  - `totalPrice`
- **Visit** is the billing bucket.
- **Order** stays separate in its own table.

`addonsPrice` and `ordersPrice` were removed from `Session`.

## Flow

### 1) Insert price on the resource

Set the price when creating or updating a space, device, or tool.

If a matching active pricing rule exists, it takes priority.

### 2) Create a session

`POST /api/v1/sessions/create/:branchId`

The session controller:

1. Validates the branch, visit, and resource.
2. Resolves the resource price.
3. Checks for an active pricing rule for that resource.
4. Stores the final session price in `Session`.
5. Uses `gamesCount` when `priceType = PER_GAME`.

### 3) Recalculate session changes

`PATCH /api/v1/sessions/update/:sessionId`

If `startedAt`, `endedAt`, or `status` changes, the session price is recalculated from the stored `basePrice`.

### 4) End the session

`PATCH /api/v1/sessions/end/:sessionId`

The final session total is computed from:

- `basePrice`
- `priceType`
- `gamesCount` for `PER_GAME`
- session duration

### 5) Close the visit

`PATCH /api/v1/visits/close/:visitId`

The visit total is calculated from:

- all session totals in the visit
- all order totals in the visit

### 6) Create invoice

`POST /api/v1/invoices/create/:visitId`

The invoice uses `visit.totalPrice` when available. If not, it falls back to the order total.

## Pricing rules

Pricing rules are optional.

Priority:

1. Matching active pricing rule
2. Resource price

## Session fields

Current session pricing fields:

| Field | Meaning |
|------|---------|
| `priceType` | How the resource is priced |
| `basePrice` | Stored base price for the session |
| `gamesCount` | Number of games for `PER_GAME` |
| `unitPrice` | Current unit price used in the session |
| `totalPrice` | Final session amount |

## What changed

- Removed `addonsPrice` from `Session`
- Removed `ordersPrice` from `Session`
- Removed session-side addon/order pricing logic
- Kept order pricing in the `Order` table
- Kept visit aggregation for the final bill

## Example

Space price: `100`

Pricing rule exists: `80`

Session result:

- `basePrice = 80`
- `gamesCount = 5`
- `unitPrice = 80`
- `totalPrice = 80` for a fixed session, or duration-based for hourly pricing

Then:

- Visit adds all session totals + order totals
- Invoice uses the visit total

