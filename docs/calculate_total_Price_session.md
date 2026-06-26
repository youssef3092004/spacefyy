Purpose: Describe how the session `totalPrice` is calculated in the codebase and show the step-by-step process.

Source references:
- utils/sessionUtils.js
- controllers/session.js

Inputs used for calculation:
- `priceType`: one of `PER_HOUR`, `PER_SESSION`, `PER_GAME`.
- `amount` or `unitPrice` (base amount used for pricing).
- `startedAt`, `endedAt` (ISO timestamps) — used to compute duration in minutes.
- `gamesCount` (integer) — used when `PER_GAME`.
- optional `fallbackTotalPrice` or explicit `totalPrice` provided by caller.

Rules / formulas (step-by-step):
1) Normalize inputs
   - `priceType` is normalized to an accepted value; invalid types throw an error.
   - `amount` / `unitPrice` and `gamesCount` are parsed as numbers and validated.

2) For `PER_GAME`:
   - Validate `gamesCount` is a positive integer.
   - total = roundMoney(baseAmount * gamesCount)

3) For `PER_SESSION` (fixed session price):
   - total = baseAmount (fixed, no time calculation)

4) For `PER_HOUR` (time-based):
   - If `endedAt` is present: compute durationMinutes = ceil((endedAt - startedAt) / 60000).
   - total = roundMoney((baseAmount * durationMinutes) / 60)
   - If `endedAt` is missing (session still active):
       - If `fallbackTotalPrice` provided, use that (parsed/validated).
       - Otherwise treat unitPrice (base amount) as the canonical value until ended.

5) Overriding by caller
   - Controllers allow an explicit `totalPrice` in the request body; if provided it is parsed/validated and used instead of computed value.

Rounding and validation:
- Money values are rounded to 2 decimal places using the project's `roundMoney` helper.
- Negative values are rejected; non-numeric values raise an error.

Example calculations (concrete steps):

- Example A — PER_HOUR (90 minutes):
  - baseAmount = 100
  - startedAt = 90 minutes ago, endedAt = now
  - durationMinutes = 90
  - total = round((100 * 90) / 60) = round(150) = 150

- Example B — PER_GAME:
  - baseAmount = 20, gamesCount = 3
  - total = round(20 * 3) = 60

- Example C — PER_SESSION:
  - baseAmount = 250
  - total = 250 (fixed)

Where this is used in the project:
- `controllers/session.js` uses `calculateSessionPricing`, `calculatePriceByType`, and `calculateSessionTotal` from `utils/sessionUtils.js` to compute `basePrice`, `unitPrice`, and `totalPrice` when creating or updating sessions.

Notes / behavior:
- `PER_HOUR` uses `ceil` on duration minutes so partial minutes bill as full minutes.
- `PER_GAME` requires integer `gamesCount` > 0.
- If the controller finds a `pricingRule` for the resource, it may map the pricing rule to `PER_SESSION` or a time-based type before calculating.
- The canonical computed total used by controllers is the value returned by `calculatePriceByType` (and optionally overridden by a parsed `totalPrice` input).

File created: calculate_total_Price_session.txt
