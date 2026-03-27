import express from "express";
import {
  createOrder,
  getOrderById,
  getAllOrders,
  getOrdersByVisit,
  updateOrder,
  deleteOrder,
  getOrderAnalytics,
  getOrderSummary,
} from "../controllers/order.js";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { cacheMiddleware } from "../middleware/cache.js";

const router = express.Router();

/**
 * @route   POST /orders/create
 * @desc    Create a new order with items
 * @body    { visitId, items: [{ productId, quantity }, ...] }
 * @access  Private
 */
router.post(
  "/create",
  verifyToken,
  checkPermission("createOrder"),
  createOrder,
);

/**
 * @route   GET /orders/getById/:orderId
 * @desc    Get order by ID with all items and product details
 * @params  orderId - The order ID
 * @access  Private
 */
router.get(
  "/getById/:orderId",
  verifyToken,
  checkPermission("viewOrder"),
  cacheMiddleware((req) => `orders:${req.params.orderId}`, "TTL_BY_ID"),
  getOrderById,
);

/**
 * @route   GET /orders/visit/:visitId
 * @desc    Get all orders for a specific visit with pagination
 * @params  visitId - The visit ID
 * @query   page, limit, sort, order
 * @access  Private
 */
router.get(
  "/visit/:visitId",
  verifyToken,
  checkPermission("viewOrder"),
  cacheMiddleware(
    (req) => `orders:visit:${req.params.visitId}`,
    "TTL_BY_VISIT",
  ),
  getOrdersByVisit,
);

/**
 * @route   GET /orders/getAll?branchId=:branchId
 * @desc    Get all orders with pagination and optional filters
 * @query   page, limit, sort, order, visitId, branchId
 * @access  Private
 */
router.get(
  "/getAll",
  verifyToken,
  checkPermission("viewOrder"),
  cacheMiddleware(
    (req) =>
      `orders:page=${req.query.page || 1}:limit=${req.query.limit || 10}:branchId=${req.query.branchId || "all"}`,
    "TTL_LIST",
  ),
  getAllOrders,
);

/**
 * @route   PUT /orders/:orderId
 * @desc    Update order items (remove or change quantities)
 * @params  orderId - The order ID
 * @body    { itemsToRemove: [itemId, ...], quantityUpdates: [{ itemId, newQuantity }, ...] }
 * @access  Private
 */
router.put(
  "/:orderId",
  verifyToken,
  checkPermission("updateOrder"),
  updateOrder,
);

/**
 * @route   DELETE /orders/:orderId
 * @desc    Delete order and restore product quantities
 * @params  orderId - The order ID
 * @access  Private
 */
router.delete(
  "/:orderId",
  verifyToken,
  checkPermission("deleteOrder"),
  deleteOrder,
);

/**
 * @route   GET /orders/analytics/branch/:branchId
 * @desc    Get order analytics for a branch
 * @params  branchId - The branch ID
 * @query   startDate, endDate
 * @access  Private
 */
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

/**
 * @route   GET /orders/summary/business/:businessId
 * @desc    Get order summary for a date range
 * @query   startDate, endDate, branchId
 * @access  Private
 */
router.get(
  "/summary/business/:businessId",
  verifyToken,
  checkPermission("viewOrderSummary"),
  cacheMiddleware(
    (req) => `orders:summary:business:${req.params.businessId}`,
    "TTL_SUMMARY",
  ),
  getOrderSummary,
);

export default router;
