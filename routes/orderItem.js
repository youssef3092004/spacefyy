import express from "express";
import {
  createOrderItem,
  getOrderItemById,
  getAllOrderItems,
  updateOrderItemQuantity,
  deleteOrderItem,
} from "../controllers/orderItem.js";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { cacheMiddleware } from "../middleware/cache.js";

const router = express.Router();

/**
 * @route   POST /order-items/create
 * @desc    Create a new order item and add it to an existing order
 * @body    orderId, productId, quantity
 * @access  Private
 * @permission  createOrderItem
 */
router.post(
  "/create",
  verifyToken,
  checkPermission("createOrderItem"),
  createOrderItem,
);

/**
 * @route   GET /order-items/getById/:orderItemId
 * @desc    Get a single order item by ID with product details
 * @params  orderItemId - The order item ID
 * @access  Private
 * @permission  viewOrderItem
 * @cache   TTL_BY_ID
 */
router.get(
  "/getById/:orderItemId",
  verifyToken,
  checkPermission("viewOrderItem"),
  cacheMiddleware((req) => `orderItems:${req.params.orderItemId}`, "TTL_BY_ID"),
  getOrderItemById,
);

/**
 * @route   GET /order-items/getAll
 * @desc    Get all order items with pagination and filters
 * @query   page, limit, orderId, productId
 * @access  Private
 * @cache   TTL_LIST
 */
router.get(
  "/getAll",
  verifyToken,
  cacheMiddleware(
    (req) =>
      `orderItems:page=${req.query.page || 1}:limit=${req.query.limit || 10}:orderId=${req.query.orderId || "all"}:productId=${req.query.productId || "all"}`,
    "TTL_LIST",
  ),
  getAllOrderItems,
);

/**
 * @route   PATCH /order-items/update/:orderItemId/:quantity
 * @desc    Update order item quantity and sync order total
 * @params  orderItemId - The order item ID, quantity - The new quantity
 * @access  Private
 * @permission  updateOrderItem
 */
router.patch(
  "/update/:orderItemId/:quantity",
  verifyToken,
  checkPermission("updateOrderItem"),
  updateOrderItemQuantity,
);

/**
 * @route   DELETE /order-items/delete/:orderItemId
 * @desc    Delete an order item and restore stock
 * @params  orderItemId - The order item ID
 * @access  Private
 * @permission  deleteOrderItem
 */
router.delete(
  "/delete/:orderItemId",
  verifyToken,
  checkPermission("deleteOrderItem"),
  deleteOrderItem,
);

export default router;
