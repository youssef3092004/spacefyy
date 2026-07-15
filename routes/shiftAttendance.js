import { Router } from "express";
import {
  addAttendance,
  updateAttendance,
  getShiftAttendance,
} from "../controllers/shiftAttendance.js";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";

const router = Router();

// Add a staff member's attendance to an OPEN shift.
router.post(
  "/create/:shiftId",
  verifyToken,
  checkPermission("MANAGE-ATTENDANCE"),
  checkOwnership({ model: "shift", paramId: "shiftId", scope: "branch" }),
  addAttendance,
);

// Update an attendance record (status / check-out / notes) on an OPEN shift.
router.patch(
  "/update/:shiftId/:attendanceId",
  verifyToken,
  checkPermission("MANAGE-ATTENDANCE"),
  checkOwnership({ model: "shift", paramId: "shiftId", scope: "branch" }),
  updateAttendance,
);

// List all attendance for a shift.
router.get(
  "/getAll/:shiftId",
  verifyToken,
  checkPermission("VIEW-SHIFTS"),
  checkOwnership({ model: "shift", paramId: "shiftId", scope: "branch" }),
  getShiftAttendance,
);

export default router;
