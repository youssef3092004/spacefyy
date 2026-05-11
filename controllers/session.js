import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import {
  calculatePriceByType,
  calculateDurationMinutes,
  ensureSessionStatusTransition,
  getSessionQueryOptions,
  normalizeSessionPriceType,
  normalizeSessionResourceType,
  normalizeSessionStatus,
  parseDate,
  parseMoney,
} from "../utils/sessionUtils.js";

const sessionSelect = {
  id: true,
  branchId: true,
  visitId: true,
  bookingId: true,
  resourceType: true,
  resourceId: true,
  pricingRuleId: true,
  priceType: true,
  basePrice: true,
  gamesCount: true,
  unitPrice: true,
  totalPrice: true,
  currency: true,
  startedAt: true,
  endedAt: true,
  durationMinutes: true,
  status: true,
  createdById: true,
  endedById: true,
  canceledById: true,
  deletedById: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
};

const getSessionByIdOrThrow = async (sessionId) => {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, deletedAt: null },
    select: sessionSelect,
  });

  if (!session) {
    throw new AppError("Session not found", 404);
  }

  return session;
};

const ensureBranchMatch = (actualBranchId, expectedBranchId) => {
  if (expectedBranchId && actualBranchId !== expectedBranchId) {
    throw new AppError("Session does not belong to this branch", 400);
  }
};

const ensureResourceExists = async ({ resourceType, resourceId, branchId }) => {
  if (resourceType === "SPACE") {
    const space = await prisma.space.findFirst({
      where: { id: resourceId, branchId, isActive: true },
      select: { id: true },
    });
    if (!space) {
      throw new AppError("Space not found for this branch", 404);
    }
    return;
  }

  if (resourceType === "DEVICE") {
    const device = await prisma.device.findFirst({
      where: { id: resourceId, branchId, isActive: true },
      select: { id: true },
    });
    if (!device) {
      throw new AppError("Device not found for this branch", 404);
    }
    return;
  }

  if (resourceType === "UNIT") {
    const unit = await prisma.unit.findFirst({
      where: { id: resourceId, branchId, isActive: true, isDeleted: false },
      select: { id: true },
    });
    if (!unit) {
      throw new AppError("Unit not found for this branch", 404);
    }
    return;
  }

  if (resourceType === "EQUIPMENT") {
    const equipment = await prisma.equipment.findFirst({
      where: { id: resourceId, branchId, isActive: true, isDeleted: false },
      select: { id: true },
    });
    if (!equipment) {
      throw new AppError("Equipment not found for this branch", 404);
    }
  }
};

const reserveResourceAvailability = async (
  tx,
  { resourceType, resourceId, branchId },
) => {
  if (resourceType === "SPACE") {
    const updated = await tx.space.updateMany({
      where: {
        id: resourceId,
        branchId,
        isActive: true,
        availableNumber: { gt: 0 },
      },
      data: { availableNumber: { decrement: 1 } },
    });

    if (updated.count === 0) {
      throw new AppError("Space is not available", 400);
    }

    const space = await tx.space.findFirst({
      where: { id: resourceId, branchId },
      select: { availableNumber: true },
    });

    await tx.space.update({
      where: { id: resourceId },
      data: { isBusy: Number(space?.availableNumber || 0) <= 0 },
    });

    return;
  }

  if (resourceType === "DEVICE") {
    const updated = await tx.device.updateMany({
      where: {
        id: resourceId,
        branchId,
        isActive: true,
        isBusy: false,
      },
      data: { isBusy: true },
    });

    if (updated.count === 0) {
      throw new AppError("Device is not available", 400);
    }

    return;
  }

  if (resourceType === "UNIT") {
    const updated = await tx.unit.updateMany({
      where: {
        id: resourceId,
        branchId,
        isActive: true,
        isDeleted: false,
        isBusy: false,
      },
      data: { isBusy: true },
    });
    if (updated.count === 0) throw new AppError("Unit is not available", 400);
    return;
  }

  if (resourceType === "EQUIPMENT") {
    const updated = await tx.equipment.updateMany({
      where: {
        id: resourceId,
        branchId,
        isActive: true,
        isDeleted: false,
        isBusy: false,
      },
      data: { isBusy: true },
    });
    if (updated.count === 0)
      throw new AppError("Equipment is not available", 400);
  }
};

