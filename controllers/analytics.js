import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { getBranchIds, toNum } from "../utils/analyticsHelpers.js";

// Plain date strings parse as UTC midnight, but this codebase's day boundaries
// are local. Matches report.js's resolveDateRange so the dashboard and the
// reports never disagree about which day a payment belongs to.
const parseLocalDate = (value, endOfDay) => {
  if (!value.includes("T")) {
    const [y, m, d] = value.split("-").map(Number);
    return endOfDay
      ? new Date(y, m - 1, d, 23, 59, 59, 999)
      : new Date(y, m - 1, d);
  }
  return new Date(value);
};

// ─── Controllers ──────────────────────────────────────────────────────────────

export const getBusinessDashboard = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    const { branchId } = req.query;

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });
    if (!business) return next(new AppError("Business not found", 404));

    const branchIds = await getBranchIds(businessId, branchId);

    if (branchIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          activeVisits: 0,
          openTakeawayOrders: 0,
          todayRevenue: 0,
          totalCustomers: 0,
          pendingPayrolls: 0,
          unpaidInvoices: 0,
        },
      });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const [
      activeVisits,
      openTakeawayOrders,
      todayRevenue,
      totalCustomers,
      pendingPayrolls,
      unpaidInvoices,
    ] = await Promise.all([
      prisma.visit.count({ where: { branchId: { in: branchIds }, status: "ACTIVE" } }),
      prisma.order.count({
        where: { branchId: { in: branchIds }, visitId: null, status: "OPEN" },
      }),
      prisma.invoice.aggregate({
        where: {
          status: "PAID",
          paidAt: { gte: todayStart, lt: todayEnd },
          OR: [{ branchId: { in: branchIds } }, { visit: { branchId: { in: branchIds } } }],
        },
        // finalAmount, not totalAmount — see getRevenueReport.
        _sum: { finalAmount: true },
      }),
      prisma.customer.count({ where: { businessId } }),
      prisma.payroll.count({
        where: { staffProfile: { branchId: { in: branchIds } }, status: "PENDING" },
      }),
      prisma.invoice.count({
        where: {
          status: "UNPAID",
          OR: [{ branchId: { in: branchIds } }, { visit: { branchId: { in: branchIds } } }],
        },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        activeVisits,
        openTakeawayOrders,
        todayRevenue: toNum(todayRevenue._sum.finalAmount),
        totalCustomers,
        pendingPayrolls,
        unpaidInvoices,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getRevenueReport = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    const { branchId, startDate, endDate, groupBy = "day" } = req.query;

    if (!["day", "month"].includes(groupBy)) {
      return next(new AppError("groupBy must be 'day' or 'month'", 400));
    }
    if (startDate && isNaN(Date.parse(startDate))) {
      return next(new AppError("Invalid startDate", 400));
    }
    if (endDate && isNaN(Date.parse(endDate))) {
      return next(new AppError("Invalid endDate", 400));
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });
    if (!business) return next(new AppError("Business not found", 404));

    const branchIds = await getBranchIds(businessId, branchId);

    const dateFilter = {};
    if (startDate) dateFilter.gte = parseLocalDate(startDate, false);
    // Through the END of the end day — `new Date("2026-01-31")` is that day's
    // midnight, which silently excluded all of January 31st.
    if (endDate) dateFilter.lte = parseLocalDate(endDate, true);
    const hasDates = Object.keys(dateFilter).length > 0;

    const invoices = await prisma.invoice.findMany({
      where: {
        status: "PAID",
        ...(hasDates ? { paidAt: dateFilter } : {}),
        OR: [{ branchId: { in: branchIds } }, { visit: { branchId: { in: branchIds } } }],
      },
      // finalAmount is what was actually collected. totalAmount is pre-discount
      // for visit invoices and post-discount for order invoices, so summing it
      // both overstates revenue and mixes two different meanings.
      select: { finalAmount: true, paidAt: true },
    });

    const grouped = {};
    for (const inv of invoices) {
      const d = new Date(inv.paidAt);
      const key =
        groupBy === "day"
          ? d.toISOString().slice(0, 10)
          : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      grouped[key] = (grouped[key] ?? 0) + Number(inv.finalAmount);
    }

    const report = Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, revenue]) => ({ period, revenue: toNum(revenue) }));

    const total = report.reduce((sum, r) => sum + r.revenue, 0);

    res.status(200).json({
      success: true,
      data: { total: toNum(total), groupBy, report },
    });
  } catch (error) {
    next(error);
  }
};
