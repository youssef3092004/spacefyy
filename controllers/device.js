import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";
import {
  incrementStorageUsage,
  decrementStorageUsage,
} from "../utils/storageUsage.js";
import { redisClient } from "../configs/redis.js";
import { compressAndUpload } from "../utils/cloudinary.js";
import { invalidateSpaceCache } from "./spaceAvailability.js";

const DeviceType = [
  "PC",
  "LAPTOP",
  "PS4_2",
  "PS4_4",
  "PS5_2",
  "PS5_4",
  "XBOX_ONE",
  "XBOX_SERIES_S",
  "XBOX_SERIES_X",
  "NINTENDO_SWITCH",
  "VR_HEADSET",
  "SIMULATOR",
  "TV",
  "PROJECTOR",
  "TABLET",
  "SMART_BOARD",
  "SOUND_SYSTEM",
  "CAMERA",
  "MICROPHONE",
  "OTHER",
];

const PricingType = ["PER_HOUR", "PER_SESSION", "PER_GAME"];

const parseBusyFilter = (value) => {
  if (value === undefined) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new AppError("isBusy must be true or false", 400);
};

const fixType = (type) => {
  if (!DeviceType.includes(String(type).toUpperCase())) {
    throw new AppError("Invalid device type", 400);
  }
  return (type = String(type).toUpperCase());
};

const fixPriceType = (priceType) => {
  if (!PricingType.includes(String(priceType).toUpperCase())) {
    throw new AppError("Invalid price type", 400);
  }
  return (priceType = String(priceType).toUpperCase());
};

export const createDevice = async (req, res, next) => {
  try {
    const {
      branchId,
      spaceId,
      name,
      type,
      customTypeLabel,
      priceType,
      pricingType,
      price,
      isBusy,
      isActive,
    } = req.body;
    const trimmedName = typeof name === "string" ? name.trim() : name;
    const requiredFields = {
      branchId,
      name: trimmedName,
      type,
    };
    for (const i in requiredFields) {
      if (!requiredFields[i]) {
        return next(
          new AppError(
            `${i.charAt(0).toUpperCase() + i.slice(1)} is required`,
            400,
          ),
        );
      }
    }
    const fixedType = fixType(type);

    if (customTypeLabel && fixedType !== "OTHER") {
      return next(
        new AppError("customTypeLabel can only be set when type is OTHER", 400),
      );
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { businessId: true },
    });
    if (!branch) {
      return next(new AppError("Branch not found", 404));
    }
    const businessId = branch.businessId;

    if (spaceId) {
      const space = await prisma.space.findUnique({ where: { id: spaceId } });
      if (!space) return next(new AppError("Space not found", 404));
      if (space.branchId !== branchId) {
        return next(new AppError("Space does not belong to this branch", 400));
      }
    }

    const { incrementStorage, newDevice } = await prisma.$transaction(
      async (tx) => {
        const resolvedPriceType = fixPriceType(
          pricingType || priceType || "PER_HOUR",
        );

        const deviceData = {
          branchId,
          name: trimmedName,
          type: fixedType,
          priceType: resolvedPriceType,
          isBusy: isBusy !== undefined ? Boolean(isBusy) : false,
          isActive: isActive !== undefined ? Boolean(isActive) : true,
          price: price !== undefined && price !== null ? Number(price) : 0,
        };

        if (spaceId) deviceData.spaceId = spaceId;

        if (req.file && req.file.buffer) {
          try {
            const uploaded = await compressAndUpload(
              req.file.buffer,
              `devices/${businessId}`,
            );
            deviceData.image = uploaded.secure_url || uploaded.url || null;
          } catch {
            throw new AppError("Image upload failed", 500);
          }
        }

        if (customTypeLabel) deviceData.customTypeLabel = customTypeLabel;

        const newDevice = await tx.device.create({
          data: deviceData,
        });

        const incrementStorage = await incrementStorageUsage(
          businessId,
          "devices",
          tx,
        );

        return { incrementStorage, newDevice };
      },
    );

    // Invalidate cache
    const keysToDelete = await redisClient.keys(
      `devices:branchId=${branchId}*`,
    );
    if (keysToDelete.length > 0) {
      await redisClient.del(keysToDelete);
    }

    res.status(201).json({
      success: true,
      message: "Device created successfully",
      data: newDevice,
      incrementStorage,
    });
  } catch (error) {
    next(error);
  }
};