const releaseResourceAvailability = async (
  tx,
  { resourceType, resourceId, branchId },
) => {
  if (resourceType === "SPACE") {
    const space = await tx.space.findFirst({
      where: { id: resourceId, branchId },
      select: { id: true, availableNumber: true, capacity: true },
    });

    if (!space) {
      return;
    }

    const nextAvailableNumber = Math.min(
      space.capacity,
      space.availableNumber + 1,
    );

    await tx.space.update({
      where: { id: resourceId },
      data: {
        availableNumber: nextAvailableNumber,
        isBusy: nextAvailableNumber <= 0,
      },
    });

    return;
  }

  if (resourceType === "DEVICE") {
    await tx.device.updateMany({
      where: { id: resourceId, branchId },
      data: { isBusy: false },
    });

    return;
  }

  if (resourceType === "UNIT") {
    await tx.unit.updateMany({
      where: { id: resourceId, branchId, isDeleted: false },
      data: { isBusy: false },
    });
    return;
  }

  if (resourceType === "EQUIPMENT") {
    await tx.equipment.updateMany({
      where: { id: resourceId, branchId, isDeleted: false },
      data: { isBusy: false },
    });
  }
};

const mapPricingRuleToPriceType = (pricingRule) => {
  if (!pricingRule) {
    return "PER_HOUR";
  }

  if (pricingRule.pricingMode === "FIXED_PRICE") {
    return "PER_SESSION";
  }

  return normalizeSessionPriceType(pricingRule.pricingType, "PER_HOUR");
};

const calculateSessionPricing = ({
  priceType,
  amount,
  startedAt,
  endedAt,
  gamesCount = 1,
  amountFieldName = "basePrice",
}) => {
  const normalizedPriceType = normalizeSessionPriceType(priceType, "PER_HOUR");
  const parsedAmount = parseMoney(amount, amountFieldName);
  const parsedGamesCount = Number(gamesCount ?? 1);

  return {
    priceType: normalizedPriceType,
    unitPrice: parsedAmount,
    basePrice: parsedAmount,
    totalPrice: calculatePriceByType({
      priceType: normalizedPriceType,
      amount: parsedAmount,
      startedAt,
      endedAt,
      gamesCount: parsedGamesCount,
    }),
  };
};

const resolveResourcePricing = async ({
  resourceType,
  resourceId,
  branchId,
}) => {
  if (resourceType === "SPACE") {
    const space = await prisma.space.findFirst({
      where: { id: resourceId, branchId, isActive: true },
      select: { id: true, type: true, priceType: true, price: true },
    });

    if (!space) {
      throw new AppError("Space not found for this branch", 404);
    }

    return {
      priceType: normalizeSessionPriceType(space.priceType, "PER_HOUR"),
      price: parseMoney(space.price || 0, "space.price"),
    };
  }

  if (resourceType === "DEVICE") {
    const device = await prisma.device.findFirst({
      where: { id: resourceId, branchId, isActive: true },
      select: { id: true, priceType: true, price: true },
    });

    if (!device) {
      throw new AppError("Device not found for this branch", 404);
    }

    return {
      priceType: normalizeSessionPriceType(device.priceType, "PER_HOUR"),
      price: parseMoney(device.price || 0, "device.price"),
    };
  }

  if (resourceType === "UNIT") {
    const unit = await prisma.unit.findFirst({
      where: { id: resourceId, branchId, isActive: true, isDeleted: false },
      select: { id: true, priceType: true, price: true },
    });
    if (!unit) throw new AppError("Unit not found for this branch", 404);
    return {
      priceType: normalizeSessionPriceType(unit.priceType, "PER_HOUR"),
      price: parseMoney(unit.price || 0, "unit.price"),
    };
  }

  const equipment = await prisma.equipment.findFirst({
    where: { id: resourceId, branchId, isActive: true, isDeleted: false },
    select: { id: true, priceType: true, price: true },
  });
  if (!equipment)
    throw new AppError("Equipment not found for this branch", 404);
  return {
    priceType: normalizeSessionPriceType(equipment.priceType, "PER_SESSION"),
    price: parseMoney(equipment.price || 0, "equipment.price"),
  };
};

const resolveActorUserId = async (req) => {
  const authUserId = req.user?.userId || req.user?.id;
  if (!authUserId) {
    throw new AppError("Cannot resolve user from token", 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: authUserId },
    select: { id: true },
  });

  if (!user) {
    throw new AppError("Authenticated user not found", 401);
  }

  return user.id;
};

