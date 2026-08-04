import { prisma } from "../configs/db.js";
import { messages } from "../locales/message.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";
import { invalidateCacheByPattern } from "../utils/cacheInvalidation.js";
import {
  addBillingInterval,
  createSubscriptionForBusiness,
  resolveFallbackPlanId,
} from "../utils/subscription.js";

const ACTIVE_STATUSES = ["TRIALING", "ACTIVE", "PAST_DUE"];

const requireDeveloper = (req, next) => {
  if (req.user.roleName !== "DEVELOPER") {
    next(new AppError(messages.FORBIDDEN.en, 403));
    return false;
  }
  return true;
};

export const createSubscription = async (req, res, next) => {
  try {
    if (!requireDeveloper(req, next)) return;

    const { businessId } = req.params;
    const { planId } = req.body;

    if (!businessId) {
      return next(new AppError("Business ID is required", 400));
    }
    if (!planId) {
      return next(new AppError("Plan ID is required", 400));
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) {
      return next(new AppError("Business not found", 404));
    }

    const subscription = await createSubscriptionForBusiness({
      businessId,
      planId,
    });

    await invalidateCacheByPattern("businesses*");
    await invalidateCacheByPattern(`business:${businessId}`);

    res.status(201).json({
      success: true,
      data: subscription,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const renewSubscription = async (req, res, next) => {
  try {
    if (!requireDeveloper(req, next)) return;

    const { id } = req.params;
    if (!id) {
      return next(new AppError("Subscription ID is required", 400));
    }

    const subscription = await prisma.subscription.findUnique({
      where: { id },
    });
    if (!subscription) {
      return next(new AppError("Subscription not found", 404));
    }
    if (!ACTIVE_STATUSES.includes(subscription.status)) {
      return next(
        new AppError(
          `Cannot renew a subscription with status ${subscription.status}`,
          400,
        ),
      );
    }

    const now = new Date();
    const periodLapsed = subscription.currentPeriodEnd <= now;
    const base = periodLapsed ? now : subscription.currentPeriodEnd;
    const currentPeriodEnd = addBillingInterval(
      base,
      subscription.billingInterval,
    );

    const updated = await prisma.subscription.update({
      where: { id },
      data: {
        status: "ACTIVE",
        currentPeriodStart: periodLapsed
          ? now
          : subscription.currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
      },
    });

    res.status(200).json({
      success: true,
      data: updated,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const cancelSubscription = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    const { immediate, cancelReason } = req.body;

    if (!businessId) {
      return next(new AppError("Business ID is required", 400));
    }

    const subscription = await prisma.subscription.findFirst({
      where: { businessId, status: { in: ACTIVE_STATUSES } },
      orderBy: { createdAt: "desc" },
    });
    if (!subscription) {
      return next(
        new AppError("No active subscription found for this business", 404),
      );
    }

    const userId = req.user?.id || req.user?.userId;
    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.subscription.update({
        where: { id: subscription.id },
        data: immediate
          ? {
              status: "CANCELLED",
              cancelledAt: now,
              cancelledById: userId,
              cancelReason: cancelReason || null,
            }
          : {
              cancelAtPeriodEnd: true,
              cancelledById: userId,
              cancelReason: cancelReason || null,
            },
      });

      // Only the EXPIRED sweep used to reset the plan, and a CANCELLED row is
      // never picked up by that sweep — so an immediate cancellation left the
      // business on its paid tier's limits forever, with no billing behind it.
      if (immediate) {
        const fallbackPlanId = await resolveFallbackPlanId(tx);
        await tx.business.update({
          where: { id: businessId },
          data: { planId: fallbackPlanId },
        });
      }

      return result;
    });

    res.status(200).json({
      success: true,
      data: updated,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getCurrentSubscription = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    if (!businessId) {
      return next(new AppError("Business ID is required", 400));
    }

    const subscription = await prisma.subscription.findFirst({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      include: { plan: { select: { id: true, name: true, type: true } } },
    });
    if (!subscription) {
      return next(new AppError("No subscription found for this business", 404));
    }

    res.status(200).json({
      success: true,
      data: subscription,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getSubscriptionHistory = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    if (!businessId) {
      return next(new AppError("Business ID is required", 400));
    }

    // Subscription has no name/email column — the default sort list would let
    // ?sort=email through to Prisma and 500.
    const { page, limit, skip, sort, order } = pagination(req, {
      allowedSortFields: ["updatedAt", "startDate", "currentPeriodEnd", "status"],
    });

    const [subscriptions, total] = await prisma.$transaction([
      prisma.subscription.findMany({
        where: { businessId },
        skip,
        take: limit,
        orderBy: { [sort]: order },
        include: { plan: { select: { id: true, name: true, type: true } } },
      }),
      prisma.subscription.count({ where: { businessId } }),
    ]);

    const totalPages = Math.ceil(total / limit);
    res.status(200).json({
      success: true,
      data: subscriptions,
      meta: { page, limit, total, totalPages, sort, order },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getSubscriptionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      return next(new AppError("Subscription ID is required", 400));
    }

    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: {
        business: { select: { id: true, name: true, ownerId: true } },
        plan: { select: { id: true, name: true, type: true } },
      },
    });
    if (!subscription) {
      return next(new AppError("Subscription not found", 404));
    }

    const userId = req.user?.id || req.user?.userId;
    const roleName = req.user.roleName;
    if (
      roleName !== "DEVELOPER" &&
      subscription.business.ownerId !== userId
    ) {
      return next(new AppError("You do not own this business", 403));
    }

    res.status(200).json({
      success: true,
      data: subscription,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};
