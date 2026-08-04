import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";

const cache = new Map();

export const getPermissionId = async (name) => {
  if (cache.has(name)) return cache.get(name); // ~0ms

  const permission = await prisma.permission.findUnique({
    where: { name },
    select: { id: true },
  });

  if (!permission) return null;
  cache.set(name, permission.id); // permanent — permissions never change
  return permission.id;
};

export const hasPermission = async (
  userId,
  roleId,
  roleName,
  permissionName,
  branchId = null,
  next,
) => {
  try {
    // Admin role has all permissions
    if (roleName === "OWNER" || roleName === "DEVELOPER") {
      return true;
    }

    const permissionId = await getPermissionId(permissionName);
    if (!permissionId) {
      // `next` is optional: callers outside the middleware chain (permission
      // granting, for one) just want the boolean.
      if (next) next(new AppError(`Permission ${permissionName} not found`, 404));
      return false;
    }

    if (branchId) {
      const branchUserPermission = await prisma.branchUserPermission.findFirst({
        where: {
          userId,
          branchId,
          permissionId,
        },
        select: { isAllowed: true },
      });

      if (branchUserPermission) {
        return branchUserPermission.isAllowed;
      }
    }

    const userPermission = await prisma.userPermission.findFirst({
      where: {
        userId,
        permissionId,
      },
      select: { isAllowed: true },
    });
    if (userPermission) {
      return userPermission.isAllowed;
    }

    const rolePermission = await prisma.rolePermission.findFirst({
      where: {
        roleId,
        permissionId,
      },
      select: { id: true },
    });
    if (rolePermission) {
      return true;
    }
    return false;
  } catch (error) {
    if (next) return next(error);
    throw error;
  }
};
