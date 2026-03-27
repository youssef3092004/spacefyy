import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import {
  updateStorageUsage,
  checkResourceLimit,
  getStorageUsageSummary,
  getStorageHistory,
  initializeStorageUsage,
} from "../utils/storageUsage.js";
import { messages } from "../locales/message.js";
import { runWeeklyStorageUsageSnapshot } from "../utils/storageUsageCron.js";

/**
 * Get storage usage summary for a business owner
 */
export const getBusinessStorageUsage = async (req, res, next) => {
  try {
    const { businessId } = req.params;

    if (!businessId) {
      return next(new AppError("Business ID is required", 400));
    }

    // Verify business exists
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      return next(new AppError("Business not found", 404));
    }

    const summary = await getStorageUsageSummary(businessId);

    res.status(200).json({
      success: true,
      data: summary,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get storage usage history for analytics
 */
export const getStorageUsageHistory = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    const { days = 30 } = req.query;

    if (!businessId) {
      return next(new AppError("Business ID is required", 400));
    }

    // Verify business exists
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      return next(new AppError("Business not found", 404));
    }

    const history = await getStorageHistory(businessId, parseInt(days));

    res.status(200).json({
      success: true,
      data: history,
      period: `Last ${days} days`,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Check if a resource can be created
 */
export const checkResourceCreationLimit = async (req, res, next) => {
  try {
    const { businessId, resourceType } = req.params;

    if (!businessId || !resourceType) {
      return next(
        new AppError("Business ID and resource type are required", 400),
      );
    }

    const result = await checkResourceLimit(businessId, resourceType);

    if (!result.allowed) {
      return res.status(409).json({
        success: false,
        message: result.message,
        data: {
          current: result.current,
          max: result.max,
        },
      });
    }

    res.status(200).json({
      success: true,
      message: `Resource creation allowed`,
      data: {
        allowed: result.allowed,
        current: result.current,
        max: result.max,
        availableSlots: result.max - result.current,
      },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Manually trigger storage usage update
 * (Usually called automatically after create/delete operations)
 */
export const triggerStorageUsageUpdate = async (req, res, next) => {
  try {
    const { businessId } = req.params;

    if (!businessId) {
      return next(new AppError("Business ID is required", 400));
    }

    await updateStorageUsage(businessId);

    const summary = await getStorageUsageSummary(businessId);

    res.status(200).json({
      success: true,
      message: "Storage usage updated successfully",
      data: summary,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create initial storage usage record for a business
 */
export const initializeStorageUsageController = async (businessId) => {
  try {
    await initializeStorageUsage(businessId);

    // Update with actual counts
    await updateStorageUsage(businessId);
  } catch (error) {
    console.error("Error initializing storage usage:", error);
    throw error;
  }
};

/**
 * Get storage usage for all businesses (admin only)
 */
export const getAllBusinessesStorageUsage = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(new AppError(messages.FORBIDDEN.en, 403));
    }
    const storageUsages = await prisma.storageUsage.findMany({
      include: {
        business: {
          select: {
            id: true,
            name: true,
            owner: { select: { id: true, name: true, email: true } },
            plan: {
              select: {
                name: true,
                type: true,
                maxBranches: true,
                maxSpaces: true,
                maxDevices: true,
                maxTools: true,
                maxUsers: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const formatted = storageUsages.map((usage) => {
      const plan = usage.business.plan;

      return {
        businessId: usage.businessId,
        businessName: usage.business.name,
        ownerEmail: usage.business.owner.email,
        planType: plan.type,
        resources: {
          branches: {
            current: usage.currentBranches,
            max: plan.maxBranches,
            percent: Math.round(
              (usage.currentBranches / (plan.maxBranches || 1)) * 100,
            ),
          },
          spaces: {
            current: usage.currentSpaces,
            max: plan.maxSpaces,
            percent: Math.round(
              (usage.currentSpaces / (plan.maxSpaces || 1)) * 100,
            ),
          },
          devices: {
            current: usage.currentDevices,
            max: plan.maxDevices,
            percent: Math.round(
              (usage.currentDevices / (plan.maxDevices || 1)) * 100,
            ),
          },
          tools: {
            current: usage.currentTools,
            max: plan.maxTools,
            percent: Math.round(
              (usage.currentTools / (plan.maxTools || 1)) * 100,
            ),
          },
          staff: {
            current: usage.currentStaff,
            max: plan.maxUsers,
            percent: Math.round(
              (usage.currentStaff / (plan.maxUsers || 1)) * 100,
            ),
          },
          users: {
            current: usage.currentUsers,
            max: plan.maxUsers,
            percent: Math.round(
              (usage.currentUsers / (plan.maxUsers || 1)) * 100,
            ),
          },
        },
        lastUpdated: usage.updatedAt,
      };
    });

    res.status(200).json({
      success: true,
      data: formatted,
      total: formatted.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Manually trigger weekly snapshot job for all businesses
 * (DEVELOPER only)
 */
export const triggerWeeklyStorageSnapshot = async (req, res, next) => {
  try {
    if (!req.user || req.user.roleName !== "DEVELOPER") {
      return next(new AppError(messages.FORBIDDEN.en, 403));
    }

    const result = await runWeeklyStorageUsageSnapshot();

    res.status(200).json({
      success: true,
      message: "Weekly storage usage snapshot executed successfully",
      data: result,
      source: "manual-trigger",
    });
  } catch (error) {
    next(error);
  }
};
