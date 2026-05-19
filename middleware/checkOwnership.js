import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { checkBranchAccess } from "../utils/checkBranchAccess.js";

export const checkOwnership = ({
  model,
  paramId = "id",
  scope = "branch", // "branch" | "user" | "business"
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
      const allowedScopes = ["branch", "user", "business"];

      if (!allowedScopes.includes(scope)) {
        return next(new AppError(`Invalid ownership scope: ${scope}`, 500));
      }

      if (!resourceId) {
        console.log("Missing resource ID in params:", req.params);
        return next(new AppError(`${paramId} is required`, 400));
      }

      // DEVELOPER bypass only
      // DEVELOPER bypass only. OWNER must still prove business ownership.
      if (
        roleName === "DEVELOPER" ||
        (roleName === "OWNER" && scope !== "business")
      ) {
        req.resourceId = resourceId;
        return next();
      }

      // Build select object conditionally based on model
      const selectFields =
        model === "branch"
          ? { id: true }
          : model === "business"
            ? { ownerId: true }
            : model === "session"
              ? {
                  id: true,
                  branchId: true,
                  visit: { select: { branchId: true } },
                  createdById: true,
                  deletedAt: true,
                }
              : model === "visit"
                ? { id: true, branchId: true }
                : scope === "user"
                  ? { userId: true, branchId: true }
                  : { branchId: true }; // device, space, unit, equipment, etc.

      // All standard models use "id" as primary key for findUnique
      const whereField =
        model === "branch" ||
        model === "business" ||
        model === "session" ||
        model === "visit" ||
        model === "device" ||
        model === "space" ||
        model === "unit" ||
        model === "equipment" ||
        model === "product"
          ? "id"
          : paramId;

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
        const ownerUserId = resource.userId || resource.createdById;
        if (!ownerUserId || ownerUserId !== userId) {
          return next(new AppError("Forbidden", 403));
        }
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
          const branchId = resource.branchId || resource.visit?.branchId;

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
