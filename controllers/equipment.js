import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { compressAndUpload } from "../utils/cloudinary.js";
import { redisClient } from "../configs/redis.js";

const EQUIPMENT_TYPES = [
  "CONTROLLER",
  "HEADSET",
  "KEYBOARD",
  "MOUSE",
  "STEERING_WHEEL",
  "JOYSTICK",
  "FLIGHT_STICK",
  "PEDALS",
  "MICROPHONE",
  "WEBCAM",
  "PING_PONG",
  "BILLIARDO",
  "BOARD_GAME",
  "OTHER",
];

const PRICING_TYPES = ["PER_HOUR", "PER_SESSION", "PER_GAME"];

const VALID_SORT_FIELDS = [
  "name",
  "type",
  "price",
  "quantity",
  "isActive",
  "isBusy",
  "priceType",
  "createdAt",
  "updatedAt",
];

const fixType = (type) => {
  const upper = String(type).toUpperCase();
  if (!EQUIPMENT_TYPES.includes(upper))
    throw new AppError("Invalid equipment type", 400);
  return upper;
};

const fixPriceType = (priceType) => {
  const upper = String(priceType).toUpperCase();
  if (!PRICING_TYPES.includes(upper))
    throw new AppError("Invalid price type", 400);
  return upper;
};

const invalidateListCache = async (branchId) => {
  const keys = await redisClient.keys(`equipment:branchId=${branchId}*`);
  if (keys.length > 0) await redisClient.del(keys);
};

// ─── CREATE ──────────────────────────────────────────────────────────────────

