import { Router } from "express";
import {
  createProduct,
  getProductById,
  getAllProducts,
  getProductsByCategory,
  searchProducts,
  updateProduct,
  toggleProductStatus,
  adjustStock,
  deleteProduct,
} from "../controllers/product.js";
import { verifyToken } from "../middleware/auth.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { autoInvalidateCache } from "../middleware/autoInvalidateCache.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { upload } from "../configs/multer.js";

const router = Router();

// ─── Write ────────────────────────────────────────────────────────────────────

router.post(
  "/create/:branchId",
  verifyToken,
  checkPermission("CREATE-PRODUCTS", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  autoInvalidateCache(),
  upload.single("image"),
  createProduct,
);

router.patch(
  "/update/:productId",
  verifyToken,
  checkPermission("UPDATE-PRODUCTS"),
  checkOwnership({ model: "product", paramId: "productId", scope: "branch" }),
  autoInvalidateCache(),
  upload.single("image"),
  updateProduct,
);

router.patch(
  "/toggle/:productId",
  verifyToken,
  checkPermission("UPDATE-PRODUCTS"),
  checkOwnership({ model: "product", paramId: "productId", scope: "branch" }),
  autoInvalidateCache(),
  toggleProductStatus,
);

router.patch(
  "/stock/:productId",
  verifyToken,
  checkPermission("UPDATE-PRODUCTS"),
  checkOwnership({ model: "product", paramId: "productId", scope: "branch" }),
  autoInvalidateCache(),
  adjustStock,
);

router.delete(
  "/delete/:productId",
  verifyToken,
  checkPermission("DELETE-PRODUCTS"),
  checkOwnership({ model: "product", paramId: "productId", scope: "branch" }),
  autoInvalidateCache(),
  deleteProduct,
);

// ─── Read ─────────────────────────────────────────────────────────────────────

router.get(
  "/getAll/:branchId",
  verifyToken,
  checkPermission("READ-PRODUCTS", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware((req) => {
    const q = req.query;
    return [
      `products:${req.params.branchId}`,
      `page=${q.page || 1}`,
      `limit=${q.limit || 10}`,
      `sort=${q.sort || "createdAt"}`,
      `order=${q.order || "desc"}`,
      `isActive=${q.isActive || ""}`,
      `categoryId=${q.categoryId || ""}`,
      `search=${q.search || ""}`,
      `minPrice=${q.minPrice || ""}`,
      `maxPrice=${q.maxPrice || ""}`,
    ].join(":");
  }, "TTL_LIST"),
  getAllProducts,
);

router.get(
  "/getById/:productId",
  verifyToken,
  checkPermission("READ-PRODUCTS"),
  checkOwnership({ model: "product", paramId: "productId", scope: "branch" }),
  cacheMiddleware((req) => `product:${req.params.productId}`, "TTL_DETAIL"),
  getProductById,
);

router.get(
  "/getByCategory/:branchId/:categoryId",
  verifyToken,
  checkPermission("READ-PRODUCTS", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware((req) => {
    const q = req.query;
    return [
      `products:category:${req.params.branchId}:${req.params.categoryId}`,
      `page=${q.page || 1}`,
      `limit=${q.limit || 10}`,
      `sort=${q.sort || "createdAt"}`,
      `order=${q.order || "desc"}`,
      `isActive=${q.isActive || ""}`,
    ].join(":");
  }, "TTL_LIST"),
  getProductsByCategory,
);

router.get(
  "/search/:branchId",
  verifyToken,
  checkPermission("READ-PRODUCTS", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware(
    (req) =>
      `products:search:${req.params.branchId}:q=${req.query.search || ""}:isActive=${req.query.isActive || ""}:limit=${req.query.limit || 15}`,
    "TTL_LIST",
  ),
  searchProducts,
);

export default router;
