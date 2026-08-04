import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { redisClient } from "../configs/redis.js";
import {
  buildModeAvailability,
  buildModePricing,
  modeAppliesToDeviceType,
  normalizeGameModeCode,
} from "../utils/gameModeUtils.js";
import { resolveResourcePricing } from "../utils/resourceAvailability.js";

const VALID_SORT_FIELDS = [
  "code",
  "label",
  "players",
  "controllersRequired",
  "sortOrder",
  "isActive",
  "createdAt",
  "updatedAt",
];

const gameModeSelect = {
  id: true,
  branchId: true,
  code: true,
  label: true,
  labelAr: true,
  players: true,
  controllersRequired: true,
  controllerEquipmentId: true,
  controllerEquipment: {
    select: { id: true, name: true, type: true, price: true, priceType: true },
  },
  deviceTypes: true,
  sortOrder: true,
  isDefault: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

/**
 * Cache invalidation must never fail a write that already committed — a Redis
 * outage would otherwise turn a successful create into a 500 while the row sits
 * in the database. Mirrors the fail-open behaviour of the cache middleware.
 */
const invalidateGameModeCache = async (branchId, gameModeId) => {
  try {
    if (!redisClient.isReady) return;
    const keys = await redisClient.keys(`gameModes:branchId=${branchId}*`);
    if (gameModeId) keys.push(`gameMode:${gameModeId}`);
    if (keys.length > 0) await redisClient.del(keys);
  } catch (error) {
    console.error("Game mode cache invalidation failed:", error.message);
  }
};

// ─── Validation ──────────────────────────────────────────────────────────────

const parseIntInRange = (value, field, min, max) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new AppError(`${field} must be an integer between ${min} and ${max}`, 400);
  }
  return parsed;
};

const validateLabel = (label, field = "label") => {
  const trimmed = String(label ?? "").trim();
  if (!trimmed || trimmed.length > 40) {
    throw new AppError(`${field} is required and must be at most 40 characters`, 400);
  }
  return trimmed;
};

// Mirrors enum DeviceType in prisma/schema.prisma. Validated here so a bad
// value returns a readable 400 instead of leaking a raw Prisma error as a 500.
const DEVICE_TYPES = [
  "PC", "LAPTOP", "PS4_2", "PS4_4", "PS5_2", "PS5_4",
  "XBOX_ONE", "XBOX_SERIES_S", "XBOX_SERIES_X", "NINTENDO_SWITCH",
  "VR_HEADSET", "SIMULATOR", "TV", "PROJECTOR", "TABLET",
  "SMART_BOARD", "SOUND_SYSTEM", "CAMERA", "MICROPHONE", "OTHER",
];

const validateDeviceTypes = (deviceTypes) => {
  if (deviceTypes == null) return undefined;
  if (!Array.isArray(deviceTypes)) {
    throw new AppError("deviceTypes must be an array", 400);
  }

  const normalized = deviceTypes.map((t) => String(t).trim().toUpperCase());
  const invalid = normalized.filter((t) => !DEVICE_TYPES.includes(t));
  if (invalid.length > 0) {
    throw new AppError(
      `Invalid deviceTypes: ${invalid.join(", ")}. Allowed: ${DEVICE_TYPES.join(", ")}`,
      400,
    );
  }

  return [...new Set(normalized)];
};

/**
 * Resolve which controller row this mode draws from.
 *
 * A branch usually has several CONTROLLER rows, so pricing and the capacity
 * check need one deterministic target. When there is exactly one we pick it as
 * a convenience; when there are several the caller must say which.
 */
