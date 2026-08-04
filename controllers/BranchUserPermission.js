import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";
import {
  checkBranchAccess,
  getAccessibleBranchIds,
} from "../utils/checkBranchAccess.js";
import { hasPermission } from "../utils/hasPermission.js";

// The route middleware only sees req.params/query/body.branchId — this endpoint
// writes to body.branchIds, an entirely different key. Every branch named there
// has to be one the caller can actually reach.
const assertBranchesReachable = async (req, branchIds) => {
  const userId = req.user?.id || req.user?.userId;
  const roleName = req.user?.roleName;

  for (const branchId of branchIds) {
    const hasAccess = await checkBranchAccess(userId, roleName, branchId);
    if (!hasAccess) {
      throw new AppError(`You do not have access to branch ${branchId}`, 403);
    }
  }
};

// Returns the branch filter to apply to a bulk read/delete: the requested
// branch when one is given, otherwise every branch the caller can reach.
// DEVELOPER gets no filter at all.
const getReachableBranchScope = async (req, requestedBranchId) => {
  if (requestedBranchId) {
    await assertBranchesReachable(req, [requestedBranchId]);
    return { branchId: requestedBranchId };
  }

  if (req.user?.roleName === "DEVELOPER") return {};

  const branchIds = await getAccessibleBranchIds(
    req.user?.id || req.user?.userId,
    req.user?.roleName,
  );
  return { branchId: { in: branchIds } };
};

// You cannot grant what you do not hold — otherwise any ADMIN could mint
// permissions they were never given, on any account.
const assertGrantorHoldsPermissions = async (req, permissionIds, branchIds) => {
  const roleName = req.user?.roleName;
  if (roleName === "DEVELOPER" || roleName === "OWNER") return;

  const permissions = await prisma.permission.findMany({
    where: { id: { in: permissionIds } },
    select: { id: true, name: true },
  });

  for (const permission of permissions) {
    for (const branchId of branchIds) {
      const allowed = await hasPermission(
        req.user?.id || req.user?.userId,
        req.user?.roleId,
        roleName,
        permission.name,
        branchId,
      );
      if (!allowed) {
        throw new AppError(
          `You cannot grant a permission you do not hold: ${permission.name}`,
          403,
        );
      }
    }
  }
};

export const createBranchUserPermission = async (req, res, next) => {
  try {
    const { userId, branchIds, permissionIds, isAllowed } = req.body;

    if (!userId) {
      return next(new AppError("UserId is required", 400));
    }
    if (!Array.isArray(branchIds) || branchIds.length === 0) {
      return next(new AppError("branchIds must be a non-empty array", 400));
    }
    if (!Array.isArray(permissionIds) || permissionIds.length === 0) {
      return next(new AppError("permissionIds must be a non-empty array", 400));
    }

    const userExists = await prisma.user.findUnique({ where: { id: userId } });
    if (!userExists) {
      return next(new AppError("User not found", 404));
    }

    const existingBranches = await prisma.branch.findMany({
      where: { id: { in: branchIds } },
    });

    if (!existingBranches.length || existingBranches.length === 0) {
      return next(new AppError("One or more branch IDs not found", 404));
    }

    if (existingBranches.length !== branchIds.length) {
      return next(new AppError("One or more branch IDs not found", 404));
    }

    const existingPermissions = await prisma.permission.findMany({
      where: { id: { in: permissionIds } },
    });
    if (existingPermissions.length !== permissionIds.length) {
      return next(new AppError("One or more permission IDs not found", 404));
    }

    await assertBranchesReachable(req, branchIds);
    await assertGrantorHoldsPermissions(req, permissionIds, branchIds);

    const data = [];
    for (const branchId of branchIds) {
      for (const permissionId of permissionIds) {
        data.push({
          userId,
          branchId,
          permissionId,
          ...(typeof isAllowed === "boolean"
            ? { isAllowed }
            : { isAllowed: true }),
        });
      }
    }

    const [result, total] = await prisma.$transaction([
      prisma.branchUserPermission.createMany({
        data,
        skipDuplicates: true,
      }),
      prisma.branchUserPermission.count({ where: { userId } }),
    ]);

    res.status(201).json({
      success: true,
      message: "Branch user permissions created successfully",
      insertedCount: result.count,
      totalRecords: total,
    });
  } catch (error) {
    next(error);
  }
};