export const getDeviceById = async (req, res, next) => {
  try {
    const { branchId, deviceId } = req.params;
    if (!deviceId) {
      return next(new AppError("Device ID is required", 400));
    }
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }
    const existingBranch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!existingBranch || existingBranch === 0) {
      return next(new AppError("Branch not found", 404));
    }
    const device = await prisma.device.findUnique({
      where: { id: deviceId, branchId: branchId },
    });
    if (!device || device === 0) {
      return next(new AppError("Device not found", 404));
    }
    res.status(200).json({ success: true, data: device });
  } catch (error) {
    next(error);
  }
};

export const getAllDevices = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(
        new AppError("Developers can only view devices in their branch", 403),
      );
    }
    const { page, limit, skip, order, sort } = pagination(req);
    const isBusy = parseBusyFilter(req.query.isBusy);
    const [devices, total] = await prisma.$transaction([
      prisma.device.findMany({
        skip: skip,
        take: limit,
        orderBy: { [sort]: order },
        where: { isBusy },
      }),
      prisma.device.count({ where: { isBusy } }),
    ]);
    const totalPages = Math.ceil(total / limit);
    res.status(200).json({
      success: true,
      data: devices,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getAllByBranchId = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { page, limit, skip, order, sort } = pagination(req);

    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }

    const existingBranch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!existingBranch) {
      return next(new AppError("Branch not found", 404));
    }

    // Build where clause with all searchable filters
    const whereClause = { branchId, isDeleted: false };

    // SpaceId filter
    if (req.query.spaceId) {
      whereClause.spaceId = req.query.spaceId;
    }

    // Type filter
    if (req.query.type) {
      whereClause.type = String(req.query.type).toUpperCase();
      if (!DeviceType.includes(whereClause.type)) {
        return next(new AppError("Invalid device type", 400));
      }
    }

    // IsActive filter
    if (req.query.isActive !== undefined) {
      whereClause.isActive = req.query.isActive === "true";
    }

    // IsBusy filter
    if (req.query.isBusy !== undefined) {
      whereClause.isBusy = req.query.isBusy === "true";
    }

    // PriceType filter
    if (req.query.priceType) {
      whereClause.priceType = String(req.query.priceType).toUpperCase();
    }

    // Price range filters
    if (req.query.priceMin || req.query.priceMax) {
      whereClause.price = {};
      if (req.query.priceMin) {
        whereClause.price.gte = parseFloat(req.query.priceMin);
      }
      if (req.query.priceMax) {
        whereClause.price.lte = parseFloat(req.query.priceMax);
      }
    }

    const [devices, total] = await prisma.$transaction([
      prisma.device.findMany({
        skip,
        take: limit,
        orderBy: { [sort]: order },
        where: whereClause,
      }),
      prisma.device.count({ where: whereClause }),
    ]);

    const totalPages = Math.ceil(total / limit);
    res.status(200).json({
      success: true,
      data: devices,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getDevicesByType = async (req, res, next) => {
  try {
    let { branchId, type } = req.params;
    if (!branchId || !type) {
      return next(new AppError("Branch ID and Device Type are required", 400));
    }

    type = String(type).toUpperCase();

    if (!DeviceType.includes(type)) {
      return next(new AppError("Invalid device type", 400));
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) {
      return next(new AppError("Branch not found", 404));
    }

    // Build where clause with filters
    const whereClause = { branchId, type, isDeleted: false };

    if (req.query.spaceId) {
      whereClause.spaceId = req.query.spaceId;
    }

    if (req.query.isActive !== undefined) {
      whereClause.isActive = req.query.isActive === "true";
    }

    if (req.query.isBusy !== undefined) {
      whereClause.isBusy = req.query.isBusy === "true";
    }

    if (req.query.priceType) {
      whereClause.priceType = String(req.query.priceType).toUpperCase();
    }

    const devices = await prisma.device.findMany({
      where: whereClause,
    });

    res.status(200).json({
      success: true,
      data: devices,
    });
  } catch (error) {
    next(error);
  }
};

export const updateDeviceById = async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const allowedUpdates = [
      "name",
      "type",
      "image",
      "customTypeLabel",
      "spaceId",
      "priceType",
      "price",
      "isBusy",
      "isActive",
    ];
    const updates = {};
    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (req.body.pricingType && !updates.priceType) {
      updates.priceType = req.body.pricingType;
    }
    if (!Object.keys(updates).length && !req.file) {
      return next(new AppError("No valid fields to update", 400));
    }
    if (updates.type) {
      updates.type = fixType(updates.type);
      if (!DeviceType.includes(updates.type)) {
        return next(new AppError("Invalid device type", 400));
      }
      if (updates.customTypeLabel && updates.type !== "OTHER") {
        return next(
          new AppError(
            "customTypeLabel can only be set when type is OTHER",
            400,
          ),
        );
      }
    }
    if (updates.name !== undefined) {
      updates.name = String(updates.name).trim();
      if (!updates.name) {
        return next(new AppError("Device name cannot be empty", 400));
      }
    }
    if (updates.isActive !== undefined) {
      updates.isActive =
        updates.isActive === "false" ? false : Boolean(updates.isActive);
    }
    if (updates.priceType) {
      updates.priceType = fixPriceType(updates.priceType);
    }
    if (updates.price !== undefined) {
      updates.price = Number(updates.price);
    }

    if (updates.isBusy !== undefined) {
      updates.isBusy =
        updates.isBusy === "false" ? false : Boolean(updates.isBusy);
    }

    const existingDevice = await prisma.device.findUnique({
      where: { id: deviceId },
    });
    if (!existingDevice || existingDevice === 0) {
      return next(new AppError("Device not found", 404));
    }

    if (updates.spaceId) {
      const space = await prisma.space.findUnique({
        where: { id: updates.spaceId },
      });
      if (!space) return next(new AppError("Space not found", 404));
      if (space.branchId !== existingDevice.branchId)
        return next(new AppError("Space does not belong to this branch", 400));
    } else if (updates.spaceId === null) {
      updates.spaceId = null;
    }

    // Handle image upload if provided
    if (req.file && req.file.buffer) {
      try {
        const uploaded = await compressAndUpload(
          req.file.buffer,
          `devices/${existingDevice.branchId}`,
        );
        updates.image = uploaded.secure_url || uploaded.url || null;
      } catch {
        return next(new AppError("Image upload failed", 500));
      }
    }

    const updatedDevice = await prisma.device.update({
      where: { id: deviceId },
      data: updates,
    });

    // Invalidate all caches related to this device's branch and space
    await invalidateSpaceCache(existingDevice.branchId);
    const keysToDelete = await redisClient.keys(
      `devices:branchId=${existingDevice.branchId}*`,
    );
    // Also delete the individual device key
    keysToDelete.push(`device:${deviceId}`);
    if (keysToDelete.length > 0) {
      await redisClient.del(keysToDelete);
    }

    res.status(200).json({ success: true, data: updatedDevice });
  } catch (error) {
    next(error);
  }
};

