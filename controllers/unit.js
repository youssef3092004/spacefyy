import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { compressAndUpload } from "../utils/cloudinary.js";
import { redisClient } from "../configs/redis.js";
import { invalidateSpaceCache } from "./spaceAvailability.js";

const UNIT_TYPES = [
  "TABLE_TENNIS_TABLE",
  "BILLIARD_TABLE",
  "GAMING_STATION",
  "MULTI_PURPOSE_TABLE",
  "DESK",
  "SEAT",
  "SIMULATOR_POD",
  "VR_POD",
  "MEETING_SEAT",
  "LOCKER",
  "OTHER",
];

const PRICING_TYPES = ["PER_HOUR", "PER_SESSION", "PER_GAME"];

const VALID_SORT_FIELDS = [
  "name",
  "type",
  "price",
  "isActive",
  "isBusy",
  "priceType",
  "createdAt",
  "updatedAt",
];

const fixType = (type) => {
  const upper = String(type).toUpperCase();
  if (!UNIT_TYPES.includes(upper)) throw new AppError("Invalid unit type", 400);
  return upper;
};

const fixPriceType = (priceType) => {
  const upper = String(priceType).toUpperCase();
  if (!PRICING_TYPES.includes(upper))
    throw new AppError("Invalid price type", 400);
  return upper;
};

const invalidateListCache = async (branchId) => {
  await invalidateSpaceCache(branchId);
  const keys = await redisClient.keys(`units:branchId=${branchId}*`);
  if (keys.length > 0) await redisClient.del(keys);
};

// ─── CREATE ──────────────────────────────────────────────────────────────────

