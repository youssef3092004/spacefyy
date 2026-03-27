import { Router } from "express";
import {
  createRole,
  getRoleById,
  getRoles,
  deleteRoleById,
  updateRole,
} from "../controllers/role.js";
import { verifyToken } from "../middleware/auth.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { checkPermission } from "../middleware/checkPermission.js";

const router = Router();

router.post(
  "/create",
  verifyToken,
  checkPermission("CREATE-ROLES"),
  createRole,
);
router.get(
  "/getAll",
  verifyToken,
  checkPermission("VIEW-ROLES"),
  cacheMiddleware(
    (req) =>
      `roles:page=${req.query.page || 1}:limit=${req.query.limit || 10}:sort=${
        req.query.sort || "createdAt"
      }:order=${req.query.order || "desc"}`,
    "TTL_LIST",
  ),
  getRoles,
);
router.get(
  "/getById/:id",
  verifyToken,
  checkPermission("VIEW-ROLES"),
  cacheMiddleware((req) => `role:${req.params.id}`, "TTL_BY_ID"),
  getRoleById,
);
router.put(
  "/update/:id",
  verifyToken,
  checkPermission("UPDATE-ROLES"),
  cacheMiddleware((req) => `role:${req.params.id}`, "TTL_BY_ID"),
  updateRole,
);
router.delete(
  "/deleteById/:id",
  verifyToken,
  checkPermission("DELETE-ROLES"),
  deleteRoleById,
);
export default router;
