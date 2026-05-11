import cron from "node-cron";
import process from "process";
import { prisma } from "../configs/db.js";

export const computeAndStoreBranchMonthlyStats = async (
  branchId,
  year,
  month,
) => {
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  const [newCustomers, activeCustomersResult, revenueResult] =
    await Promise.all([
      // Customers registered to this branch during this month
      prisma.customerBranch.count({
        where: { branchId, registeredAt: { gte: startOfMonth, lte: endOfMonth } },
      }),
      // Distinct visitors this month
      prisma.visit.findMany({
        where: { branchId, startedAt: { gte: startOfMonth, lte: endOfMonth } },
        select: { customerId: true },
        distinct: ["customerId"],
      }),
      // Revenue this month (closed visits only)
      prisma.visit.aggregate({
        where: {
          branchId,
          startedAt: { gte: startOfMonth, lte: endOfMonth },
          status: { in: ["INVOICED", "PAID"] },
        },
        _sum: { totalPrice: true },
      }),
    ]);

  const activeCustomers = activeCustomersResult.length;
  const totalRevenue = Number(revenueResult._sum.totalPrice ?? 0);
  const avgSpendPerCustomer =
    activeCustomers > 0
      ? Math.round((totalRevenue / activeCustomers) * 100) / 100
      : 0;

  return prisma.branchMonthlyStats.upsert({
    where: { branchId_month_year: { branchId, month, year } },
    update: { newCustomers, activeCustomers, totalRevenue, avgSpendPerCustomer },
    create: {
      branchId,
      month,
      year,
      newCustomers,
      activeCustomers,
      totalRevenue,
      avgSpendPerCustomer,
    },
  });
};

export const runMonthlyBranchStats = async () => {
  const now = new Date();
  // Always snapshot the previous month
  const targetMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const targetYear =
    now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  const branches = await prisma.branch.findMany({ select: { id: true } });

  if (!branches.length) {
    console.log("[BranchStatsCron] No branches found. Skipping.");
    return { total: 0, success: 0, failed: 0 };
  }

  let success = 0;
  let failed = 0;

  for (const branch of branches) {
    try {
      await computeAndStoreBranchMonthlyStats(branch.id, targetYear, targetMonth);
      success += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `[BranchStatsCron] Failed for branch ${branch.id}:`,
        error,
      );
    }
  }

  console.log(
    `[BranchStatsCron] Done. month=${targetMonth}/${targetYear}, total=${branches.length}, success=${success}, failed=${failed}`,
  );

  return { total: branches.length, success, failed };
};

export const startBranchStatsCron = () => {
  const enabled = process.env.ENABLE_BRANCH_STATS_CRON !== "false";

  if (!enabled) {
    console.log("[BranchStatsCron] Disabled by ENABLE_BRANCH_STATS_CRON=false");
    return null;
  }

  // Runs at 00:05 on the 1st of every month
  const schedule = process.env.BRANCH_STATS_CRON || "5 0 1 * *";
  const timezone = process.env.BRANCH_STATS_CRON_TZ || "UTC";

  if (!cron.validate(schedule)) {
    console.error(
      `[BranchStatsCron] Invalid cron expression: ${schedule}. Job not started.`,
    );
    return null;
  }

  const job = cron.schedule(
    schedule,
    async () => {
      try {
        await runMonthlyBranchStats();
      } catch (error) {
        console.error("[BranchStatsCron] Unexpected cron error:", error);
      }
    },
    { timezone },
  );

  console.log(
    `[BranchStatsCron] Started. schedule='${schedule}', timezone='${timezone}'`,
  );

  if (process.env.RUN_BRANCH_STATS_ON_BOOT === "true") {
    runMonthlyBranchStats().catch((error) => {
      console.error("[BranchStatsCron] Boot run failed:", error);
    });
  }

  return job;
};
