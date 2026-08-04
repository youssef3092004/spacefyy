import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import {
  assertGamesCountForPriceType,
  calculateComponentPrice,
  calculateDurationMinutes,
  normalizeSessionResourceType,
  parseDate,
  parseMoney,
  roundMoney,
  serializeComponent,
  SESSION_COMPONENT_SELECT,
} from "../utils/sessionUtils.js";
import {
  modeAppliesToDeviceType,
  syncAutoManagedControllers,
} from "../utils/gameModeUtils.js";
import {
  ensureResourceExists,
  mapPricingRuleToPriceType,
  releaseResourceAvailability,
  reserveResourceAvailability,
  resolvePricingRule,
  resolveResourcePricing,
} from "../utils/resourceAvailability.js";
import { emitSpaceOverviewUpdate } from "./webSocketSpaceOverView.js";
import { invalidateResourceCachesSafe } from "../utils/cacheInvalidation.js";

// ─── Shape ────────────────────────────────────────────────────────────────────

// Shared with the game-mode engine so the two cannot drift — this select must
// carry gameModeId and autoManaged for the mode switch to read them.
const componentSelect = SESSION_COMPONENT_SELECT;

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

    // Validate before coercing — Math.max(1, ...) used to silently turn -5 and
    // "abc" into 1, making the guard below unreachable.
    const qty = quantity == null ? 1 : Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      return next(new AppError("quantity must be a positive integer", 400));
    }

    const games = gamesCount != null ? Number(gamesCount) : 0;
    const componentStartedAt = parseDate(startedAt, "startedAt") || new Date();

    // Same trap as the session: endComponent requires endedAt > startedAt, so a
    // future start leaves the component impossible to close.
    if (componentStartedAt.getTime() > Date.now() + 60_000) {
      return next(new AppError("startedAt cannot be in the future", 400));
    }

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

    assertGamesCountForPriceType(priceType, games);

    const component = await prisma.$transaction(async (tx) => {
      // The status read above happened outside this transaction. If the session
      // was ended concurrently, an open component created here could never be
      // ended (endComponent refuses a non-ACTIVE session), so its resource
      // would stay reserved forever.
      const stillActive = await tx.session.findFirst({
        where: { id: sessionId, status: "ACTIVE", deletedAt: null },
        select: { id: true },
      });
      if (!stillActive) {
        throw new AppError("Session is no longer active", 409);
      }

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
    invalidateResourceCachesSafe(branchId, [
      { resourceType: normalizedType, resourceId },
    ]);

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
      // Guarded on endedAt: the check above ran outside this transaction, so
      // two concurrent calls would otherwise both release the resource.
      const claimed = await tx.sessionComponent.updateMany({
        where: { id: componentId, endedAt: null },
        data: { endedAt, durationMinutes, totalPrice },
      });

      if (claimed.count === 0) {
        throw new AppError("Component is already ended", 409);
      }

      const result = await tx.sessionComponent.findUnique({
        where: { id: componentId },
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
    invalidateResourceCachesSafe(component.branchId, [
      {
        resourceType: component.resourceType,
        resourceId: component.resourceId,
      },
      ...autoEndedEquipment,
    ]);

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

// PATCH /sessions/change-mode/:sessionId  (alias: /sessions/change-players/:sessionId)
//
// Switches the session's active device/unit to another GameMode — e.g. SGL
// (1v1) to DBL (2v2) — and brings the controllers along with it.
//
// The device's own rate never changes between modes; the extra cost of a bigger
// mode is entirely the controllers it requires, which this endpoint adds and
// removes automatically. PricingRule is deliberately not consulted.
//
// The physical device is NOT released/re-reserved during the swap, so nobody
// can book it mid-switch and there is no release/reserve race.
export const changeSessionMode = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const {
      gameModeId,
      modeCode,
      players,
      modeLabel,
      resourceId,
      switchedAt,
      gamesCount,
      allowOverbook,
    } = req.body ?? {};

    if (!gameModeId && !modeCode && players == null) {
      return next(
        new AppError("Provide one of gameModeId, modeCode or players", 400),
      );
    }

    const session = await getActiveSessionOrThrow(sessionId);

    // ── Resolve the target mode ───────────────────────────────────────────
    // gameModeId > modeCode > legacy players. The legacy path keeps the old
    // change-players contract working for clients that predate GameMode.
    let mode = null;
    if (gameModeId || modeCode) {
      mode = await prisma.gameMode.findFirst({
        where: {
          branchId: session.branchId,
          isActive: true,
          ...(gameModeId
            ? { id: gameModeId }
            : { code: String(modeCode).trim().toUpperCase() }),
        },
        select: {
          id: true,
          code: true,
          label: true,
          players: true,
          controllersRequired: true,
          controllerEquipmentId: true,
          deviceTypes: true,
        },
      });
      if (!mode) {
        return next(new AppError("Game mode not found for this branch", 404));
      }
    } else {
      const playersNum = Number(players);
      if (!Number.isInteger(playersNum) || playersNum <= 0) {
        return next(new AppError("players must be a positive integer", 400));
      }
      // Synthetic mode: relabel only, no controller management.
      mode = {
        id: null,
        code: null,
        label: null,
        players: playersNum,
        controllersRequired: 0,
        controllerEquipmentId: null,
      };
    }

    // ── Find the segment to switch ────────────────────────────────────────
    const activeSegments = await prisma.sessionComponent.findMany({
      where: {
        sessionId,
        resourceType: { in: ["DEVICE", "UNIT"] },
        endedAt: null,
        ...(resourceId ? { resourceId } : {}),
      },
      select: componentSelect,
    });

    if (activeSegments.length === 0) {
      return next(
        new AppError("No active device or unit to change the player mode for", 400),
      );
    }
    if (activeSegments.length > 1) {
      return next(
        new AppError(
          "Multiple active devices/units in this session — specify resourceId",
          400,
        ),
      );
    }

    const target = activeSegments[0];

    const alreadyInMode = mode.id
      ? target.gameModeId === mode.id
      : (target.players ?? null) === mode.players;
    if (alreadyInMode) {
      return next(new AppError("Session is already in this mode", 400));
    }

    // ── When ──────────────────────────────────────────────────────────────
    // Explicit switchedAt makes the flow testable and lets staff correct a late
    // entry; it must sit inside the current segment's window.
    const at = switchedAt ? parseDate(switchedAt, "switchedAt") : new Date();
    if (at <= new Date(target.startedAt)) {
      return next(
        new AppError("switchedAt must be after the current segment started", 400),
      );
    }
    if (at > new Date()) {
      return next(new AppError("switchedAt cannot be in the future", 400));
    }

    // ── Rates, straight from the resources ────────────────────────────────
    const devicePricing = await resolveResourcePricing({
      resourceType: target.resourceType,
      resourceId: target.resourceId,
      branchId: session.branchId,
    });

    // A mode restricted by deviceTypes must be rejected here, not just hidden
    // by the pricing endpoint — otherwise the API happily accepts a mode the
    // switcher deliberately greyed out.
    if (mode.id && mode.deviceTypes?.length > 0) {
      const resourceRow =
        target.resourceType === "DEVICE"
          ? await prisma.device.findUnique({
              where: { id: target.resourceId },
              select: { type: true },
            })
          : await prisma.unit.findUnique({
              where: { id: target.resourceId },
              select: { type: true },
            });

      if (!modeAppliesToDeviceType(mode, resourceRow?.type)) {
        return next(
          new AppError(
            `Game mode ${mode.code} does not apply to this ${target.resourceType.toLowerCase()}`,
            400,
            { typeError: "DEVICE_TYPE_MISMATCH" },
          ),
        );
      }
    }

    let equipment = null;
    if (mode.controllersRequired > 0) {
      const row = await prisma.equipment.findFirst({
        where: {
          id: mode.controllerEquipmentId,
          branchId: session.branchId,
          type: "CONTROLLER",
          isActive: true,
          isDeleted: false,
        },
        select: { id: true, name: true, price: true, priceType: true },
      });
      if (!row) {
        return next(
          new AppError(
            "This mode's controller equipment is missing or inactive",
            400,
            { typeError: "MODE_MISCONFIGURED" },
          ),
        );
      }
      equipment = { ...row, price: parseMoney(row.price, "equipment.price") };
    }

    const games = gamesCount == null ? 0 : Number(gamesCount);

    // Validate BEFORE creating anything. The old implementation wrote
    // gamesCount: 0 blindly and skipped this, producing a PER_GAME segment that
    // could never be priced and left the whole visit un-closeable.
    const willSegmentDevice = devicePricing.priceType === "PER_HOUR";
    if (willSegmentDevice) {
      assertGamesCountForPriceType(
        devicePricing.priceType,
        gamesCount == null ? target.gamesCount : games,
      );
    }
    if (equipment) {
      assertGamesCountForPriceType(equipment.priceType, games);
    }

    const label =
      (modeLabel != null && String(modeLabel).trim()
        ? String(modeLabel).trim()
        : null) ?? mode.label;

    // ── Apply ─────────────────────────────────────────────────────────────
    const result = await prisma.$transaction(async (tx) => {
      // Guarded claim: the open-check above ran outside this transaction.
      const claimed = await tx.sessionComponent.updateMany({
        where: { id: target.id, endedAt: null },
        data: willSegmentDevice
          ? {
              endedAt: at,
              durationMinutes: calculateDurationMinutes(target.startedAt, at),
              totalPrice: calculateComponentPrice({
                priceType: target.priceType,
                unitPrice: target.unitPrice,
                quantity: target.quantity,
                gamesCount: target.gamesCount,
                startedAt: target.startedAt,
                endedAt: at,
              }),
            }
          : // Flat-fee device: relabel in place. Segmenting would charge the
            // PER_SESSION fee twice, and a PER_GAME segment would restart the
            // game count.
            {
              players: mode.players,
              modeLabel: label,
              gameModeId: mode.id,
            },
      });

      if (claimed.count === 0) {
        throw new AppError("Session component is no longer active", 409);
      }

      let endedSegment = null;
      let newSegment = null;

      if (willSegmentDevice) {
        endedSegment = await tx.sessionComponent.findUnique({
          where: { id: target.id },
          select: componentSelect,
        });

        newSegment = await tx.sessionComponent.create({
          data: {
            sessionId,
            branchId: session.branchId,
            resourceType: target.resourceType,
            resourceId: target.resourceId,
            pricingRuleId: null,
            priceType: devicePricing.priceType,
            unitPrice: devicePricing.price,
            quantity: Math.max(1, target.quantity),
            gamesCount: gamesCount == null ? target.gamesCount : games,
            players: mode.players,
            modeLabel: label,
            gameModeId: mode.id,
            autoManaged: false, // the device is staff-owned, not engine-owned
            startedAt: at,
            totalPrice: 0,
          },
          select: componentSelect,
        });
      } else {
        newSegment = await tx.sessionComponent.findUnique({
          where: { id: target.id },
          select: componentSelect,
        });
      }

      // Controllers. Skipped entirely on the legacy players-only path, which
      // has no mode row and therefore no controller policy.
      const controllers = mode.id
        ? await syncAutoManagedControllers(tx, {
            session,
            mode,
            equipment,
            at,
            gamesCount: games,
            allowOverbook: allowOverbook === true,
          })
        : { ended: [], created: null };

      const sessionTotal = await recalculateSessionTotal(tx, sessionId);
      return { endedSegment, newSegment, controllers, sessionTotal };
    });

    // Side effects only after the transaction commits.
    emitSpaceOverviewUpdate(session.branchId, {
      action: "SESSION_MODE_CHANGED",
      sessionId,
      resourceId: target.resourceId,
      gameModeId: mode.id,
      modeCode: mode.code,
    });
    invalidateResourceCachesSafe(session.branchId, [
      { resourceType: target.resourceType, resourceId: target.resourceId },
      ...(equipment
        ? [{ resourceType: "EQUIPMENT", resourceId: equipment.id }]
        : []),
    ]);

    res.status(200).json({
      success: true,
      message: mode.code ? `Game mode changed to ${mode.code}` : "Player mode changed",
      data: {
        sessionId,
        switchedAt: at,
        mode: mode.id
          ? {
              id: mode.id,
              code: mode.code,
              label: mode.label,
              players: mode.players,
              controllersRequired: mode.controllersRequired,
            }
          : null,
        device: {
          endedSegment: result.endedSegment
            ? serializeComponent(result.endedSegment)
            : null,
          newSegment: serializeComponent(result.newSegment),
        },
        controllers: {
          ended: result.controllers.ended.map(serializeComponent),
          created: result.controllers.created
            ? serializeComponent(result.controllers.created)
            : null,
        },
        sessionTotal: result.sessionTotal,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Back-compat: the original route name still points at the same handler.
export const changeSessionPlayers = changeSessionMode;
