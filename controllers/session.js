import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import {
  calculateComponentPrice,
  calculateDurationMinutes,
  ensureSessionStatusTransition,
  getSessionQueryOptions,
  normalizeSessionResourceType,
  parseDate,
  parseMoney,
  roundMoney,
  serializeComponent,
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

// ─── Shapes ───────────────────────────────────────────────────────────────────

const sessionSelect = {
  id: true,
  branchId: true,
  visitId: true,
  bookingId: true,
  startedAt: true,
  endedAt: true,
  durationMinutes: true,
  totalPrice: true,
  currency: true,
  status: true,
  createdById: true,
  endedById: true,
  canceledById: true,
  deletedById: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
};

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
  players: true,
  modeLabel: true,
  startedAt: true,
  endedAt: true,
  durationMinutes: true,
  totalPrice: true,
  createdAt: true,
  updatedAt: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getSessionByIdOrThrow = async (sessionId) => {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, deletedAt: null },
    select: { ...sessionSelect, components: { select: componentSelect } },
  });
  if (!session) throw new AppError("Session not found", 404);
  return session;
};

const ensureBranchMatch = (actualBranchId, expectedBranchId) => {
  if (expectedBranchId && actualBranchId !== expectedBranchId) {
    throw new AppError("Session does not belong to this branch", 400);
  }
};

const resolveActorUserId = async (req) => {
  const authUserId = req.user?.userId || req.user?.id;
  if (!authUserId) throw new AppError("Cannot resolve user from token", 401);
  const user = await prisma.user.findUnique({
    where: { id: authUserId },
    select: { id: true },
  });
  if (!user) throw new AppError("Authenticated user not found", 401);
  return user.id;
};

// Build a SessionComponent data object from a raw component input.
const buildComponentData = async ({
  resourceType,
  resourceId,
  branchId,
  gamesCount,
  players,
  quantity,
  modeLabel,
  sessionId,
  startedAt,
}) => {
  const normalizedType = normalizeSessionResourceType(resourceType);

  await ensureResourceExists({
    resourceType: normalizedType,
    resourceId,
    branchId,
  });

  // players and the mode label only apply to the actual playable resource
  // (device/unit); ignore them for SPACE/EQUIPMENT.
  const isModeResource =
    normalizedType === "DEVICE" || normalizedType === "UNIT";
  const playersForPricing =
    isModeResource && players != null ? Number(players) : undefined;
  const explicitLabel =
    modeLabel != null && String(modeLabel).trim()
      ? String(modeLabel).trim()
      : null;

  const pricingRule = await resolvePricingRule({
    resourceType: normalizedType,
    resourceId,
    branchId,
    players: playersForPricing,
  });
  const resourcePricing = await resolveResourcePricing({
    resourceType: normalizedType,
    resourceId,
    branchId,
  });

  const priceType = pricingRule
    ? mapPricingRuleToPriceType(pricingRule)
    : resourcePricing.priceType;

  const unitPrice = pricingRule
    ? parseMoney(pricingRule.price, "pricingRule.price")
    : resourcePricing.price;

  return {
    normalizedType,
    pricingRuleId: pricingRule?.id ?? null,
    priceType,
    unitPrice,
    data: {
      branchId,
      sessionId,
      resourceType: normalizedType,
      resourceId,
      pricingRuleId: pricingRule?.id ?? null,
      priceType,
      unitPrice,
      quantity: quantity != null ? Math.max(1, Number(quantity)) : 1,
      gamesCount: gamesCount != null ? Number(gamesCount) : 0,
      players: playersForPricing ?? null,
      // Explicit label from the request wins; otherwise fall back to a matched
      // pricing rule's name (null when neither exists).
      modeLabel: isModeResource
        ? (explicitLabel ?? pricingRule?.name ?? null)
        : null,
      startedAt,
      totalPrice: 0,
    },
  };
};

// ─── Smart resource resolver ──────────────────────────────────────────────────

// Every device/unit session also charges its parent space, regardless of
// space type — PUBLIC and DESK are no longer free zones. Only the picked
// device/unit is added alongside it — never the other resources sharing
// the room.
const resolveSpaceForComponent = async (spaceId, branchId) => {
  if (!spaceId) return null;

  return prisma.space.findFirst({
    where: { id: spaceId, branchId, isActive: true },
    select: { id: true },
  });
};