export const createUnit = async (req, res, next) => {
  try {
    const {
      branchId,
      spaceId,
      name,
      type,
      customTypeLabel,
      priceType,
      price,
      isBusy,
      isActive,
    } = req.body;

    const trimmedName = typeof name === "string" ? name.trim() : name;

    if (!branchId) return next(new AppError("branchId is required", 400));
    if (!trimmedName) return next(new AppError("name is required", 400));
    if (!type) return next(new AppError("type is required", 400));

    const fixedType = fixType(type);

    if (fixedType === "OTHER" && !customTypeLabel)
      return next(
        new AppError("customTypeLabel is required when type is OTHER", 400),
      );

    if (fixedType !== "OTHER" && customTypeLabel)
      return next(
        new AppError("customTypeLabel can only be set when type is OTHER", 400),
      );

    const resolvedPriceType = fixPriceType(priceType || "PER_HOUR");
    const resolvedPrice = Number(price ?? 0);

    if (isNaN(resolvedPrice) || resolvedPrice < 0)
      return next(new AppError("price must be a valid number >= 0", 400));

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });
    if (!branch) return next(new AppError("Branch not found", 404));

    if (spaceId) {
      const space = await prisma.space.findFirst({
        where: { id: spaceId, branchId, isDeleted: false },
        select: { id: true },
      });
      if (!space)
        return next(
          new AppError(
            "Space not found or does not belong to this branch",
            404,
          ),
        );
    }

    const data = {
      branchId,
      name: trimmedName,
      type: fixedType,
      priceType: resolvedPriceType,
      price: resolvedPrice,
      isBusy: isBusy !== undefined ? Boolean(isBusy) : false,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    };

    if (spaceId) data.spaceId = spaceId;
    if (customTypeLabel) data.customTypeLabel = customTypeLabel;

    if (req.file?.buffer) {
      try {
        const uploaded = await compressAndUpload(
          req.file.buffer,
          `units/${branchId}`,
        );
        data.image = uploaded.secure_url || uploaded.url;
      } catch {
        return next(new AppError("Image upload failed", 500));
      }
    }

    const unit = await prisma.unit.create({ data });

    await invalidateListCache(branchId);

    res.status(201).json({
      success: true,
      message: "Unit created successfully",
      data: unit,
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET BY ID ────────────────────────────────────────────────────────────────

export const getUnitById = async (req, res, next) => {
  try {
    const { branchId, unitId } = req.params;

    if (!branchId) return next(new AppError("branchId is required", 400));
    if (!unitId) return next(new AppError("unitId is required", 400));

    const unit = await prisma.unit.findFirst({
      where: { id: unitId, branchId, isDeleted: false },
    });

    if (!unit) return next(new AppError("Unit not found", 404));

    res.status(200).json({ success: true, data: unit, source: "database" });
  } catch (error) {
    next(error);
  }
};

// ─── GET ALL BY BRANCH ────────────────────────────────────────────────────────

export const getAllByBranchId = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    if (!branchId) return next(new AppError("branchId is required", 400));

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });
    if (!branch) return next(new AppError("Branch not found", 404));

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const skip = (page - 1) * limit;
    const sort = VALID_SORT_FIELDS.includes(req.query.sort)
      ? req.query.sort
      : "createdAt";
    const order = req.query.order === "asc" ? "asc" : "desc";

    const where = { branchId, isDeleted: false };

    // Type filter
    if (req.query.type) {
      const type = String(req.query.type).toUpperCase();
      if (!UNIT_TYPES.includes(type))
        return next(new AppError("Invalid unit type", 400));
      where.type = type;
    }

    // Boolean filters
    if (req.query.isActive !== undefined)
      where.isActive = req.query.isActive === "true";
    if (req.query.isBusy !== undefined)
      where.isBusy = req.query.isBusy === "true";

    // PriceType filter
    if (req.query.priceType) {
      const pt = String(req.query.priceType).toUpperCase();
      if (!PRICING_TYPES.includes(pt))
        return next(new AppError("Invalid price type", 400));
      where.priceType = pt;
    }

    // SpaceId filter
    if (req.query.spaceId) where.spaceId = req.query.spaceId;

    // Name search (case-insensitive contains)
    if (req.query.name) {
      where.name = { contains: req.query.name, mode: "insensitive" };
    }

    // Price range filter
    if (req.query.priceMin || req.query.priceMax) {
      where.price = {};
      if (req.query.priceMin) where.price.gte = parseFloat(req.query.priceMin);
      if (req.query.priceMax) where.price.lte = parseFloat(req.query.priceMax);
    }

    const [units, total] = await prisma.$transaction([
      prisma.unit.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort]: order },
      }),
      prisma.unit.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: units,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET BY TYPE ──────────────────────────────────────────────────────────────

