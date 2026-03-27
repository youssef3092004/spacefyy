# Pricing Rules API Guide

This guide documents how `pricing-rules` works in Spacefy, how to call each endpoint, and how to model pricing correctly.

## Base Path

All pricing-rules endpoints are mounted under:

`/api/v1/pricing-rules`

## Authentication and Authorization

All routes require:

- `verifyToken`
- branch ownership check for `:branchId`
- specific permission per action

Permissions:

- Create: `CREATE-PRICING-RULES`
- Read: `VIEW-PRICING-RULES`
- Update: `UPDATE-PRICING-RULES`
- Delete: `DELETE-PRICING-RULES`

## Core Concepts

### 1) `pricingType` vs `pricingMode`

These are different and both are important.

`pricingType` answers: what is the business category of pricing?

- `PER_HOUR`
- `PER_SESSION`
- `PER_GAME`

`pricingMode` answers: how price is applied mathematically/operationally?

- `TIME_RANGE`
- `PER_HOUR`
- `FIXED_PRICE`

Important behavior in this codebase:

- If client sends `pricingMode: "PER_SESSION"`, backend normalizes it to `FIXED_PRICE`.
- `PER_SESSION` is treated as an alias, not a stored enum value.

### 2) Target Scope (exactly one)

Each pricing rule must target exactly one entity:

- `spaceId` or
- `deviceId` or
- `toolId`

If none or more than one is provided, request fails with `400`.

### 3) Duration Rules by Mode

For `pricingMode: TIME_RANGE`:

- `minDurationMinutes` is required
- `maxDurationMinutes` is required
- `minDurationMinutes < maxDurationMinutes`

For `pricingMode: PER_HOUR` or `FIXED_PRICE`:

- Duration values should be `null` or omitted

### 4) Overlap Rule

For the same target and same `pricingMode`, duration ranges cannot overlap.

## Endpoint Reference

## 1. Create Pricing Rule

`POST /api/v1/pricing-rules/create/:branchId`

Required body fields:

- `name`
- `pricingType`
- `minPlayers`
- `maxPlayers`
- `price`
- `pricingMode`
- exactly one target (`spaceId` | `deviceId` | `toolId`)

Optional body fields:

- `minDurationMinutes`
- `maxDurationMinutes`
- `priority` (integer)
- `isActive` (boolean, default true)

Example:

```json
{
  "name": "Weekend Tool Time Slot",
  "pricingType": "PER_HOUR",
  "minDurationMinutes": 60,
  "maxDurationMinutes": 120,
  "minPlayers": 1,
  "maxPlayers": 2,
  "price": 20,
  "pricingMode": "TIME_RANGE",
  "toolId": "<tool-id>"
}
```

Alias example:

```json
{
  "name": "Flat Session",
  "pricingType": "PER_SESSION",
  "minPlayers": 1,
  "maxPlayers": 4,
  "price": 150,
  "pricingMode": "PER_SESSION",
  "spaceId": "<space-id>"
}
```

Note: this is normalized to `pricingMode = FIXED_PRICE` internally.

## 2. Get All Pricing Rules in Branch

`GET /api/v1/pricing-rules/getAll/:branchId`

Query params:

- Pagination: `page`, `limit`
- Sorting: `sort`, `order`
- Filters: `pricingType`, `pricingMode`, `isActive`, `spaceId`, `deviceId`, `toolId`

Rules:

- only one target filter is allowed (`spaceId` or `deviceId` or `toolId`)
- `isActive` must be `"true"` or `"false"`

Example:

`GET /api/v1/pricing-rules/getAll/<branchId>?page=1&limit=10&pricingMode=TIME_RANGE&toolId=<toolId>`

Response includes pagination `meta`.

## 3. Get Rule by ID

`GET /api/v1/pricing-rules/getById/:branchId/:pricingRuleId`

Returns one rule if it belongs to the branch.

## 4. Get Rules by Target

`GET /api/v1/pricing-rules/getByTarget/:branchId/:target/:targetId`

Where `target` is one of:

- `space`
- `device`
- `tool`

## 5. Update Rule by ID

`PATCH /api/v1/pricing-rules/update/:branchId/:pricingRuleId`

Allowed fields:

- `name`
- `pricingType`
- `minDurationMinutes`
- `maxDurationMinutes`
- `minPlayers`
- `maxPlayers`
- `price`
- `priority`
- `isActive`
- `pricingMode`
- `spaceId`
- `deviceId`
- `toolId`

Validation still applies:

- target must remain exactly one
- mode consistency check
- no overlap for same target/mode

## 6. Update Rules by Target (bulk)

`PATCH /api/v1/pricing-rules/updateByTarget/:branchId/:target/:targetId`

Updates all rules attached to the target.

Allowed fields:

- `name`
- `pricingType`
- `minDurationMinutes`
- `maxDurationMinutes`
- `minPlayers`
- `maxPlayers`
- `price`
- `priority`
- `isActive`
- `pricingMode`

## 7. Delete Rule by ID

`DELETE /api/v1/pricing-rules/delete/:branchId/:pricingRuleId`

## 8. Delete Rules by Target (bulk)

`DELETE /api/v1/pricing-rules/deleteByTarget/:branchId/:target/:targetId`

## Notes and Gotchas

- `currency` is in Prisma model, but current create/update controller does not write it from body. Model default is used (`EGP`) unless controller is extended.
- `isPackage` is ignored by current pricing-rules controller.
- `pricingMode` alias support exists for incoming `PER_SESSION`.
- Read endpoints use cache middleware, which can improve repeated reads.

## Error Patterns (Common)

- `Invalid pricingMode`:
  - send one of `TIME_RANGE`, `PER_HOUR`, `FIXED_PRICE`
  - `PER_SESSION` is accepted and normalized in this codebase

- `Exactly one target ... is required`:
  - send one and only one of `spaceId`, `deviceId`, `toolId`

- `Duration must be null for PER_HOUR/FIXED_PRICE`:
  - remove or null out duration fields for these modes

- `Duration range overlaps ...`:
  - change `minDurationMinutes`/`maxDurationMinutes` so they do not intersect existing ranges for the same target and mode

## Quick cURL Examples

Create:

```bash
curl -X POST "http://localhost:<PORT>/api/v1/pricing-rules/create/<branchId>" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Evening Slot",
    "pricingType": "PER_HOUR",
    "minDurationMinutes": 60,
    "maxDurationMinutes": 90,
    "minPlayers": 1,
    "maxPlayers": 2,
    "price": 20,
    "pricingMode": "TIME_RANGE",
    "toolId": "<tool-id>"
  }'
```

List:

```bash
curl "http://localhost:<PORT>/api/v1/pricing-rules/getAll/<branchId>?page=1&limit=10&isActive=true" \
  -H "Authorization: Bearer <token>"
```

Update by ID:

```bash
curl -X PATCH "http://localhost:<PORT>/api/v1/pricing-rules/update/<branchId>/<pricingRuleId>" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "price": 25,
    "priority": 2
  }'
```

## Recommended Client-Side Modeling

- Keep `pricingType` for business UI/reporting semantics.
- Keep `pricingMode` for calculation/validation logic.
- In frontend forms:
  - if mode is `TIME_RANGE`, show duration inputs
  - if mode is `PER_HOUR` or `FIXED_PRICE`, hide/clear duration inputs
- Always enforce exactly one target before submit.
