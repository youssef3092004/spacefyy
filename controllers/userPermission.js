import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";

export const createUserPermission = async (req, res, next) => {
  try {
    const { userId, permissionIds, isAllowed } = req.body;
    if (!userId) {
      return next(new AppError("UserId is required", 400));
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        id: userId,
      },
    });

    if (!existingUser) {
      return next(new AppError("User not found", 404));
    }

    if (
      !permissionIds ||
      !Array.isArray(permissionIds) ||
      permissionIds.length === 0
    ) {
      return next(new AppError("PermissionIds are required", 400));
    }

    const existingPermissions = await prisma.permission.findMany({
      where: {
        id: { in: permissionIds },
      },
    });

    if (!existingPermissions.length || existingPermissions.length === 0) {
      return next(new AppError("No permissions found", 404));
    }

    if (existingPermissions.length !== permissionIds.length) {
      return next(new AppError("One or more permissions not found", 404));
    }

    const userPermission = await prisma.userPermission.createMany({
      data: permissionIds.map((permissionId) => ({
        userId,
        permissionId,
        isAllowed: isAllowed !== undefined ? isAllowed : true,
      })),
      skipDuplicates: true,
    });
    res.status(201).json({
      success: true,
      message: "User permission created successfully",
      insertedCount: userPermission.count,
    });
  } catch (error) {
    next(error);
  }
};

export const getUserPermissionByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return next(new AppError("UserId is required", 400));
    }

    const { page, limit, skip, sort, order } = pagination(req);

    const [userPermissions, total] = await prisma.$transaction([
      prisma.userPermission.findMany({
        where: { userId },
        include: { permission: true },
        skip,
        take: limit,
        orderBy: { [sort]: order },
      }),
      prisma.userPermission.count({
        where: { userId },
      }),
    ]);

    if (!userPermissions.length) {
      return next(new AppError("No permissions found for this user", 404));
    }

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: userPermissions,
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

export const getUserPermissionByUserIdIsAllowed = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return next(new AppError("UserId is required", 400));
    }

    const { page, limit, skip, sort, order } = pagination(req);

    const [userPermissions, total] = await prisma.$transaction([
      prisma.userPermission.findMany({
        where: { userId, isAllowed: true },
        include: { permission: true },
        skip,
        take: limit,
        orderBy: { [sort]: order },
      }),
      prisma.userPermission.count({
        where: { userId, isAllowed: true },
      }),
    ]);

    if (!userPermissions.length) {
      return next(new AppError("No permissions found for this user", 404));
    }

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: userPermissions,
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

export const updateUserPermissionByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { permissionIds, isAllowed } = req.body;

    if (!userId) {
      return next(new AppError("UserId is required", 400));
    }
    if (
      !permissionIds ||
      !Array.isArray(permissionIds) ||
      permissionIds.length === 0
    ) {
      return next(new AppError("PermissionIds are required", 400));
    }
    if (typeof isAllowed !== "boolean") {
      return next(new AppError("isAllowed must be a boolean value", 400));
    }

    const updateResult = await prisma.userPermission.updateMany({
      where: {
        userId,
        permissionId: { in: permissionIds },
      },
      data: {
        isAllowed,
      },
    });

    if (updateResult.count === 0) {
      return next(new AppError("No matching permissions found to update", 404));
    }

    res.status(200).json({
      success: true,
      message: "User permissions updated successfully",
      updatedCount: updateResult.count,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteUserPermissionByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return next(new AppError("UserId is required", 400));
    }
    const deleteResult = await prisma.userPermission.deleteMany({
      where: { userId },
    });
    if (deleteResult.count === 0) {
      return next(new AppError("No permissions found to delete", 404));
    }
    res.status(200).json({
      success: true,
      message: "User permissions deleted successfully",
      deletedCount: deleteResult.count,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteSpecificUserPermissions = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { permissionIds } = req.body;
    if (!userId) {
      return next(new AppError("UserId is required", 400));
    }
    const existingUser = await prisma.user.findFirst({
      where: {
        id: userId,
      },
    });
    if (!existingUser) {
      return next(new AppError("User not found", 404));
    }
    if (
      !permissionIds ||
      !Array.isArray(permissionIds) ||
      permissionIds.length === 0
    ) {
      return next(new AppError("PermissionIds are required", 400));
    }
    const deleteResult = await prisma.userPermission.deleteMany({
      where: {
        userId,
        permissionId: { in: permissionIds },
      },
    });
    if (deleteResult.count === 0) {
      return next(new AppError("No matching permissions found to delete", 404));
    }
    res.status(200).json({
      success: true,
      message: "Specific user permissions deleted successfully",
      deletedCount: deleteResult.count,
    });
  } catch (error) {
    next(error);
  }
};
