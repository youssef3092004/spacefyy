import cron from "node-cron";
import process from "process";
import { prisma } from "../configs/db.js";
import { withCronLock } from "./cronLock.js";

const AUTO_CANCEL_AFTER_MINUTES =
  parseInt(process.env.AUTO_CANCEL_AFTER_MINUTES) || 30;

export const runVisitAutoCancel = async () =>
  withCronLock("VisitAutoCancelCron", runVisitAutoCancelUnlocked);

const runVisitAutoCancelUnlocked = async () => {
  const cutoff = new Date(Date.now() - AUTO_CANCEL_AFTER_MINUTES * 60 * 1000);

  const staleVisits = await prisma.visit.findMany({
    where: {
      status: "ACTIVE",
      startedAt: { lte: cutoff },
      // `none: {}` counted soft-deleted sessions as existing, so a visit whose
      // only session was deleted was excluded from the sweep forever — and
      // ensureCanStartVisit then rejected every future visit for that customer.
      sessions: { none: { deletedAt: null } },
      orders: { none: {} },
    },
    select: { id: true },
  });

  const total = staleVisits.length;
  if (!total) return { total: 0, cancelled: 0, failed: 0, failedIds: [] };

  const cancelledAt = new Date();
  let cancelled = 0;
  const failedIds = [];

  for (const visit of staleVisits) {
    try {
      // Guarded on ACTIVE: the read above happens once, but the loop can run
      // for a while. Without it, a visit invoiced in between was overwritten
      // as CANCELLED with totalPrice 0 while holding a live UNPAID invoice,
      // and revenue reports (which skip CANCELLED) silently dropped it.
      const { count } = await prisma.visit.updateMany({
        where: { id: visit.id, status: "ACTIVE" },
        data: {
          status: "CANCELLED",
          endedAt: cancelledAt,
          cancelledAt,
          totalPrice: 0,
        },
      });
      if (count > 0) cancelled += 1;
    } catch (err) {
      failedIds.push(visit.id);
      console.error(
        JSON.stringify({
          level: "error",
          job: "VisitAutoCancelCron",
          event: "cancel_failed",
          visitId: visit.id,
          reason: err?.message ?? String(err),
          ts: new Date().toISOString(),
        }),
      );
    }
  }

  const result = { total, cancelled, failed: failedIds.length, failedIds };

  if (failedIds.length > 0) {
    console.error(
      JSON.stringify({
        level: "error",
        job: "VisitAutoCancelCron",
        event: "run_completed_with_failures",
        ...result,
        ts: new Date().toISOString(),
      }),
    );
  } else if (cancelled > 0) {
    console.log(
      JSON.stringify({
        level: "info",
        job: "VisitAutoCancelCron",
        event: "run_completed",
        ...result,
        ts: new Date().toISOString(),
      }),
    );
  }

  return result;
};

export const startVisitAutoCancelCron = () => {
  const enabled = process.env.ENABLE_VISIT_AUTO_CANCEL_CRON !== "false";

  if (!enabled) {
    console.log(
      "[VisitAutoCancelCron] Disabled by ENABLE_VISIT_AUTO_CANCEL_CRON=false",
    );
    return null;
  }

  const schedule = process.env.VISIT_AUTO_CANCEL_CRON || "*/5 * * * *";

  if (!cron.validate(schedule)) {
    console.error(
      `[VisitAutoCancelCron] Invalid cron expression: ${schedule}. Job not started.`,
    );
    return null;
  }

  const job = cron.schedule(schedule, async () => {
    try {
      await runVisitAutoCancel();
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          job: "VisitAutoCancelCron",
          event: "unexpected_error",
          reason: err?.message ?? String(err),
          ts: new Date().toISOString(),
        }),
      );
    }
  });

  console.log(`[VisitAutoCancelCron] Started. schedule='${schedule}'`);
  return job;
};
