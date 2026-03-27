import { Router } from "express";
import {
  createBranchUserPermission,
  deleteSpecificBranchUserPermissionByUserId,
  deleteBranchUserPermissionByUserId,
  getBranchUserPermissionByUserId,
  updateBranchUserPermissionByUserId,
} from "../controllers/BranchUserPermission.js";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";

const router = Router();

router.post(
  "/create",
  verifyToken,
  checkPermission("CREATE-BRANCH-USER-PERMISSIONS", true),
  createBranchUserPermission,
);

router.get(
  "/getByUserId/:userId",
  verifyToken,
  checkPermission("VIEW-BRANCH-USER-PERMISSIONS", true),
  getBranchUserPermissionByUserId,
);

router.patch(
  "/updateByUserId/:userId",
  verifyToken,
  checkPermission("UPDATE-BRANCH-USER-PERMISSIONS", true),
  updateBranchUserPermissionByUserId,
);

router.delete(
  "/deleteSpecificByUserId/:userId",
  verifyToken,
  checkPermission("DELETE-BRANCH-USER-PERMISSIONS", true),
  deleteSpecificBranchUserPermissionByUserId,
);

router.delete(
  "/deleteAllByUserId/:userId",
  verifyToken,
  checkPermission("DELETE-BRANCH-USER-PERMISSIONS", true),
  deleteBranchUserPermissionByUserId,
);

export default router;
