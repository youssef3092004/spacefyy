import { Router } from "express";
import {
  createPermission,
  getPermissionById,
  getAllPermissions,
  deletePermissionById,
  deleteAllPermissions,
  updatePermissionById,
} from "../controllers/permission.js";
import { verifyToken } from "../middleware/auth.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { checkPermission } from "../middleware/checkPermission.js";

const router = Router();

router.post(
  "/create",
  verifyToken,
  checkPermission("CREATE-PERMISSIONS"),
  createPermission,
);
router.get(
  "/getAll",
  verifyToken,
  checkPermission("VIEW-PERMISSIONS"),
  cacheMiddleware(
    (req) =>
      `permissions:page=${req.query.page || 1}:limit=${req.query.limit || 10}:sort=${
        req.query.sort || "createdAt"
      }:order=${req.query.order || "desc"}`,
    "TTL_LIST",
  ),
  getAllPermissions,
);
router.get(
  "/getById/:id",
  verifyToken,
  checkPermission("VIEW-PERMISSIONS"),
  cacheMiddleware((req) => `permission:${req.params.id}`, "TTL_BY_ID"),
  getPermissionById,
);
router.put(
  "/updateById/:id",
  verifyToken,
  checkPermission("UPDATE-PERMISSIONS"),
  cacheMiddleware((req) => `permission:${req.params.id}`, "TTL_BY_ID"),
  updatePermissionById,
);
router.delete(
  "/deleteById/:id",
  verifyToken,
  checkPermission("DELETE-PERMISSIONS"),
  deletePermissionById,
);
router.delete(
  "/deleteAll",
  verifyToken,
  checkPermission("DELETE-PERMISSIONS"),
  deleteAllPermissions,
);

export default router;