export const createSession = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const {
      visitId,
      bookingId,
      resourceType,
      resourceId,
      gamesCount,
      totalPrice,
      startedAt,
      endedAt,
      status,
    } = req.body;

    const requiredFields = {
      branchId,
      visitId,
      resourceType,
      resourceId,
    };

    for (const field in requiredFields) {
      if (!requiredFields[field]) {
        return next(new AppError(`${field} is required`, 400));
      }
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });
    if (!branch) {
      return next(new AppError("Branch not found", 404));
    }

    const normalizedResourceType = normalizeSessionResourceType(resourceType);
    const normalizedStatus = normalizeSessionStatus(status, "ACTIVE");
    const sessionStartedAt = parseDate(startedAt, "startedAt") || new Date();
    const sessionEndedAt = parseDate(endedAt, "endedAt");

    if (normalizedStatus === "ACTIVE" && sessionEndedAt) {
      return next(new AppError("Active session cannot have endedAt", 400));
    }

    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
      select: { id: true, branchId: true, status: true, customerId: true },
    });

    if (!visit) {
      return next(new AppError("Visit not found", 404));
    }

    if (visit.branchId !== branchId) {
      return next(new AppError("Visit does not belong to this branch", 400));
    }

    if (visit.customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: visit.customerId },
        select: { isBlocked: true, blockedReason: true },
      });
      if (customer?.isBlocked) {
        return next(
          new AppError(
            `Customer is blocked${customer.blockedReason ? `: ${customer.blockedReason}` : ""}`,
            403,
          ),
        );
      }
    }

    await ensureResourceExists({
      resourceType: normalizedResourceType,
      resourceId,
      branchId: visit.branchId,
    });

    const resourceFilter =
      normalizedResourceType === "SPACE"
        ? { spaceId: resourceId }
        : normalizedResourceType === "DEVICE"
          ? { deviceId: resourceId }
          : normalizedResourceType === "UNIT"
            ? { unitId: resourceId }
            : { equipmentId: resourceId };

    const pricingRule = await prisma.pricingRule.findFirst({
      where: {
        branchId: visit.branchId,
        isActive: true,
        ...resourceFilter,
      },
      orderBy: { priority: "desc" },
      select: {
        id: true,
        pricingMode: true,
        price: true,
        currency: true,
        pricingType: true,
      },
    });

    const actorUserId = await resolveActorUserId(req);

    const resolvedEndedAt =
      normalizedStatus === "ACTIVE" ? null : sessionEndedAt || new Date();

    const resolvedDuration = resolvedEndedAt
      ? calculateDurationMinutes(sessionStartedAt, resolvedEndedAt)
      : null;
    const parsedGamesCount = gamesCount === undefined ? 1 : Number(gamesCount);

    if (!Number.isInteger(parsedGamesCount) || parsedGamesCount <= 0) {
      return next(new AppError("gamesCount must be a positive integer", 400));
    }

    const baseResourcePricing = await resolveResourcePricing({
      resourceType: normalizedResourceType,
      resourceId,
      branchId: visit.branchId,
    });

    const computed = calculateSessionPricing(
      pricingRule
        ? {
            priceType: mapPricingRuleToPriceType(pricingRule),
            amount: pricingRule.price,
            amountFieldName: "pricingRule.price",
            startedAt: sessionStartedAt,
            endedAt: resolvedEndedAt,
            gamesCount: parsedGamesCount,
          }
        : {
            priceType: baseResourcePricing.priceType,
            amount: baseResourcePricing.price,
            startedAt: sessionStartedAt,
            endedAt: resolvedEndedAt,
            gamesCount: parsedGamesCount,
          },
    );

    if (totalPrice !== undefined) {
      computed.totalPrice = parseMoney(totalPrice, "totalPrice");
    }

    const session = await prisma.$transaction(async (tx) => {
      if (normalizedStatus === "ACTIVE") {
        await reserveResourceAvailability(tx, {
          resourceType: normalizedResourceType,
          resourceId,
          branchId,
        });
      }

      return tx.session.create({
        data: {
          visitId,
          bookingId: bookingId || null,
          branchId,
          resourceType: normalizedResourceType,
          resourceId,
          pricingRuleId: pricingRule?.id || null,
          priceType: pricingRule
            ? mapPricingRuleToPriceType(pricingRule)
            : baseResourcePricing.priceType,
          basePrice: computed.basePrice,
          gamesCount: parsedGamesCount,
          unitPrice: computed.unitPrice,
          totalPrice: computed.totalPrice,
          currency: pricingRule?.currency || "EGP",
          startedAt: sessionStartedAt,
          endedAt: resolvedEndedAt,
          durationMinutes: resolvedDuration,
          status: normalizedStatus,
          createdById: actorUserId,
        },
        select: sessionSelect,
      });
    });

    res.status(201).json({
      success: true,
      message: "Session created successfully",
      data: session,
    });
  } catch (error) {
    next(error);
  }
};

