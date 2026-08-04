import process from "process";
import { prisma } from "../configs/db.js";
import { redisClient } from "../configs/redis.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";

// Where users land when their role is deleted. Lowest-privilege by design.
const FALLBACK_ROLE_NAME = process.env.FALLBACK_ROLE_NAME || "CUSTOMER";

export const createRole = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(
        new AppError("Forbidden: Only DEVELOPER can create roles", 403),
      );
    }
    const { name, description } = req.body;
    if (!name || !description) {
      return next(new AppError("Name and description are required", 400));
    }

    const existingRole = await prisma.role.findUnique({
      where: { name },
    });
    if (existingRole) {
      return next(new AppError("Role with this name already exists", 409));
    }
    const newRole = await prisma.role.create({
      data: {
        name,
        description,
      },
    });
    const keys = await redisClient.keys("roles:*");
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
    res.status(201).json({
      success: true,
      data: newRole,
    });
  } catch (error) {
    next(error);
  }
};

export const getRoles = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(new AppError("Forbidden: Only DEVELOPER can get roles", 403));
    }
    const { page, limit, skip, sort, order } = pagination(req);
    const [roles, total] = await prisma.$transaction([
      prisma.role.findMany({
        skip,
        take: limit,
        orderBy: { [sort]: order },
      }),
      prisma.role.count(),
    ]);
    if (!roles.length) {
      return next(new AppError("No roles found", 404));
    }
    const totalPages = Math.ceil(total / limit);
    res.status(200).json({
      success: true,
      data: roles,
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

export const getRoleById = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(
        new AppError("Forbidden: Only DEVELOPER can get roles by ID", 403),
      );
    }
    const { id } = req.params;
    if (!id) {
      return next(new AppError("Role ID is required", 400));
    }
    const role = await prisma.role.findUnique({
      where: { id },
    });
    if (!role) {
      return next(new AppError("Role not found", 404));
    }
    res.status(200).json({
      success: true,
      data: role,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteRoleById = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(
        new AppError("Forbidden: Only DEVELOPER can delete roles", 403),
      );
    }
    const { id } = req.params;
    if (!id) {
      return next(new AppError("Role ID is required", 400));
    }
    // Look the fallback up by name. The previous hardcoded UUID was
    // environment-specific: in any other database it either failed the foreign
    // key or silently moved every affected user into whatever role owned it.
    const fallbackRole = await prisma.role.findUnique({
      where: { name: FALLBACK_ROLE_NAME },
      select: { id: true },
    });
    if (!fallbackRole) {
      return next(
        new AppError(
          `Cannot delete this role: the fallback role "${FALLBACK_ROLE_NAME}" does not exist. Create it first.`,
          409,
        ),
      );
    }
    if (fallbackRole.id === id) {
      return next(
        new AppError(`Cannot delete the fallback role "${FALLBACK_ROLE_NAME}"`, 409),
      );
    }

    // One transaction: a reassignment that commits without the delete leaves
    // every affected user demoted for no reason.
    const [allUsersWithRole, role] = await prisma.$transaction([
      prisma.user.updateMany({
        where: { roleId: id },
        data: { roleId: fallbackRole.id },
      }),
      prisma.role.delete({ where: { id } }),
    ]);
    if (!role) {
      return next(new AppError("Role not found", 404));
    }
    const keys = await redisClient.keys(`role:${id}`);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
    const allKeys = await redisClient.keys("roles:*");
    if (allKeys.length > 0) {
      await redisClient.del(allKeys);
    }
    res.status(200).json({
      success: true,
      message: "Role deleted successfully",
      reassignedUsersCount: allUsersWithRole.count,
    });
  } catch (error) {
    next(error);
  }
};

export const updateRole = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(
        new AppError("Forbidden: Only DEVELOPER can update roles", 403),
      );
    }
    const { id } = req.params;
    if (!id) {
      return next(new AppError("Role ID is required", 400));
    }
    const { name, description } = req.body;
    if (!name && !description) {
      return next(
        new AppError(
          "At least one field (name or description) is required to update",
          400,
        ),
      );
    }
    const updatedRole = await prisma.role.update({
      where: { id },
      data: {
        name,
        description,
      },
    });
    await redisClient.del(`role:${id}`);
    const key = await redisClient.keys(`roles:*`);
    if (key.length > 0) {
      await redisClient.del(key);
    }
    res.status(200).json({
      success: true,
      data: updatedRole,
    });
  } catch (error) {
    next(error);
  }
};
