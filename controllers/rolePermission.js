import { prisma } from "../configs/db.js";
import { redisClient } from "../configs/redis.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";

export const createRolePermission = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(
        new AppError("Forbidden: Only DEVELOPER can assign permissions", 403),
      );
    }
    const { roleId, permissionIds } = req.body;
    if (!roleId) {
      return next(new AppError("Role ID are required", 400));
    }
    if (!Array.isArray(permissionIds) || permissionIds.length === 0) {
      return next(new AppError("permissionIds must be a non-empty array", 400));
    }

    const uniquePermissionIds = [...new Set(permissionIds)];

    const existingRolePermissions = await prisma.rolePermission.findMany({
      where: {
        roleId,
        permissionId: { in: uniquePermissionIds },
      },
      select: { permissionId: true },
    });

    const existingPermissionIds = new Set(
      existingRolePermissions.map((item) => item.permissionId),
    );

    const permissionsToInsert = uniquePermissionIds.filter(
      (permissionId) => !existingPermissionIds.has(permissionId),
    );

    const rolePermissionsData = permissionsToInsert.map((permissionId) => ({
      roleId,
      permissionId,
    }));

    if (!rolePermissionsData.length) {
      return res.status(200).json({
        success: true,
        message: "All provided permissions are already assigned to this role",
        insertedCount: 0,
      });
    }

    const result = await prisma.rolePermission.createMany({
      data: rolePermissionsData,
      skipDuplicates: true,
    });

    res.status(201).json({
      success: true,
      message: "Permissions assigned to role successfully",
      insertedCount: result.count,
    });
  } catch (error) {
    next(error);
  }
};

export const getRolePermissionById = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(
        new AppError(
          "Forbidden: Only DEVELOPER can view role-permissions",
          403,
        ),
      );
    }
    const { id } = req.params;
    if (!id) {
      return next(new AppError("Role-Permission ID is required", 400));
    }
    const rolePermission = await prisma.rolePermission.findUnique({
      where: { id },
    });
    if (!rolePermission || rolePermission === 0) {
      return next(new AppError("Role-Permission not found", 404));
    }
    res.status(200).json({
      success: true,
      data: rolePermission,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllRolePermissions = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(
        new AppError(
          "Forbidden: Only DEVELOPER can view role-permissions",
          403,
        ),
      );
    }
    const { page, limit, skip, sort, order } = pagination(req);

    const [rolePermissions, total] = await prisma.$transaction([
      prisma.rolePermission.findMany({
        skip,
        take: limit,
        orderBy: { [sort]: order },
      }),
      prisma.rolePermission.count(),
    ]);

    if (!rolePermissions.length) {
      return next(new AppError("No role-permissions found", 404));
    }

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: rolePermissions,
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

export const deleteAllRolePermissions = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(
        new AppError(
          "Forbidden: Only DEVELOPER can delete role-permissions",
          403,
        ),
      );
    }
    const result = await prisma.rolePermission.deleteMany({});
    const keys = await redisClient.keys("rolePermission:*");
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
    res.status(200).json({
      success: true,
      message: "All role-permissions deleted successfully",
      count: result.count,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteRolePermissionById = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(
        new AppError(
          "Forbidden: Only DEVELOPER can delete role-permissions",
          403,
        ),
      );
    }
    const { id } = req.params;
    if (!id) {
      return next(new AppError("Role-Permission ID is required", 400));
    }
    const rolePermission = await prisma.rolePermission.delete({
      where: { id },
    });
    if (!rolePermission || rolePermission === 0) {
      return next(new AppError("Role-Permission not found", 404));
    }
    await redisClient.del(`rolePermission:${id}`);
    res.status(200).json({
      success: true,
      message: "Role-Permission deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const updateRolePermissionById = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(
        new AppError(
          "Forbidden: Only DEVELOPER can update role-permissions",
          403,
        ),
      );
    }
    const { id } = req.params;
    const { roleId, permissionId } = req.body;
    if (!id) {
      return next(new AppError("Role-Permission ID is required", 400));
    }
    if (!roleId || !permissionId) {
      return next(new AppError("Role ID and Permission ID are required", 400));
    }
    const updatedRolePermission = await prisma.rolePermission.update({
      where: { id },
      data: { roleId, permissionId },
    });
    if (!updatedRolePermission) {
      return next(new AppError("Role-Permission not found", 404));
    }
    await redisClient.del(`rolePermission:${id}`);
    res.status(200).json({
      success: true,
      data: updatedRolePermission,
    });
  } catch (error) {
    next(error);
  }
};

export const getPermissionsByRoleId = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(
        new AppError(
          "Forbidden: Only DEVELOPER can view role-permissions",
          403,
        ),
      );
    }
    const { roleId } = req.params;
    if (!roleId) {
      return next(new AppError("Role ID is required", 400));
    }
    const { page, limit, skip, sort, order } = pagination(req);
    const [rolePermissions, total] = await prisma.$transaction([
      prisma.rolePermission.findMany({
        where: { roleId },
        include: { permission: true },
        skip,
        take: limit,
        orderBy: { [sort]: order },
      }),
      prisma.rolePermission.count({
        where: { roleId },
      }),
    ]);

    if (!rolePermissions.length) {
      return next(new AppError("No permissions found for this role", 404));
    }

    res.status(200).json({
      success: true,
      data: rolePermissions.map((rp) => rp.permission),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        sort,
        order,
      },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};