const resolveComponentsFromDevice = async (deviceId, branchId, players, modeLabel) => {
  const device = await prisma.device.findFirst({
    where: { id: deviceId, branchId, isActive: true, isDeleted: false },
    select: { id: true, spaceId: true },
  });
  if (!device) throw new AppError("Device not found for this branch", 404);

  const space = await resolveSpaceForComponent(device.spaceId, branchId);
  if (!space) {
    return [{ resourceType: "DEVICE", resourceId: deviceId, players, modeLabel }];
  }

  return [
    { resourceType: "SPACE", resourceId: space.id },
    { resourceType: "DEVICE", resourceId: deviceId, players, modeLabel },
  ];
};

const resolveComponentsFromUnit = async (unitId, branchId, players, modeLabel) => {
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, branchId, isActive: true, isDeleted: false },
    select: { id: true, spaceId: true },
  });
  if (!unit) throw new AppError("Unit not found for this branch", 404);

  const space = await resolveSpaceForComponent(unit.spaceId, branchId);
  if (!space) {
    return [{ resourceType: "UNIT", resourceId: unitId, players, modeLabel }];
  }

  return [
    { resourceType: "SPACE", resourceId: space.id },
    { resourceType: "UNIT", resourceId: unitId, players, modeLabel },
  ];
};

const resolveComponentsFromSpace = async (spaceId, branchId) => {
  const space = await prisma.space.findFirst({
    where: { id: spaceId, branchId, isActive: true },
    select: { id: true },
  });
  if (!space) throw new AppError("Space not found for this branch", 404);

  return [{ resourceType: "SPACE", resourceId: space.id }];
};

// ─── Controllers ──────────────────────────────────────────────────────────────

