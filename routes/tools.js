import { Router } from "express";
import {
  createTool,
  getToolById,
  getToolsByBranchId,
  getToolsByIsActive,
  deleteToolById,
  deleteToolsByBranchId,
  deleteAllTools,
  updateToolById,
} from "../controllers/tools.js";
import { verifyToken } from "../middleware/auth.js";
// import { cacheMiddleware } from "../middleware/cache.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import { upload } from "../middleware/multer.js";

const router = Router();

router.post(
  "/create",
  verifyToken,
  checkPermission("CREATE-TOOLS"),
  upload.single("image"),
  createTool,
);
router.get(
  "/getById/:branchId/:toolId",
  verifyToken,
  checkPermission("GET-TOOLS", true),
  checkOwnership({ model: "tool", paramId: "toolId", scope: "branch" }),
  getToolById,
);
router.get(
  "/getAll/:branchId",
  verifyToken,
  checkPermission("GET-TOOLS", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  getToolsByBranchId,
);
router.get(
  "/getByStatus/:branchId/:isActive",
  verifyToken,
  checkPermission("GET-TOOLS", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  getToolsByIsActive,
);
router.delete(
  "/delete/:branchId/:toolId",
  verifyToken,
  checkPermission("DELETE-TOOLS", true),
  checkOwnership({ model: "tool", paramId: "toolId", scope: "branch" }),
  deleteToolById,
);
router.delete(
  "/deleteByBranch/:branchId",
  verifyToken,
  checkPermission("DELETE-TOOLS", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  deleteToolsByBranchId,
);
router.delete(
  "/deleteAll",
  verifyToken,
  checkPermission("DELETE-TOOLS"),
  deleteAllTools,
);
router.put(
  "/update/:branchId/:toolId",
  verifyToken,
  checkPermission("UPDATE-TOOLS", true),
  checkOwnership({ model: "tool", paramId: "toolId", scope: "branch" }),
  upload.single("image"),
  updateToolById,
);

export default router;
