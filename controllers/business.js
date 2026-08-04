import { prisma } from "../configs/db.js";
import { messages } from "../locales/message.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";
import { initializeStorageUsage } from "../utils/storageUsage.js";
import { invalidateCacheByPattern } from "../utils/cacheInvalidation.js";
import {
  resolveFallbackPlanId,
  createSubscriptionForBusiness,
} from "../utils/subscription.js";

const resolvePlanId = async (requestedPlanId) => {
  if (requestedPlanId) {
    const plan = await prisma.plan.findUnique({
      where: { id: requestedPlanId },
      select: { id: true },
    });

    if (!plan) {
      throw new AppError("Plan not found", 404);
    }

    return plan.id;
  }

  return resolveFallbackPlanId();
};

export const createBusiness = async (req, res, next) => {
  try {
    const { name, ownerId, planId } = req.body;
    if (!name || !ownerId) {
      return next(new AppError("Name and ownerId are required", 400));
    }
    const existOwner = await prisma.user.findUnique({
      where: { id: ownerId },
    });
    if (!existOwner) {
      return next(new AppError("Owner not found", 404));
    }

    const validPlanId = await resolvePlanId(planId);

    const newBusiness = await prisma.business.create({
      data: {
        name,
        ownerId,
        planId: validPlanId,
      },
    });

    const storageUsage = await initializeStorageUsage(newBusiness.id);

    const newSettings = await prisma.businessSettings.create({
      data: {
        businessId: newBusiness.id,
        notificationsEnabled: true,
        autoApprovePayroll: false,
      },
    });

    const subscription = await createSubscriptionForBusiness({
      businessId: newBusiness.id,
      planId: validPlanId,
    });

    await invalidateCacheByPattern("businesses*");
    await invalidateCacheByPattern(`business:${newBusiness.id}`);

    return res.status(201).json({
      success: true,
      data: {
        business: newBusiness,
        settings: newSettings,
        storage: storageUsage,
        subscription,
      },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getBusinessById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      return next(new AppError("Business ID is required", 400));
    }
    const business = await prisma.business.findUnique({
      where: { id },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    if (!business) {
      return next(new AppError("Business not found", 404));
    }
    const branchesCount = await prisma.branch.count({
      where: { businessId: id },
    });
    business.branchesCount = branchesCount;
    res.status(200).json({
      success: true,
      data: business,
      branchesCount,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getAllBusinesses = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(new AppError(messages.FORBIDDEN.en, 403));
    }
    const { page, limit, skip, sort, order } = pagination(req);
    const [businesses, total] = await prisma.$transaction([
      prisma.business.findMany({
        skip,
        take: limit,
        orderBy: { [sort]: order },
        include: {
          plan: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              branches: true,
            },
          },
        },
      }),
      prisma.business.count(),
    ]);
    if (!businesses.length) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }
    const totalPages = Math.ceil(total / limit);
    res.status(200).json({
      success: true,
      data: businesses,
      meta: {
        page,
        limit,
        total,
        totalPages,
        sort,
        order,
      },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const deleteBusinessById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      return next(new AppError("Business ID is required", 400));
    }
    const business = await prisma.business.delete({
      where: { id },
    });
    if (!business) {
      return next(new AppError("Business not found", 404));
    }

    await invalidateCacheByPattern("businesses*");
    await invalidateCacheByPattern(`business:${business.id}`);

    res.status(200).json({
      success: true,
      data: business,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAllBusinesses = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(
        new AppError("Forbidden: Only DEVELOPER can perform this action", 403),
      );
    }
    const deletedBusinesses = await prisma.business.deleteMany({});
    if (deletedBusinesses.count === 0) {
      return next(new AppError("No businesses to delete", 404));
    }

    await invalidateCacheByPattern("businesses*");
    await invalidateCacheByPattern(`business:*`);

    res.status(200).json({
      success: true,
      data: deletedBusinesses,
      count: deletedBusinesses.count,
    });
  } catch (error) {
    next(error);
  }
};

export const updateBusinessById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, ownerId } = req.body;
    if (!id) {
      return next(new AppError("Business ID is required", 400));
    }
    const existingBusiness = await prisma.business.findUnique({
      where: { id },
    });
    if (!existingBusiness) {
      return next(new AppError("Business not found", 404));
    }

    const updateData = {};

    if (name !== undefined) {
      if (!name) {
        return next(new AppError("Name cannot be empty", 400));
      }
      updateData.name = name;
    }

    if (ownerId !== undefined) {
      if (!ownerId) {
        return next(new AppError("ownerId cannot be empty", 400));
      }

      const existOwner = await prisma.user.findUnique({
        where: { id: ownerId },
      });
      if (!existOwner) {
        return next(new AppError("Owner not found", 404));
      }

      updateData.ownerId = ownerId;
    }

    if (Object.keys(updateData).length === 0) {
      return next(new AppError("Provide at least one field to update", 400));
    }

    const updatedBusiness = await prisma.business.update({
      where: { id: id },
      data: updateData,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    await invalidateCacheByPattern("businesses*");
    await invalidateCacheByPattern(`business:${updatedBusiness.id}`);

    res.status(200).json({
      success: true,
      data: updatedBusiness,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};
