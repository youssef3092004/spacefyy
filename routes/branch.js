import { Router } from "express";
import {
  createBranch,
  getAllBranches,
  getBranchById,
  getBranchesByBusinessId,
  updateBranchById,
  updateBranchByIdPatch,
  deleteBranchById,
  deleteAllBranches,
} from "../controllers/branch.js";
import { verifyToken } from "../middleware/auth.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { upload } from "../middleware/multer.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";

const router = Router();

const resolveOwnerBusinessId = async (req, res, next) => {
  try {
    req.body ||= {};

    if (req.body?.businessId) {
      return next();
    }

    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return next(new AppError("Unauthorized", 401));
    }

    const business = await prisma.business.findFirst({
      where: { ownerId: userId },
      select: { id: true },
    });

    if (!business) {
      return next(new AppError("No business found for this owner", 404));
    }

    req.body.businessId = business.id;
    next();
  } catch (error) {
    next(error);
  }
};

router.post(
  "/create",
  verifyToken,
  checkPermission("CREATE-BRANCHES"),
  resolveOwnerBusinessId,
  checkOwnership({
    model: "business",
    paramId: "businessId",
    scope: "business",
  }),
  upload.single("image"),
  createBranch,
);

router.put(
  "/update/:branchId",
  verifyToken,
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  checkPermission("UPDATE-BRANCHES", true),
  upload.single("image"),
  updateBranchById,
);
router.patch(
  "/update/:branchId",
  verifyToken,
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  checkPermission("UPDATE-BRANCHES", true),
  upload.single("image"),
  updateBranchByIdPatch,
);
router.delete(
  "/delete/:branchId",
  verifyToken,
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  checkPermission("DELETE-BRANCHES", true),
  deleteBranchById,
);
router.get(
  "/getAll",
  verifyToken,
  checkPermission("VIEW-BRANCHES"),
  cacheMiddleware((req) => {
    const {
      page = 1,
      limit = 10,
      sort = "createdAt",
      order = "desc",
    } = req.query;

    // The result set is scoped to the caller's businesses, so the caller must
    // be part of the key — otherwise one tenant's list is served to another.
    const userId = req.user?.id || req.user?.userId;
    return `branches:all:user=${userId}:page=${page}:limit=${limit}:sort=${sort}:order=${order}`;
  }, "TTL_LIST"),
  getAllBranches,
);
router.get(
  "/getById/:branchId",
  verifyToken,
  checkPermission("VIEW-BRANCHES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware((req) => `branch:${req.params.branchId}`, "TTL_BY_ID"),
  getBranchById,
);
router.get(
  "/getByBusinessId/:businessId",
  verifyToken,
  checkPermission("VIEW-BRANCHES"),
  checkOwnership({
    model: "business",
    paramId: "businessId",
    scope: "business",
  }),
  cacheMiddleware((req) => {
    const {
      page = 1,
      limit = 10,
      sort = "createdAt",
      order = "desc",
    } = req.query;

    return `branches:businessId=${req.params.businessId}:page=${page}:limit=${limit}:sort=${sort}:order=${order}`;
  }, "TTL_LIST"),
  getBranchesByBusinessId,
);
router.delete(
  "/deleteAll",
  verifyToken,
  checkPermission("DELETE-BRANCHES"),
  deleteAllBranches,
);

export default router;
