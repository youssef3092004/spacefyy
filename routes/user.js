import { Router } from "express";
import {
  getAllUsers,
  getUserById,
  deleteAllUsers,
  deleteUserById,
  updateUserById,
  getUserByRoleName,
  getMe,
  getAllPermissionsByUserId,
} from "../controllers/user.js";
import { verifyToken } from "../middleware/auth.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import { upload } from "../middleware/multer.js";

const router = Router();

router.get(
  "/getAll",
  verifyToken,
  checkPermission("VIEW-USERS"),
  cacheMiddleware(
    (req) =>
      `users:page=${req.query.page || 1}:limit=${req.query.limit || 10}:sort=${
        req.query.sort || "createdAt"
      }:order=${req.query.order || "desc"}`,
    "TTL_LIST",
  ),
  getAllUsers,
);

router.get(
  "/getById/:id",
  verifyToken,
  cacheMiddleware((req) => `user:${req.params.id}`, "TTL_BY_ID"),
  checkPermission("VIEW-USERS"),
  checkOwnership({
    model: "user",
    paramId: "id",
    scope: "user",
  }),
  getUserById,
);
router.delete(
  "/deleteAll",
  verifyToken,
  checkPermission("DELETE-USERS"),
  deleteAllUsers,
);
router.delete(
  "/deleteById/:id",
  verifyToken,
  checkPermission("DELETE-USERS"),
  checkOwnership({
    model: "user",
    paramId: "id",
    scope: "user",
  }),
  deleteUserById,
);
router.patch(
  "/update/:id",
  verifyToken,
  checkPermission("UPDATE-USERS"),
  upload.single("profileImage"),
  cacheMiddleware((req) => `user:${req.params.id}`, "TTL_BY_ID"),
  checkOwnership({
    model: "user",
    paramId: "id",
    scope: "user",
  }),
  updateUserById,
);
router.get(
  "/getByRoleName/:roleName",
  verifyToken,
  checkPermission("VIEW-USERS"),
  cacheMiddleware(
    (req) =>
      `users:roleName=${req.params.roleName}:page=${req.query.page || 1}:limit=${req.query.limit || 10}:sort=${
        req.query.sort || "createdAt"
      }:order=${req.query.order || "desc"}`,
    "TTL_LIST",
  ),
  getUserByRoleName,
);
router.get("/getMe", verifyToken, getMe);
router.get(
  "/getPermissions/:userId",
  verifyToken,
  checkPermission("VIEW-PERMISSIONS-BY-USER"),
  getAllPermissionsByUserId,
);

export default router;
