import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { toNum } from "../utils/analyticsHelpers.js";
import {
  computeDailyBranchAggregate,
  computeIncomeByDay,
  emptyDayMetrics,
} from "../utils/reportAggregation.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const PAYROLL_VISIBLE_ROLES = new Set(["OWNER", "ADMIN", "DEVELOPER"]);
const OVERDUE_DAYS = 14;
const PAYROLL_OVERDUE_CRITICAL_DAYS = 30;
const PAYROLL_OVERDUE_WARNING_DAYS = 7;
const NOT_FULL_PNL_NOTE =
  "Not a full P&L — excludes rent, utilities, inventory cost, and taxes.";

// ─── Date helpers ───────────────────────────────────────────────────────────

const startOfUTCDay = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDays = (d, days) => new Date(d.getTime() + days * 24 * 60 * 60 * 1000);

const resolveDateRange = (startDate, endDate) => {
  if (startDate && isNaN(Date.parse(startDate))) {
    throw new AppError("startDate must be a valid date (e.g. 2026-01-01)", 400);
  }
  if (endDate && isNaN(Date.parse(endDate))) {
    throw new AppError("endDate must be a valid date (e.g. 2026-12-31)", 400);
  }

  let start;
  let end;

  if (!startDate && !endDate) {
    const now = new Date();
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = now;
  } else {
    // Plain date strings (no time component) parse as UTC midnight, but the
    // report's day/month boundaries (and the rest of this codebase's "today"
    // logic) are local — so interpret them as local days: startDate means
    // "from the start of that local day", endDate means "through the end of
    // that local day". Without this, startDate===endDate=today would be a
    // zero-length range and a full-month range would never contain its month
    // for payroll.
    const parseLocal = (value, endOfDay) => {
      if (!value.includes("T")) {
        const [y, m, d] = value.split("-").map(Number);
        return endOfDay
          ? new Date(y, m - 1, d, 23, 59, 59, 999)
          : new Date(y, m - 1, d);
      }
      return new Date(value);
    };

    start = parseLocal(startDate ?? endDate, false);
    end = endDate ? parseLocal(endDate, true) : new Date();
  }

  if (start > end) {
    throw new AppError("startDate must be before endDate", 400);
  }

  return { start, end };
};

const resolvePreviousPeriod = (start, end) => {
  const spanMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - spanMs);
  return { start: prevStart, end: prevEnd };
};

// Calendar months (1-12, with year) fully contained inside [start, end].
const monthsFullyContainedInRange = (start, end) => {
  const months = [];
  let year = start.getFullYear();
  let month = start.getMonth() + 1;

  while (true) {
    const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
    if (monthStart > end) break;

    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
    if (monthStart >= start && monthEnd <= end) {
      months.push({ month, year });
    }

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return months;
};

const isoWeekKey = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dayOfWeek = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dayOfWeek);
  return d.toISOString().slice(0, 10);
};

const bucketTrendByWeek = (dayTrend) => {
  const weeks = new Map();
  for (const { period, revenue } of dayTrend) {
    const key = isoWeekKey(period);
    weeks.set(key, (weeks.get(key) ?? 0) + revenue);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, revenue]) => ({ period, revenue: toNum(revenue) }));
};

const addMetricsInto = (acc, m) => {
  acc.totalRevenue += Number(m.totalRevenue ?? 0);
  acc.sessionRevenue += Number(m.sessionRevenue ?? 0);
  acc.productRevenue += Number(m.productRevenue ?? 0);
  acc.paidInvoiceCount += m.paidInvoiceCount ?? 0;
  acc.grossRevenueBeforeDiscount += Number(m.grossRevenueBeforeDiscount ?? 0);
  acc.discountGiven += Number(m.discountGiven ?? 0);
  acc.cashTotal += Number(m.cashTotal ?? 0);
  acc.cardTotal += Number(m.cardTotal ?? 0);
  acc.instapayTotal += Number(m.instapayTotal ?? 0);
  acc.bankTotal += Number(m.bankTotal ?? 0);
  acc.unknownPaymentTotal += Number(m.unknownPaymentTotal ?? 0);
};