export const createSession = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const {
      visitId,
      bookingId,
      startedAt,
      deviceId,
      unitId,
      spaceId,
      components,
      players,
      modeLabel,
    } = req.body ?? {};

    if (!branchId || !visitId) {
      return next(new AppError("branchId and visitId are required", 400));
    }

    const smartIds = [deviceId, unitId, spaceId].filter(Boolean);
    const hasManual = Array.isArray(components) && components.length > 0;

    if (smartIds.length === 0 && !hasManual) {
      return next(
        new AppError(
          "Provide deviceId, unitId, spaceId, or a non-empty components array",
          400,
        ),
      );
    }
    if (smartIds.length > 1) {
      return next(
        new AppError("Provide only one of deviceId, unitId, or spaceId", 400),
      );
    }
    if (smartIds.length > 0 && hasManual) {
      return next(
        new AppError(
          "Provide either deviceId/unitId/spaceId or components, not both",
          400,
        ),
      );
    }

    const [branch, visit] = await Promise.all([
      prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true },
      }),
      prisma.visit.findUnique({
        where: { id: visitId },
        select: { id: true, branchId: true, status: true, customerId: true },
      }),
    ]);

    if (!branch) return next(new AppError("Branch not found", 404));
    if (!visit) return next(new AppError("Visit not found", 404));
    if (visit.branchId !== branchId) {
      return next(new AppError("Visit does not belong to this branch", 400));
    }
    if (visit.status !== "ACTIVE") {
      return next(
        new AppError("Cannot add a session to a non-active visit", 400),
      );
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

    const sessionStartedAt = parseDate(startedAt, "startedAt") || new Date();
    const actorUserId = await resolveActorUserId(req);

    // Resolve the final component list — smart mode (device/unit) or manual array.
    let rawComponents;
    try {
      if (deviceId) {
        rawComponents = await resolveComponentsFromDevice(deviceId, branchId, players, modeLabel);
      } else if (unitId) {
        rawComponents = await resolveComponentsFromUnit(unitId, branchId, players, modeLabel);
      } else if (spaceId) {
        rawComponents = await resolveComponentsFromSpace(spaceId, branchId);
      } else {
        rawComponents = components;
      }
    } catch (err) {
      return next(err);
    }

    // Validate and resolve pricing for every component before opening a transaction.
    const builtComponents = await Promise.all(
      rawComponents.map((c) =>
        buildComponentData({
          resourceType: c.resourceType,
          resourceId: c.resourceId,
          branchId,
          gamesCount: c.gamesCount,
          players: c.players,
          quantity: c.quantity,
          modeLabel: c.modeLabel,
          sessionId: null,
          startedAt: sessionStartedAt,
        }),
      ),
    );

    const session = await prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          branchId,
          visitId,
          bookingId: bookingId || null,
          startedAt: sessionStartedAt,
          totalPrice: 0,
          createdById: actorUserId,
        },
        select: sessionSelect,
      });

      for (const built of builtComponents) {
        await reserveResourceAvailability(tx, {
          resourceType: built.normalizedType,
          resourceId: built.data.resourceId,
          branchId,
          quantity: built.data.quantity,
        });
        await tx.sessionComponent.create({
          data: { ...built.data, sessionId: created.id },
        });
      }

      const sess = await tx.session.findFirst({
        where: { id: created.id },
        select: { ...sessionSelect, components: { select: componentSelect } },
      });

      if (!sess) return sess;

      // Collect resource ids by type
      const spaceIds = sess.components
        .filter((c) => c.resourceType === "SPACE")
        .map((c) => c.resourceId);
      const deviceIds = sess.components
        .filter((c) => c.resourceType === "DEVICE")
        .map((c) => c.resourceId);
      const unitIds = sess.components
        .filter((c) => c.resourceType === "UNIT")
        .map((c) => c.resourceId);

      const [spaces, devices, units] = await Promise.all([
        spaceIds.length
          ? tx.space.findMany({
              where: { id: { in: spaceIds } },
              select: { id: true, isBusy: true },
            })
          : [],
        deviceIds.length
          ? tx.device.findMany({
              where: { id: { in: deviceIds } },
              select: { id: true, isBusy: true },
            })
          : [],
        unitIds.length
          ? tx.unit.findMany({
              where: { id: { in: unitIds } },
              select: { id: true, isBusy: true },
            })
          : [],
      ]);

      const spaceMap = new Map(spaces.map((r) => [r.id, r.isBusy]));
      const deviceMap = new Map(devices.map((r) => [r.id, r.isBusy]));
      const unitMap = new Map(units.map((r) => [r.id, r.isBusy]));

      // Attach isBusy to each component
      const componentsWithStatus = sess.components.map((c) => ({
        ...c,
        isBusy:
          c.resourceType === "SPACE"
            ? !!spaceMap.get(c.resourceId)
            : c.resourceType === "DEVICE"
              ? !!deviceMap.get(c.resourceId)
              : c.resourceType === "UNIT"
                ? !!unitMap.get(c.resourceId)
                : false,
      }));

      return { ...sess, components: componentsWithStatus };
    });

    emitSpaceOverviewUpdate(branchId, {
      action: "SESSION_CREATED",
      sessionId: session?.id ?? null,
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

export const endSession = async (req, res, next) => {
  try {
    const { branchId, sessionId } = req.params;
    if (!sessionId) return next(new AppError("Session ID is required", 400));

    const existingSession = await getSessionByIdOrThrow(sessionId);
    ensureBranchMatch(existingSession.branchId, branchId);
    ensureSessionStatusTransition(existingSession.status, "ENDED");

    const actorUserId = await resolveActorUserId(req);
    const endedAt = new Date();

    const session = await prisma.$transaction(async (tx) => {
      let sessionTotal = 0;

      for (const comp of existingSession.components) {
        const compEndedAt = comp.endedAt || endedAt;
        const durationMinutes = calculateDurationMinutes(
          comp.startedAt,
          compEndedAt,
        );
        const totalPrice = calculateComponentPrice({
          priceType: comp.priceType,
          unitPrice: comp.unitPrice,
          quantity: comp.quantity,
          gamesCount: comp.gamesCount,
          startedAt: comp.startedAt,
          endedAt: compEndedAt,
        });

        await tx.sessionComponent.update({
          where: { id: comp.id },
          data: {
            endedAt: compEndedAt,
            durationMinutes,
            totalPrice,
          },
        });

        await releaseResourceAvailability(tx, {
          resourceType: comp.resourceType,
          resourceId: comp.resourceId,
          branchId: comp.branchId,
        });

        sessionTotal = roundMoney(sessionTotal + totalPrice);
      }

      const durationMinutes = calculateDurationMinutes(
        existingSession.startedAt,
        endedAt,
      );

      return tx.session.update({
        where: { id: sessionId },
        data: {
          status: "ENDED",
          endedAt,
          durationMinutes,
          totalPrice: sessionTotal,
          endedById: actorUserId,
        },
        select: { ...sessionSelect, components: { select: componentSelect } },
      });
    });

    emitSpaceOverviewUpdate(existingSession.branchId, {
      action: "SESSION_ENDED",
      sessionId,
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
    if (!sessionId) return next(new AppError("Session ID is required", 400));

    const existingSession = await getSessionByIdOrThrow(sessionId);
    ensureBranchMatch(existingSession.branchId, branchId);
    ensureSessionStatusTransition(existingSession.status, "CANCELLED");

    const actorUserId = await resolveActorUserId(req);
    const canceledAt = new Date();

    const session = await prisma.$transaction(async (tx) => {
      for (const comp of existingSession.components) {
        await tx.sessionComponent.update({
          where: { id: comp.id },
          data: { endedAt: canceledAt, durationMinutes: 0, totalPrice: 0 },
        });

        await releaseResourceAvailability(tx, {
          resourceType: comp.resourceType,
          resourceId: comp.resourceId,
          branchId: comp.branchId,
        });
      }

      return tx.session.update({
        where: { id: sessionId },
        data: {
          status: "CANCELLED",
          endedAt: canceledAt,
          durationMinutes: 0,
          totalPrice: 0,
          canceledById: actorUserId,
        },
        select: { ...sessionSelect, components: { select: componentSelect } },
      });
    });

    emitSpaceOverviewUpdate(existingSession.branchId, {
      action: "SESSION_CANCELLED",
      sessionId,
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

export const updateSessionById = async (req, res, next) => {
  try {
    const { branchId, sessionId } = req.params;
    if (!sessionId) return next(new AppError("Session ID is required", 400));

    const existingSession = await getSessionByIdOrThrow(sessionId);
    ensureBranchMatch(existingSession.branchId, branchId);

    const { bookingId, currency, startedAt } = req.body ?? {};
    const updateData = {};

    if (bookingId !== undefined) updateData.bookingId = bookingId || null;
    if (currency !== undefined) updateData.currency = currency || "EGP";
    if (startedAt !== undefined)
      updateData.startedAt = parseDate(startedAt, "startedAt");

    if (!Object.keys(updateData).length) {
      return next(new AppError("No valid fields to update", 400));
    }

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: updateData,
      select: { ...sessionSelect, components: { select: componentSelect } },
    });

    res.status(200).json({
      success: true,
      message: "Session updated successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteSessionById = async (req, res, next) => {
  try {
    const { branchId, sessionId } = req.params;
    if (!sessionId) return next(new AppError("Session ID is required", 400));

    const existingSession = await getSessionByIdOrThrow(sessionId);
    ensureBranchMatch(existingSession.branchId, branchId);
    const actorUserId = await resolveActorUserId(req);

    if (existingSession.status === "ACTIVE") {
      const cancelledAt = new Date();
      await prisma.$transaction(async (tx) => {
        for (const comp of existingSession.components) {
          if (!comp.endedAt) {
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
        }
      });
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: { deletedAt: new Date(), deletedById: actorUserId },
    });

    res
      .status(200)
      .json({ success: true, message: "Session deleted successfully" });
  } catch (error) {
    next(error);
  }
};

export const getSessionById = async (req, res, next) => {
  try {
    const { branchId, sessionId } = req.params;
    if (!sessionId) return next(new AppError("Session ID is required", 400));

    const session = await getSessionByIdOrThrow(sessionId);
    ensureBranchMatch(session.branchId, branchId);

    const data = {
      ...session,
      components: (session.components ?? []).map(serializeComponent),
    };

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getAllSessionsByBranchId = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    if (!branchId) return next(new AppError("branchId is required", 400));

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
        select: { ...sessionSelect, components: { select: componentSelect } },
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

export const getAllSessionByVisitId = async (req, res, next) => {
  try {
    const { branchId, visitId } = req.params;
    if (!visitId) return next(new AppError("Visit ID is required", 400));

    const sessions = await prisma.session.findMany({
      where: { visitId, branchId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { ...sessionSelect, components: { select: componentSelect } },
    });

    res.status(200).json({ success: true, data: sessions });
  } catch (error) {
    next(error);
  }
};
