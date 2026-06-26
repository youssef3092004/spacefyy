import { Router } from "express";
import {
  createCategory,
  getCategoryById,
  getAllCategories,
  updateCategory,
  deleteCategory,
} from "../controllers/category.js";
import { verifyToken } from "../middleware/auth.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import { autoInvalidateCache } from "../middleware/autoInvalidateCache.js";

const router = Router();

// ─── Write ────────────────────────────────────────────────────────────────────

router.post(
  "/create/:branchId",
  verifyToken,
  checkPermission("CREATE-CATEGORY", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  autoInvalidateCache(),
  createCategory,
);

router.patch(
  "/update/:categoryId",
  verifyToken,
  checkPermission("UPDATE-CATEGORY"),
  checkOwnership({ model: "categoryProduct", paramId: "categoryId", scope: "branch" }),
  autoInvalidateCache(),
  updateCategory,
);

router.delete(
  "/delete/:categoryId",
  verifyToken,
  checkPermission("DELETE-CATEGORY"),
  checkOwnership({ model: "categoryProduct", paramId: "categoryId", scope: "branch" }),
  autoInvalidateCache(),
  deleteCategory,
);

// ─── Read ─────────────────────────────────────────────────────────────────────

router.get(
  "/getAll/:branchId",
  verifyToken,
  checkPermission("READ-CATEGORY", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware(
    (req) => `categories:${req.params.branchId}`,
    "TTL_LIST",
  ),
  getAllCategories,
);

router.get(
  "/getById/:categoryId",
  verifyToken,
  checkPermission("READ-CATEGORY"),
  checkOwnership({ model: "categoryProduct", paramId: "categoryId", scope: "branch" }),
  cacheMiddleware((req) => `category:${req.params.categoryId}`, "TTL_DETAIL"),
  getCategoryById,
);

export default router;
