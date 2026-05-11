import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";
import {
  ensureCanStartVisit,
  ensureCanModifyAnything,
  ensureCanModifySession,
} from "../utils/visitStatusLock.js";

const VisitStatus = ["ACTIVE", "CLOSED", "INVOICED", "PAID"];

const visitSelect = {
  id: true,
  branchId: true,
  customerId: true,
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

export const getAllByBranchId = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }

    const { page, limit, skip, sort, order } = pagination(req);

    const normalizedStatus = req.query.status
      ? String(req.query.status).toUpperCase()
      : undefined;

    if (normalizedStatus && !VisitStatus.includes(normalizedStatus)) {
      return next(new AppError("Invalid visit status", 400));
    }

    const where = {
      branchId,
      ...(normalizedStatus ? { status: normalizedStatus } : {}),
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
        select: visitSelect,
      }),
      prisma.visit.count({ where }),
    ]);

    if (!branch) {
      return next(new AppError("Branch not found", 404));
    }

    res.status(200).json({
      success: true,
      data: visits,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
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

    if (!branch) {
      return next(new AppError("Branch not found", 404));
    }

    if (!customer) {
      return next(new AppError("Customer not found", 404));
    }

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
        status: true,
        startedAt: true,
        endedAt: true,
        durationMinutes: true,
        totalPrice: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Auto-link customer to branch; set firstVisitAt if not yet recorded
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

export const closeVisit = async (req, res, next) => {
  try {
    const { visitId } = req.params;
    if (!visitId) {
      return next(new AppError("Visit ID is required", 400));
    }

    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
      select: {
        id: true,
        status: true,
        startedAt: true,
        pricingMode: true,
        totalPrice: true,
      },
    });

    if (!visit) {
      return next(new AppError("Visit not found", 404));
    }

    ensureCanModifyAnything(visit.status);
    ensureCanModifySession(visit.status);

    if (visit.status !== "ACTIVE") {
      return next(new AppError("This Visit already closed", 400));
    }

    const endedAt = new Date();

    const [sessionTotals, orderTotals] = await Promise.all([
      prisma.session.aggregate({
        where: {
          visitId,
          deletedAt: null,
          status: {
            not: "CANCELLED",
          },
        },
        _sum: {
          totalPrice: true,
          durationMinutes: true,
        },
      }),
      prisma.order.aggregate({
        where: { visitId },
        _sum: { finalPrice: true },
      }),
    ]);

    const sessionTotal = Number(sessionTotals._sum.totalPrice ?? 0);
    const orderTotal = Number(orderTotals._sum.finalPrice ?? 0);
    const finalTotalPrice =
      Math.round((sessionTotal + orderTotal + Number.EPSILON) * 100) / 100;

    const fallbackDurationMinutes = Math.max(
      0,
      Math.round((endedAt.getTime() - visit.startedAt.getTime()) / 60000),
    );

    const finalDurationMinutes =
      sessionTotals._sum.durationMinutes ?? fallbackDurationMinutes;

    const updated = await prisma.visit.updateMany({
      where: {
        id: visitId,
        status: "ACTIVE",
      },
      data: {
        endedAt,
        status: "CLOSED",
        durationMinutes: finalDurationMinutes,
        totalPrice: finalTotalPrice,
      },
    });

    if (updated.count === 0) {
      return next(new AppError("This Visit already closed", 400));
    }

    const closedVisit = await prisma.visit.findUnique({
      where: { id: visitId },
    });

    res.status(200).json({
      status: "success",
      message:
        "Visit closed and total price calculated from sessions and orders",
      data: closedVisit,
    });
  } catch (error) {
    next(error);
  }
};

export const invoiceVisit = async (req, res, next) => {
  try {
    const { visitId } = req.params;
    if (!visitId) {
      return next(new AppError("Visit ID is required", 400));
    }

    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
      select: { id: true, status: true },
    });

    if (!visit) {
      return next(new AppError("Session not found", 404));
    }

    ensureCanModifyAnything(visit.status);

    if (visit.status === "INVOICED") {
      return next(new AppError("Visit is already INVOICED", 400));
    }

    if (visit.status !== "CLOSED") {
      return next(new AppError("Only CLOSED visits can be invoiced", 400));
    }

    const invoicedVisit = await prisma.$transaction(async (tx) => {
      const [visitWithAmount, orderTotals] = await Promise.all([
        tx.visit.findUnique({
          where: { id: visitId },
          select: { totalPrice: true },
        }),
        tx.order.aggregate({
          where: { visitId },
          _sum: { totalPrice: true },
        }),
      ]);

      const visitAmount = Number(visitWithAmount?.totalPrice ?? 0);
      const orderAmount = Number(orderTotals._sum.totalPrice ?? 0);
      const totalAmount =
        Math.round(
          ((visitAmount > 0 ? visitAmount : orderAmount) + Number.EPSILON) *
            100,
        ) / 100;

      await tx.invoice.upsert({
        where: { visitId },
        create: {
          visitId,
          totalAmount,
          status: "UNPAID",
        },
        update: {
          totalAmount,
          status: "UNPAID",
          paidAt: null,
        },
      });

      return tx.visit.update({
        where: { id: visitId },
        data: { status: "INVOICED" },
      });
    });

    res.status(200).json({
      status: "success",
      message: "Visit marked as INVOICED",
      data: invoicedVisit,
    });
  } catch (error) {
    next(error);
  }
};

export const payVisit = async (req, res, next) => {
  try {
    const { visitId } = req.params;
    if (!visitId) {
      return next(new AppError("Visit ID is required", 400));
    }

    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
      select: { id: true, status: true },
    });

    if (!visit) {
      return next(new AppError("Session not found", 404));
    }

    ensureCanModifyAnything(visit.status);

    if (visit.status !== "INVOICED") {
      return next(
        new AppError("Only INVOICED visits can be marked as PAID", 400),
      );
    }

    const paidVisit = await prisma.$transaction(async (tx) => {
      const [visitWithAmount, orderTotals] = await Promise.all([
        tx.visit.findUnique({
          where: { id: visitId },
          select: { totalPrice: true },
        }),
        tx.order.aggregate({
          where: { visitId },
          _sum: { totalPrice: true },
        }),
      ]);

      const visitAmount = Number(visitWithAmount?.totalPrice ?? 0);
      const orderAmount = Number(orderTotals._sum.totalPrice ?? 0);
      const totalAmount =
        Math.round(
          ((visitAmount > 0 ? visitAmount : orderAmount) + Number.EPSILON) *
            100,
        ) / 100;

      await tx.invoice.upsert({
        where: { visitId },
        create: {
          visitId,
          totalAmount,
          status: "PAID",
          paidAt: new Date(),
        },
        update: {
          totalAmount,
          status: "PAID",
          paidAt: new Date(),
        },
      });

      return tx.visit.update({
        where: { id: visitId },
        data: { status: "PAID" },
      });
    });

    res.status(200).json({
      status: "success",
      message: "Visit marked as PAID",
      data: paidVisit,
    });
  } catch (error) {
    next(error);
  }
};
