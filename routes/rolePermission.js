import { Router } from "express";
import {
  createRolePermission,
  getAllRolePermissions,
  getRolePermissionById,
  deleteRolePermissionById,
  deleteAllRolePermissions,
  updateRolePermissionById,
} from "../controllers/rolePermission.js";
import { verifyToken } from "../middleware/auth.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { checkPermission } from "../middleware/checkPermission.js";

const router = Router();

router.post(
  "/create",
  verifyToken,
  checkPermission("CREATE-ROLE-PERMISSIONS"),
  createRolePermission,
);
router.get(
  "/getAll",
  verifyToken,
  checkPermission("VIEW-ROLE-PERMISSIONS"),
  cacheMiddleware(
    (req) =>
      `rolePermissions:page=${req.query.page || 1}:limit=${req.query.limit || 10}:sort=${
        req.query.sort || "createdAt"
      }:order=${req.query.order || "desc"}`,
    "TTL_LIST",
  ),
  getAllRolePermissions,
);
router.get(
  "/getById/:id",
  verifyToken,
  checkPermission("VIEW-ROLE-PERMISSIONS"),
  cacheMiddleware((req) => `rolePermission:${req.params.id}`, "TTL_BY_ID"),
  getRolePermissionById,
);
router.put(
  "/update/:id",
  verifyToken,
  checkPermission("UPDATE-ROLE-PERMISSIONS"),
  cacheMiddleware((req) => `rolePermission:${req.params.id}`, "TTL_BY_ID"),
  updateRolePermissionById,
);
router.delete(
  "/deleteById/:id",
  verifyToken,
  checkPermission("DELETE-ROLE-PERMISSIONS"),
  deleteRolePermissionById,
);
router.delete(
  "/deleteAll",
  verifyToken,
  checkPermission("DELETE-ROLE-PERMISSIONS"),
  deleteAllRolePermissions,
);

export default router;
