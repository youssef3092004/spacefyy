import { prisma } from "../configs/db.js";
import { AppError } from "./appError.js";

/**
 * Calculate percentage usage
 * @param {number} current - Current usage count
 * @param {number} max - Maximum limit
 * @returns {number} Percentage (0-100)
 */
const calculatePercentage = (current, max) => {
  if (!max || max === 0) return 0;
  return Math.round((current / max) * 100);
};

/**
 * Increment storage counter for a specific resource
 * SAFE & FAST: Checks limit before incrementing to prevent exceeding plan limits
 * @param {string} businessId - Business ID
 * @param {string} resourceType - Type of resource (branches, spaces, devices, tools, staff, users)
 * @throws {AppError} If plan limit would be exceeded
 */
export const incrementStorageUsage = async (
  businessId,
  resourceType,
  prismaClient = prisma,
) => {
  try {
    const fieldMap = {
      branches: "currentBranches",
      spaces: "currentSpaces",
      devices: "currentDevices",
      tools: "currentTools",
      staff: "currentStaff",
      users: "currentUsers",
    };

    const maxFieldMap = {
      branches: "maxBranches",
      spaces: "maxSpaces",
      devices: "maxDevices",
      tools: "maxTools",
      staff: "maxStaff",
      users: "maxUsers",
    };

    const field = fieldMap[resourceType];
    const maxField = maxFieldMap[resourceType];

    if (!field) {
      throw new AppError("Invalid resource type", 400);
    }

    const business = await prismaClient.business.findUnique({
      where: { id: businessId },
      include: { plan: true },
    });

    if (!business) {
      throw new AppError("Business not found", 404);
    }

    const plan = business.plan;
    if (!plan) {
      throw new AppError("Business plan not found", 500);
    }

    const storageUsage = await prismaClient.storageUsage.findUnique({
      where: { businessId },
      select: { [field]: true },
    });

    if (!storageUsage) {
      throw new AppError("Storage usage record not found", 404);
    }

    const currentCount = storageUsage[field];
    const maxLimit = plan[maxField];

    if (maxLimit && currentCount >= maxLimit) {
      throw new AppError(
        `Cannot create ${resourceType}. Maximum limit of ${maxLimit} reached (current: ${currentCount})`,
        403,
      );
    }

    const result = await prismaClient.storageUsage.update({
      where: { businessId },
      data: {
        [field]: { increment: 1 },
      },
    });

    return result;
  } catch (error) {
    console.error("Error incrementing storage usage:", error);
    throw error;
  }
};

/**
 * Decrement storage counter for a specific resource
 * FAST: Uses atomic decrement without counting
 * @param {string} businessId - Business ID
 * @param {string} resourceType - Type of resource (branches, spaces, devices, tools, staff, users)
 */
export const decrementStorageUsage = async (
  businessId,
  resourceType,
  prismaClient = prisma,
  amount = 1,
) => {
  try {
    const fieldMap = {
      branches: "currentBranches",
      spaces: "currentSpaces",
      devices: "currentDevices",
      tools: "currentTools",
      staff: "currentStaff",
      users: "currentUsers",
    };

    const field = fieldMap[resourceType];

    if (!field) {
      throw new AppError("Invalid resource type", 400);
    }

    const decrementBy = Number(amount);
    if (!Number.isFinite(decrementBy) || decrementBy <= 0) {
      throw new AppError("Decrement amount must be a positive number", 400);
    }

    const storageUsage = await prismaClient.storageUsage.findUnique({
      where: { businessId },
      select: { [field]: true },
    });

    if (!storageUsage) {
      throw new AppError("Storage usage record not found", 404);
    }

    if (storageUsage[field] > 0) {
      const safeDecrement = Math.min(storageUsage[field], decrementBy);
      await prismaClient.storageUsage.update({
        where: { businessId },
        data: {
          [field]: { decrement: safeDecrement },
        },
      });
    }
  } catch (error) {
    console.error("Error decrementing storage usage:", error);
    throw error;
  }
};

