import { Router } from "express";
import {
  addOrderItems,
  getVisitOrder,  
  updateItemQuantity,
  removeItem,
  completeOrder,
  completeTakeawayOrder,
  cancelOrder,
  getOrderById,
  getOrderInvoice,
  getAllOrders,
  getOrderAnalytics,
} from "../controllers/order.js";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { autoInvalidateCache } from "../middleware/autoInvalidateCache.js";

const router = Router();

// ─── Write ────────────────────────────────────────────────────────────────────

router.post(
  "/create",
  verifyToken,
  checkPermission("createOrder"),
  autoInvalidateCache(),
  addOrderItems,
);

router.patch(
  "/item/:itemId",
  verifyToken,
  checkPermission("updateOrder"),
  autoInvalidateCache(),
  updateItemQuantity,
);

router.delete(
  "/item/:itemId",
  verifyToken,
  checkPermission("deleteOrder"),
  autoInvalidateCache(),
  removeItem,
);

router.patch(
  "/visit/:visitId/complete",
  verifyToken,
  checkPermission("updateOrder"),
  checkOwnership({ model: "visit", paramId: "visitId", scope: "branch" }),
  autoInvalidateCache(),
  completeOrder,
);

router.patch(
  "/complete/:orderId",
  verifyToken,
  checkPermission("updateOrder"),
  autoInvalidateCache(),
  completeTakeawayOrder,
);

router.delete(
  "/:orderId",
  verifyToken,
  checkPermission("deleteOrder"),
  autoInvalidateCache(),
  cancelOrder,
);

// ─── Read ─────────────────────────────────────────────────────────────────────

router.get(
  "/visit/:visitId",
  verifyToken,
  checkPermission("viewOrder"),
  checkOwnership({ model: "visit", paramId: "visitId", scope: "branch" }),
  cacheMiddleware(
    (req) => `order:visit:${req.params.visitId}`,
    "TTL_BY_ID",
  ),
  getVisitOrder,
);

router.get(
  "/getById/:orderId",
  verifyToken,
  checkPermission("viewOrder"),
  cacheMiddleware(
    (req) => `order:${req.params.orderId}`,
    "TTL_BY_ID",
  ),
  getOrderById,
);

router.get(
  "/invoice/:orderId",
  verifyToken,
  checkPermission("viewOrder"),
  cacheMiddleware(
    (req) => `order:invoice:${req.params.orderId}`,
    "TTL_BY_ID",
  ),
  getOrderInvoice,
);

router.get(
  "/getAll",
  verifyToken,
  checkPermission("viewOrder"),
  cacheMiddleware(
    (req) => {
      const q = req.query;
      return `orders:page=${q.page || 1}:limit=${q.limit || 10}:branchId=${q.branchId || "all"}:visitId=${q.visitId || ""}:filter=${q.filter || ""}:search=${q.search || ""}`;
    },
    "TTL_LIST",
  ),
  getAllOrders,
);

router.get(
  "/analytics/branch/:branchId",
  verifyToken,
  checkPermission("viewOrderAnalytics"),
  cacheMiddleware(
    (req) => `orders:analytics:branch:${req.params.branchId}`,
    "TTL_ANALYTICS",
  ),
  getOrderAnalytics,
);

export default router;