export const getBranchUserPermissionByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { branchId } = req.query;

    if (!userId) {
      return next(new AppError("UserId is required", 400));
    }

    const { page, limit, skip, sort, order } = pagination(req);

    const where = {
      userId,
      ...(branchId ? { branchId } : {}),
    };

    const [branchUserPermissions, total] = await prisma.$transaction([
      prisma.branchUserPermission.findMany({
        where,
        include: { permission: true, branch: true },
        skip,
        take: limit,
        orderBy: { [sort]: order },
      }),
      prisma.branchUserPermission.count({ where }),
    ]);

    if (!branchUserPermissions.length) {
      return next(new AppError("No permissions found for this user", 404));
    }

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: branchUserPermissions,
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

export const updateBranchUserPermissionByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { branchId, permissionIds, isAllowed } = req.body;

    if (!userId) {
      return next(new AppError("UserId is required", 400));
    }
    if (!branchId) {
      return next(new AppError("BranchId is required", 400));
    }
    if (!Array.isArray(permissionIds) || permissionIds.length === 0) {
      return next(new AppError("permissionIds must be a non-empty array", 400));
    }
    if (typeof isAllowed !== "undefined" && typeof isAllowed !== "boolean") {
      return next(new AppError("isAllowed must be a boolean value", 400));
    }

    await assertBranchesReachable(req, [branchId]);
    await assertGrantorHoldsPermissions(req, permissionIds, [branchId]);

    const updateResult = await prisma.branchUserPermission.updateMany({
      where: {
        userId,
        branchId,
        permissionId: { in: permissionIds },
      },
      data: {
        ...(typeof isAllowed === "boolean" ? { isAllowed } : {}),
      },
    });

    if (updateResult.count === 0) {
      return next(new AppError("No matching permissions found to update", 404));
    }

    res.status(200).json({
      success: true,
      message: "Branch user permissions updated successfully",
      updatedCount: updateResult.count,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteSpecificBranchUserPermissionByUserId = async (
  req,
  res,
  next,
) => {
  try {
    const { userId } = req.params;
    const { branchId, permissionIds } = req.body;

    if (!userId) {
      return next(new AppError("UserId is required", 400));
    }
    if (
      permissionIds &&
      (!Array.isArray(permissionIds) || permissionIds.length === 0)
    ) {
      return next(new AppError("permissionIds must be a non-empty array", 400));
    }

    // With no branchId this would strip a user's grants across every branch on
    // the platform, including another tenant's isAllowed:false denials.
    const reachableBranchIds = await getReachableBranchScope(req, branchId);

    const where = {
      userId,
      ...reachableBranchIds,
      ...(permissionIds ? { permissionId: { in: permissionIds } } : {}),
    };

    const deleteResult = await prisma.branchUserPermission.deleteMany({
      where,
    });

    if (deleteResult.count === 0) {
      return next(new AppError("No permissions found to delete", 404));
    }

    res.status(200).json({
      success: true,
      message: "Branch user permissions deleted successfully",
      deletedCount: deleteResult.count,
    });
  } catch (error) {
    console.error(
      `[deleteBranchUserPermissionByUserId] Error deleting permissions for userId: ${req.params.userId}`,
      error,
    );
    next(error);
  }
};

export const deleteBranchUserPermissionByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return next(new AppError("UserId is required", 400));
    }
    const deleteResult = await prisma.branchUserPermission.deleteMany({
      where: { userId, ...(await getReachableBranchScope(req, null)) },
    });
    if (deleteResult.count === 0) {
      return next(new AppError("No permissions found to delete", 404));
    }
    res.status(200).json({
      success: true,
      message: "Branch user permissions deleted successfully",
      deletedCount: deleteResult.count,
    });
  } catch (error) {
    next(error);
  }
};
