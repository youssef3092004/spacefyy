import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import {
  calculateComponentPrice,
  calculateDurationMinutes,
  normalizeSessionResourceType,
  parseDate,
  parseMoney,
  roundMoney,
} from "../utils/sessionUtils.js";
import {
  ensureResourceExists,
  mapPricingRuleToPriceType,
  releaseResourceAvailability,
  reserveResourceAvailability,
  resolvePricingRule,
  resolveResourcePricing,
} from "../utils/resourceAvailability.js";
import { emitSpaceOverviewUpdate } from "./webSocketSpaceOverView.js";

// ─── Shape ────────────────────────────────────────────────────────────────────

const componentSelect = {
  id: true,
  sessionId: true,
  branchId: true,
  resourceType: true,
  resourceId: true,
  pricingRuleId: true,
  priceType: true,
  unitPrice: true,
  quantity: true,
  gamesCount: true,
  startedAt: true,
  endedAt: true,
  durationMinutes: true,
  totalPrice: true,
  createdAt: true,
  updatedAt: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getComponentByIdOrThrow = async (componentId) => {
  const component = await prisma.sessionComponent.findUnique({
    where: { id: componentId },
    select: componentSelect,
  });
  if (!component) throw new AppError("Session component not found", 404);
  return component;
};

const getActiveSessionOrThrow = async (sessionId) => {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, deletedAt: null },
    select: { id: true, branchId: true, status: true },
  });
  if (!session) throw new AppError("Session not found", 404);
  if (session.status !== "ACTIVE") {
    throw new AppError("Cannot modify components on a non-active session", 400);
  }
  return session;
};

// Recalculate session.totalPrice from all its non-ended components + already-ended ones.
const recalculateSessionTotal = async (tx, sessionId) => {
  const components = await tx.sessionComponent.findMany({
    where: { sessionId },
    select: { totalPrice: true },
  });
  const total = components.reduce(
    (sum, c) => roundMoney(sum + Number(c.totalPrice)),
    0,
  );
  await tx.session.update({
    where: { id: sessionId },
    data: { totalPrice: total },
  });
  return total;
};

// ─── Controllers ──────────────────────────────────────────────────────────────

