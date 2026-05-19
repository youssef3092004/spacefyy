import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";
import { messages } from "../locales/message.js";

const fixStatus = (status) => {
  if (!status) return null;
  const upperStatus = String(status).toUpperCase();
  if (["PENDING", "APPROVED", "REJECTED", "PAID"].includes(upperStatus)) {
    return upperStatus;
  }
  return null;
};

export const createPayroll = async (req, res, next) => {
  try {
    const {
      staffProfileId,
      bonus = 0,
      overtime = 0,
      deductions = 0,
      method,
      month,
      year,
    } = req.body;
    const requiredFields = { staffProfileId, method, month, year };
    for (const [field, value] of Object.entries(requiredFields)) {
      if (value === undefined || value === null) {
        return next(new AppError(`${field} is required`, 400));
      }
    }
    if (bonus < 0 || overtime < 0 || deductions < 0) {
      return next(new AppError("Salary components cannot be negative", 400));
    }
    if (month < 1 || month > 12) {
      return next(new AppError("Month must be between 1 and 12", 400));
    }

    if (year < 2000 || year > new Date().getFullYear() + 1) {
      return next(new AppError("Invalid year", 400));
    }
    if (!["CASH", "BANK", "INSTAPAY", "CARD"].includes(method)) {
      return next(new AppError("Invalid payment method", 400));
    }

    const staffProfile = await prisma.staffProfile.findUnique({
      where: { id: staffProfileId },
    });
    if (!staffProfile) {
      return next(new AppError("Staff profile not found", 404));
    }
    const payrollExists = await prisma.payroll.findFirst({
      where: {
        staffProfileId,
        month,
        year,
      },
    });
    if (payrollExists) {
      return next(
        new AppError(
          "Payroll for this staff and this month already exists",
          400,
        ),
      );
    }
    const baseSalary = staffProfile.baseSalary;
    const calculatedGrossSalary =
      parseFloat(baseSalary) + parseFloat(bonus) + parseFloat(overtime);
    const calculatedNetSalary = calculatedGrossSalary - parseFloat(deductions);
    const newPayroll = await prisma.payroll.create({
      data: {
        staffProfileId,
        grossSalary: calculatedGrossSalary,
        bonus,
        overtime,
        deductions,
        netSalary: calculatedNetSalary,
        method,
        month,
        year,
      },
      include: {
        staffProfile: {
          select: {
            branchId: true,
          },
        },
      },
    });
    res.status(201).json({
      success: true,
      message: "Payroll created successfully",
      data: newPayroll,
    });
  } catch (error) {
    next(error);
  }
};

export const changeStatusPayroll = async (req, res, next) => {
  try {
    const { branchId, payrollId } = req.params;
    const { status } = req.body;

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return next(new AppError("Invalid status value", 400));
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) {
      return next(new AppError(messages.BRANCH_NOT_FOUND.en, 404));
    }
    const payroll = await prisma.payroll.findFirst({
      where: { id: payrollId, staffProfile: { branchId: branchId } },
    });
    if (!payroll) {
      return next(new AppError("Payroll record not found", 404));
    }
    if (payroll.status !== "PENDING") {
      return next(
        new AppError("Only pending payrolls can be approved or rejected", 400),
      );
    }

    const updatedPayroll = await prisma.payroll.update({
      where: { id: payrollId },
      data: {
        status: status,
        approvedById: req.user.id,
        approvedAt: new Date(),
      },
    });
    res.status(200).json({
      success: true,
      message: "Payroll status updated successfully",
      data: updatedPayroll,
    });
  } catch (error) {
    next(error);
  }
};

