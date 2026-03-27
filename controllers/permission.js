import { prisma } from "../configs/db.js";
import { redisClient } from "../configs/redis.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";

export const createPermission = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(
        new AppError("Forbidden: Only DEVELOPER can create permissions", 403),
      );
    }
    const { name, description } = req.body;
    if (!name || !description) {
      return next(new AppError("Name and description are required", 400));
    }
    const existingPermission = await prisma.permission.findUnique({
      where: { name },
    });
    if (existingPermission) {
      return next(
        new AppError("Permission with this name already exists", 400),
      );
    }
    const newPermission = await prisma.permission.create({
      data: {
        name,
        description,
      },
    });
    const keys = await redisClient.keys("permissions:*");
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
    res.status(201).json({
      status: "success",
      data: newPermission,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getPermissionById = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(
        new AppError("Forbidden: Only DEVELOPER can get permissions", 403),
      );
    }
    const { id } = req.params;
    if (!id) {
      return next(new AppError("Permission ID is required", 400));
    }
    const permission = await prisma.permission.findUnique({
      where: { id },
    });
    if (!permission) {
      return next(new AppError("Permission not found", 404));
    }
    res.status(200).json({
      status: "success",
      data: permission,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getAllPermissions = async (req, res, next) => {
  try {
    // if (req.user.roleName !== "DEVELOPER") {
    //   return next(
    //     new AppError("Forbidden: Only DEVELOPER can get permissions", 403),
    //   );
    // }
    const { page, limit, skip, sort, order } = pagination(req);

    const [total, permissions] = await prisma.$transaction([
      prisma.permission.count(),
      prisma.permission.findMany({
        skip,
        take: limit,
        orderBy: {
          [sort]: order,
        },
      }),
    ]);

    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

    res.status(200).json({
      status: "success",
      data: permissions,
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

export const deletePermissionById = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(
        new AppError("Forbidden: Only DEVELOPER can delete permissions", 403),
      );
    }
    const { id } = req.params;
    if (!id) {
      return next(new AppError("Permission ID is required", 400));
    }
    const permission = await prisma.permission.delete({
      where: { id },
    });
    if (!permission) {
      return next(new AppError("Permission not found", 404));
    }
    await redisClient.del(`permission:${id}`);
    const keys = await redisClient.keys("permissions:*");
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
    res.status(200).json({
      status: "success",
      message: "Permission deleted successfully",
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAllPermissions = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(
        new AppError("Forbidden: Only DEVELOPER can delete permissions", 403),
      );
    }
    const result = await prisma.permission.deleteMany({});
    const keys = await redisClient.keys("permissions:*");
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
    res.status(200).json({
      status: "success",
      message: "All permissions deleted successfully",
      count: result.count,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const updatePermissionById = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(
        new AppError("Forbidden: Only DEVELOPER can update permissions", 403),
      );
    }
    const { id } = req.params;
    if (!id) {
      return next(new AppError("Permission ID is required", 400));
    }
    const { name, description } = req.body;
    if (!name || !description) {
      return next(new AppError("Name and description are required", 400));
    }
    const updatedPermission = await prisma.permission.update({
      where: { id },
      data: { name, description },
    });
    if (!updatedPermission) {
      return next(new AppError("Permission not found", 404));
    }
    await redisClient.del(`permission:${id}`);
    const keys = await redisClient.keys("permissions:*");
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
    res.status(200).json({
      status: "success",
      data: updatedPermission,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};