export const resetStorageUsageByRecourse = async (
  businessId,
  resourceType,
  prismaClient = prisma,
) => {
  try {
    const fieldMap = {
      branches: "currentBranches",
      spaces: "currentSpaces",
      devices: "currentDevices",
      tools: "currentTools",
      staff: "currentStaff",
      users: "currentUsers",
    };

    const field = fieldMap[resourceType];

    if (!field) {
      throw new AppError("Invalid resource type", 400);
    }
    await prismaClient.storageUsage.update({
      where: { businessId },
      data: { [field]: 0 },
    });
  } catch (error) {
    console.error("Error resetting storage usage:", error);
    throw error;
  }
};

/**
 * Initialize storage usage for a new business
 * Called when a business is first created
 */
export const initializeStorageUsage = async (businessId) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new AppError("Business not found", 404);
    }

    const result = await prisma.storageUsage.create({
      data: {
        businessId,
        currentBranches: 0,
        currentSpaces: 0,
        currentDevices: 0,
        currentTools: 0,
        currentStaff: 0,
        currentUsers: 0,
      },
    });
    return result;
  } catch (error) {
    console.error("Error initializing storage usage:", error);
    throw error;
  }
};

/**
 * Update storage usage for a business by recounting all resources
 * Use this for:
 * - Data synchronization/audit
 * - Fixing inconsistencies
 * For normal create/delete operations, use incrementStorageUsage/decrementStorageUsage instead
 */
export const updateStorageUsage = async (businessId) => {
  try {
    // Verify business exists
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new AppError("Business not found", 404);
    }

    // Count all resources
    const [
      branchCount,
      spaceCount,
      deviceCount,
      toolCount,
      staffCount,
      userCount,
    ] = await Promise.all([
      prisma.branch.count({ where: { businessId } }),
      prisma.space.count({
        where: { branch: { businessId } },
      }),
      prisma.device.count({
        where: { branch: { businessId } },
      }),
      prisma.tool.count({
        where: { branch: { businessId } },
      }),
      prisma.staffProfile.count({
        where: { branch: { businessId } },
      }),
      prisma.user.count({
        where: { businesses: { some: { id: businessId } } },
      }),
    ]);

    let storageUsage = await prisma.storageUsage.findUnique({
      where: { businessId },
    });

    if (!storageUsage) {
      storageUsage = await prisma.storageUsage.create({
        data: {
          businessId,
          currentBranches: 0,
          currentSpaces: 0,
          currentDevices: 0,
          currentTools: 0,
          currentStaff: 0,
          currentUsers: 0,
        },
      });
    }

    await prisma.storageUsage.update({
      where: { id: storageUsage.id },
      data: {
        currentBranches: branchCount,
        currentSpaces: spaceCount,
        currentDevices: deviceCount,
        currentTools: toolCount,
        currentStaff: staffCount,
        currentUsers: userCount,
      },
    });

    return storageUsage;
  } catch (error) {
    console.error("Error updating storage usage:", error);
    throw error;
  }
};

/**
 * Record storage usage snapshot for analytics
 * Should be called periodically (daily, monthly, etc.)
 */
export const recordStorageSnapshot = async (businessId) => {
  try {
    const storageUsage = await prisma.storageUsage.findUnique({
      where: { businessId },
    });

    if (!storageUsage) {
      throw new AppError("Storage usage record not found", 404);
    }

    // Create history record
    await prisma.storageUsageHistory.create({
      data: {
        storageUsageId: storageUsage.id,
        branches: storageUsage.currentBranches,
        spaces: storageUsage.currentSpaces,
        devices: storageUsage.currentDevices,
        tools: storageUsage.currentTools,
        staff: storageUsage.currentStaff,
        users: storageUsage.currentUsers,
      },
    });
  } catch (error) {
    console.error("Error recording storage snapshot:", error);
    throw error;
  }
};

/**
 * Check if a resource can be created based on plan limits
 */
