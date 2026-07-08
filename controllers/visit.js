import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";
import { ensureCanStartVisit } from "../utils/visitStatusLock.js";
import {
  applyDiscount,
  resolveCustomerDiscount,
} from "../utils/discountUtils.js";
import { formatOrder, ORDER_INCLUDE } from "./order.js";
import {
  calculateComponentPrice,
  calculateDurationMinutes,
  roundMoney,
} from "../utils/sessionUtils.js";
import { releaseResourceAvailability } from "../utils/resourceAvailability.js";

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
  notes: true,
  durationMinutes: true,
  cancelledAt: true,
  cancelledById: true,
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

    if (
      normalizedStatus &&
      !["ACTIVE", "INVOICED", "CANCELLED"].includes(normalizedStatus)
    ) {
      return next(new AppError("Invalid visit status", 400));
    }

    const { startDate, endDate } = req.query;

    const startedAtFilter = {};
    if (startDate) {
      const from = new Date(startDate);
      if (isNaN(from))
        return next(new AppError("Invalid startDate format", 400));
      startedAtFilter.gte = from;
    }
    if (endDate) {
      const to = new Date(endDate);
      if (isNaN(to)) return next(new AppError("Invalid endDate format", 400));
      // include the full end day
      to.setHours(23, 59, 59, 999);
      startedAtFilter.lte = to;
    }

    const where = {
      branchId,
      ...(normalizedStatus ? { status: normalizedStatus } : {}),
      ...(Object.keys(startedAtFilter).length
        ? { startedAt: startedAtFilter }
        : {}),
    };

    const [branch, visits, total] = await Promise.all([
      prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true },
      }),
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
    const { branchId, customerId, startedAt, notes } = req.body;

    if (!branchId || !customerId) {
      return next(new AppError("branchId and customerId are required", 400));
    }

    const [branch, customer, latestVisit] = await Promise.all([
      prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true },
      }),
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

    if (!branch) return next(new AppError("Branch not found", 404));
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
        ...(notes ? { notes: String(notes) } : {}),
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
      success: true,
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

// Core close-visit logic, shared by PATCH /visits/close/:visitId and
// POST /invoices/create/:visitId (invoicing an ACTIVE visit closes it first).
// Ends active sessions, releases their resources, completes the visit's order,
// sums totals, applies discounts, upserts the Invoice, and marks the visit INVOICED.
export const closeVisitCore = async (
  visitId,
  { discountType, discountAmount } = {},
) => {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    select: {
      id: true,
      status: true,
      startedAt: true,
      branchId: true,
      customerId: true,
    },
  });

  if (!visit) throw new AppError("Visit not found", 404);
  if (visit.status !== "ACTIVE") {
    throw new AppError("Only ACTIVE visits can be closed", 400);
  }

  const manualDiscount = validateManualDiscount(discountType, discountAmount);
  const customerDiscount = await resolveCustomerDiscount(visit.customerId);

  const endedAt = new Date();

  // Auto-end any sessions that are still ACTIVE before calculating totals
  const activeSessions = await prisma.session.findMany({
    where: { visitId, status: "ACTIVE", deletedAt: null },
    select: {
      id: true,
      startedAt: true,
      components: {
        where: { endedAt: null },
        select: {
          id: true,
          resourceType: true,
          resourceId: true,
          branchId: true,
          priceType: true,
          unitPrice: true,
          quantity: true,
          gamesCount: true,
          startedAt: true,
        },
      },
    },
  });

  if (activeSessions.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const session of activeSessions) {
        let sessionTotal = 0;

        for (const comp of session.components) {
          const compDuration = calculateDurationMinutes(
            comp.startedAt,
            endedAt,
          );
          const compPrice = calculateComponentPrice({
            priceType: comp.priceType,
            unitPrice: comp.unitPrice,
            quantity: comp.quantity,
            gamesCount: comp.gamesCount,
            startedAt: comp.startedAt,
            endedAt,
          });

          await tx.sessionComponent.update({
            where: { id: comp.id },
            data: {
              endedAt,
              durationMinutes: compDuration,
              totalPrice: compPrice,
            },
          });

          await releaseResourceAvailability(tx, {
            resourceType: comp.resourceType,
            resourceId: comp.resourceId,
            branchId: comp.branchId,
          });

          sessionTotal = roundMoney(sessionTotal + compPrice);
        }

        const sessionDuration = calculateDurationMinutes(
          session.startedAt,
          endedAt,
        );
        await tx.session.update({
          where: { id: session.id },
          data: {
            status: "ENDED",
            endedAt,
            durationMinutes: sessionDuration,
            totalPrice: sessionTotal,
          },
        });
      }
    });
  }

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
  const orderTotal = Number(orderTotals._sum.totalPrice ?? 0);
  const rawTotal =
    Math.round((sessionTotal + orderTotal + Number.EPSILON) * 100) / 100;

  const afterCustomerDiscount = applyDiscount(
    rawTotal,
    customerDiscount.type,
    customerDiscount.amount,
  );
  const finalAmount = applyDiscount(
    afterCustomerDiscount,
    manualDiscount.type,
    manualDiscount.amount,
  );

  const fallbackDuration = Math.max(
    0,
    Math.round((endedAt.getTime() - visit.startedAt.getTime()) / 60000),
  );
  const durationMinutes =
    sessionTotals._sum.durationMinutes ?? fallbackDuration;

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.visit.updateMany({
      where: { id: visitId, status: "ACTIVE" },
      data: {
        endedAt,
        status: "INVOICED",
        durationMinutes,
        totalPrice: rawTotal,
      },
    });

    if (updated.count === 0)
      throw new AppError("Visit is no longer ACTIVE", 409);

    await tx.order.updateMany({
      where: { visitId, status: { in: ["OPEN", "COMPLETED"] } },
      data: { status: "INVOICED" },
    });

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

  return result;
};

