import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import {
  calculateDurationMinutes,
  calculateSessionTotal,
  ensureSessionStatusTransition,
  getSessionQueryOptions,
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

  if (resourceType === "TOOL") {
    const tool = await prisma.tool.findFirst({
      where: { id: resourceId, branchId, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (!tool) {
      throw new AppError("Tool not found for this branch", 404);
    }
  }
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
      select: { id: true, branchId: true, status: true },
    });

    if (!visit) {
      return next(new AppError("Visit not found", 404));
    }

    if (visit.branchId !== branchId) {
      return next(new AppError("Visit does not belong to this branch", 400));
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
          : { toolId: resourceId };

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
      },
    });

    if (!pricingRule) {
      return next(
        new AppError("Pricing rule not found for this resource", 404),
      );
    }

    const actorUserId = await resolveActorUserId(req);

    const resolvedUnitPrice = parseMoney(
      pricingRule.price,
      "pricingRule.price",
    );
    const resolvedTotalPrice = calculateSessionTotal({
      pricingMode: pricingRule.pricingMode,
      unitPrice: resolvedUnitPrice,
      startedAt: sessionStartedAt,
      endedAt:
        normalizedStatus === "ACTIVE" ? null : sessionEndedAt || new Date(),
      fallbackTotalPrice: totalPrice,
    });

    const resolvedEndedAt =
      normalizedStatus === "ACTIVE" ? null : sessionEndedAt || new Date();

    const resolvedDuration = resolvedEndedAt
      ? calculateDurationMinutes(sessionStartedAt, resolvedEndedAt)
      : null;

    const session = await prisma.session.create({
      data: {
        visitId,
        bookingId: bookingId || null,
        branchId,
        resourceType: normalizedResourceType,
        resourceId,
        pricingRuleId: pricingRule.id,
        unitPrice: resolvedUnitPrice,
        totalPrice: resolvedTotalPrice,
        currency: pricingRule.currency || "EGP",
        startedAt: sessionStartedAt,
        endedAt: resolvedEndedAt,
        durationMinutes: resolvedDuration,
        status: normalizedStatus,
        createdById: actorUserId,
      },
      select: sessionSelect,
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

    const linkedPricingRule = await prisma.pricingRule.findUnique({
      where: { id: existingSession.pricingRuleId },
      select: { pricingMode: true },
    });

    const { bookingId, totalPrice, currency, startedAt, endedAt, status } =
      req.body;

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
    const effectiveUnitPrice =
      updateData.unitPrice ?? Number(existingSession.unitPrice);

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

    if (totalPrice !== undefined) {
      updateData.totalPrice = parseMoney(totalPrice, "totalPrice");
    } else if (updateData.endedAt !== undefined) {
      updateData.totalPrice = calculateSessionTotal({
        pricingMode: linkedPricingRule?.pricingMode,
        unitPrice: effectiveUnitPrice,
        startedAt: effectiveStartedAt,
        endedAt: finalEndedAt,
        fallbackTotalPrice: existingSession.totalPrice,
      });
    }

    if (!Object.keys(updateData).length) {
      return next(new AppError("No valid fields to update", 400));
    }

    const updatedSession = await prisma.session.update({
      where: { id: sessionId },
      data: updateData,
      select: sessionSelect,
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
    const linkedPricingRule = await prisma.pricingRule.findUnique({
      where: { id: existingSession.pricingRuleId },
      select: { pricingMode: true },
    });
    ensureSessionStatusTransition(existingSession.status, "ENDED");

    const endedAt = new Date();
    const durationMinutes = calculateDurationMinutes(
      existingSession.startedAt,
      endedAt,
    );
    const totalPrice = calculateSessionTotal({
      pricingMode: linkedPricingRule?.pricingMode,
      unitPrice: existingSession.unitPrice,
      startedAt: existingSession.startedAt,
      endedAt,
      fallbackTotalPrice: existingSession.totalPrice,
    });

    const session = await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: "ENDED",
        endedAt,
        durationMinutes,
        totalPrice,
        endedById: actorUserId,
      },
      select: sessionSelect,
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

    const session = await prisma.session.update({
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
