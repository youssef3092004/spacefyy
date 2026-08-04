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
/**
 * Business IDs owned by this user. Empty for every role except OWNER.
 *
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export const getOwnedBusinessIds = async (userId) => {
  const businesses = await prisma.business.findMany({
    where: { ownerId: userId },
    select: { id: true },
  });
  return businesses.map((b) => b.id);
};

export const checkBranchAccess = async (userId, roleName, branchId, next) => {
  try {
    if (roleName === "DEVELOPER") {
      return true;
    }

    // An OWNER has access to every branch of the businesses they own — and to
    // nothing else. Without this the role was a platform-wide bypass.
    if (roleName === "OWNER") {
      const ownedBusinessIds = await getOwnedBusinessIds(userId);
      if (ownedBusinessIds.length === 0) return false;

      const branch = await prisma.branch.findFirst({
        where: { id: branchId, businessId: { in: ownedBusinessIds } },
        select: { id: true },
      });
      return Boolean(branch);
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

/**
 * Get the list of branchIds a non-owner/developer user is allowed to see.
 * STAFF: branches where they have a staffProfile.
 * Other roles (ADMIN, CUSTOMER): branches granted via branchUserPermission.
 *
 * @param {string} userId
 * @param {string} roleName
 * @returns {Promise<string[]>}
 */
export const getAccessibleBranchIds = async (userId, roleName) => {
  if (roleName === "OWNER") {
    const ownedBusinessIds = await getOwnedBusinessIds(userId);
    if (ownedBusinessIds.length === 0) return [];
    const branches = await prisma.branch.findMany({
      where: { businessId: { in: ownedBusinessIds } },
      select: { id: true },
    });
    return branches.map((b) => b.id);
  }

  if (roleName === "STAFF") {
    const staffProfiles = await prisma.staffProfile.findMany({
      where: { userId },
      select: { branchId: true },
    });
    return staffProfiles.map((s) => s.branchId);
  }

  const branchUserPermissions = await prisma.branchUserPermission.findMany({
    where: { userId },
    select: { branchId: true },
    distinct: ["branchId"],
  });
  return branchUserPermissions.map((b) => b.branchId);
};

/**
 * Business IDs this user may act within — owned businesses for an OWNER, the
 * businesses behind their accessible branches for everyone else.
 *
 * Customers, staff profiles and analytics are business-scoped rather than
 * branch-scoped, so they need this rather than getAccessibleBranchIds.
 *
 * DEVELOPER gets null, meaning "unrestricted" — callers must treat null as
 * "skip the filter", not as "no access".
 *
 * @param {string} userId
 * @param {string} roleName
 * @returns {Promise<string[]|null>}
 */
export const getAccessibleBusinessIds = async (userId, roleName) => {
  if (roleName === "DEVELOPER") return null;

  if (roleName === "OWNER") return getOwnedBusinessIds(userId);

  const branchIds = await getAccessibleBranchIds(userId, roleName);
  if (branchIds.length === 0) return [];

  const branches = await prisma.branch.findMany({
    where: { id: { in: branchIds } },
    select: { businessId: true },
    distinct: ["businessId"],
  });
  return branches.map((b) => b.businessId).filter(Boolean);
};

/**
 * True when the user may act on the given business.
 *
 * @param {string} userId
 * @param {string} roleName
 * @param {string} businessId
 * @returns {Promise<boolean>}
 */
export const checkBusinessAccess = async (userId, roleName, businessId) => {
  if (!businessId) return false;
  const businessIds = await getAccessibleBusinessIds(userId, roleName);
  if (businessIds === null) return true;
  return businessIds.includes(businessId);
};
