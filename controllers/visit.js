import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import {
  freezePricingAtSessionStart,
  freezePricingAtSessionClose,
} from "../utils/visitPricingSnapshot.js";
import {
  ensureCanStartVisit,
  ensureCanModifyAnything,
  ensureCanModifySession,
} from "../utils/visitStatusLock.js";

const resolveRuleBranchId = (pricingRule) => {
  return (
    pricingRule?.space?.branchId ||
    pricingRule?.device?.branchId ||
    pricingRule?.tool?.branchId ||
    null
  );
};

const resolveSingleTarget = ({ spaceId, deviceId, toolId }) => {
  const targets = [
    { field: "spaceId", value: spaceId },
    { field: "deviceId", value: deviceId },
    { field: "toolId", value: toolId },
  ].filter((target) => Boolean(target.value));

  if (targets.length !== 1) {
    throw new AppError(
      "Exactly one target is required when resolving pricing rule (spaceId, deviceId, toolId)",
      400,
    );
  }

  return targets[0];
};

export const startVisit = async (req, res, next) => {
  try {
    const {
      branchId,
      customerId,
      pricingRuleId,
      spaceId,
      deviceId,
      toolId,
      startedAt,
    } = req.body;

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
        select: { id: true },
      }),
      prisma.visit.findFirst({
        where: {
          branchId,
          customerId,
        },
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

    let pricingRule;

    if (pricingRuleId) {
      pricingRule = await prisma.pricingRule.findUnique({
        where: { id: pricingRuleId },
        include: {
          space: { select: { branchId: true } },
          device: { select: { branchId: true } },
          tool: { select: { branchId: true } },
        },
      });
    } else {
      const target = resolveSingleTarget({ spaceId, deviceId, toolId });

      pricingRule = await prisma.pricingRule.findFirst({
        where: {
          isActive: true,
          [target.field]: target.value,
          ...(target.field === "spaceId" ? { space: { branchId } } : {}),
          ...(target.field === "deviceId" ? { device: { branchId } } : {}),
          ...(target.field === "toolId" ? { tool: { branchId } } : {}),
        },
        include: {
          space: { select: { branchId: true } },
          device: { select: { branchId: true } },
          tool: { select: { branchId: true } },
        },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      });
    }

    if (!pricingRule || !pricingRule.isActive) {
      return next(new AppError("Active pricing rule not found", 404));
    }

    const ruleBranchId = resolveRuleBranchId(pricingRule);
    if (!ruleBranchId || ruleBranchId !== branchId) {
      return next(
        new AppError(
          "Pricing rule does not belong to the specified branch",
          400,
        ),
      );
    }

    ensureCanStartVisit(latestVisit?.status);

    const frozenPricing = freezePricingAtSessionStart(pricingRule);

    const visit = await prisma.visit.create({
      data: {
        branchId,
        customerId,
        status: "ACTIVE",
        startedAt: startedAt ? new Date(startedAt) : new Date(),
        pricingRuleId: frozenPricing.pricingRuleId,
        pricingMode: frozenPricing.pricingMode,
        unitPrice: frozenPricing.unitPrice,
        totalPrice: frozenPricing.totalPrice,
      },
    });

    res.status(201).json({
      status: "success",
      message: "Visit started and pricing snapshot frozen",
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
        unitPrice: true,
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

    if (!visit.pricingMode || visit.unitPrice === null) {
      return next(
        new AppError(
          "Session pricing snapshot is missing; cannot close safely",
          400,
        ),
      );
    }

    const endedAt = new Date();
    const frozenClose = freezePricingAtSessionClose({
      startedAt: visit.startedAt,
      endedAt,
      pricingMode: visit.pricingMode,
      unitPrice: visit.unitPrice,
      existingTotalPrice: visit.totalPrice,
    });

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
        _sum: { totalPrice: true },
      }),
    ]);

    const sessionTotal = Number(
      sessionTotals._sum.totalPrice ?? frozenClose.totalPrice ?? 0,
    );
    const orderTotal = Number(orderTotals._sum.totalPrice ?? 0);
    const finalTotalPrice =
      Math.round((sessionTotal + orderTotal + Number.EPSILON) * 100) / 100;

    const finalDurationMinutes =
      sessionTotals._sum.durationMinutes ?? frozenClose.durationMinutes;

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
