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
const router = Router();

router.post(
  "/create",
  verifyToken,
  checkPermission("CREATE-CATEGORY"),
  createCategory,
);

router.get(
  "/getAll",
  verifyToken,
  checkPermission("READ-CATEGORY"),
  cacheMiddleware(
    (req) =>
      `categories:page=${req.query.page || 1}:limit=${req.query.limit || 10}:search=${req.query.search || ""}`,
    "TTL_LIST",
  ),
  getAllCategories,
);
router.get(
  "/getById/:categoryId",
  verifyToken,
  checkPermission("READ-CATEGORY"),
  cacheMiddleware((req) => `category:${req.params.categoryId}`, "TTL_DETAIL"),
  getCategoryById,
);
router.patch(
  "/update/:categoryId",
  verifyToken,
  checkPermission("UPDATE-CATEGORY"),
  updateCategory,
);
router.delete(
  "/delete/:categoryId",
  verifyToken,
  checkPermission("DELETE-CATEGORY"),
  deleteCategory,
);

export default router;