// ─── Income (snapshot-accelerated, with safe live fallback) ────────────────

const getIncomeMetrics = async (branchIds, start, end) => {
  const todayStart = startOfUTCDay(new Date());
  const rangeStartDay = startOfUTCDay(start);
  const hasPastPortion = rangeStartDay < todayStart;
  const hasTodayPortion = end >= todayStart;

  const dayBuckets = new Map();
  let usedSnapshot = false;

  if (hasPastPortion) {
    const expectedDays = Math.round((todayStart.getTime() - rangeStartDay.getTime()) / 86400000);
    const rows = await prisma.branchDailyReport.findMany({
      where: { branchId: { in: branchIds }, date: { gte: rangeStartDay, lt: todayStart } },
    });

    if (expectedDays > 0 && rows.length === expectedDays * branchIds.length) {
      usedSnapshot = true;
      for (const row of rows) {
        const key = row.date.toISOString().slice(0, 10);
        const acc = dayBuckets.get(key) ?? emptyDayMetrics();
        addMetricsInto(acc, row);
        dayBuckets.set(key, acc);
      }
    }
  }

  if (!usedSnapshot) {
    // Gap in snapshot coverage (or range is entirely in the future/today) —
    // fall back to one live query over the whole requested range.
    const liveBuckets = await computeIncomeByDay(branchIds, start, end);
    for (const [key, m] of liveBuckets) dayBuckets.set(key, m);
  } else if (hasTodayPortion) {
    // Snapshot cleanly covered the past portion; today is still in progress
    // and can't be snapshotted, so it's always computed live.
    const todayMetrics = await computeDailyBranchAggregate(branchIds, todayStart, end);
    const key = todayStart.toISOString().slice(0, 10);
    dayBuckets.set(key, todayMetrics);
  }

  const totals = emptyDayMetrics();
  const trend = [];
  for (const [date, m] of [...dayBuckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    addMetricsInto(totals, m);
    trend.push({ period: date, revenue: toNum(m.totalRevenue) });
  }

  return { totals, trend };
};

// ─── Customers (always live — dedup can't be safely summed across days or branches) ──

const getCustomerMetrics = async (branchIds, start, end) => {
  const [newCustomers, activeCustomerRows] = await Promise.all([
    prisma.customerBranch.count({
      where: { branchId: { in: branchIds }, registeredAt: { gte: start, lte: end } },
    }),
    prisma.visit.findMany({
      where: { branchId: { in: branchIds }, startedAt: { gte: start, lte: end } },
      select: { customerId: true },
      distinct: ["customerId"],
    }),
  ]);
  return { newCustomers, activeCustomers: activeCustomerRows.length };
};

// ─── Outstanding (always live — a point-in-time balance, not a period flow) ──

const getOutstanding = async (branchIds) => {
  const unpaidInvoices = await prisma.invoice.findMany({
    where: {
      status: "UNPAID",
      OR: [{ branchId: { in: branchIds } }, { visit: { branchId: { in: branchIds } } }],
    },
    select: { finalAmount: true, createdAt: true },
  });

  const overdueThreshold = new Date(Date.now() - OVERDUE_DAYS * 24 * 60 * 60 * 1000);
  let unpaidInvoiceTotal = 0;
  let overdueCount = 0;
  let overdueTotal = 0;

  for (const inv of unpaidInvoices) {
    const amt = Number(inv.finalAmount ?? 0);
    unpaidInvoiceTotal += amt;
    if (inv.createdAt < overdueThreshold) {
      overdueCount += 1;
      overdueTotal += amt;
    }
  }

  return {
    unpaidInvoiceCount: unpaidInvoices.length,
    unpaidInvoiceTotal: toNum(unpaidInvoiceTotal),
    overdueCount,
    overdueTotal: toNum(overdueTotal),
  };
};

// ─── Payroll (role-gated expense proxy) ────────────────────────────────────

const getPayroll = async (branchIds, start, end, roleName) => {
  if (!PAYROLL_VISIBLE_ROLES.has(roleName)) {
    return { payroll: null, payrollNote: "Payroll figures are only visible to Owner/Admin roles." };
  }

  const months = monthsFullyContainedInRange(start, end);
  if (months.length === 0) {
    return {
      payroll: null,
      payrollNote:
        "Payroll is a monthly figure; no full calendar month is contained in this date range.",
    };
  }

  const rows = await prisma.payroll.findMany({
    where: {
      staffProfile: { branchId: { in: branchIds } },
      OR: months.map(({ month, year }) => ({ month, year })),
    },
    select: { netSalary: true, status: true, month: true, year: true },
  });

  const now = new Date();
  let paidTotal = 0;
  let pendingApprovedTotal = 0;
  let pendingApprovedCount = 0;
  let oldestPendingDaysPastPeriodEnd = 0;

  for (const row of rows) {
    const amt = Number(row.netSalary ?? 0);
    if (row.status === "PAID") {
      paidTotal += amt;
    } else if (row.status === "PENDING" || row.status === "APPROVED") {
      pendingApprovedTotal += amt;
      pendingApprovedCount += 1;
      const periodEnd = new Date(row.year, row.month, 0, 23, 59, 59, 999);
      const daysPastEnd = Math.floor((now - periodEnd) / (24 * 60 * 60 * 1000));
      if (daysPastEnd > oldestPendingDaysPastPeriodEnd) {
        oldestPendingDaysPastPeriodEnd = daysPastEnd;
      }
    }
  }

  return {
    payroll: {
      monthsIncluded: months,
      paidTotal: toNum(paidTotal),
      pendingApprovedTotal: toNum(pendingApprovedTotal),
      pendingApprovedCount,
      oldestPendingDaysPastPeriodEnd,
    },
    payrollNote: null,
  };
};

// ─── Top products / low stock ──────────────────────────────────────────────

const getTopProducts = async (branchIds, start, end) => {
  const where = {
    branchId: { in: branchIds },
    createdAt: { gte: start, lte: end },
    status: { in: ["COMPLETED", "INVOICED"] },
  };

  const topItems = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: { order: where },
    _sum: { quantity: true, totalPrice: true },
    orderBy: { _sum: { totalPrice: "desc" } },
    take: 10,
  });

  const productIds = topItems.map((i) => i.productId);
  const products = productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } })
    : [];
  const productMap = Object.fromEntries(products.map((p) => [p.id, p.name]));

  return topItems.map((i) => ({
    productId: i.productId,
    productName: productMap[i.productId] ?? "Unknown",
    totalQuantity: i._sum.quantity ?? 0,
    totalRevenue: toNum(i._sum.totalPrice),
  }));
};

