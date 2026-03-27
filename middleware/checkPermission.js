import { AppError } from "../utils/appError.js";
import { formatPermission } from "../utils/formatPermission.js";
import { hasPermission } from "../utils/hasPermission.js";

/**
 * Permission check middleware
 *
 * Usage:
 * router.post("/create", checkPermission("CREATE-BRANCHES"), controller);
 *
 * For branch-scoped actions:
 * router.post("/create", checkPermission("CREATE-DEVICES", true), controller);
 *
 * @param {string} permissionName - Permission name
 * @param {boolean} [requireBranchId=false] - If true, extracts branchId from request
 */

export const checkPermission = (permissionName, requireBranchId = false) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.roleId) {
        return next(
          new AppError(
            "Unauthorized: You must be logged in to access this resource",
            401,
          ),
        );
      }

      const { userId, roleId } = req.user;
      const roleName = req.user.roleName;

      if (!roleName) {
        return next(new AppError("Role not found in user session", 403));
      }

      let branchId = null;
      if (requireBranchId) {
        branchId =
          req.params.branchId || req.body?.branchId || req.query?.branchId;

        if (!branchId) {
          return next(
            new AppError(
              `branchId is required for permission: ${permissionName}`,
              400,
            ),
          );
        }
      }

      const allowed = await hasPermission(
        userId,
        roleId,
        roleName,
        permissionName,
        branchId,
        next,
      );

      if (!allowed) {
        const permission = await formatPermission(permissionName);
        return next(
          new AppError(
            `Forbidden: You do not have permission to perform ${permission}`,
            403,
          ),
        );
      }

      if (branchId) {
        req.branchId = branchId;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