export const checkResourceLimit = async (businessId, resourceType) => {
  try {
    // Get storage usage with business and plan
    const storageUsage = await prisma.storageUsage.findUnique({
      where: { businessId },
      include: {
        business: {
          include: { plan: true },
        },
      },
    });

    if (!storageUsage) {
      throw new AppError("Storage usage record not found", 404);
    }

    const plan = storageUsage.business.plan;

    const limits = {
      branches: {
        current: storageUsage.currentBranches,
        max: plan.maxBranches,
      },
      spaces: {
        current: storageUsage.currentSpaces,
        max: plan.maxSpaces,
      },
      devices: {
        current: storageUsage.currentDevices,
        max: plan.maxDevices,
      },
      tools: {
        current: storageUsage.currentTools,
        max: plan.maxTools,
      },
      staff: {
        current: storageUsage.currentStaff,
        max: plan.maxUsers,
      },
      users: {
        current: storageUsage.currentUsers,
        max: plan.maxUsers,
      },
    };

    const limit = limits[resourceType];

    if (!limit) {
      throw new AppError("Invalid resource type", 400);
    }

    if (limit.max && limit.current >= limit.max) {
      return {
        allowed: false,
        message: `Maximum ${resourceType} limit (${limit.max}) reached`,
        current: limit.current,
        max: limit.max,
      };
    }

    return {
      allowed: true,
      current: limit.current,
      max: limit.max,
    };
  } catch (error) {
    console.error("Error checking resource limit:", error);
    throw error;
  }
};

/**
 * Get storage usage summary for a business
 */
export const getStorageUsageSummary = async (businessId) => {
  try {
    // Get storage usage with business and plan
    const storageUsage = await prisma.storageUsage.findUnique({
      where: { businessId },
      include: {
        business: {
          include: { plan: true },
        },
      },
    });

    if (!storageUsage) {
      throw new AppError("Storage usage record not found", 404);
    }

    const plan = storageUsage.business.plan;

    return {
      businessId,
      resources: {
        branches: {
          current: storageUsage.currentBranches,
          max: plan.maxBranches,
          usagePercent: calculatePercentage(
            storageUsage.currentBranches,
            plan.maxBranches,
          ),
        },
        spaces: {
          current: storageUsage.currentSpaces,
          max: plan.maxSpaces,
          usagePercent: calculatePercentage(
            storageUsage.currentSpaces,
            plan.maxSpaces,
          ),
        },
        devices: {
          current: storageUsage.currentDevices,
          max: plan.maxDevices,
          usagePercent: calculatePercentage(
            storageUsage.currentDevices,
            plan.maxDevices,
          ),
        },
        tools: {
          current: storageUsage.currentTools,
          max: plan.maxTools,
          usagePercent: calculatePercentage(
            storageUsage.currentTools,
            plan.maxTools,
          ),
        },
        staff: {
          current: storageUsage.currentStaff,
          max: plan.maxUsers,
          usagePercent: calculatePercentage(
            storageUsage.currentStaff,
            plan.maxUsers,
          ),
        },
        users: {
          current: storageUsage.currentUsers,
          max: plan.maxUsers,
          usagePercent: calculatePercentage(
            storageUsage.currentUsers,
            plan.maxUsers,
          ),
        },
      },
      lastUpdated: storageUsage.updatedAt,
    };
  } catch (error) {
    console.error("Error getting storage usage summary:", error);
    throw error;
  }
};

/**
 * Get storage usage history for analytics
 */
export const getStorageHistory = async (businessId, days = 30) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const storageUsage = await prisma.storageUsage.findUnique({
      where: { businessId },
      select: { id: true },
    });

    if (!storageUsage) {
      throw new AppError("Storage usage record not found", 404);
    }

    const history = await prisma.storageUsageHistory.findMany({
      where: {
        storageUsageId: storageUsage.id,
        recordedAt: { gte: since },
      },
      orderBy: { recordedAt: "asc" },
    });

    return history;
  } catch (error) {
    console.error("Error getting storage history:", error);
    throw error;
  }
};