export const deleteDeviceById = async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    if (!deviceId) {
      return next(new AppError("Device ID is required", 400));
    }
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: { branch: { select: { businessId: true } } },
    });
    if (!device || device === 0) {
      return next(new AppError("Device not found", 404));
    }

    await prisma.$transaction(async (tx) => {
      await tx.device.update({
        where: { id: deviceId },
        data: {
          deletedAt: new Date(),
          isDeleted: true,
          deletedBy: req.user.id,
        },
      });

      await decrementStorageUsage(device.branch.businessId, "devices", tx);
    });

    // Invalidate cache - delete individual device key and all branch device lists
    const keysToDelete = await redisClient.keys(
      `devices:branchId=${device.branchId}*`,
    );
    // Also delete the individual device key
    keysToDelete.push(`device:${deviceId}`);
    if (keysToDelete.length > 0) {
      await redisClient.del(keysToDelete);
    }

    res
      .status(200)
      .json({ success: true, message: "Device deleted successfully" });
  } catch (error) {
    next(error);
  }
};

export const deleteDevicesByBranchId = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER" && req.user.roleName !== "OWNER") {
      return next(
        new AppError(
          "Only developers and owners can delete devices by branch",
          403,
        ),
      );
    }
    const { branchId } = req.params;
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }
    const existingBranch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!existingBranch || existingBranch === 0) {
      return next(new AppError("Branch not found", 404));
    }
    const { result } = await prisma.$transaction(async (tx) => {
      const result = await tx.device.updateMany({
        where: { branchId: branchId, isDeleted: false },
        data: {
          deletedAt: new Date(),
          isDeleted: true,
          deletedBy: req.user.id,
        },
      });

      if (!result || result.count === 0) {
        throw new AppError("No devices to delete for this branch", 404);
      }

      // Decrement storage
      await decrementStorageUsage(
        existingBranch.businessId,
        "devices",
        tx,
        result.count,
      );

      return { result };
    });

    // Invalidate cache for this branch
    const keysToDelete = await redisClient.keys(
      `devices:branchId=${branchId}*`,
    );
    if (keysToDelete.length > 0) {
      await redisClient.del(keysToDelete);
    }

    res.status(200).json({
      success: true,
      message: `devices deleted successfully for branch`,
      count: result.count,
    });
  } catch (error) {
    next(error);
  }
};

