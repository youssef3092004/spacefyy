import { prisma } from "../configs/db.js";
import { redisClient } from "../configs/redis.js";
import { AppError } from "../utils/appError.js";

// High-performance real-time availability check for spaces, devices, and units
// Used by frontend before creating reservations (NO CACHE for accuracy)

export const checkSpaceAvailability = async (req, res, next) => {
  try {
    const { spaceId } = req.params;
    const { branchId } = req.query;

    if (!spaceId) return next(new AppError("Space ID is required", 400));
    if (!branchId) return next(new AppError("Branch ID is required", 400));

    // Lightweight query: only essential availability fields
    const space = await prisma.space.findUnique({
      where: { id: spaceId },
      select: {
        id: true,
        name: true,
        branchId: true,
        isBusy: true,
        isActive: true,
        capacity: true,
        availableNumber: true,
        type: true,
      },
    });

    if (!space) return next(new AppError("Space not found", 404));
    if (space.branchId !== branchId) {
      return next(new AppError("Space not found in this branch", 404));
    }

    res.status(200).json({
      success: true,
      data: {
        spaceId: space.id,
        name: space.name,
        available: !space.isBusy && space.isActive,
        isBusy: space.isBusy,
        isActive: space.isActive,
        capacity: space.capacity,
        availableNumber: space.availableNumber,
        type: space.type,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const checkDeviceAvailability = async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { branchId } = req.query;

    if (!deviceId) return next(new AppError("Device ID is required", 400));
    if (!branchId) return next(new AppError("Branch ID is required", 400));

    const device = await prisma.device.findFirst({
      where: { id: deviceId, branchId, isDeleted: false },
      select: { id: true, name: true, isBusy: true, isActive: true },
    });

    if (!device) return next(new AppError("Device not found in this branch", 404));

    res.status(200).json({
      success: true,
      data: {
        deviceId: device.id,
        name: device.name,
        available: !device.isBusy && device.isActive,
        isBusy: device.isBusy,
        isActive: device.isActive,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const checkUnitAvailability = async (req, res, next) => {
  try {
    const { unitId } = req.params;
    const { branchId } = req.query;

    if (!unitId) return next(new AppError("Unit ID is required", 400));
    if (!branchId) return next(new AppError("Branch ID is required", 400));

    const unit = await prisma.unit.findFirst({
      where: { id: unitId, branchId, isDeleted: false },
      select: { id: true, name: true, isBusy: true, isActive: true },
    });

    if (!unit) return next(new AppError("Unit not found in this branch", 404));

    res.status(200).json({
      success: true,
      data: {
        unitId: unit.id,
        name: unit.name,
        available: !unit.isBusy && unit.isActive,
        isBusy: unit.isBusy,
        isActive: unit.isActive,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Cache invalidation utility
export const invalidateSpaceCache = async (branchId) => {
  try {
    await redisClient.del(`spaces:overview:branchId=${branchId}`);
  } catch (error) {
    console.error("⚠️  Cache invalidation error:", error.message);
    // Don't fail the request if cache invalidation fails
  }
};

export default {
  checkSpaceAvailability,
  checkDeviceAvailability,
  checkUnitAvailability,
  invalidateSpaceCache,
};