export const getUnitsByType = async (req, res, next) => {
  try {
    const { branchId, type } = req.params;
    if (!branchId) return next(new AppError("branchId is required", 400));

    const fixedType = fixType(type);

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });
    if (!branch) return next(new AppError("Branch not found", 404));

    const where = { branchId, type: fixedType, isDeleted: false };

    if (req.query.isActive !== undefined)
      where.isActive = req.query.isActive === "true";
    if (req.query.isBusy !== undefined)
      where.isBusy = req.query.isBusy === "true";
    if (req.query.priceType)
      where.priceType = String(req.query.priceType).toUpperCase();
    if (req.query.spaceId) where.spaceId = req.query.spaceId;

    const units = await prisma.unit.findMany({ where });

    res.status(200).json({ success: true, data: units });
  } catch (error) {
    next(error);
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────

export const updateUnitById = async (req, res, next) => {
  try {
    const { branchId, unitId } = req.params;
    if (!branchId) return next(new AppError("branchId is required", 400));
    if (!unitId) return next(new AppError("unitId is required", 400));

    const allowed = [
      "name",
      "type",
      "customTypeLabel",
      "spaceId",
      "priceType",
      "price",
      "isBusy",
      "isActive",
    ];

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (!req.file && Object.keys(updates).length === 0)
      return next(new AppError("No valid fields to update", 400));

    const unit = await prisma.unit.findFirst({
      where: { id: unitId, branchId, isDeleted: false },
    });
    if (!unit) return next(new AppError("Unit not found", 404));

    // Type validation
    if (updates.type) {
      updates.type = fixType(updates.type);
      const effectiveLabel =
        updates.customTypeLabel ?? unit.customTypeLabel ?? null;
      if (updates.type === "OTHER" && !effectiveLabel)
        return next(
          new AppError("customTypeLabel is required when type is OTHER", 400),
        );
      if (updates.type !== "OTHER" && updates.customTypeLabel)
        return next(
          new AppError(
            "customTypeLabel can only be set when type is OTHER",
            400,
          ),
        );
    }

    if (updates.name !== undefined) {
      updates.name = String(updates.name).trim();
      if (!updates.name) return next(new AppError("name cannot be empty", 400));
    }

    if (updates.priceType) updates.priceType = fixPriceType(updates.priceType);

    if (updates.price !== undefined) {
      updates.price = Number(updates.price);
      if (isNaN(updates.price) || updates.price < 0)
        return next(new AppError("price must be a valid number >= 0", 400));
    }

    if (updates.isBusy !== undefined)
      updates.isBusy =
        updates.isBusy === "false" ? false : Boolean(updates.isBusy);
    if (updates.isActive !== undefined)
      updates.isActive =
        updates.isActive === "false" ? false : Boolean(updates.isActive);

    // SpaceId validation
    if (updates.spaceId) {
      const space = await prisma.space.findFirst({
        where: { id: updates.spaceId, branchId, isDeleted: false },
        select: { id: true },
      });
      if (!space)
        return next(
          new AppError(
            "Space not found or does not belong to this branch",
            404,
          ),
        );
    }

    // Image upload
    if (req.file?.buffer) {
      try {
        const uploaded = await compressAndUpload(
          req.file.buffer,
          `units/${branchId}`,
        );
        updates.image = uploaded.secure_url || uploaded.url;
      } catch {
        return next(new AppError("Image upload failed", 500));
      }
    }

    const updated = await prisma.unit.update({
      where: { id: unitId },
      data: updates,
    });

    await Promise.all([
      invalidateListCache(branchId),
      redisClient.del(`unit:${unitId}`),
    ]);

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE BY ID ─────────────────────────────────────────────────────────────

export const deleteUnitById = async (req, res, next) => {
  try {
    const { branchId, unitId } = req.params;
    if (!branchId) return next(new AppError("branchId is required", 400));
    if (!unitId) return next(new AppError("unitId is required", 400));

    const unit = await prisma.unit.findFirst({
      where: { id: unitId, branchId, isDeleted: false },
    });
    if (!unit) return next(new AppError("Unit not found", 404));

    await prisma.unit.update({
      where: { id: unitId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user.id,
      },
    });

    await Promise.all([
      invalidateListCache(branchId),
      redisClient.del(`unit:${unitId}`),
    ]);

    res
      .status(200)
      .json({ success: true, message: "Unit deleted successfully" });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE ALL BY BRANCH ─────────────────────────────────────────────────────

export const deleteUnitsByBranchId = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    if (!branchId) return next(new AppError("branchId is required", 400));

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });
    if (!branch) return next(new AppError("Branch not found", 404));

    const result = await prisma.unit.updateMany({
      where: { branchId, isDeleted: false },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user.id,
      },
    });

    if (result.count === 0)
      return next(new AppError("No units to delete for this branch", 404));

    await invalidateListCache(branchId);

    res.status(200).json({
      success: true,
      message: "Units deleted successfully",
      count: result.count,
    });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE ALL (DEVELOPER ONLY) ──────────────────────────────────────────────

export const deleteAllUnits = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER")
      return next(new AppError("Only developers can delete all units", 403));

    const result = await prisma.unit.updateMany({
      where: { isDeleted: false },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user.id,
      },
    });

    if (result.count === 0)
      return next(new AppError("No units to delete", 404));

    res.status(200).json({
      success: true,
      message: "All units deleted successfully",
      count: result.count,
    });
  } catch (error) {
    next(error);
  }
};
