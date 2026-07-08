# Reports — Branch & Business Financial Reports

Owner-facing financial reports for any date range: income, payment method breakdown, outstanding invoices, payroll cost, customers, discounts, top products, low stock — plus **rule-based insights** that flag problems automatically (revenue drops, uncollected invoices, heavy discounting, low stock, overdue payroll).

Works at two levels:

- **Branch report** — one branch's numbers for a period.
- **Business report** — business-wide totals **plus a per-branch breakdown** so the owner can compare branches side by side.

The same endpoint also serves as the **Daily Closing Report** — just request today as the range (see below).

---

## Table of Contents

1. [Endpoints](#endpoints)
2. [Query Parameters](#query-parameters)
3. [Daily Closing Report](#daily-closing-report)
4. [Response Shape — Branch Report](#response-shape--branch-report)
5. [Response Shape — Business Report](#response-shape--business-report)
6. [Report Sections Explained](#report-sections-explained)
7. [Insights (Automatic Flags)](#insights-automatic-flags)
8. [Payment Method Tracking](#payment-method-tracking)
9. [Payroll Visibility & Access Control](#payroll-visibility--access-control)
10. [How It Stays Fast — Daily Snapshots](#how-it-stays-fast--daily-snapshots)
11. [Caching](#caching)

---

## Endpoints

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/reports/branch/:branchId` | `viewOrderAnalytics` permission + branch access |
| GET | `/api/v1/reports/business/:businessId` | `viewOrderAnalytics` permission + must **own** the business (or DEVELOPER) |

Both are read-only `GET` endpoints and share the same query parameters.

---

## Query Parameters

| Param | Type | Default | Description |
|---|---|---|---|
| `startDate` | date | first day of current month | Start of the reporting period. A plain date (`2026-07-01`) means "from the start of that day". |
| `endDate` | date | now | End of the reporting period. A plain date (`2026-07-31`) means "through the end of that day". |
| `compare` | `true`/`false` | `false` | Also compute the same metrics for the **previous period of equal length** and enable revenue-trend insights ("revenue down 20% vs. last period"). |
| `trendGroupBy` | `day`/`week` | `day` | Granularity of the `income.trend` array. |

With no dates at all, the report is **month-to-date**.

**Examples:**

```
GET /api/v1/reports/branch/<branchId>                                  → this month so far
GET /api/v1/reports/branch/<branchId>?startDate=2026-06-01&endDate=2026-06-30   → full June
GET /api/v1/reports/business/<businessId>?compare=true                → month-to-date vs. previous period
GET /api/v1/reports/branch/<branchId>?startDate=2026-07-08&endDate=2026-07-08   → Daily Closing Report
```

---

## Daily Closing Report

The end-of-day summary is the branch report with `startDate = endDate = today`:

```
GET /api/v1/reports/branch/:branchId?startDate=2026-07-08&endDate=2026-07-08
```

What the owner reads off it:

| Question | Field |
|---|---|
| Which branch? | `branchName` |
| Net profit for the day | `income.totalRevenue` (sum of what customers actually paid, after discounts) |
| How was it paid? | `income.paymentBreakdown` — `CASH` / `CARD` (Visa) / `INSTAPAY` / `BANK` / `UNKNOWN` |
| How many invoices? | `income.paidInvoiceCount` |

**Note:** payroll is a *monthly* figure (`Payroll.month`/`year`) and is intentionally **not** prorated into a single day. For a one-day range, `payroll` and `net.netAfterPayroll` are `null` with an explanatory `payrollNote` — "net profit for the day" is the day's collected revenue.

---

## Response Shape — Branch Report

```json
{
  "success": true,
  "data": {
    "branchId": "uuid",
    "branchName": "Main Branch 2",
    "isActive": true,
    "period":  { "startDate": "2026-07-01T00:00:00.000Z", "endDate": "2026-07-08T19:21:35.897Z" },
    "comparePeriod": null,

    "income": {
      "totalRevenue": 22173.84,
      "sessionRevenue": 21197.59,
      "productRevenue": 976.25,
      "paidInvoiceCount": 32,
      "trend": [
        { "period": "2026-07-03", "revenue": 2591 },
        { "period": "2026-07-04", "revenue": 1288.16 }
      ],
      "paymentBreakdown": {
        "CASH": 120, "CARD": 0, "INSTAPAY": 0, "BANK": 0, "UNKNOWN": 22053.84
      }
    },

    "outstanding": {
      "unpaidInvoiceCount": 32,
      "unpaidInvoiceTotal": 199653.33,
      "overdueCount": 1,
      "overdueTotal": 450
    },

    "payroll": {
      "monthsIncluded": [{ "month": 6, "year": 2026 }],
      "paidTotal": 4100,
      "pendingApprovedTotal": 0,
      "pendingApprovedCount": 0,
      "oldestPendingDaysPastPeriodEnd": 0
    },
    "payrollNote": null,

    "net": {
      "netAfterPayroll": 18073.84,
      "note": "Not a full P&L — excludes rent, utilities, inventory cost, and taxes."
    },

    "customers": {
      "newCustomers": 0,
      "activeCustomers": 13,
      "avgSpendPerCustomer": 1705.68
    },

    "discounts": {
      "totalDiscountGiven": 133.75,
      "grossRevenueBeforeDiscount": 22307.59,
      "discountRatioPercent": 0.6
    },

    "topProducts": [
      { "productId": "uuid", "productName": "USB Controller", "totalQuantity": 7, "totalRevenue": 2450 }
    ],

    "lowStockProducts": [
      { "productId": "uuid", "name": "Spacefyy Mug", "stock": 11, "alertValue": 15, "branchId": "uuid" }
    ],

    "insights": [
      {
        "severity": "critical",
        "category": "outstanding",
        "message": "32 unpaid invoices totaling 199653.33 (90.0% of billed revenue) remain uncollected."
      }
    ]
  },
  "source": "database"
}
```

---

## Response Shape — Business Report

Same sub-object shapes as the branch report, aggregated business-wide, plus a `branches[]` array for comparison:

```json
{
  "success": true,
  "data": {
    "businessId": "uuid",
    "businessName": "Spacefyy Main Business",
    "period": { "...": "..." },
    "comparePeriod": { "...": "..." },

    "totals": {
      "income": { "...": "..." },
      "outstanding": { "...": "..." },
      "payroll": { "...": "..." },
      "net": { "...": "..." },
      "customers": { "...": "..." },
      "discounts": { "...": "..." },
      "topProducts": [ "business-wide top 10" ],
      "lowStockProducts": [ "across all branches" ]
    },

    "branches": [
      {
        "branchId": "uuid",
        "branchName": "Downtown",
        "isActive": true,
        "shareOfBusinessRevenuePercent": 62.3,
        "income": { "...": "..." },
        "outstanding": { "...": "..." },
        "payroll": { "...": "..." },
        "net": { "...": "..." },
        "customers": { "...": "..." },
        "discounts": { "...": "..." },
        "insights": [
          {
            "severity": "warning",
            "category": "comparison",
            "message": "Branch B generated 1200, 68% below the 2-branch average of 3750."
          }
        ]
      }
    ],

    "insights": [ "business-level insights" ]
  },
  "source": "database"
}
```

**Important:** business-wide `totals.customers.activeCustomers` is **not** the sum of the per-branch values — a customer who visited two branches counts once at business level. Revenue, payroll, and discount figures *are* additive.

---

## Report Sections Explained

| Section | Source | Meaning |
|---|---|---|
| `income` | PAID invoices (`paidAt` within range) | `totalRevenue` sums `finalAmount` — what customers actually paid after discounts. Split into `sessionRevenue` (visit invoices) vs `productRevenue` (takeaway order invoices). |
| `income.trend` | same | Revenue per day (or per ISO week with `trendGroupBy=week`). |
| `income.paymentBreakdown` | `Invoice.paymentMethod` | Revenue per payment method. Invoices paid before the field existed (or without sending it) land in `UNKNOWN`. |
| `outstanding` | UNPAID invoices (live, not period-bound) | Total uncollected money right now. `overdue*` = unpaid for more than **14 days**. |
| `payroll` | `Payroll` rows joined through `StaffProfile.branchId` | Only for **calendar months fully contained** in the range. `paidTotal` counts `PAID` rows; `PENDING`/`APPROVED` are surfaced separately as a caution, not as spent money. |
| `net` | computed | `netAfterPayroll = income.totalRevenue − payroll.paidTotal`. Deliberately **not** called "profit" — rent, utilities, and inventory cost are not tracked yet. |
| `customers` | `CustomerBranch` + distinct visit customers | `newCustomers` = registered in range; `activeCustomers` = distinct visitors in range; `avgSpendPerCustomer` = revenue ÷ active. |
| `discounts` | paid invoices | Discount given in currency and as a % of gross (pre-discount) revenue. |
| `topProducts` | `OrderItem` groupBy | Top 10 products by revenue, `COMPLETED`/`INVOICED` orders only. |
| `lowStockProducts` | `Product` | Active products with alerts on and `stock <= alertValue`. |

---

## Insights (Automatic Flags)

Each report includes an `insights` array of `{ severity, category, message }` objects — deterministic rules computed from the same numbers, designed to tell the owner *what to act on*:

| Category | Rule | Severity |
|---|---|---|
| `revenue` | Revenue down ≥ 20% vs. previous period (`compare=true`) | critical |
| `revenue` | Revenue down 10–20% | warning |
| `revenue` | Revenue up ≥ 20% | info |
| `outstanding` | Unpaid invoices ≥ 25% of billed revenue | critical |
| `outstanding` | Unpaid invoices 10–25% of billed revenue | warning |
| `outstanding` | Any invoice unpaid > 14 days | warning |
| `discounts` | Discounts ≥ 25% of gross revenue | critical |
| `discounts` | Discounts 15–25% of gross revenue | warning |
| `inventory` | ≥ 3 products at/below stock alert | warning |
| `inventory` | 1–2 products at/below stock alert | info |
| `payroll` | Payroll pending approval/payment | info |
| `payroll` | Payroll unpaid > 30 days after its month ended | critical |
| `payroll` | Payroll unpaid 7–30 days after its month ended | warning |
| `net` | Revenue didn't cover paid payroll (negative `netAfterPayroll`) | critical |
| `comparison` | *(business report only)* a branch earned < 50% of the cross-branch average | warning |

Severities: `info` (good to know) → `warning` (look into this) → `critical` (act now). Thresholds are named constants at the top of `controllers/report.js`.

---

## Payment Method Tracking

`Invoice` has a nullable `paymentMethod` field (`CASH` / `BANK` / `INSTAPAY` / `CARD`) captured **at the moment of payment**. "Visa" = `CARD` (card brands are not distinguished).

Send it in the body when marking an invoice paid:

```
PATCH /api/v1/invoices/pay/:visitId
PATCH /api/v1/invoices/payById/:invoiceId

{ "paymentMethod": "CASH" }
```

- **Required** — omitting it (or sending an invalid value) returns `400` `"paymentMethod is required. Use CASH, BANK, INSTAPAY or CARD"`.
- Historical invoices (paid before the field existed) are all `UNKNOWN` in the breakdown.

**Frontend action item:** add a payment-method picker to the "mark as paid" flow — paying is rejected without it.

---

## Payroll Visibility & Access Control

Payroll totals can approximate individual salaries in small teams, so they are **role-gated**:

| Role | Sees payroll / `netAfterPayroll`? | Everything else? |
|---|---|---|
| OWNER (of this business), ADMIN, DEVELOPER | ✅ | ✅ |
| STAFF (has `viewOrderAnalytics` by default) | ❌ `payroll: null` + explanatory `payrollNote` | ✅ income, customers, products, discounts |

- The payroll query is **skipped entirely** for non-privileged roles (not fetched-then-hidden).
- The branch report additionally verifies that an OWNER-role caller actually owns the branch's business before including payroll (defense-in-depth over the shared `checkOwnership` middleware).
- The business report is only reachable by the business's actual owner or a DEVELOPER (`checkOwnership` with `scope: "business"`).
- Cache keys include the caller's role, so a privileged cached response is never served to a non-privileged role.

---

## How It Stays Fast — Daily Snapshots

Reports over long ranges don't re-scan every invoice on every request. A background cron persists one row per branch per day into **`BranchDailyReport`** (revenue splits, payment totals, discount totals, customer counts):

| | |
|---|---|
| Cron file | `utils/dailyReportCron.js` |
| Default schedule | `10 0 * * *` (00:10 UTC daily — snapshots **yesterday**) |
| Env overrides | `DAILY_REPORT_CRON`, `DAILY_REPORT_CRON_TZ`, `ENABLE_DAILY_REPORT_CRON=false`, `RUN_DAILY_REPORT_ON_BOOT=true` |
| Shared logic | `utils/reportAggregation.js` — the cron and the live report path use the **same** aggregation function, so stored and live numbers can never drift |

**How a report request resolves its range:**

1. **Past days** fully covered by snapshots → summed from `BranchDailyReport` (fast path).
2. **Any gap** in snapshot coverage → automatic fallback to one live query over the whole range (correct, just slower). This stops happening once the cron has run daily for the range in question.
3. **Today** is always computed live (the day isn't finished, so it can't be snapshotted).

`outstanding`, `payroll`, `topProducts`, and `lowStockProducts` are always live — they are point-in-time balances or ranked lists, not per-day sums.

To backfill history (e.g. after enabling the feature on an existing branch), call `computeAndStoreBranchDailyReport(branchId, date)` from `utils/dailyReportCron.js` for each past day.

---

## Caching

Both endpoints are cached in Redis under the existing `TTL_ANALYTICS` TTL. The cache key includes: branch/business id, `startDate`, `endDate`, `compare`, `trendGroupBy`, and the caller's **role**.

A freshly-paid invoice may take up to the TTL to appear in a previously-requested range — same behavior as the other analytics endpoints.
