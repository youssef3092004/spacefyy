import { Router } from "express";
import {
  createSpace,
  getSpaceById,
  getAllByBranchId,
  getSpaceByIsActive,
  getSpacesByType,
  updateSpaceById,
  deleteSpaceById,
  deleteAllSpaces,
  deleteSpacesByBranchId,
} from "../controllers/space.js";
import { verifyToken } from "../middleware/auth.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import { upload } from "../middleware/multer.js";

const router = Router();

router.post(
  "/create",
  verifyToken,
  checkPermission("CREATE-SPACES", true),
  upload.single("image"),
  createSpace,
);
router.get(
  "/getAllByBranchId/:branchId",
  verifyToken,
  checkPermission("VIEW-SPACES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware(
    (req) =>
      `spaces:page=${req.query.page || 1}:limit=${req.query.limit || 10}:branchId=${
        req.params.branchId || "all"
      }:type=${req.query.type || "all"}:isActive=${
        req.query.isActive || "all"
      }`,
    "TTL_LIST",
  ),
  getAllByBranchId,
);
router.get(
  "/getById/:branchId/:spaceId",
  verifyToken,
  checkPermission("VIEW-SPACES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware((req) => `space:${req.params.spaceId}`, "TTL_BY_ID"),
  getSpaceById,
);
router.get(
  "/getByIsActive/:branchId/:isActive",
  verifyToken,
  checkPermission("VIEW-SPACES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware(
    (req) =>
      `spaces:branchId=${req.params.branchId}:isActive=${req.params.isActive}`,
    "TTL_LIST",
  ),
  getSpaceByIsActive,
);
router.get(
  "/getByType/:branchId/:type",
  verifyToken,
  checkPermission("VIEW-SPACES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware(
    (req) => `spaces:branchId=${req.params.branchId}:type=${req.params.type}`,
    "TTL_LIST",
  ),
  getSpacesByType,
);
router.patch(
  "/update/:branchId/:spaceId",
  verifyToken,
  checkPermission("UPDATE-SPACES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  updateSpaceById,
);
router.delete(
  "/delete/:branchId/:spaceId",
  verifyToken,
  checkPermission("DELETE-SPACES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  deleteSpaceById,
);
router.delete(
  "/deleteAll",
  verifyToken,
  checkPermission("DELETE-SPACES"),
  deleteAllSpaces,
);
router.delete(
  "/deleteAllByBranchId/:branchId",
  verifyToken,
  checkPermission("DELETE-SPACES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  deleteSpacesByBranchId,
);

export default router;