const getLowStockProducts = async (branchIds) => {
  const products = await prisma.product.findMany({
    where: { branchId: { in: branchIds }, isActive: true, alertIsActivated: true },
    select: { id: true, name: true, stock: true, alertValue: true, branchId: true },
  });
  return products
    .filter((p) => p.stock <= p.alertValue)
    .map((p) => ({ productId: p.id, name: p.name, stock: p.stock, alertValue: p.alertValue, branchId: p.branchId }));
};

// ─── Orchestrator ───────────────────────────────────────────────────────────

const computeBranchMetrics = async ({ branchIds, start, end, roleName, includeDetails }) => {
  const [incomeResult, customerMetrics, outstanding, payrollResult, topProducts, lowStockProducts] =
    await Promise.all([
      getIncomeMetrics(branchIds, start, end),
      getCustomerMetrics(branchIds, start, end),
      getOutstanding(branchIds),
      getPayroll(branchIds, start, end, roleName),
      includeDetails ? getTopProducts(branchIds, start, end) : Promise.resolve(undefined),
      includeDetails ? getLowStockProducts(branchIds) : Promise.resolve(undefined),
    ]);

  const income = {
    totalRevenue: toNum(incomeResult.totals.totalRevenue),
    sessionRevenue: toNum(incomeResult.totals.sessionRevenue),
    productRevenue: toNum(incomeResult.totals.productRevenue),
    paidInvoiceCount: incomeResult.totals.paidInvoiceCount,
    trend: incomeResult.trend,
    paymentBreakdown: {
      CASH: toNum(incomeResult.totals.cashTotal),
      CARD: toNum(incomeResult.totals.cardTotal),
      INSTAPAY: toNum(incomeResult.totals.instapayTotal),
      BANK: toNum(incomeResult.totals.bankTotal),
      UNKNOWN: toNum(incomeResult.totals.unknownPaymentTotal),
    },
  };

  const grossRevenueBeforeDiscount = toNum(incomeResult.totals.grossRevenueBeforeDiscount);
  const totalDiscountGiven = toNum(incomeResult.totals.discountGiven);
  const discounts = {
    totalDiscountGiven,
    grossRevenueBeforeDiscount,
    discountRatioPercent:
      grossRevenueBeforeDiscount > 0 ? toNum((totalDiscountGiven / grossRevenueBeforeDiscount) * 100) : 0,
  };

  const customers = {
    newCustomers: customerMetrics.newCustomers,
    activeCustomers: customerMetrics.activeCustomers,
    avgSpendPerCustomer:
      customerMetrics.activeCustomers > 0 ? toNum(income.totalRevenue / customerMetrics.activeCustomers) : 0,
  };

  const net = {
    netAfterPayroll: payrollResult.payroll ? toNum(income.totalRevenue - payrollResult.payroll.paidTotal) : null,
    note: payrollResult.payroll ? NOT_FULL_PNL_NOTE : payrollResult.payrollNote,
  };

  return {
    income,
    outstanding,
    payroll: payrollResult.payroll,
    payrollNote: payrollResult.payrollNote,
    net,
    customers,
    discounts,
    ...(includeDetails ? { topProducts, lowStockProducts } : {}),
  };
};