const resolveControllerEquipment = async (
  branchId,
  controllerEquipmentId,
  controllersRequired,
) => {
  if (controllersRequired === 0) return null;

  if (controllerEquipmentId) {
    const equipment = await prisma.equipment.findFirst({
      where: {
        id: controllerEquipmentId,
        branchId,
        type: "CONTROLLER",
        isActive: true,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!equipment) {
      throw new AppError(
        "controllerEquipmentId must reference an active CONTROLLER in this branch",
        400,
      );
    }
    return equipment.id;
  }

  const candidates = await prisma.equipment.findMany({
    where: { branchId, type: "CONTROLLER", isActive: true, isDeleted: false },
    select: { id: true },
    take: 2,
  });

  if (candidates.length === 0) {
    throw new AppError(
      "This branch has no active CONTROLLER equipment to draw from",
      400,
    );
  }
  if (candidates.length > 1) {
    throw new AppError(
      "Several CONTROLLER equipment rows exist — controllerEquipmentId is required",
      400,
    );
  }
  return candidates[0].id;
};

// ─── CREATE ──────────────────────────────────────────────────────────────────

export const createGameMode = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const {
      code,
      label,
      labelAr,
      players,
      controllersRequired,
      controllerEquipmentId,
      deviceTypes,
      sortOrder,
      isDefault,
      isActive,
    } = req.body ?? {};

    const normalizedCode = normalizeGameModeCode(code);
    const normalizedLabel = validateLabel(label);
    const normalizedPlayers = parseIntInRange(players, "players", 1, 16);
    const normalizedControllers =
      controllersRequired == null
        ? 0
        : parseIntInRange(controllersRequired, "controllersRequired", 0, 8);

    const resolvedEquipmentId = await resolveControllerEquipment(
      branchId,
      controllerEquipmentId,
      normalizedControllers,
    );

    const data = {
      branchId,
      code: normalizedCode,
      label: normalizedLabel,
      labelAr: labelAr ? validateLabel(labelAr, "labelAr") : null,
      players: normalizedPlayers,
      controllersRequired: normalizedControllers,
      controllerEquipmentId: resolvedEquipmentId,
      deviceTypes: validateDeviceTypes(deviceTypes) ?? [],
      sortOrder: sortOrder == null ? 0 : parseIntInRange(sortOrder, "sortOrder", 0, 999),
      isDefault: Boolean(isDefault),
      isActive: isActive == null ? true : Boolean(isActive),
    };

    const created = await prisma.$transaction(async (tx) => {
      // Only one default per branch.
      if (data.isDefault) {
        await tx.gameMode.updateMany({
          where: { branchId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.gameMode.create({ data, select: gameModeSelect });
    });

    await invalidateGameModeCache(branchId);

    res.status(201).json({
      success: true,
      message: "Game mode created successfully",
      data: created,
    });
  } catch (error) {
    if (error?.code === "P2002") {
      return next(
        new AppError("A game mode with this code already exists for this branch", 409),
      );
    }
    next(error);
  }
};

// ─── READ ────────────────────────────────────────────────────────────────────

export const getGameModesByBranchId = async (req, res, next) => {
  try {
    const { branchId } = req.params;

    // Parsed inline rather than via pagination(): that helper throws on any
    // sort field outside its own hardcoded list, which excludes every column
    // this resource sorts by. Same approach as controllers/equipment.js.
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const skip = (page - 1) * limit;
    const sort = VALID_SORT_FIELDS.includes(req.query.sort)
      ? req.query.sort
      : "sortOrder";
    const order = req.query.order === "asc" ? "asc" : "desc";

    const where = { branchId };
    if (req.query.isActive !== undefined) {
      where.isActive = String(req.query.isActive) === "true";
    }
    if (req.query.deviceType) {
      // An empty deviceTypes means "applies to every device type" — that's what
      // modeAppliesToDeviceType (and so the pricing endpoint) does. A bare
      // `has` filter excluded exactly those universal modes, so the list and
      // the pricing quote disagreed about which modes exist for a device.
      where.OR = [
        { deviceTypes: { has: String(req.query.deviceType).toUpperCase() } },
        { deviceTypes: { isEmpty: true } },
      ];
    }

    const [gameModes, total] = await prisma.$transaction([
      prisma.gameMode.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort]: order },
        select: gameModeSelect,
      }),
      prisma.gameMode.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: gameModes,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit), sort, order },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getGameModeById = async (req, res, next) => {
  try {
    const { branchId, gameModeId } = req.params;

    const gameMode = await prisma.gameMode.findUnique({
      where: { id: gameModeId },
      select: gameModeSelect,
    });
    if (!gameMode) return next(new AppError("Game mode not found", 404));
    // Consistent with update/delete: a mode fetched through another branch's
    // URL would otherwise be returned as if it belonged there.
    if (gameMode.branchId !== branchId) {
      return next(new AppError("Game mode does not belong to this branch", 400));
    }

    res.status(200).json({ success: true, data: gameMode, source: "database" });
  } catch (error) {
    next(error);
  }
};

// ─── UPDATE ──────────────────────────────────────────────────────────────────

const UPDATABLE_FIELDS = [
  "code",
  "label",
  "labelAr",
  "players",
  "controllersRequired",
  "controllerEquipmentId",
  "deviceTypes",
  "sortOrder",
  "isDefault",
  "isActive",
];

export const updateGameModeById = async (req, res, next) => {
  try {
    const { branchId, gameModeId } = req.params;
    const body = req.body ?? {};

    const invalidKeys = Object.keys(body).filter(
      (key) => !UPDATABLE_FIELDS.includes(key),
    );
    if (invalidKeys.length > 0) {
      return next(
        new AppError(
          `Invalid fields: ${invalidKeys.join(", ")}. Allowed: ${UPDATABLE_FIELDS.join(", ")}`,
          400,
        ),
      );
    }

    const existing = await prisma.gameMode.findUnique({
      where: { id: gameModeId },
      select: { id: true, branchId: true, controllersRequired: true, controllerEquipmentId: true },
    });
    if (!existing) return next(new AppError("Game mode not found", 404));
    if (existing.branchId !== branchId) {
      return next(new AppError("Game mode does not belong to this branch", 400));
    }

    const data = {};
    if (body.code !== undefined) data.code = normalizeGameModeCode(body.code);
    if (body.label !== undefined) data.label = validateLabel(body.label);
    if (body.labelAr !== undefined) {
      data.labelAr = body.labelAr ? validateLabel(body.labelAr, "labelAr") : null;
    }
    if (body.players !== undefined) {
      data.players = parseIntInRange(body.players, "players", 1, 16);
    }
    if (body.controllersRequired !== undefined) {
      data.controllersRequired = parseIntInRange(
        body.controllersRequired,
        "controllersRequired",
        0,
        8,
      );
    }
    if (body.deviceTypes !== undefined) {
      data.deviceTypes = validateDeviceTypes(body.deviceTypes);
    }
    if (body.sortOrder !== undefined) {
      data.sortOrder = parseIntInRange(body.sortOrder, "sortOrder", 0, 999);
    }
    if (body.isDefault !== undefined) data.isDefault = Boolean(body.isDefault);
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

    // Re-resolve the controller row whenever either side of the pair changes,
    // so the DB CHECK (controllers > 0 requires an equipment) can never trip.
    const nextControllers = data.controllersRequired ?? existing.controllersRequired;
    if (
      body.controllerEquipmentId !== undefined ||
      data.controllersRequired !== undefined
    ) {
      data.controllerEquipmentId = await resolveControllerEquipment(
        branchId,
        body.controllerEquipmentId ?? existing.controllerEquipmentId,
        nextControllers,
      );
    }

    if (Object.keys(data).length === 0) {
      return next(new AppError("No valid fields to update", 400));
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.gameMode.updateMany({
          where: { branchId, isDefault: true, id: { not: gameModeId } },
          data: { isDefault: false },
        });
      }
      return tx.gameMode.update({
        where: { id: gameModeId },
        data,
        select: gameModeSelect,
      });
    });

    await invalidateGameModeCache(branchId, gameModeId);

    res.status(200).json({
      success: true,
      message: "Game mode updated successfully",
      data: updated,
    });
  } catch (error) {
    if (error?.code === "P2002") {
      return next(
        new AppError("A game mode with this code already exists for this branch", 409),
      );
    }
    next(error);
  }
};

