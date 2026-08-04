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

/**
 * Adds one billing interval, clamped to the last day of the target month.
 *
 * setMonth overflows: Jan 31 + 1 month lands on Mar 3, so a customer who
 * subscribed on the 31st skipped February entirely and the same date could be
 * billed as belonging to two periods. Same for Feb 29 + 1 year.
 */
export const addBillingInterval = (date, billingInterval) => {
  const source = new Date(date);
  const monthsToAdd = billingInterval === "YEARLY" ? 12 : 1;

  const targetYear = source.getFullYear() + Math.floor((source.getMonth() + monthsToAdd) / 12);
  const targetMonth = (source.getMonth() + monthsToAdd) % 12;

  // Day 0 of the following month is the last day of the target month.
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

  const result = new Date(source);
  result.setFullYear(targetYear, targetMonth, Math.min(source.getDate(), lastDayOfTargetMonth));
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