export const createEquipment = async (req, res, next) => {
  try {
    const {
      branchId,
      name,
      type,
      customTypeLabel,
      priceType,
      price,
      quantity,
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

    const resolvedPriceType = fixPriceType(priceType || "PER_SESSION");
    const resolvedPrice = Number(price ?? 0);

    if (isNaN(resolvedPrice) || resolvedPrice < 0)
      return next(new AppError("price must be a valid number >= 0", 400));

    const resolvedQuantity = parseInt(quantity ?? 1);
    if (isNaN(resolvedQuantity) || resolvedQuantity < 1)
      return next(new AppError("quantity must be a positive integer", 400));

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });
    if (!branch) return next(new AppError("Branch not found", 404));

    const data = {
      branchId,
      name: trimmedName,
      type: fixedType,
      priceType: resolvedPriceType,
      price: resolvedPrice,
      quantity: resolvedQuantity,
      isBusy: isBusy !== undefined ? Boolean(isBusy) : false,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    };

    if (customTypeLabel) data.customTypeLabel = customTypeLabel;

    if (req.file?.buffer) {
      try {
        const uploaded = await compressAndUpload(
          req.file.buffer,
          `equipment/${branchId}`,
        );
        data.image = uploaded.secure_url || uploaded.url;
      } catch {
        return next(new AppError("Image upload failed", 500));
      }
    }

    const equipment = await prisma.equipment.create({ data });

    await invalidateListCache(branchId);

    res.status(201).json({
      success: true,
      message: "Equipment created successfully",
      data: equipment,
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET BY ID ────────────────────────────────────────────────────────────────

export const getEquipmentById = async (req, res, next) => {
  try {
    const { branchId, equipmentId } = req.params;

    if (!branchId) return next(new AppError("branchId is required", 400));
    if (!equipmentId) return next(new AppError("equipmentId is required", 400));

    const equipment = await prisma.equipment.findFirst({
      where: { id: equipmentId, branchId, isDeleted: false },
    });

    if (!equipment) return next(new AppError("Equipment not found", 404));

    res
      .status(200)
      .json({ success: true, data: equipment, source: "database" });
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

    if (req.query.type) {
      const type = String(req.query.type).toUpperCase();
      if (!EQUIPMENT_TYPES.includes(type))
        return next(new AppError("Invalid equipment type", 400));
      where.type = type;
    }

    if (req.query.isActive !== undefined)
      where.isActive = req.query.isActive === "true";
    if (req.query.isBusy !== undefined)
      where.isBusy = req.query.isBusy === "true";

    if (req.query.priceType) {
      const pt = String(req.query.priceType).toUpperCase();
      if (!PRICING_TYPES.includes(pt))
        return next(new AppError("Invalid price type", 400));
      where.priceType = pt;
    }

    if (req.query.name) {
      where.name = { contains: req.query.name, mode: "insensitive" };
    }

    if (req.query.priceMin || req.query.priceMax) {
      where.price = {};
      if (req.query.priceMin) where.price.gte = parseFloat(req.query.priceMin);
      if (req.query.priceMax) where.price.lte = parseFloat(req.query.priceMax);
    }

    if (req.query.quantityMin || req.query.quantityMax) {
      where.quantity = {};
      if (req.query.quantityMin)
        where.quantity.gte = parseInt(req.query.quantityMin);
      if (req.query.quantityMax)
        where.quantity.lte = parseInt(req.query.quantityMax);
    }

    const [equipmentList, total] = await prisma.$transaction([
      prisma.equipment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort]: order },
      }),
      prisma.equipment.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: equipmentList,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET BY TYPE ──────────────────────────────────────────────────────────────

export const getEquipmentByType = async (req, res, next) => {
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

    const equipmentList = await prisma.equipment.findMany({ where });

    res.status(200).json({ success: true, data: equipmentList });
  } catch (error) {
    next(error);
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────

export const updateEquipmentById = async (req, res, next) => {
  try {
    const { branchId, equipmentId } = req.params;
    if (!branchId) return next(new AppError("branchId is required", 400));
    if (!equipmentId) return next(new AppError("equipmentId is required", 400));

    const allowed = [
      "name",
      "type",
      "customTypeLabel",
      "priceType",
      "price",
      "quantity",
      "isBusy",
      "isActive",
    ];

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (!req.file && Object.keys(updates).length === 0)
      return next(new AppError("No valid fields to update", 400));

    const existing = await prisma.equipment.findFirst({
      where: { id: equipmentId, branchId, isDeleted: false },
    });
    if (!existing) return next(new AppError("Equipment not found", 404));

    if (updates.type) {
      updates.type = fixType(updates.type);
      const effectiveLabel =
        updates.customTypeLabel ?? existing.customTypeLabel ?? null;
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

    if (updates.quantity !== undefined) {
      updates.quantity = parseInt(updates.quantity);
      if (isNaN(updates.quantity) || updates.quantity < 1)
        return next(new AppError("quantity must be a positive integer", 400));
    }

    if (updates.isBusy !== undefined) updates.isBusy = Boolean(updates.isBusy);
    if (updates.isActive !== undefined)
      updates.isActive =
        updates.isActive === "false" ? false : Boolean(updates.isActive);

    if (req.file?.buffer) {
      try {
        const uploaded = await compressAndUpload(
          req.file.buffer,
          `equipment/${branchId}`,
        );
        updates.image = uploaded.secure_url || uploaded.url;
      } catch {
        return next(new AppError("Image upload failed", 500));
      }
    }

    const updated = await prisma.equipment.update({
      where: { id: equipmentId },
      data: updates,
    });

    await Promise.all([
      invalidateListCache(branchId),
      redisClient.del(`equipment:${equipmentId}`),
    ]);

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE BY ID ─────────────────────────────────────────────────────────────

export const deleteEquipmentById = async (req, res, next) => {
  try {
    const { branchId, equipmentId } = req.params;
    if (!branchId) return next(new AppError("branchId is required", 400));
    if (!equipmentId) return next(new AppError("equipmentId is required", 400));

    const equipment = await prisma.equipment.findFirst({
      where: { id: equipmentId, branchId, isDeleted: false },
    });
    if (!equipment) return next(new AppError("Equipment not found", 404));

    await prisma.equipment.update({
      where: { id: equipmentId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user.id,
      },
    });

    await Promise.all([
      invalidateListCache(branchId),
      redisClient.del(`equipment:${equipmentId}`),
    ]);

    res
      .status(200)
      .json({ success: true, message: "Equipment deleted successfully" });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE ALL BY BRANCH ─────────────────────────────────────────────────────

export const deleteEquipmentByBranchId = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    if (!branchId) return next(new AppError("branchId is required", 400));

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });
    if (!branch) return next(new AppError("Branch not found", 404));

    const result = await prisma.equipment.updateMany({
      where: { branchId, isDeleted: false },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user.id,
      },
    });

    if (result.count === 0)
      return next(new AppError("No equipment to delete for this branch", 404));

    await invalidateListCache(branchId);

    res.status(200).json({
      success: true,
      message: "Equipment deleted successfully",
      count: result.count,
    });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE ALL (DEVELOPER ONLY) ──────────────────────────────────────────────

export const deleteAllEquipment = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER")
      return next(
        new AppError("Only developers can delete all equipment", 403),
      );

    const result = await prisma.equipment.updateMany({
      where: { isDeleted: false },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user.id,
      },
    });

    if (result.count === 0)
      return next(new AppError("No equipment to delete", 404));

    res.status(200).json({
      success: true,
      message: "All equipment deleted successfully",
      count: result.count,
    });
  } catch (error) {
    next(error);
  }
};