// POST /sessions/:branchId/:sessionId/components
export const addComponent = async (req, res, next) => {
  try {
    const { branchId, sessionId } = req.params;
    const { resourceType, resourceId, quantity, gamesCount, startedAt } =
      req.body ?? {};

    if (!resourceType || !resourceId) {
      return next(
        new AppError("resourceType and resourceId are required", 400),
      );
    }

    const normalizedType = normalizeSessionResourceType(resourceType);
    const session = await getActiveSessionOrThrow(sessionId);

    if (session.branchId !== branchId) {
      return next(new AppError("Session does not belong to this branch", 400));
    }

    await ensureResourceExists({
      resourceType: normalizedType,
      resourceId,
      branchId,
    });

    const qty = Math.max(1, Number(quantity) || 1);
    if (!Number.isInteger(qty) || qty <= 0) {
      return next(new AppError("quantity must be a positive integer", 400));
    }

    const games = gamesCount != null ? Number(gamesCount) : 0;
    const componentStartedAt = parseDate(startedAt, "startedAt") || new Date();

    const [pricingRule, resourcePricing] = await Promise.all([
      resolvePricingRule({
        resourceType: normalizedType,
        resourceId,
        branchId,
      }),
      resolveResourcePricing({
        resourceType: normalizedType,
        resourceId,
        branchId,
      }),
    ]);

    const priceType = pricingRule
      ? mapPricingRuleToPriceType(pricingRule)
      : resourcePricing.priceType;

    const unitPrice = pricingRule
      ? parseMoney(pricingRule.price, "pricingRule.price")
      : resourcePricing.price;

    const component = await prisma.$transaction(async (tx) => {
      await reserveResourceAvailability(tx, {
        resourceType: normalizedType,
        resourceId,
        branchId,
        quantity: qty,
      });

      const created = await tx.sessionComponent.create({
        data: {
          sessionId,
          branchId,
          resourceType: normalizedType,
          resourceId,
          pricingRuleId: pricingRule?.id ?? null,
          priceType,
          unitPrice,
          quantity: qty,
          gamesCount: games,
          startedAt: componentStartedAt,
          totalPrice: 0,
        },
        select: componentSelect,
      });

      return created;
    });

    emitSpaceOverviewUpdate(branchId, {
      action: "SESSION_COMPONENT_ADDED",
      resourceType: normalizedType,
      resourceId,
    });

    res.status(201).json({
      success: true,
      message: "Component added to session",
      data: component,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /:branchId/end/:componentId
export const endComponent = async (req, res, next) => {
  try {
    const { branchId, componentId } = req.params;

    const component = await getComponentByIdOrThrow(componentId);

    if (component.branchId !== branchId) {
      return next(
        new AppError("Component does not belong to this branch", 400),
      );
    }
    if (component.endedAt) {
      return next(new AppError("Component is already ended", 400));
    }

    await getActiveSessionOrThrow(component.sessionId);

    const endedAt = parseDate(req.body?.endedAt, "endedAt") || new Date();

    if (endedAt <= new Date(component.startedAt)) {
      return next(new AppError("endedAt must be after the component startedAt", 400));
    }
    const durationMinutes = calculateDurationMinutes(
      component.startedAt,
      endedAt,
    );
    const totalPrice = calculateComponentPrice({
      priceType: component.priceType,
      unitPrice: component.unitPrice,
      quantity: component.quantity,
      gamesCount: component.gamesCount,
      startedAt: component.startedAt,
      endedAt,
    });

    const { updated, autoEndedEquipment } = await prisma.$transaction(async (tx) => {
      const result = await tx.sessionComponent.update({
        where: { id: componentId },
        data: { endedAt, durationMinutes, totalPrice },
        select: componentSelect,
      });

      await releaseResourceAvailability(tx, {
        resourceType: component.resourceType,
        resourceId: component.resourceId,
        branchId: component.branchId,
      });

      // When a DEVICE or UNIT ends, auto-end EQUIPMENT only if no other DEVICE/UNIT is still active
      const autoEnded = [];
      if (component.resourceType === "DEVICE" || component.resourceType === "UNIT") {
        const remainingActive = await tx.sessionComponent.count({
          where: {
            sessionId: component.sessionId,
            resourceType: { in: ["DEVICE", "UNIT"] },
            endedAt: null,
          },
        });

        if (remainingActive > 0) {
          await recalculateSessionTotal(tx, component.sessionId);
          return { updated: result, autoEndedEquipment: [] };
        }

        const activeEquipment = await tx.sessionComponent.findMany({
          where: { sessionId: component.sessionId, resourceType: "EQUIPMENT", endedAt: null },
          select: componentSelect,
        });

        for (const eq of activeEquipment) {
          const eqEndedAt = endedAt < new Date(eq.startedAt) ? new Date(eq.startedAt) : endedAt;
          const eqDuration = calculateDurationMinutes(eq.startedAt, eqEndedAt);
          const eqPrice = calculateComponentPrice({
            priceType: eq.priceType,
            unitPrice: eq.unitPrice,
            quantity: eq.quantity,
            gamesCount: eq.gamesCount,
            startedAt: eq.startedAt,
            endedAt: eqEndedAt,
          });

          const ended = await tx.sessionComponent.update({
            where: { id: eq.id },
            data: { endedAt: eqEndedAt, durationMinutes: eqDuration, totalPrice: eqPrice },
            select: componentSelect,
          });

          await releaseResourceAvailability(tx, {
            resourceType: "EQUIPMENT",
            resourceId: eq.resourceId,
            branchId: eq.branchId,
          });

          autoEnded.push(ended);
        }
      }

      await recalculateSessionTotal(tx, component.sessionId);

      return { updated: result, autoEndedEquipment: autoEnded };
    });

    emitSpaceOverviewUpdate(component.branchId, {
      action: "SESSION_COMPONENT_ENDED",
      resourceType: component.resourceType,
      resourceId: component.resourceId,
    });

    res.status(200).json({
      success: true,
      message: "Component ended successfully",
      data: updated,
      ...(autoEndedEquipment.length > 0 && { autoEndedEquipment }),
    });
  } catch (error) {
    next(error);
  }
};

// GET /sessions/:branchId/:sessionId/components
export const getComponentsBySession = async (req, res, next) => {
  try {
    const { branchId, sessionId } = req.params;

    const session = await prisma.session.findFirst({
      where: { id: sessionId, branchId, deletedAt: null },
      select: { id: true },
    });
    if (!session) return next(new AppError("Session not found", 404));

    const components = await prisma.sessionComponent.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      select: componentSelect,
    });

    res.status(200).json({ success: true, data: components });
  } catch (error) {
    next(error);
  }
};
