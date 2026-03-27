import { prisma } from "../configs/db.js";
// import { AppError } from "./appError.js";

/**
 * Check if a STAFF user has access to a specific branch
 * For STAFF role: Check if user has staffProfile in that branch
 * For other roles: Check branchUserPermission only
 *
 * @param {string} userId - User ID
 * @param {string} roleName - User role name
 * @param {string} branchId - Branch ID to check access for
 * @param {function} next - Next middleware function for error handling
 * @returns {Promise<boolean>} - True if user has access, false otherwise
 */
export const checkBranchAccess = async (userId, roleName, branchId, next) => {
  try {
    if (roleName === "OWNER" || roleName === "DEVELOPER") {
      return true;
    }

    if (roleName === "STAFF") {
      const staffProfile = await prisma.staffProfile.findFirst({
        where: {
          userId,
          branchId,
        },
      });

      if (staffProfile) {
        return true;
      }

      return false;
    }

    // Other roles (ADMIN, CUSTOMER): Check branchUserPermission ONLY
    const branchUserPermission = await prisma.branchUserPermission.findFirst({
      where: {
        userId,
        branchId,
      },
    });

    return branchUserPermission ? true : false;
  } catch (error) {
    if (next) {
      next(error);
    }
    return false;
  }
};
