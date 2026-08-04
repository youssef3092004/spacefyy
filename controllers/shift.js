import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { computeShiftBoundMetrics } from "../utils/reportAggregation.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

// Shifts belong to a *local* calendar day. We store `date` at local midnight
// and derive it server-side (never from the client) so a shift opened at 11pm
// stays on the correct day regardless of the server's UTC offset — same class
// of bug we fixed in the reports feature.
const startOfLocalDay = (d = new Date()) => {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
};

// Parse a plain `YYYY-MM-DD` as a LOCAL day (not UTC midnight), matching how
// `date` is stored. Falsy/invalid input falls back to today.
const resolveLocalDay = (dateStr) => {
  if (!dateStr) return startOfLocalDay();
  if (!dateStr.includes("T")) {
    const [y, m, d] = dateStr.split("-").map(Number);
    if (y && m && d) return new Date(y, m - 1, d);
  }
  const parsed = new Date(dateStr);
  return isNaN(parsed) ? startOfLocalDay() : startOfLocalDay(parsed);
};

// `date` holds a local-midnight instant computed with whatever UTC offset was
// in force when the shift was opened. Under DST that offset changes, so the
// same calendar day recomputed later is a different instant and exact-equality
// matching silently returns nothing. Adjacent local midnights are ~24h apart,
// so a ±12h window identifies exactly one calendar day under any offset.
const localDayWindow = (day) => ({
  gte: new Date(day.getTime() - 12 * 60 * 60 * 1000),
  lt: new Date(day.getTime() + 12 * 60 * 60 * 1000),
});

