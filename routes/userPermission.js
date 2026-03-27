import { Router } from "express";
import {
  createUserPermission,
  getUserPermissionByUserId,
  getUserPermissionByUserIdIsAllowed,
  updateUserPermissionByUserId,
  deleteSpecificUserPermissions,
  deleteUserPermissionByUserId,
} from "../controllers/userPermission.js";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";

const router = Router();

router.post(
  "/create",
  verifyToken,
  checkPermission("CREATE-USER-PERMISSIONS"),
  createUserPermission,
);
router.get(
  "/getByUserId/:userId",
  verifyToken,
  checkPermission("VIEW-USER-PERMISSIONS"),
  getUserPermissionByUserId,
);
router.get(
  "/getByUserIdIsAllowed/:userId",
  verifyToken,
  checkPermission("VIEW-USER-PERMISSIONS"),
  getUserPermissionByUserIdIsAllowed,
);
router.patch(
  "/updateByUserId/:userId",
  verifyToken,
  checkPermission("UPDATE-USER-PERMISSIONS"),
  updateUserPermissionByUserId,
);
router.delete(
  "/deleteSpecific/:userId",
  verifyToken,
  checkPermission("DELETE-USER-PERMISSIONS"),
  deleteSpecificUserPermissions,
);
router.delete(
  "/deleteByUserId/:userId",
  verifyToken,
  checkPermission("DELETE-USER-PERMISSIONS"),
  deleteUserPermissionByUserId,
);

export default router;
