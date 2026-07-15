import { Router } from "express";
import {
  addExpense,
  getShiftExpenses,
  deleteExpense,
} from "../controllers/shiftExpense.js";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";

const router = Router();

// Record a petty-cash payout during an OPEN shift.
router.post(
  "/create/:shiftId",
  verifyToken,
  checkPermission("MANAGE-EXPENSES"),
  checkOwnership({ model: "shift", paramId: "shiftId", scope: "branch" }),
  addExpense,
);

// List all expenses for a shift.
router.get(
  "/getAll/:shiftId",
  verifyToken,
  checkPermission("VIEW-SHIFTS"),
  checkOwnership({ model: "shift", paramId: "shiftId", scope: "branch" }),
  getShiftExpenses,
);

// Remove an expense from an OPEN shift.
router.delete(
  "/delete/:shiftId/:expenseId",
  verifyToken,
  checkPermission("MANAGE-EXPENSES"),
  checkOwnership({ model: "shift", paramId: "shiftId", scope: "branch" }),
  deleteExpense,
);

export default router;