const SHIFT_INCLUDE = {
  openedBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
  attendance: {
    include: {
      staffProfile: {
        select: {
          id: true,
          position: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
  },
};

const round2 = (n) => Math.round((Number(n ?? 0) + Number.EPSILON) * 100) / 100;

// Shift's cash fields come back from Prisma as Decimal — convert to plain
// numbers for the API response (null stays null: actualCash/expectedCash/
// variance are only known once the shift is closed).
const formatShift = (shift) => ({
  ...shift,
  openingCash: round2(shift.openingCash),
  actualCash: shift.actualCash == null ? null : round2(shift.actualCash),
  expectedCash: shift.expectedCash == null ? null : round2(shift.expectedCash),
  variance: shift.variance == null ? null : round2(shift.variance),
});

// Money taken during a shift's [openedAt → end] window, reusing the shared
// report aggregation so shift revenue always agrees with the /reports figures.
const computeShiftRevenue = async (branchId, shiftId, from, to) => {
  const m = await computeShiftBoundMetrics(branchId, shiftId, from, to);
  return {
    window: { from, to },
    totalRevenue: m.totalRevenue,
    sessionRevenue: m.sessionRevenue,
    productRevenue: m.productRevenue,
    paidInvoiceCount: m.paidInvoiceCount,
    paymentBreakdown: {
      CASH: m.cashTotal,
      CARD: m.cardTotal,
      INSTAPAY: m.instapayTotal,
      BANK: m.bankTotal,
      UNKNOWN: m.unknownPaymentTotal,
    },
  };
};

// Petty-cash payouts recorded during the shift (see controllers/shiftExpense.js).
// Shared here since it feeds the expectedCash formula on close.
const computeShiftExpensesTotal = async (shiftId) => {
  const agg = await prisma.shiftExpense.aggregate({
    where: { shiftId },
    _sum: { amount: true },
    _count: true,
  });
  return { total: round2(agg._sum.amount), count: agg._count };
};

const summarizeAttendance = (attendance = []) => {
  const totals = { total: attendance.length, present: 0, late: 0, absent: 0, leftEarly: 0 };
  for (const a of attendance) {
    if (a.status === "PRESENT") totals.present += 1;
    else if (a.status === "LATE") totals.late += 1;
    else if (a.status === "ABSENT") totals.absent += 1;
    else if (a.status === "LEFT_EARLY") totals.leftEarly += 1;
  }
  return totals;
};

// ─── Controllers ──────────────────────────────────────────────────────────────

export const openShift = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { openingCash } = req.body ?? {};

    const openingCashNum = Number(openingCash);
    if (
      openingCash === undefined ||
      openingCash === null ||
      isNaN(openingCashNum) ||
      openingCashNum < 0
    ) {
      return next(
        new AppError("openingCash is required and must be a non-negative number", 400),
      );
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: {
        id: true,
        business: { select: { plan: { select: { maxShiftsPerDay: true } } } },
      },
    });
    if (!branch) return next(new AppError("Branch not found", 404));

    const maxShiftsPerDay = branch.business?.plan?.maxShiftsPerDay ?? null;
    const day = startOfLocalDay();

    // Serializable, not the default READ COMMITTED: the "is one already open"
    // check is a phantom read, so two concurrent opens straddling local
    // midnight would each resolve a different `date`, sidestep the
    // @@unique([branchId, date, shiftNumber]) backstop, and both commit —
    // leaving two OPEN shifts on one branch and double-counting every
    // unstamped invoice into both shifts' expected cash.
    let shift;
    try {
      shift = await prisma.$transaction(
        async (tx) => {
          const alreadyOpen = await tx.shift.findFirst({
            where: { branchId, status: "OPEN" },
            select: { id: true, shiftNumber: true },
          });
          if (alreadyOpen) {
            throw new AppError(
              "Another shift is already open for this branch. Close it before opening a new one.",
              400,
            );
          }

          const todayCount = await tx.shift.count({
            where: { branchId, date: localDayWindow(day) },
          });
          if (maxShiftsPerDay !== null && todayCount >= maxShiftsPerDay) {
            throw new AppError(
              `Cannot open a new shift. Your plan allows ${maxShiftsPerDay} shift(s) per day (already opened today: ${todayCount}).`,
              403,
              { typeError: "limit" },
            );
          }

          return tx.shift.create({
            data: {
              branchId,
              date: day,
              shiftNumber: todayCount + 1,
              status: "OPEN",
              openedAt: new Date(),
              openedById: req.user.id,
              openingCash: openingCashNum,
            },
            include: SHIFT_INCLUDE,
          });
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      // P2034 = serialization failure, P2002 = the shiftNumber backstop fired.
      // Both mean another open won the race.
      if (error?.code === "P2034" || error?.code === "P2002") {
        return next(
          new AppError(
            "Another shift was opened for this branch at the same moment. Please retry.",
            409,
          ),
        );
      }
      throw error;
    }

    res.status(201).json({
      success: true,
      message: "Shift opened successfully",
      data: formatShift(shift),
    });
  } catch (error) {
    next(error);
  }
};

export const closeShift = async (req, res, next) => {
  try {
    const { shiftId } = req.params;
    const { handoverNotes, incidentNotes, actualCash } = req.body ?? {};

    const shift = await prisma.shift.findUnique({
      
      where: { id: shiftId },
      select: {
        id: true,
        status: true,
        branchId: true,
        openedAt: true,
        openingCash: true,
      },
    });
    if (!shift) return next(new AppError("Shift not found", 404));
    if (shift.status !== "OPEN") {
      return next(new AppError("Only OPEN shifts can be closed", 400));
    }

    const actualCashNum = Number(actualCash);
    if (
      actualCash === undefined ||
      actualCash === null ||
      isNaN(actualCashNum) ||
      actualCashNum < 0
    ) {
      return next(
        new AppError("actualCash is required and must be a non-negative number", 400),
      );
    }

    const closedAt = new Date();
    const revenue = await computeShiftRevenue(shift.branchId, shiftId, shift.openedAt, closedAt);
    const expenses = await computeShiftExpensesTotal(shiftId);

    const openingCash = round2(shift.openingCash);
    const expectedCash = round2(openingCash + revenue.paymentBreakdown.CASH - expenses.total);
    const variance = round2(actualCashNum - expectedCash);

    // Guarded on OPEN: the status check above ran before the aggregation, and
    // a concurrent close would otherwise overwrite the first one's figures.
    const claimed = await prisma.shift.updateMany({
      where: { id: shiftId, status: "OPEN" },
      data: {
        status: "CLOSED",
        closedAt,
        closedById: req.user.id,
        handoverNotes: handoverNotes?.trim() || null,
        incidentNotes: incidentNotes?.trim() || null,
        actualCash: actualCashNum,
        expectedCash,
        variance,
      },
    });

    if (claimed.count === 0) {
      return next(new AppError("Shift is no longer OPEN", 409));
    }

    const updated = await prisma.shift.findUnique({
      where: { id: shiftId },
      include: SHIFT_INCLUDE,
    });

    const insights = [];
    if (variance !== 0) {
      insights.push({
        severity: variance < 0 ? "critical" : "warning",
        category: "cash",
        message:
          variance < 0
            ? `Cash shortfall of ${Math.abs(variance)}: actual cash (${actualCashNum}) is less than expected (${expectedCash}).`
            : `Cash overage of ${variance}: actual cash (${actualCashNum}) is more than expected (${expectedCash}).`,
      });
    }

    res.status(200).json({
      success: true,
      message: "Shift closed successfully",
      data: {
        ...formatShift(updated),
        revenue,
        expenses,
        attendanceSummary: summarizeAttendance(updated.attendance),
        insights,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getTodayShifts = async (req, res, next) => {
  try {
    const { branchId } = req.params;

    const shifts = await prisma.shift.findMany({
      where: { branchId, date: localDayWindow(startOfLocalDay()) },
      include: SHIFT_INCLUDE,
      orderBy: { shiftNumber: "asc" },
    });

    const data = shifts.map((s) => ({
      ...formatShift(s),
      attendanceSummary: summarizeAttendance(s.attendance),
    }));

    res.status(200).json({ success: true, data, source: "database" });
  } catch (error) {
    next(error);
  }
};

export const getShiftById = async (req, res, next) => {
  try {
    const { shiftId } = req.params;

    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      include: SHIFT_INCLUDE,
    });
    if (!shift) return next(new AppError("Shift not found", 404));

    // For a closed shift, revenue is the final open→close window; for one still
    // open, it's revenue so far (open→now).
    const to = shift.status === "CLOSED" && shift.closedAt ? shift.closedAt : new Date();
    const [revenue, expenses] = await Promise.all([
      computeShiftRevenue(shift.branchId, shift.id, shift.openedAt, to),
      computeShiftExpensesTotal(shift.id),
    ]);

    res.status(200).json({
      success: true,
      data: {
        ...formatShift(shift),
        revenue,
        expenses,
        attendanceSummary: summarizeAttendance(shift.attendance),
      },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getDailyShiftReport = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const day = resolveLocalDay(req.query.date);

    const shifts = await prisma.shift.findMany({
      where: { branchId, date: localDayWindow(day) },
      include: SHIFT_INCLUDE,
      orderBy: { shiftNumber: "asc" },
    });

    const now = new Date();
    const perShift = await Promise.all(
      shifts.map(async (s) => {
        const to = s.status === "CLOSED" && s.closedAt ? s.closedAt : now;
        const [revenue, expenses] = await Promise.all([
          computeShiftRevenue(s.branchId, s.id, s.openedAt, to),
          computeShiftExpensesTotal(s.id),
        ]);
        return {
          id: s.id,
          shiftNumber: s.shiftNumber,
          status: s.status,
          openedAt: s.openedAt,
          closedAt: s.closedAt,
          openedBy: s.openedBy,
          closedBy: s.closedBy,
          openingCash: round2(s.openingCash),
          actualCash: s.actualCash == null ? null : round2(s.actualCash),
          expectedCash: s.expectedCash == null ? null : round2(s.expectedCash),
          variance: s.variance == null ? null : round2(s.variance),
          attendanceSummary: summarizeAttendance(s.attendance),
          revenue,
          expenses,
        };
      }),
    );

    const totals = perShift.reduce(
      (acc, s) => {
        acc.shifts += 1;
        acc.totalStaff += s.attendanceSummary.total;
        acc.present += s.attendanceSummary.present;
        acc.late += s.attendanceSummary.late;
        acc.absent += s.attendanceSummary.absent;
        acc.leftEarly += s.attendanceSummary.leftEarly;
        acc.totalRevenue += s.revenue.totalRevenue;
        acc.paidInvoiceCount += s.revenue.paidInvoiceCount;
        acc.totalExpenses += s.expenses.total;
        if (s.variance != null) acc.totalVariance += s.variance;
        return acc;
      },
      {
        shifts: 0,
        totalStaff: 0,
        present: 0,
        late: 0,
        absent: 0,
        leftEarly: 0,
        totalRevenue: 0,
        paidInvoiceCount: 0,
        totalExpenses: 0,
        totalVariance: 0,
      },
    );
    totals.totalRevenue = round2(totals.totalRevenue);
    totals.totalExpenses = round2(totals.totalExpenses);
    totals.totalVariance = round2(totals.totalVariance);

    res.status(200).json({
      success: true,
      data: {
        branchId,
        date: day,
        shifts: perShift,
        totals,
      },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};