export const getSessionById = async (req, res, next) => {
  try {
    const { branchId, sessionId } = req.params;
    if (!sessionId) {
      return next(new AppError("Session ID is required", 400));
    }

    const session = await getSessionByIdOrThrow(sessionId);
    ensureBranchMatch(session.branchId, branchId);

    res.status(200).json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllSessionsByBranchId = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    if (!branchId) {
      return next(new AppError("branchId is required", 400));
    }

    const { page, limit, skip, sort, order, where } = getSessionQueryOptions({
      ...req.query,
      branchId,
    });

    const [sessions, total] = await prisma.$transaction([
      prisma.session.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort]: order },
        select: sessionSelect,
      }),
      prisma.session.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: sessions,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        sort,
        order,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateSessionById = async (req, res, next) => {
  try {
    const { branchId, sessionId } = req.params;
    if (!sessionId) {
      return next(new AppError("Session ID is required", 400));
    }

    const existingSession = await getSessionByIdOrThrow(sessionId);
    ensureBranchMatch(existingSession.branchId, branchId);

    const {
      bookingId,
      gamesCount,
      totalPrice,
      currency,
      startedAt,
      endedAt,
      status,
    } = req.body;

    const updateData = {};

    if (bookingId !== undefined) {
      updateData.bookingId = bookingId || null;
    }

    if (currency !== undefined) {
      updateData.currency = currency || "EGP";
    }

    if (startedAt !== undefined) {
      updateData.startedAt = parseDate(startedAt, "startedAt");
    }

    if (gamesCount !== undefined) {
      const parsedGamesCount = Number(gamesCount);
      if (!Number.isInteger(parsedGamesCount) || parsedGamesCount <= 0) {
        return next(new AppError("gamesCount must be a positive integer", 400));
      }
      updateData.gamesCount = parsedGamesCount;
    }

    if (endedAt !== undefined) {
      updateData.endedAt = parseDate(endedAt, "endedAt");
    }

    if (status !== undefined) {
      updateData.status = normalizeSessionStatus(status);
      ensureSessionStatusTransition(existingSession.status, updateData.status);
    }

    const effectiveStartedAt =
      updateData.startedAt || existingSession.startedAt;
    const effectiveEndedAt =
      updateData.endedAt !== undefined
        ? updateData.endedAt
        : existingSession.endedAt;

    if (
      (updateData.status === "ENDED" || updateData.status === "CANCELLED") &&
      !effectiveEndedAt
    ) {
      updateData.endedAt = new Date();
    }

    const finalEndedAt =
      updateData.endedAt !== undefined ? updateData.endedAt : effectiveEndedAt;

    if (updateData.status === "ACTIVE" && finalEndedAt) {
      return next(new AppError("Active session cannot have endedAt", 400));
    }

    if (finalEndedAt) {
      updateData.durationMinutes = calculateDurationMinutes(
        effectiveStartedAt,
        finalEndedAt,
      );
    }

    const computed = calculateSessionPricing({
      priceType: existingSession.priceType,
      amount: existingSession.basePrice || 0,
      startedAt: effectiveStartedAt,
      endedAt: finalEndedAt,
      gamesCount: updateData.gamesCount ?? existingSession.gamesCount ?? 1,
    });

    if (totalPrice !== undefined) {
      updateData.totalPrice = parseMoney(totalPrice, "totalPrice");
    } else if (
      updateData.endedAt !== undefined ||
      updateData.status !== undefined ||
      updateData.gamesCount !== undefined
    ) {
      updateData.totalPrice = computed.totalPrice;
      updateData.unitPrice = computed.unitPrice;
    }

    if (!Object.keys(updateData).length) {
      return next(new AppError("No valid fields to update", 400));
    }

    const nextStatus = updateData.status || existingSession.status;
    const shouldReleaseAvailability =
      existingSession.status === "ACTIVE" &&
      (nextStatus === "ENDED" || nextStatus === "CANCELLED");

    const updatedSession = await prisma.$transaction(async (tx) => {
      const updated = await tx.session.update({
        where: { id: sessionId },
        data: updateData,
        select: sessionSelect,
      });

      if (shouldReleaseAvailability) {
        await releaseResourceAvailability(tx, {
          resourceType: existingSession.resourceType,
          resourceId: existingSession.resourceId,
          branchId: existingSession.branchId,
        });
      }

      return updated;
    });

    res.status(200).json({
      success: true,
      message: "Session updated successfully",
      data: updatedSession,
    });
  } catch (error) {
    next(error);
  }
};

