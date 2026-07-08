import { prisma } from "../configs/db.js";
import { AppError } from "./appError.js";

const ACTIVE_STATUSES = ["TRIALING", "ACTIVE", "PAST_DUE"];

/**
 * First active + public plan, ordered by creation. Used as the default plan
 * for new businesses and as the downgrade target when a subscription expires.
 */
export const resolveFallbackPlanId = async (prismaClient = prisma) => {
  const fallbackPlan = await prismaClient.plan.findFirst({
    where: {
      isActive: true,
      isPublic: true,
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!fallbackPlan) {
    throw new AppError(
      "No active public plan found. Create a plan first or provide a valid planId",
      400,
    );
  }

  return fallbackPlan.id;
};

export const addBillingInterval = (date, billingInterval) => {
  const result = new Date(date);
  if (billingInterval === "YEARLY") {
    result.setFullYear(result.getFullYear() + 1);
  } else {
    result.setMonth(result.getMonth() + 1);
  }
  return result;
};

/**
 * Creates (or replaces) the current Subscription for a business, superseding
 * any prior TRIALING/ACTIVE/PAST_DUE row, and keeps Business.planId in sync.
 */
export const createSubscriptionForBusiness = async ({
  businessId,
  planId,
  prismaClient = prisma,
}) => {
  const plan = await prismaClient.plan.findUnique({ where: { id: planId } });
  if (!plan) {
    throw new AppError("Plan not found", 404);
  }

  const isFirstSubscription =
    (await prismaClient.subscription.count({ where: { businessId } })) === 0;

  const now = new Date();
  let status = "ACTIVE";
  let trialEndsAt = null;
  let currentPeriodEnd = addBillingInterval(now, plan.billingInterval);

  if (isFirstSubscription && plan.trialDays > 0) {
    status = "TRIALING";
    trialEndsAt = new Date(now);
    trialEndsAt.setDate(trialEndsAt.getDate() + plan.trialDays);
    currentPeriodEnd = trialEndsAt;
  }

  return prismaClient.$transaction(async (tx) => {
    const priorSubscription = await tx.subscription.findFirst({
      where: { businessId, status: { in: ACTIVE_STATUSES } },
      orderBy: { createdAt: "desc" },
    });

    if (priorSubscription) {
      await tx.subscription.update({
        where: { id: priorSubscription.id },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          cancelReason: "Superseded by new subscription",
        },
      });
    }

    const subscription = await tx.subscription.create({
      data: {
        businessId,
        planId,
        status,
        priceSnapshot: plan.price,
        currency: plan.currency,
        billingInterval: plan.billingInterval,
        startDate: now,
        currentPeriodStart: now,
        currentPeriodEnd,
        trialEndsAt,
      },
    });

    await tx.business.update({
      where: { id: businessId },
      data: { planId },
    });

    return subscription;
  });
};