// ─── Insights ───────────────────────────────────────────────────────────────

const computeInsights = (metrics, previousMetrics = null, context = {}) => {
  const insights = [];

  if (previousMetrics && previousMetrics.income.totalRevenue > 0) {
    const pctChange =
      ((metrics.income.totalRevenue - previousMetrics.income.totalRevenue) /
        previousMetrics.income.totalRevenue) *
      100;
    if (pctChange <= -20) {
      insights.push({
        severity: "critical",
        category: "revenue",
        message: `Revenue dropped ${Math.abs(pctChange).toFixed(1)}% vs. the previous period (${previousMetrics.income.totalRevenue} → ${metrics.income.totalRevenue}).`,
      });
    } else if (pctChange <= -10) {
      insights.push({
        severity: "warning",
        category: "revenue",
        message: `Revenue dropped ${Math.abs(pctChange).toFixed(1)}% vs. the previous period (${previousMetrics.income.totalRevenue} → ${metrics.income.totalRevenue}).`,
      });
    } else if (pctChange >= 20) {
      insights.push({
        severity: "info",
        category: "revenue",
        message: `Revenue grew ${pctChange.toFixed(1)}% vs. the previous period.`,
      });
    }
  }

  const billedRevenue = metrics.income.totalRevenue + metrics.outstanding.unpaidInvoiceTotal;
  if (billedRevenue > 0) {
    const unpaidRatio = (metrics.outstanding.unpaidInvoiceTotal / billedRevenue) * 100;
    if (unpaidRatio >= 25) {
      insights.push({
        severity: "critical",
        category: "outstanding",
        message: `${metrics.outstanding.unpaidInvoiceCount} unpaid invoices totaling ${metrics.outstanding.unpaidInvoiceTotal} (${unpaidRatio.toFixed(1)}% of billed revenue) remain uncollected.`,
      });
    } else if (unpaidRatio >= 10) {
      insights.push({
        severity: "warning",
        category: "outstanding",
        message: `${metrics.outstanding.unpaidInvoiceCount} unpaid invoices totaling ${metrics.outstanding.unpaidInvoiceTotal} (${unpaidRatio.toFixed(1)}% of billed revenue) remain uncollected.`,
      });
    }
  }
  if (metrics.outstanding.overdueCount > 0) {
    insights.push({
      severity: "warning",
      category: "outstanding",
      message: `${metrics.outstanding.overdueCount} invoices totaling ${metrics.outstanding.overdueTotal} have been unpaid for more than ${OVERDUE_DAYS} days.`,
    });
  }

  if (metrics.discounts.discountRatioPercent >= 25) {
    insights.push({
      severity: "critical",
      category: "discounts",
      message: `Discounts equal ${metrics.discounts.discountRatioPercent.toFixed(1)}% of gross revenue, well above the 15% guideline.`,
    });
  } else if (metrics.discounts.discountRatioPercent >= 15) {
    insights.push({
      severity: "warning",
      category: "discounts",
      message: `Discounts equal ${metrics.discounts.discountRatioPercent.toFixed(1)}% of gross revenue, above the 15% guideline.`,
    });
  }

  if (metrics.lowStockProducts?.length >= 3) {
    insights.push({
      severity: "warning",
      category: "inventory",
      message: `${metrics.lowStockProducts.length} products are at or below their stock alert threshold: ${metrics.lowStockProducts.map((p) => p.name).join(", ")}.`,
    });
  } else if (metrics.lowStockProducts?.length >= 1) {
    insights.push({
      severity: "info",
      category: "inventory",
      message: `${metrics.lowStockProducts.length} product(s) are at or below their stock alert threshold: ${metrics.lowStockProducts.map((p) => p.name).join(", ")}.`,
    });
  }

  if (metrics.payroll) {
    if (metrics.payroll.pendingApprovedTotal > 0) {
      insights.push({
        severity: "info",
        category: "payroll",
        message: `${metrics.payroll.pendingApprovedCount} payroll record(s) totaling ${metrics.payroll.pendingApprovedTotal} are pending approval/payment.`,
      });
    }
    if (metrics.payroll.oldestPendingDaysPastPeriodEnd > PAYROLL_OVERDUE_CRITICAL_DAYS) {
      insights.push({
        severity: "critical",
        category: "payroll",
        message: `Payroll is still unpaid more than ${PAYROLL_OVERDUE_CRITICAL_DAYS} days after its period ended.`,
      });
    } else if (metrics.payroll.oldestPendingDaysPastPeriodEnd > PAYROLL_OVERDUE_WARNING_DAYS) {
      insights.push({
        severity: "warning",
        category: "payroll",
        message: `Payroll is still unpaid more than ${PAYROLL_OVERDUE_WARNING_DAYS} days after its period ended.`,
      });
    }
    if (metrics.net.netAfterPayroll !== null && metrics.net.netAfterPayroll < 0) {
      insights.push({
        severity: "critical",
        category: "net",
        message: `Revenue did not cover paid payroll costs this period (net after payroll: ${metrics.net.netAfterPayroll}).`,
      });
    }
  }

  if (context.businessAverageRevenue > 0 && metrics.income.totalRevenue < 0.5 * context.businessAverageRevenue) {
    const pctBelow = toNum((1 - metrics.income.totalRevenue / context.businessAverageRevenue) * 100);
    const averageLabel = context.branchCount ? `${context.branchCount}-branch` : "business";
    insights.push({
      severity: "warning",
      category: "comparison",
      message: `${context.branchLabel ?? "This branch"} generated ${metrics.income.totalRevenue}, ${pctBelow}% below the ${averageLabel} average of ${toNum(context.businessAverageRevenue)}.`,
    });
  }

  return insights;
};