export const getDevicesBySpaceId = async (req, res, next) => {
  try {
    const { branchId, spaceId } = req.params;
    if (!branchId) return next(new AppError("Branch ID is required", 400));
    if (!spaceId) return next(new AppError("Space ID is required", 400));

    const space = await prisma.space.findUnique({ where: { id: spaceId } });
    if (!space) return next(new AppError("Space not found", 404));
    if (space.branchId !== branchId)
      return next(new AppError("Space does not belong to this branch", 400));

    const { page, limit, skip, order, sort } = pagination(req);
    const whereClause = { spaceId, branchId, isDeleted: false };

    if (req.query.type) {
      whereClause.type = String(req.query.type).toUpperCase();
      if (!DeviceType.includes(whereClause.type))
        return next(new AppError("Invalid device type", 400));
    }
    if (req.query.isActive !== undefined)
      whereClause.isActive = req.query.isActive === "true";
    if (req.query.isBusy !== undefined)
      whereClause.isBusy = req.query.isBusy === "true";

    const [devices, total] = await prisma.$transaction([
      prisma.device.findMany({
        skip,
        take: limit,
        orderBy: { [sort]: order },
        where: whereClause,
      }),
      prisma.device.count({ where: whereClause }),
    ]);

    res.status(200).json({
      success: true,
      data: devices,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAllDevices = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(new AppError("Only developers can delete all devices", 403));
    }
    const result = await prisma.device.updateMany({
      where: { isDeleted: false },
      data: { deletedAt: new Date(), isDeleted: true, deletedBy: req.user.id },
    });
    if (!result || result.count === 0) {
      return next(new AppError("No devices to delete", 404));
    }
    res.status(200).json({
      success: true,
      message: "All devices deleted successfully",
      count: result.count,
    });
  } catch (error) {
    next(error);
  }
};
