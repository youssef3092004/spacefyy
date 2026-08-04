import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import {
  checkBranchAccess,
  checkBusinessAccess,
  getAccessibleBranchIds,
} from "../utils/checkBranchAccess.js";

export const checkOwnership = ({
  model,
  paramId = "id",
  scope = "branch", // "branch" | "user" | "business" | "tenant"
}) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      if (!userId) {
        return next(new AppError("Unauthorized", 401));
      }

      const roleName = req.user.roleName;
      const resourceId =
        req.params[paramId] ?? req.body?.[paramId] ?? req.query?.[paramId];
      const allowedScopes = ["branch", "user", "business", "tenant"];

      if (!allowedScopes.includes(scope)) {
        return next(new AppError(`Invalid ownership scope: ${scope}`, 500));
      }

      if (!resourceId) {
        console.log("Missing resource ID in params:", req.params);
        return next(new AppError(`${paramId} is required`, 400));
      }

      // DEVELOPER bypass only. OWNER is NOT exempt — it now falls through to
      // the same branch/user/business checks below, where checkBranchAccess
      // resolves the branches of the businesses they actually own.
      if (roleName === "DEVELOPER") {
        req.resourceId = resourceId;
        return next();
      }

      // Tenant-scoped models are keyed by the business they belong to, so the
      // per-model shapes below don't apply to them.
      const tenantSelectFields =
        model === "business" ? { id: true, ownerId: true } : { businessId: true };

      // Build select object conditionally based on model
      const selectFields =
        scope === "tenant"
          ? tenantSelectFields
          : model === "branch"
            ? { id: true }
            : model === "business"
            ? { ownerId: true }
            : model === "session"
              ? { id: true, branchId: true, createdById: true, deletedAt: true }
              : model === "sessionComponent"
                ? { id: true, branchId: true }
                : model === "visit"
                  ? { id: true, branchId: true }
                  : model === "user"
                    ? { id: true }
                    : model === "payroll"
                      ? // Payroll has no branchId — it hangs off staffProfile.
                        { staffProfile: { select: { branchId: true } } }
                      : scope === "user"
                        ? { userId: true, branchId: true }
                        : { branchId: true };

      // All standard models use "id" as primary key for findUnique
      const idModels = new Set([
        "branch", "business", "session", "sessionComponent",
        "visit", "device", "space", "unit", "equipment", "product", "categoryProduct",
        "order", "invoice", "user", "shift", "payroll", "staffProfile", "gameMode",
        "customer",
      ]);
      const whereField = idModels.has(model) ? "id" : paramId;

      const resource =
        model === "session"
          ? await prisma.session.findFirst({
              where: { id: resourceId, deletedAt: null },
              select: selectFields,
            })
          : await prisma[model].findUnique({
              where: { [whereField]: resourceId },
              select: selectFields,
            });

      if (!resource) {
        return next(new AppError("Resource not found", 404));
      }

      // 🔹 USER ownership
      if (scope === "user") {
        const ownerUserId =
          model === "user"
            ? resource.id
            : resource.userId || resource.createdById;
        if (!ownerUserId) {
          return next(new AppError("Forbidden", 403));
        }

        if (ownerUserId !== userId) {
          // An OWNER may also act on staff of the businesses they own.
          const ownedBranchIds =
            roleName === "OWNER"
              ? await getAccessibleBranchIds(userId, roleName)
              : [];

          const isOwnStaff =
            ownedBranchIds.length > 0 &&
            (await prisma.staffProfile.findFirst({
              where: { userId: ownerUserId, branchId: { in: ownedBranchIds } },
              select: { id: true },
            }));

          if (!isOwnStaff) {
            return next(new AppError("Forbidden", 403));
          }
        }
      }

      // 🔹 TENANT ownership — the resource's business must be one the caller
      // can act within. Used by business-scoped models (customer) that have no
      // branchId of their own.
      if (scope === "tenant") {
        const businessId =
          model === "business" ? resource.id : resource.businessId;

        const hasAccess = await checkBusinessAccess(userId, roleName, businessId);
        if (!hasAccess) {
          return next(
            new AppError("You do not have access to this business", 403),
          );
        }

        req.businessId = businessId;
      }

      // 🔹 BUSINESS ownership
      if (scope === "business") {
        if (!resource.ownerId || resource.ownerId !== userId) {
          return next(new AppError("You do not own this business", 403));
        }
      }

      // 🔹 BRANCH ownership
      if (scope === "branch") {
        // For the branch model itself, check if user has access to this branch
        if (model === "branch") {
          const hasAccess = await checkBranchAccess(
            userId,
            roleName,
            resourceId, // resourceId IS the branchId
            next,
          );

          if (!hasAccess) {
            return next(
              new AppError("You do not have access to this branch", 403),
            );
          }

          req.branchId = resourceId;
        } else {
          // For other resources (device, space, tool), check if they belong to an accessible branch
          const branchId =
            resource.branchId ||
            resource.visit?.branchId ||
            resource.staffProfile?.branchId;

          if (!branchId) {
            return next(new AppError("Resource has no branch", 400));
          }

          const hasAccess = await checkBranchAccess(
            userId,
            roleName,
            branchId,
            next,
          );

          if (!hasAccess) {
            return next(
              new AppError("You do not have access to this branch", 403),
            );
          }

          req.branchId = branchId;
        }
      }

      req.resourceId = resourceId;
      next();
    } catch (err) {
      next(err);
    }
  };
};
