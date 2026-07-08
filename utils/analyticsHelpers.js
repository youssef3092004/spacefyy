import { prisma } from "../configs/db.js";

export const getBranchIds = async (businessId, branchId) => {
  const where = { businessId, ...(branchId ? { id: branchId } : {}) };
  const branches = await prisma.branch.findMany({ where, select: { id: true } });
  return branches.map((b) => b.id);
};

export const toNum = (val) => Math.round((Number(val ?? 0) + Number.EPSILON) * 100) / 100;