export const endSession = async (req, res, next) => {
  try {
    const { branchId, sessionId } = req.params;
    if (!sessionId) {
      return next(new AppError("Session ID is required", 400));
    }

    const existingSession = await getSessionByIdOrThrow(sessionId);
    ensureBranchMatch(existingSession.branchId, branchId);
    const actorUserId = await resolveActorUserId(req);
    ensureSessionStatusTransition(existingSession.status, "ENDED");

    const endedAt = new Date();
    const durationMinutes = calculateDurationMinutes(
      existingSession.startedAt,
      endedAt,
    );

    const computed = calculateSessionPricing({
      priceType: existingSession.priceType,
      amount: existingSession.basePrice || 0,
      startedAt: existingSession.startedAt,
      endedAt,
      gamesCount: existingSession.gamesCount ?? 1,
    });

    const session = await prisma.$transaction(async (tx) => {
      const endedSession = await tx.session.update({
        where: { id: sessionId },
        data: {
          status: "ENDED",
          endedAt,
          durationMinutes,
          gamesCount: existingSession.gamesCount ?? 1,
          unitPrice: computed.unitPrice,
          totalPrice: computed.totalPrice,
          endedById: actorUserId,
        },
        select: sessionSelect,
      });

      await releaseResourceAvailability(tx, {
        resourceType: existingSession.resourceType,
        resourceId: existingSession.resourceId,
        branchId: existingSession.branchId,
      });

      return endedSession;
    });

    res.status(200).json({
      success: true,
      message: "Session ended successfully",
      data: session,
    });
  } catch (error) {
    next(error);
  }
};

export const cancelSession = async (req, res, next) => {
  try {
    const { branchId, sessionId } = req.params;
    if (!sessionId) {
      return next(new AppError("Session ID is required", 400));
    }

    const existingSession = await getSessionByIdOrThrow(sessionId);
    ensureBranchMatch(existingSession.branchId, branchId);
    const actorUserId = await resolveActorUserId(req);
    ensureSessionStatusTransition(existingSession.status, "CANCELLED");

    const session = await prisma.$transaction(async (tx) => {
      const canceledSession = await tx.session.update({
        where: { id: sessionId },
        data: {
          status: "CANCELLED",
          endedAt: new Date(),
          durationMinutes: 0,
          totalPrice: 0,
          canceledById: actorUserId,
        },
        select: sessionSelect,
      });

      await releaseResourceAvailability(tx, {
        resourceType: existingSession.resourceType,
        resourceId: existingSession.resourceId,
        branchId: existingSession.branchId,
      });

      return canceledSession;
    });

    res.status(200).json({
      success: true,
      message: "Session cancelled successfully",
      data: session,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteSessionById = async (req, res, next) => {
  try {
    const { branchId, sessionId } = req.params;
    if (!sessionId) {
      return next(new AppError("Session ID is required", 400));
    }

    const existingSession = await getSessionByIdOrThrow(sessionId);
    ensureBranchMatch(existingSession.branchId, branchId);
    const actorUserId = await resolveActorUserId(req);

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        deletedAt: new Date(),
        deletedById: actorUserId,
      },
    });

    res.status(200).json({
      success: true,
      message: "Session deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const getAllSessionByVisitId = async (req, res, next) => {
  try {
    const { branchId, visitId } = req.params;
    if (!visitId) {
      return next(new AppError("Visit ID is required", 400));
    }
    const sessions = await prisma.session.findMany({
      where: { visitId, branchId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: sessionSelect,
    });

    res.status(200).json({
      success: true,
      data: sessions,
    });
  } catch (error) {
    next(error);
  }
};
