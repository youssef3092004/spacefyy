import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";

const round2 = (n) => Math.round((Number(n ?? 0) + Number.EPSILON) * 100) / 100;

const EXPENSE_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
};

const formatExpense = (expense) => ({
  ...expense,
  amount: round2(expense.amount),
});

// Expenses are only editable while their shift is OPEN — a closed shift is a
// finalized financial record (same convention as controllers/shiftAttendance.js).
const ensureShiftOpen = async (shiftId) => {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: { id: true, status: true, branchId: true },
  });
  if (!shift) throw new AppError("Shift not found", 404);
  if (shift.status !== "OPEN") {
    throw new AppError("This shift is closed and its expenses are read-only", 400);
  }
  return shift;
};

// ─── Controllers ──────────────────────────────────────────────────────────────

export const addExpense = async (req, res, next) => {
  try {
    const { shiftId } = req.params;
    const { category, amount, reason } = req.body ?? {};

    const amountNum = Number(amount);
    if (amount === undefined || amount === null || isNaN(amountNum) || amountNum <= 0) {
      return next(new AppError("amount is required and must be a positive number", 400));
    }
    if (!reason || !reason.trim()) {
      return next(new AppError("reason is required to record an expense", 400));
    }

    await ensureShiftOpen(shiftId);

    const expense = await prisma.shiftExpense.create({
      data: {
        shiftId,
        createdById: req.user.id,
        category: category?.trim() || "OTHER",
        amount: amountNum,
        reason: reason.trim(),
      },
      include: EXPENSE_INCLUDE,
    });

    res.status(201).json({
      success: true,
      message: "Expense recorded successfully",
      data: formatExpense(expense),
    });
  } catch (error) {
    next(error);
  }
};

export const getShiftExpenses = async (req, res, next) => {
  try {
    const { shiftId } = req.params;

    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      select: { id: true },
    });
    if (!shift) return next(new AppError("Shift not found", 404));

    const expenses = await prisma.shiftExpense.findMany({
      where: { shiftId },
      include: EXPENSE_INCLUDE,
      orderBy: { createdAt: "asc" },
    });

    const total = round2(expenses.reduce((sum, e) => sum + Number(e.amount), 0));

    res.status(200).json({
      success: true,
      data: expenses.map(formatExpense),
      total,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const deleteExpense = async (req, res, next) => {
  try {
    const { shiftId, expenseId } = req.params;

    await ensureShiftOpen(shiftId);

    const expense = await prisma.shiftExpense.findUnique({
      where: { id: expenseId },
      select: { id: true, shiftId: true },
    });
    if (!expense || expense.shiftId !== shiftId) {
      return next(new AppError("Expense not found on this shift", 404));
    }

    await prisma.shiftExpense.delete({ where: { id: expenseId } });

    res.status(200).json({
      success: true,
      message: "Expense deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