export const changeStatusToPaidPayroll = async (req, res, next) => {
  try {
    const { branchId, payrollId } = req.params;

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) {
      return next(new AppError(messages.BRANCH_NOT_FOUND.en, 404));
    }
    const paidAt = new Date();
    const updated = await prisma.payroll.updateMany({
      where: {
        id: payrollId,
        status: "APPROVED",
        staffProfile: { branchId },
      },
      data: {
        status: "PAID",
        paidAt,
      },
    });

    if (updated.count === 0) {
      const existingPayroll = await prisma.payroll.findFirst({
        where: { id: payrollId, staffProfile: { branchId } },
        select: { id: true, status: true },
      });

      if (!existingPayroll) {
        return next(new AppError("Payroll record not found", 404));
      }

      return next(
        new AppError("Only approved payrolls can be marked as paid", 400),
      );
    }

    const updatedPayroll = await prisma.payroll.findUnique({
      where: { id: payrollId },
    });

    //! Here you might want to integrate with an actual payment gateway & make the expenses record

    res.status(200).json({
      success: true,
      message: "Payroll marked as paid successfully",
      data: updatedPayroll,
    });
  } catch (error) {
    next(error);
  }
};

export const getPayrollById = async (req, res, next) => {
  try {
    const { branchId, payrollId } = req.params;
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) {
      return next(new AppError("Branch not found", 404));
    }
    const payroll = await prisma.payroll.findFirst({
      where: { id: payrollId, staffProfile: { branchId: branchId } },
    });
    if (!payroll) {
      return next(new AppError("Payroll record not found", 404));
    }
    res.status(200).json({
      success: true,
      message: "Payroll record retrieved successfully",
      data: payroll,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getPayrollByStaffId = async (req, res, next) => {
  try {
    const { branchId, staffId } = req.params;
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) {
      return next(new AppError(messages.BRANCH_NOT_FOUND.en, 404));
    }
    const payroll = await prisma.payroll.findMany({
      where: {
        staffProfileId: staffId,
        staffProfile: { branchId: branchId },
      },
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json({
      success: true,
      message: "Payroll records retrieved successfully",
      data: payroll,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getPayrolls = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) {
      return next(new AppError(messages.BRANCH_NOT_FOUND.en, 404));
    }
    const { page, limit, skip, order, sort } = pagination(req);
    //! fix the filters as a many endpoints
    const { status, month, year } = req.query;
    const filter = {};
    if (status) {
      const fixedStatus = fixStatus(status);
      if (!fixedStatus) {
        return next(new AppError("Invalid status value", 400));
      }
      filter.status = fixedStatus;
    }
    if (month) filter.month = parseInt(month);
    if (year) filter.year = parseInt(year);
    const totalRecords = await prisma.payroll.count({ where: filter });
    const payrolls = await prisma.payroll.findMany({
      where: filter,
      skip: skip,
      take: limit,
      orderBy: { [sort]: order },
    });
    res.status(200).json({
      success: true,
      message: "Payrolls retrieved successfully",
      data: payrolls,
      pagination: {
        totalRecords,
        currentPage: page,
        totalPages: Math.ceil(totalRecords / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const deletePayrollById = async (req, res, next) => {
  try {
    const { branchId, payrollId } = req.params;
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) {
      return next(new AppError(messages.BRANCH_NOT_FOUND.en, 404));
    }
    const payroll = await prisma.payroll.findFirst({
      where: { id: payrollId, staffProfile: { branchId: branchId } },
    });
    if (!payroll) {
      return next(new AppError("Payroll record not found", 404));
    }
    await prisma.payroll.delete({
      where: { id: payrollId },
    });
    res
      .status(200)
      .json({ success: true, message: "Payroll record deleted successfully" });
  } catch (error) {
    next(error);
  }
};

export const deleteAllPayrollsByBranchId = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER" && req.user.roleName !== "OWNER") {
      return next(new AppError(messages.FORBIDDEN.en, 403));
    }
    const { branchId } = req.params;
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) {
      return next(new AppError("Branch not found", 404));
    }
    const result = await prisma.payroll.deleteMany({
      where: { staffProfile: { branchId: branchId } },
    });
    if (!result.count || result.count === 0) {
      return next(new AppError("No payroll records to delete", 404));
    }
    res.status(200).json({
      success: true,
      message: "All payrolls deleted",
      count: result.count,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAllPayrolls = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(new AppError(messages.FORBIDDEN.en, 403));
    }
    const result = await prisma.payroll.deleteMany({});
    if (!result.count || result.count === 0) {
      return next(new AppError("No payroll records to delete", 404));
    }
    res.status(200).json({
      success: true,
      message: "All payrolls deleted",
      count: result.count,
    });
  } catch (error) {
    next(error);
  }
};