// ─── PRICING (what the frontend renders the switcher from) ───────────────────

/**
 * GET /game-modes/pricing/:branchId?deviceId= | ?unitId= | ?sessionId=
 *
 * Returns every mode for the branch with its computed price and whether it can
 * be switched to right now. Deliberately NOT cached — `availability` is live
 * inventory, and a cached entry would offer a mode that then 409s at the switch.
 */
export const getGameModePricing = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { deviceId, unitId, sessionId, resourceId, includeInactive } = req.query;

    const provided = [deviceId, unitId, sessionId].filter(Boolean);
    if (provided.length !== 1) {
      return next(
        new AppError("Provide exactly one of deviceId, unitId or sessionId", 400),
      );
    }

    // ── Resolve the device/unit these modes apply to ──────────────────────
    let resourceType;
    let targetResourceId;
    let currentComponent = null;

    if (sessionId) {
      const open = await prisma.sessionComponent.findMany({
        where: {
          sessionId,
          resourceType: { in: ["DEVICE", "UNIT"] },
          endedAt: null,
          ...(resourceId ? { resourceId } : {}),
        },
        select: {
          id: true,
          resourceType: true,
          resourceId: true,
          gameModeId: true,
          players: true,
          quantity: true,
        },
      });
      if (open.length === 0) {
        return next(new AppError("No active device or unit in this session", 400));
      }
      if (open.length > 1) {
        return next(
          new AppError(
            "Multiple active devices/units in this session — specify resourceId",
            400,
          ),
        );
      }
      currentComponent = open[0];
      resourceType = currentComponent.resourceType;
      targetResourceId = currentComponent.resourceId;
    } else {
      resourceType = deviceId ? "DEVICE" : "UNIT";
      targetResourceId = deviceId || unitId;
    }

    // Base rate — from the resource itself. PricingRule is intentionally not
    // consulted: a mode never changes the device's own rate.
    const pricing = await resolveResourcePricing({
      resourceType,
      resourceId: targetResourceId,
      branchId,
    });

    const resourceRow =
      resourceType === "DEVICE"
        ? await prisma.device.findFirst({
            where: { id: targetResourceId, branchId },
            select: { id: true, name: true, type: true },
          })
        : await prisma.unit.findFirst({
            where: { id: targetResourceId, branchId },
            select: { id: true, name: true, type: true },
          });

    const resource = {
      kind: resourceType,
      id: targetResourceId,
      name: resourceRow?.name ?? null,
      type: resourceRow?.type ?? null,
      priceType: pricing.priceType,
      price: pricing.price,
    };

    // ── Modes ─────────────────────────────────────────────────────────────
    const modes = await prisma.gameMode.findMany({
      where: {
        branchId,
        ...(String(includeInactive) === "true" ? {} : { isActive: true }),
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      select: gameModeSelect,
    });

    // ── Live controller inventory, one aggregate for every equipment on the
    //    page rather than a query per mode ──────────────────────────────────
    const equipmentIds = [
      ...new Set(modes.map((m) => m.controllerEquipmentId).filter(Boolean)),
    ];

    const [equipmentRows, usage, heldRows] = await Promise.all([
      equipmentIds.length
        ? prisma.equipment.findMany({
            where: { id: { in: equipmentIds } },
            select: {
              id: true,
              name: true,
              price: true,
              priceType: true,
              quantity: true,
              isActive: true,
              isDeleted: true,
            },
          })
        : [],
      equipmentIds.length
        ? prisma.sessionComponent.groupBy({
            by: ["resourceId"],
            where: {
              resourceType: "EQUIPMENT",
              resourceId: { in: equipmentIds },
              endedAt: null,
            },
            _sum: { quantity: true },
          })
        : [],
      // What THIS session already holds — those units are released back before
      // the new ones are reserved, so only the delta needs to be free.
      sessionId && equipmentIds.length
        ? prisma.sessionComponent.groupBy({
            by: ["resourceId"],
            where: {
              sessionId,
              resourceType: "EQUIPMENT",
              resourceId: { in: equipmentIds },
              endedAt: null,
              autoManaged: true,
            },
            _sum: { quantity: true },
          })
        : [],
    ]);

    const equipmentById = new Map(equipmentRows.map((e) => [e.id, e]));
    const inUseById = new Map(usage.map((u) => [u.resourceId, u._sum.quantity ?? 0]));
    const heldById = new Map(heldRows.map((h) => [h.resourceId, h._sum.quantity ?? 0]));

    const data = modes.map((mode) => {
      const raw = equipmentById.get(mode.controllerEquipmentId);
      const usable = raw && raw.isActive && !raw.isDeleted ? raw : null;
      const equipment = usable
        ? {
            id: usable.id,
            name: usable.name,
            priceType: usable.priceType,
            price: Number(usable.price),
          }
        : null;

      const isCurrent = Boolean(
        currentComponent && currentComponent.gameModeId === mode.id,
      );

      return {
        id: mode.id,
        code: mode.code,
        label: mode.label,
        labelAr: mode.labelAr,
        players: mode.players,
        controllersRequired: mode.controllersRequired,
        sortOrder: mode.sortOrder,
        isDefault: mode.isDefault,
        isActive: mode.isActive,
        isCurrent,
        pricing: buildModePricing({
          resource,
          controllerEquipment: equipment,
          controllersRequired: mode.controllersRequired,
        }),
        availability: buildModeAvailability({
          mode,
          controllerEquipment: equipment,
          freeControllers: usable
            ? Math.max(0, usable.quantity - (inUseById.get(usable.id) ?? 0))
            : 0,
          heldControllers: heldById.get(mode.controllerEquipmentId) ?? 0,
          isCurrent,
          deviceTypeMatches: modeAppliesToDeviceType(mode, resource.type),
        }),
      };
    });

    res.status(200).json({
      success: true,
      data: {
        branchId,
        currency: "EGP",
        resource,
        sessionId: sessionId ?? null,
        currentModeId: currentComponent?.gameModeId ?? null,
        currentModeCode:
          data.find((m) => m.isCurrent)?.code ?? null,
        modes: data,
      },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE ──────────────────────────────────────────────────────────────────

/**
 * Hard delete. Safe because SessionComponent snapshots players/modeLabel/
 * unitPrice at billing time and its gameModeId nulls out (onDelete: SetNull),
 * so historical bills stay intact. Owners who want to keep the row for history
 * should set isActive:false instead.
 */
export const deleteGameModeById = async (req, res, next) => {
  try {
    const { branchId, gameModeId } = req.params;

    const existing = await prisma.gameMode.findUnique({
      where: { id: gameModeId },
      select: { id: true, branchId: true },
    });
    if (!existing) return next(new AppError("Game mode not found", 404));
    if (existing.branchId !== branchId) {
      return next(new AppError("Game mode does not belong to this branch", 400));
    }

    await prisma.gameMode.delete({ where: { id: gameModeId } });
    await invalidateGameModeCache(branchId, gameModeId);

    res.status(200).json({
      success: true,
      message: "Game mode deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
