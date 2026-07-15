import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";

const VALID_ATTENDANCE_STATUS = new Set([
  "PRESENT",
  "LATE",
  "ABSENT",
  "LEFT_EARLY",
]);

const ATTENDANCE_INCLUDE = {
  staffProfile: {
    select: {
      id: true,
      position: true,
      user: { select: { id: true, name: true } },
    },
  },
};

// Attendance is only editable while its shift is OPEN — a closed shift is a
// finalized record.
const ensureShiftOpen = async (shiftId) => {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: { id: true, status: true, branchId: true },
  });
  if (!shift) throw new AppError("Shift not found", 404);
  if (shift.status !== "OPEN") {
    throw new AppError("This shift is closed and its attendance is read-only", 400);
  }
  return shift;
};

const parseDate = (value, label) => {
  if (value === undefined || value === null) return undefined;
  const d = new Date(value);
  if (isNaN(d)) throw new AppError(`Invalid ${label}`, 400);
  return d;
};

// ─── Controllers ──────────────────────────────────────────────────────────────

export const addAttendance = async (req, res, next) => {
  try {
    const { shiftId } = req.params;
    const { staffProfileId, status, checkInTime, notes } = req.body ?? {};

    if (!staffProfileId) {
      return next(new AppError("staffProfileId is required", 400));
    }
    if (status && !VALID_ATTENDANCE_STATUS.has(status)) {
      return next(
        new AppError("Invalid status. Use PRESENT, LATE, ABSENT or LEFT_EARLY", 400),
      );
    }

    const shift = await ensureShiftOpen(shiftId);

    // Staff must belong to the same branch as the shift.
    const staffProfile = await prisma.staffProfile.findUnique({
      where: { id: staffProfileId },
      select: { id: true, branchId: true },
    });
    if (!staffProfile) return next(new AppError("Staff profile not found", 404));
    if (staffProfile.branchId !== shift.branchId) {
      return next(
        new AppError("Staff member does not belong to this shift's branch", 400),
      );
    }

    const existing = await prisma.shiftAttendance.findUnique({
      where: { shiftId_staffProfileId: { shiftId, staffProfileId } },
      select: { id: true },
    });
    if (existing) {
      return next(new AppError("This staff member is already on this shift", 400));
    }

    const checkIn = parseDate(checkInTime, "checkInTime");

    const attendance = await prisma.shiftAttendance.create({
      data: {
        shiftId,
        staffProfileId,
        status: status ?? "PRESENT",
        checkInTime: checkIn ?? new Date(),
        notes: notes?.trim() || null,
      },
      include: ATTENDANCE_INCLUDE,
    });

    res.status(201).json({
      success: true,
      message: "Attendance recorded successfully",
      data: attendance,
    });
  } catch (error) {
    next(error);
  }
};

export const updateAttendance = async (req, res, next) => {
  try {
    const { shiftId, attendanceId } = req.params;
    const { status, checkInTime, checkOutTime, notes } = req.body ?? {};

    if (status && !VALID_ATTENDANCE_STATUS.has(status)) {
      return next(
        new AppError("Invalid status. Use PRESENT, LATE, ABSENT or LEFT_EARLY", 400),
      );
    }

    await ensureShiftOpen(shiftId);

    const attendance = await prisma.shiftAttendance.findUnique({
      where: { id: attendanceId },
      select: { id: true, shiftId: true },
    });
    if (!attendance || attendance.shiftId !== shiftId) {
      return next(new AppError("Attendance record not found on this shift", 404));
    }

    const data = {};
    if (status !== undefined) data.status = status;
    if (notes !== undefined) data.notes = notes?.trim() || null;
    const checkIn = parseDate(checkInTime, "checkInTime");
    if (checkIn !== undefined) data.checkInTime = checkIn;
    const checkOut = parseDate(checkOutTime, "checkOutTime");
    if (checkOut !== undefined) data.checkOutTime = checkOut;

    if (Object.keys(data).length === 0) {
      return next(new AppError("No valid fields to update", 400));
    }

    const updated = await prisma.shiftAttendance.update({
      where: { id: attendanceId },
      data,
      include: ATTENDANCE_INCLUDE,
    });

    res.status(200).json({
      success: true,
      message: "Attendance updated successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

export const getShiftAttendance = async (req, res, next) => {
  try {
    const { shiftId } = req.params;

    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      select: { id: true },
    });
    if (!shift) return next(new AppError("Shift not found", 404));

    const attendance = await prisma.shiftAttendance.findMany({
      where: { shiftId },
      include: ATTENDANCE_INCLUDE,
      orderBy: { createdAt: "asc" },
    });

    res.status(200).json({ success: true, data: attendance, source: "database" });
  } catch (error) {
    next(error);
  }
};