export const closeVisit = async (req, res, next) => {
  try {
    const { visitId } = req.params;
    if (!visitId) return next(new AppError("Visit ID is required", 400));

    const { discountType, discountAmount } = req.body ?? {};

    const result = await closeVisitCore(visitId, {
      discountType,
      discountAmount,
    });

    res.status(200).json({
      success: true,
      message: "Visit closed and invoice created",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const CANCEL_WINDOW_MINUTES = 15;

export const cancelVisit = async (req, res, next) => {
  try {
    const { visitId } = req.params;
    if (!visitId) return next(new AppError("Visit ID is required", 400));

    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
      select: {
        id: true,
        status: true,
        startedAt: true,
        branchId: true,
        _count: { select: { orders: true } },
      },
    });

    if (!visit) return next(new AppError("Visit not found", 404));
    if (visit.status !== "ACTIVE") {
      return next(new AppError("Only ACTIVE visits can be cancelled", 400));
    }

    const minutesElapsed =
      (Date.now() - new Date(visit.startedAt).getTime()) / 60000;
    if (minutesElapsed > CANCEL_WINDOW_MINUTES) {
      return next(
        new AppError(
          `Visit cannot be cancelled after ${CANCEL_WINDOW_MINUTES} minutes`,
          400,
        ),
      );
    }

    if (visit._count.orders > 0) {
      return next(new AppError("Cannot cancel a visit that has orders", 400));
    }

    const authUserId = req.user?.userId || req.user?.id;
    if (!authUserId)
      return next(new AppError("Cannot resolve user from token", 401));

    const cancelledAt = new Date();

    // Auto-cancel any active sessions and release their resources
    const activeSessions = await prisma.session.findMany({
      where: { visitId, status: "ACTIVE", deletedAt: null },
      select: {
        id: true,
        components: {
          select: {
            id: true,
            resourceType: true,
            resourceId: true,
            branchId: true,
          },
        },
      },
    });

    if (activeSessions.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const session of activeSessions) {
          for (const comp of session.components) {
            await tx.sessionComponent.update({
              where: { id: comp.id },
              data: { endedAt: cancelledAt, durationMinutes: 0, totalPrice: 0 },
            });
            await releaseResourceAvailability(tx, {
              resourceType: comp.resourceType,
              resourceId: comp.resourceId,
              branchId: comp.branchId,
            });
          }
          await tx.session.update({
            where: { id: session.id },
            data: {
              status: "CANCELLED",
              endedAt: cancelledAt,
              durationMinutes: 0,
              totalPrice: 0,
              canceledById: authUserId,
            },
          });
        }
      });
    }

    const result = await prisma.visit.update({
      where: { id: visitId },
      data: {
        status: "CANCELLED",
        endedAt: cancelledAt,
        cancelledAt,
        cancelledById: authUserId,
        totalPrice: 0,
      },
      select: visitSelect,
    });

    res.status(200).json({
      success: true,
      message: "Visit cancelled successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
