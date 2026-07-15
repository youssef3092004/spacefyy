import { Router } from "express";
import {
  openShift,
  closeShift,
  getTodayShifts,
  getShiftById,
  getDailyShiftReport,
} from "../controllers/shift.js";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";

const router = Router();

// Open a new shift for a branch (creates the row).
router.post(
  "/open/:branchId",
  verifyToken,
  checkPermission("OPEN-SHIFTS", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  openShift,
);

// Close an open shift (requires handover notes).
router.post(
  "/close/:shiftId",
  verifyToken,
  checkPermission("CLOSE-SHIFTS"),
  checkOwnership({ model: "shift", paramId: "shiftId", scope: "branch" }),
  closeShift,
);

// All of today's shifts for a branch.
router.get(
  "/today/:branchId",
  verifyToken,
  checkPermission("VIEW-SHIFTS", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  getTodayShifts,
);

// Daily shift report: all shifts for a day + attendance/revenue totals.
router.get(
  "/report/daily/:branchId",
  verifyToken,
  checkPermission("VIEW-SHIFTS", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  getDailyShiftReport,
);

// Single shift with attendance and its revenue block.
router.get(
  "/getById/:shiftId",
  verifyToken,
  checkPermission("VIEW-SHIFTS"),
  checkOwnership({ model: "shift", paramId: "shiftId", scope: "branch" }),
  getShiftById,
);

export default router;
