import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";
import { ensureCanStartVisit } from "../utils/visitStatusLock.js";
import { applyDiscount, resolveCustomerDiscount } from "../utils/discountUtils.js";
import { formatOrder, ORDER_INCLUDE } from "./order.js";

const visitSelect = {
  id: true,
  branchId: true,
  customerId: true,
  customer: { select: { id: true, name: true } },
  pricingRuleId: true,
  pricingMode: true,
  totalPrice: true,
  startedAt: true,
  endedAt: true,
  status: true,
  durationMinutes: true,
  createdAt: true,
  updatedAt: true,
};

const validateManualDiscount = (discountType, discountAmount) => {
  if (!discountType && !discountAmount) return { type: "FLAT", amount: 0 };

  if (discountType && !["FLAT", "PERCENT"].includes(discountType)) {
    throw new AppError("discountType must be FLAT or PERCENT", 400);
  }
  const amt = Number(discountAmount ?? 0);
  if (isNaN(amt) || amt < 0) {
    throw new AppError("discountAmount must be a non-negative number", 400);
  }
  return { type: discountType || "FLAT", amount: amt };
};

export const getAllByBranchId = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    if (!branchId) return next(new AppError("Branch ID is required", 400));

    const { page, limit, skip, sort, order } = pagination(req);

    const normalizedStatus = req.query.status
      ? String(req.query.status).toUpperCase()
      : undefined;

    if (normalizedStatus && !["ACTIVE", "INVOICED"].includes(normalizedStatus)) {
      return next(new AppError("Invalid visit status", 400));
    }

    const where = {
      branchId,
      ...(normalizedStatus ? { status: normalizedStatus } : {}),
    };

    const [branch, visits, total] = await Promise.all([
      prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } }),
      prisma.visit.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort]: order },
        select: {
          ...visitSelect,
          sessions: {
            where: { deletedAt: null },
            select: { status: true },
          },
          _count: {
            select: { orders: true },
          },
        },
      }),
      prisma.visit.count({ where }),
    ]);

    if (!branch) return next(new AppError("Branch not found", 404));

    const data = visits.map(({ sessions, _count, ...visit }) => ({
      ...visit,
      sessionCount: sessions.length,
      sessionStatuses: [...new Set(sessions.map((s) => s.status))],
      totalOrders: _count.orders,
    }));

    res.status(200).json({
      success: true,
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

export const startVisit = async (req, res, next) => {
  try {
    const { branchId, customerId, startedAt } = req.body;

    if (!branchId || !customerId) {
      return next(new AppError("branchId and customerId are required", 400));
    }

    const [branch, customer, latestVisit] = await Promise.all([
      prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } }),
      prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true, isBlocked: true, blockedReason: true },
      }),
      prisma.visit.findFirst({
        where: { branchId, customerId },
        orderBy: { startedAt: "desc" },
        select: { status: true },
      }),
    ]);

    if (!branch)   return next(new AppError("Branch not found", 404));
    if (!customer) return next(new AppError("Customer not found", 404));

    if (customer.isBlocked) {
      return next(
        new AppError(
          `Customer is blocked${customer.blockedReason ? `: ${customer.blockedReason}` : ""}`,
          403,
        ),
      );
    }

    ensureCanStartVisit(latestVisit?.status);

    const visit = await prisma.visit.create({
      data: {
        branchId,
        customerId,
        status: "ACTIVE",
        startedAt: startedAt ? new Date(startedAt) : new Date(),
        totalPrice: 0,
      },
      select: {
        id: true,
        branchId: true,
        customerId: true,
        customer: { select: { id: true, name: true } },
        status: true,
        startedAt: true,
        endedAt: true,
        durationMinutes: true,
        totalPrice: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Auto-link customer to branch; record firstVisitAt if not yet set.
    const existingCB = await prisma.customerBranch.findUnique({
      where: { customerId_branchId: { customerId, branchId } },
      select: { firstVisitAt: true },
    });

    if (!existingCB) {
      await prisma.customerBranch.create({
        data: { customerId, branchId, firstVisitAt: visit.startedAt },
      });
    } else if (!existingCB.firstVisitAt) {
      await prisma.customerBranch.update({
        where: { customerId_branchId: { customerId, branchId } },
        data: { firstVisitAt: visit.startedAt },
      });
    }

    res.status(201).json({
      status: "success",
      message: "Visit started successfully",
      data: visit,
    });
  } catch (error) {
    next(error);
  }
};

export const getVisitById = async (req, res, next) => {
  try {
    const { visitId } = req.params;
    if (!visitId) return next(new AppError("Visit ID is required", 400));

    const [visit, rawOrders] = await Promise.all([
      prisma.visit.findUnique({
        where: { id: visitId },
        select: {
          ...visitSelect,
          sessions: {
            where: { deletedAt: null },
            select: {
              id: true,
              status: true,
              startedAt: true,
              endedAt: true,
              durationMinutes: true,
              totalPrice: true,
              currency: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.order.findMany({
        where: { visitId },
        include: ORDER_INCLUDE,
      }),
    ]);

    if (!visit) return next(new AppError("Visit not found", 404));

    const { sessions, ...visitData } = visit;

    res.status(200).json({
      success: true,
      data: {
        ...visitData,
        sessions,
        orders: rawOrders.map(formatOrder),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const closeVisit = async (req, res, next) => {
  try {
    const { visitId } = req.params;
    if (!visitId) return next(new AppError("Visit ID is required", 400));

    const { discountType, discountAmount } = req.body ?? {};

    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
      select: { id: true, status: true, startedAt: true, branchId: true, customerId: true },
    });

    if (!visit) return next(new AppError("Visit not found", 404));
    if (visit.status !== "ACTIVE") {
      return next(new AppError("Only ACTIVE visits can be closed", 400));
    }

    let manualDiscount;
    try {
      manualDiscount = validateManualDiscount(discountType, discountAmount);
    } catch (err) {
      return next(err);
    }

    const customerDiscount = await resolveCustomerDiscount(visit.customerId);

    const endedAt = new Date();

    const [sessionTotals, orderTotals] = await Promise.all([
      prisma.session.aggregate({
        where: { visitId, deletedAt: null, status: { not: "CANCELLED" } },
        _sum: { totalPrice: true, durationMinutes: true },
      }),
      // Use raw order.totalPrice — discount is applied at invoice level for visit orders
      prisma.order.aggregate({
        where: { visitId },
        _sum: { totalPrice: true },
      }),
    ]);

    const sessionTotal = Number(sessionTotals._sum.totalPrice ?? 0);
    const orderTotal   = Number(orderTotals._sum.totalPrice ?? 0);
    const rawTotal     = Math.round((sessionTotal + orderTotal + Number.EPSILON) * 100) / 100;

    const afterCustomerDiscount = applyDiscount(rawTotal, customerDiscount.type, customerDiscount.amount);
    const finalAmount            = applyDiscount(afterCustomerDiscount, manualDiscount.type, manualDiscount.amount);

    const fallbackDuration = Math.max(
      0,
      Math.round((endedAt.getTime() - visit.startedAt.getTime()) / 60000),
    );
    const durationMinutes = sessionTotals._sum.durationMinutes ?? fallbackDuration;

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.visit.updateMany({
        where: { id: visitId, status: "ACTIVE" },
        data: { endedAt, status: "INVOICED", durationMinutes, totalPrice: rawTotal },
      });

      if (updated.count === 0) throw new AppError("Visit is no longer ACTIVE", 409);

      await tx.invoice.upsert({
        where: { visitId },
        create: {
          visitId,
          branchId: visit.branchId,
          totalAmount: rawTotal,
          discountType: manualDiscount.type,
          discountAmount: manualDiscount.amount,
          customerDiscountType: customerDiscount.type,
          customerDiscountAmount: customerDiscount.amount,
          finalAmount,
          status: "UNPAID",
        },
        update: {
          totalAmount: rawTotal,
          discountType: manualDiscount.type,
          discountAmount: manualDiscount.amount,
          customerDiscountType: customerDiscount.type,
          customerDiscountAmount: customerDiscount.amount,
          finalAmount,
          status: "UNPAID",
          paidAt: null,
        },
      });

      return tx.visit.findUnique({ where: { id: visitId }, select: visitSelect });
    });

    res.status(200).json({
      status: "success",
      message: "Visit closed and invoice created",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
