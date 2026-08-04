import { AppError } from "../utils/appError.js";
import { formatPermission } from "../utils/formatPermission.js";
import { hasPermission } from "../utils/hasPermission.js";
import { checkBranchAccess } from "../utils/checkBranchAccess.js";

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

        // Owners and developers don't require branchId since they have all permissions
        if (!branchId && roleName !== "OWNER" && roleName !== "DEVELOPER") {
          return next(
            new AppError(
              `branchId is required for permission: ${permissionName}`,
              400,
            ),
          );
        }
      }

      // hasPermission answers "does this user hold the permission", and falls
      // back to their role-wide grant when no branch-specific row exists — so
      // on its own it never established that the branch is theirs to touch.
      if (branchId) {
        const hasAccess = await checkBranchAccess(
          userId || req.user?.id,
          roleName,
          branchId,
        );
        if (!hasAccess) {
          return next(
            new AppError("You do not have access to this branch", 403),
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