// ─── Controllers ────────────────────────────────────────────────────────────

const parseTrendGroupBy = (trendGroupBy) => {
  const value = trendGroupBy || "day";
  if (!["day", "week"].includes(value)) {
    throw new AppError("trendGroupBy must be 'day' or 'week'", 400);
  }
  return value;
};

export const getBranchReport = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { startDate, endDate, compare, trendGroupBy } = req.query ?? {};

    const groupBy = parseTrendGroupBy(trendGroupBy);

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, name: true, isActive: true, businessId: true },
    });
    if (!branch) return next(new AppError("Branch not found", 404));

    const roleName = req.user.roleName;
    const userId = req.user?.id || req.user?.userId;

    // Defense-in-depth: checkOwnership's branch scope bypasses the check
    // entirely for roleName === "OWNER" regardless of which business the
    // branch belongs to. Payroll figures are sensitive, so verify actual
    // business ownership here before including them.
    if (roleName === "OWNER") {
      const business = await prisma.business.findUnique({
        where: { id: branch.businessId },
        select: { ownerId: true },
      });
      if (!business || business.ownerId !== userId) {
        return next(new AppError("You do not have access to this branch's report", 403));
      }
    }

    const { start, end } = resolveDateRange(startDate, endDate);

    const metrics = await computeBranchMetrics({
      branchIds: [branchId],
      start,
      end,
      roleName,
      includeDetails: true,
    });
    if (groupBy === "week") {
      metrics.income.trend = bucketTrendByWeek(metrics.income.trend);
    }

    let previous = null;
    let comparePeriod = null;
    if (compare === "true") {
      const prev = resolvePreviousPeriod(start, end);
      comparePeriod = { startDate: prev.start.toISOString(), endDate: prev.end.toISOString() };
      previous = await computeBranchMetrics({
        branchIds: [branchId],
        start: prev.start,
        end: prev.end,
        roleName,
        includeDetails: false,
      });
    }

    const insights = computeInsights(metrics, previous);

    res.status(200).json({
      success: true,
      data: {
        branchId: branch.id,
        branchName: branch.name,
        isActive: branch.isActive,
        period: { startDate: start.toISOString(), endDate: end.toISOString() },
        comparePeriod,
        ...metrics,
        insights,
      },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getBusinessReport = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    const { startDate, endDate, compare, trendGroupBy } = req.query ?? {};

    const groupBy = parseTrendGroupBy(trendGroupBy);

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true },
    });
    if (!business) return next(new AppError("Business not found", 404));

    const branches = await prisma.branch.findMany({
      where: { businessId },
      select: { id: true, name: true, isActive: true },
    });
    const branchIds = branches.map((b) => b.id);
    const roleName = req.user.roleName;

    const { start, end } = resolveDateRange(startDate, endDate);

    const totals = await computeBranchMetrics({ branchIds, start, end, roleName, includeDetails: true });
    if (groupBy === "week") {
      totals.income.trend = bucketTrendByWeek(totals.income.trend);
    }

    let previousTotals = null;
    let comparePeriod = null;
    if (compare === "true") {
      const prev = resolvePreviousPeriod(start, end);
      comparePeriod = { startDate: prev.start.toISOString(), endDate: prev.end.toISOString() };
      previousTotals = await computeBranchMetrics({
        branchIds,
        start: prev.start,
        end: prev.end,
        roleName,
        includeDetails: false,
      });
    }

    const businessAverageRevenue = branchIds.length > 0 ? totals.income.totalRevenue / branchIds.length : 0;

    const perBranch = await Promise.all(
      branches.map(async (branch) => {
        const branchMetrics = await computeBranchMetrics({
          branchIds: [branch.id],
          start,
          end,
          roleName,
          includeDetails: false,
        });
        const insights = computeInsights(branchMetrics, null, {
          branchLabel: branch.name,
          branchCount: branchIds.length,
          businessAverageRevenue,
        });
        return {
          branchId: branch.id,
          branchName: branch.name,
          isActive: branch.isActive,
          shareOfBusinessRevenuePercent:
            totals.income.totalRevenue > 0
              ? toNum((branchMetrics.income.totalRevenue / totals.income.totalRevenue) * 100)
              : 0,
          ...branchMetrics,
          insights,
        };
      }),
    );

    const businessInsights = computeInsights(totals, previousTotals);

    res.status(200).json({
      success: true,
      data: {
        businessId: business.id,
        businessName: business.name,
        period: { startDate: start.toISOString(), endDate: end.toISOString() },
        comparePeriod,
        totals,
        branches: perBranch,
        insights: businessInsights,
      },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};
