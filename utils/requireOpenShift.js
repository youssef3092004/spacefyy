import { prisma } from "../configs/db.js";
import { AppError } from "./appError.js";

// OWNER/DEVELOPER can operate regardless of shift state — same bypass
// convention as checkOwnership.js/checkPermission.js.
const BYPASS_ROLES = new Set(["OWNER", "DEVELOPER"]);

// Core check, callable directly from controllers that resolve branchId
// dynamically rather than via checkOwnership (e.g. addOrderItems, which only
// knows the branch after distinguishing a visit order from a takeaway order).
// Returns the open Shift row (id only), or null when the caller's role
// bypasses gating.
export const assertOpenShift = async (branchId, roleName) => {
  if (BYPASS_ROLES.has(roleName)) return null;
  if (!branchId) {
    throw new AppError("branchId is required to verify shift status", 400);
  }

  const shift = await prisma.shift.findFirst({
    where: { branchId, status: "OPEN" },
    select: { id: true },
  });

  if (!shift) {
    throw new AppError(
      "No open shift for this branch. Open a shift before recording sales.",
      400,
    );
  }

  return shift;
};

// Express middleware for routes where checkOwnership({scope:"branch"}) already
// ran and set req.branchId. Attaches the open shift as req.openShift (null
// for OWNER/DEVELOPER) so controllers can stamp it onto records (e.g. an
// invoice's shiftId at the moment of payment) without a second query.
export const requireOpenShift = () => {
  return async (req, res, next) => {
    try {
      const branchId =
        req.branchId || req.params.branchId || req.body?.branchId;
      req.openShift = await assertOpenShift(branchId, req.user?.roleName);
      next();
    } catch (error) {
      next(error);
    }
  };
};
