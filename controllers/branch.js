import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";
import { compressAndUpload } from "../utils/cloudinary.js";
import {
  incrementStorageUsage,
  decrementStorageUsage,
} from "../utils/storageUsage.js";
import { invalidateCacheByPattern } from "../utils/cacheInvalidation.js";
import { messages } from "../locales/message.js";
import { getAccessibleBusinessIds } from "../utils/checkBranchAccess.js";

const timeToDate = (time) => {
  return new Date(`2026-01-01T${time}:00.000Z`);
};

const uploadBranchImage = async (file) => {
  if (!file) {
    return null;
  }

  const uploadResult = await compressAndUpload(file.buffer, "branches");
  return uploadResult.secure_url;
};

export const createBranch = async (req, res, next) => {
  try {
    const { name, address, businessId, openingTime, closingTime } = req.body;

    const requiredFields = {
      name,
      address,
      businessId,
      openingTime,
      closingTime,
    };

    for (let i in requiredFields) {
      if (!requiredFields[i]) {
        return next(
          new AppError(
            `${i.charAt(0).toUpperCase() + i.slice(1)} is required`,
            400,
          ),
        );
      }
    }

    const parseTimeToMinutes = (t) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };

    if (parseTimeToMinutes(openingTime) >= parseTimeToMinutes(closingTime)) {
      return next(
        new AppError("Opening time must be before closing time", 400),
      );
    }

    const existingBusiness = await prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!existingBusiness) return next(new AppError("Business not found", 404));

    const uploadResult = req.file
      ? await compressAndUpload(req.file.buffer, "branches")
      : null;

    const { incrementStorage, newBranch } = await prisma.$transaction(
      async (tx) => {
        const newBranch = await tx.branch.create({
          data: {
            name,
            address,
            businessId,
            ...(uploadResult?.secure_url && { image: uploadResult.secure_url }),
            openingTime: timeToDate(openingTime),
            closingTime: timeToDate(closingTime),
          },
        });

        const incrementStorage = await incrementStorageUsage(
          businessId,
          "branches",
          tx,
        );

        return { incrementStorage, newBranch };
      },
    );

    await invalidateCacheByPattern(`branches:*businessId=${businessId}*`);
    await invalidateCacheByPattern("businesses*");

    res.status(201).json({
      success: true,
      message: "Branch created successfully",
      data: newBranch,
      storageUsage: incrementStorage,
    });
  } catch (err) {
    next(err);
  }
};

export const getBranchById = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) {
      return next(new AppError("Branch not found", 404));
    }
    res.status(200).json({
      success: true,
      data: branch,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getAllBranches = async (req, res, next) => {
  try {
    const { page, limit, skip, sort, order } = pagination(req);

    // Unscoped, this handed every caller the branch ids of every tenant on the
    // platform. DEVELOPER (null) is the only role that sees across businesses.
    const businessIds = await getAccessibleBusinessIds(
      req.user?.id || req.user?.userId,
      req.user?.roleName,
    );
    const where = businessIds === null ? {} : { businessId: { in: businessIds } };

    const branches = await prisma.branch.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sort]: order },
    });

    if (!branches.length || branches.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    // If first page has fewer rows than limit, we already know total without extra count query.
    const total =
      page === 1 && branches.length < limit
        ? branches.length
        : await prisma.branch.count({ where });

    const totalPages = Math.ceil(total / limit);
    res.status(200).json({
      success: true,
      data: branches,
      meta: {
        page,
        limit,
        total,
        totalPages,
        sort,
        order,
      },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getBranchesByBusinessId = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    if (!businessId) {
      return next(new AppError("Business ID is required", 400));
    }
    const existingBusiness = await prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!existingBusiness) {
      return next(new AppError("Business not found", 404));
    }
    const [branches, total] = await prisma.$transaction([
      prisma.branch.findMany({
        where: { businessId },
      }),
      prisma.branch.count({
        where: { businessId },
      }),
    ]);
    if (!branches || branches.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }
    res.status(200).json({
      success: true,
      data: branches,
      meta: {
        total,
      },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const updateBranchById = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { name, address } = req.body;
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }
    const existingBranch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!existingBranch) {
      return next(new AppError("Branch not found", 404));
    }
    if (!name || !address) {
      return next(new AppError("Name and address are required", 400));
    }
    const image = await uploadBranchImage(req.file);
    const updatedBranch = await prisma.branch.update({
      where: { id: branchId },
      data: {
        name,
        address,
        ...(image ? { image } : {}),
      },
    });

    await invalidateCacheByPattern(`branch:*branchId=${branchId}*`);

    res.status(200).json({
      success: true,
      data: updatedBranch,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const updateBranchByIdPatch = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }
    const existingBranch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!existingBranch || existingBranch.length === 0) {
      return next(new AppError("Branch not found", 404));
    }
    const allowedFields = [
      "name",
      "address",
      "image",
      "openingTime",
      "closingTime",
    ];
    const updateData = { ...req.body };

    // Backward compatibility: ignore deprecated field if sent by old clients.
    if (Object.prototype.hasOwnProperty.call(updateData, "currency")) {
      delete updateData.currency;
    }

    if (updateData.openingTime) {
      const openingTime = updateData.openingTime;
      if (typeof openingTime !== "string") {
        return next(
          new AppError("Opening time must be a string in 'HH:MM' format", 400),
        );
      }
      updateData.openingTime = timeToDate(openingTime);
    }
    if (updateData.closingTime) {
      const closingTime = updateData.closingTime;
      if (typeof closingTime !== "string") {
        return next(
          new AppError("Closing time must be a string in 'HH:MM' format", 400),
        );
      }
      updateData.closingTime = timeToDate(closingTime);
    }

    const image = await uploadBranchImage(req.file);
    if (image) {
      updateData.image = image;
    }

    for (const key of Object.keys(updateData)) {
      if (!allowedFields.includes(key)) {
        return next(new AppError(`Field '${key}' cannot be updated`, 400));
      }
    }
    const updatedBranch = await prisma.branch.update({
      where: { id: branchId },
      data: updateData,
    });

    await invalidateCacheByPattern(`branch:*branchId=${branchId}*`);

    res.status(200).json({
      success: true,
      data: updatedBranch,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const deleteBranchById = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) {
      return next(new AppError("Branch not found", 404));
    }

    await prisma.$transaction(async (tx) => {
      await tx.branch.delete({
        where: { id: branchId },
      });

      await decrementStorageUsage(branch.businessId, "branches", tx);
    });

    await invalidateCacheByPattern(`branch:*branchId=${branchId}*`);
    await invalidateCacheByPattern(
      `branches:*businessId=${branch.businessId}*`,
    );
    await invalidateCacheByPattern("businesses*");

    res.status(200).json({
      success: true,
      message: "Branch deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAllBranches = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(new AppError(messages.FORBIDDEN.en, 403));
    }
    const deletedBranches = await prisma.branch.deleteMany({});
    if (deletedBranches.count === 0) {
      return next(new AppError("No branches to delete", 404));
    }

    await invalidateCacheByPattern(`branches:*`);
    await invalidateCacheByPattern("businesses*");

    res.status(200).json({
      success: true,
      message: "All branches deleted successfully",
      count: deletedBranches.count,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};
