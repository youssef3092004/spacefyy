import { Router } from "express";
import {
  createProduct,
  getProductById,
  getAllProducts,
  getProductsByCategory,
  updateProduct,
  deleteProduct,
  searchProducts,
} from "../controllers/product.js";
import { verifyToken } from "../middleware/auth.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import { checkPermission } from "../middleware/checkPermission.js";

const router = Router();

router.post(
  "/create/:branchId",
  verifyToken,
  checkPermission("CREATE-PRODUCTS", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  createProduct,
);
router.get(
  "/getAll/:branchId",
  verifyToken,
  checkPermission("READ-PRODUCTS", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware(
    (req) =>
      `products:${req.params.branchId}:page=${req.query.page || 1}:limit=${req.query.limit || 10}:search=${req.query.search || ""}:isActive=${req.query.isActive || ""}`,
    "TTL_LIST",
  ),
  getAllProducts,
);
router.get(
  "/search/:branchId",
  verifyToken,
  checkPermission("READ-PRODUCTS", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware(
    (req) => `productSearch:${req.params.branchId}:${req.query.search}`,
    "TTL_LIST",
  ),
  searchProducts,
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
  cacheMiddleware(
    (req) =>
      `productsByCategory:${req.params.branchId}:${req.params.categoryId}:page=${req.query.page || 1}:limit=${req.query.limit || 10}`,
    "TTL_LIST",
  ),
  getProductsByCategory,
);
router.patch(
  "/update/:productId",
  verifyToken,
  checkPermission("UPDATE-PRODUCTS"),
  updateProduct,
);
router.delete(
  "/delete/:productId",
  verifyToken,
  checkPermission("DELETE-PRODUCTS"),
  deleteProduct,
);

export default router;
