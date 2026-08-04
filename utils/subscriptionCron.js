import cron from "node-cron";
import process from "process";
import { prisma } from "../configs/db.js";
import { resolveFallbackPlanId } from "./subscription.js";
import { withCronLock } from "./cronLock.js";

const GRACE_DAYS = parseInt(process.env.SUBSCRIPTION_GRACE_DAYS) || 3;

export const runSubscriptionExpiryCheck = async () =>
  withCronLock("SubscriptionCron", runSubscriptionExpiryCheckUnlocked);

const runSubscriptionExpiryCheckUnlocked = async () => {
  const now = new Date();

  const lapsedSubscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
      currentPeriodEnd: { lte: now },
    },
    select: { id: true, status: true, cancelAtPeriodEnd: true, businessId: true },
  });

  let cancelled = 0;
  let pastDue = 0;
  let expired = 0;
  const failedIds = [];

  // Resolved once per run, not once per subscription — this is a constant for
  // the whole sweep and was being re-queried inside both loops.
  let fallbackPlanId = null;
  const getFallbackPlanId = async () => {
    if (!fallbackPlanId) fallbackPlanId = await resolveFallbackPlanId();
    return fallbackPlanId;
  };

  for (const subscription of lapsedSubscriptions) {
    try {
      if (subscription.cancelAtPeriodEnd) {
        // Reset the plan alongside the cancellation. A CANCELLED row is not in
        // ACTIVE_STATUSES, so the PAST_DUE → EXPIRED sweep below never sees it
        // again — without this the business keeps its paid limits forever.
        const planId = await getFallbackPlanId();
        await prisma.$transaction([
          prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: "CANCELLED", cancelledAt: now },
          }),
          prisma.business.update({
            where: { id: subscription.businessId },
            data: { planId },
          }),
        ]);
        cancelled += 1;
      } else if (subscription.status !== "PAST_DUE") {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: "PAST_DUE" },
        });
        pastDue += 1;
      }
    } catch (err) {
      failedIds.push(subscription.id);
      console.error(
        JSON.stringify({
          level: "error",
          job: "SubscriptionCron",
          event: "transition_failed",
          subscriptionId: subscription.id,
          reason: err?.message ?? String(err),
          ts: now.toISOString(),
        }),
      );
    }
  }

  const graceCutoff = new Date(now.getTime() - GRACE_DAYS * 24 * 60 * 60 * 1000);
  const overdueSubscriptions = await prisma.subscription.findMany({
    where: {
      status: "PAST_DUE",
      currentPeriodEnd: { lte: graceCutoff },
    },
    select: { id: true, businessId: true },
  });

  for (const subscription of overdueSubscriptions) {
    try {
      const planId = await getFallbackPlanId();
      await prisma.$transaction([
        prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: "EXPIRED" },
        }),
        prisma.business.update({
          where: { id: subscription.businessId },
          data: { planId },
        }),
      ]);
      expired += 1;
    } catch (err) {
      failedIds.push(subscription.id);
      console.error(
        JSON.stringify({
          level: "error",
          job: "SubscriptionCron",
          event: "expire_failed",
          subscriptionId: subscription.id,
          reason: err?.message ?? String(err),
          ts: now.toISOString(),
        }),
      );
    }
  }

  const result = { cancelled, pastDue, expired, failed: failedIds.length, failedIds };

  if (failedIds.length > 0) {
    console.error(
      JSON.stringify({
        level: "error",
        job: "SubscriptionCron",
        event: "run_completed_with_failures",
        ...result,
        ts: now.toISOString(),
      }),
    );
  } else if (cancelled > 0 || pastDue > 0 || expired > 0) {
    console.log(
      JSON.stringify({
        level: "info",
        job: "SubscriptionCron",
        event: "run_completed",
        ...result,
        ts: now.toISOString(),
      }),
    );
  }

  return result;
};

export const startSubscriptionCron = () => {
  const enabled = process.env.ENABLE_SUBSCRIPTION_CRON !== "false";

  if (!enabled) {
    console.log(
      "[SubscriptionCron] Disabled by ENABLE_SUBSCRIPTION_CRON=false",
    );
    return null;
  }

  const schedule = process.env.SUBSCRIPTION_CRON || "0 * * * *";

  if (!cron.validate(schedule)) {
    console.error(
      `[SubscriptionCron] Invalid cron expression: ${schedule}. Job not started.`,
    );
    return null;
  }

  const job = cron.schedule(schedule, async () => {
    try {
      await runSubscriptionExpiryCheck();
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          job: "SubscriptionCron",
          event: "unexpected_error",
          reason: err?.message ?? String(err),
          ts: new Date().toISOString(),
        }),
      );
    }
  });

  console.log(`[SubscriptionCron] Started. schedule='${schedule}'`);
  return job;
};
