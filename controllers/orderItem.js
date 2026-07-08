import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";
import { invalidateCacheByPattern } from "../utils/cacheInvalidation.js";
import { applyBothDiscounts, sumItems } from "./order.js";

const FINAL_ORDER_STATUSES = new Set(["COMPLETED", "INVOICED"]);

// Order items live under their own route (/order-items), but every mutation
// here also changes the parent order's totalPrice/finalPrice/itemCount —
// so the orders list/detail caches need busting too, not just orderItems'.
const invalidateOrderRelatedCaches = () => {
  Promise.all([
    invalidateCacheByPattern("orders:*"),
    invalidateCacheByPattern("order:*"),
    invalidateCacheByPattern("orderItems:*"),
  ]).catch((error) => {
    console.error("Order-item cache invalidation failed:", error);
  });
};

const parsePositiveInt = (value, fieldName) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(`${fieldName} must be a positive integer`, 400);
  }
  return parsed;
};

const ensureOrderExists = async (orderId) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      branchId: true,
      visitId: true,
      status: true,
      totalPrice: true,
      discountType: true,
      discountAmount: true,
      customerDiscountType: true,
      customerDiscountAmount: true,
      visit: {
        select: {
          id: true,
          branchId: true,
        },
      },
    },
  });

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  if (FINAL_ORDER_STATUSES.has(order.status)) {
    throw new AppError(
      "This order is already finalized. No more items can be added.",
      409,
    );
  }

  return order;
};

const ensureProductUsable = async (productId) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      price: true,
      stock: true,
      isActive: true,
      branchId: true,
    },
  });

  if (!product) {
    throw new AppError("Product not found", 404);
  }

  if (!product.isActive) {
    throw new AppError(`Product "${product.name}" is no longer available`, 400);
  }

  return product;
};

const ensureOrderItemExists = async (orderItemId) => {
  const orderItem = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    select: {
      id: true,
      orderId: true,
      productId: true,
      quantity: true,
      unitPrice: true,
      totalPrice: true,
      product: {
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      },
      order: {
        select: {
          id: true,
          status: true,
          totalPrice: true,
          discountType: true,
          discountAmount: true,
          customerDiscountType: true,
          customerDiscountAmount: true,
        },
      },
    },
  });

  if (!orderItem) {
    throw new AppError("Order item not found", 404);
  }

  if (FINAL_ORDER_STATUSES.has(orderItem.order.status)) {
    throw new AppError("Cannot modify items in a finalized order", 409);
  }

  return orderItem;
};

const reserveStock = async (tx, productId, quantity) => {
  const result = await tx.product.updateMany({
    where: {
      id: productId,
      isActive: true,
      stock: {
        gte: quantity,
      },
    },
    data: {
      stock: {
        decrement: quantity,
      },
    },
  });

  if (result.count === 0) {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { stock: true, name: true, isActive: true },
    });

    if (!product) {
      throw new AppError("Product not found", 404);
    }
    if (!product.isActive) {
      throw new AppError(
        `Product "${product.name}" is no longer available`,
        400,
      );
    }

    throw new AppError(
      `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${quantity}`,
      400,
    );
  }
};

/**
 * Create a new order item
 * Validates order and product exist, reserves stock atomically
 * Merges with existing item if same product already in order
 * Auto-syncs order totalPrice
 * @param {Object} req - Express request
 * @param {string} req.body.orderId - Order ID
 * @param {string} req.body.productId - Product ID
 * @param {number} req.body.quantity - Quantity to add
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
export const createOrderItem = async (req, res, next) => {
  try {
    const { orderId, productId, quantity } = req.body;

    if (!orderId || !productId || quantity === undefined) {
      return next(
        new AppError("orderId, productId and quantity are required", 400),
      );
    }

    const parsedQuantity = parsePositiveInt(quantity, "quantity");

    const [order, product] = await Promise.all([
      ensureOrderExists(orderId),
      ensureProductUsable(productId),
    ]);

    const orderBranchId = order.branchId ?? order.visit?.branchId;

    if (!orderBranchId) {
      return next(new AppError("Order is not assigned to a branch", 400));
    }

    if (orderBranchId !== product.branchId) {
      return next(
        new AppError("Product and order must belong to the same branch", 400),
      );
    }

    const unitPrice = Number(product.price);
    const lineTotal = unitPrice * parsedQuantity;

    const savedItem = await prisma.$transaction(async (tx) => {
      await reserveStock(tx, productId, parsedQuantity);

      const existingItem = await tx.orderItem.findFirst({
        where: { orderId, productId },
        select: {
          id: true,
          quantity: true,
          totalPrice: true,
          unitPrice: true,
        },
      });

      let item;
      if (existingItem) {
        item = await tx.orderItem.update({
          where: { id: existingItem.id },
          data: {
            quantity: existingItem.quantity + parsedQuantity,
            totalPrice: Number(existingItem.totalPrice) + lineTotal,
          },
          include: {
            product: {
              select: { id: true, name: true, price: true },
            },
          },
        });
      } else {
        item = await tx.orderItem.create({
          data: {
            orderId,
            productId,
            quantity: parsedQuantity,
            unitPrice,
            totalPrice: lineTotal,
          },
          include: {
            product: {
              select: { id: true, name: true, price: true },
            },
          },
        });
      }

      const allItems = await tx.orderItem.findMany({
        where: { orderId },
        select: { totalPrice: true },
      });
      const newTotal = sumItems(allItems);
      const newFinal = applyBothDiscounts(newTotal, order);

      await tx.order.update({
        where: { id: orderId },
        data: { totalPrice: newTotal, finalPrice: newFinal },
      });

      return item;
    });

    invalidateOrderRelatedCaches();

    return res.status(201).json({
      success: true,
      message: "Order item saved successfully",
      data: savedItem,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single order item by ID
 * Returns item details with product and category information
 * @param {Object} req - Express request
 * @param {string} req.params.orderItemId - Order item ID
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
export const getOrderItemById = async (req, res, next) => {
  try {
    const { orderItemId } = req.params;

    if (!orderItemId) {
      return next(new AppError("orderItemId is required", 400));
    }

    const item = await prisma.orderItem.findUnique({
      where: { id: orderItemId },
      select: {
        id: true,
        orderId: true,
        productId: true,
        quantity: true,
        unitPrice: true,
        totalPrice: true,
        createdAt: true,
        product: {
          select: {
            id: true,
            name: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!item) {
      return next(new AppError("Order item not found", 404));
    }

    return res.status(200).json({
      success: true,
      message: "Order item retrieved successfully",
      data: item,
      source: "Database",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all order items with pagination and optional filters
 * @param {Object} req - Express request
 * @param {number} req.query.page - Page number (default: 1)
 * @param {number} req.query.limit - Items per page (default: 10)
 * @param {string} req.query.orderId - Optional: filter by order ID
 * @param {string} req.query.productId - Optional: filter by product ID
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
export const getAllOrderItems = async (req, res, next) => {
  try {
    const { page, limit, skip, sort, order } = pagination(req);
    const { orderId, productId } = req.query;

    const where = {
      ...(orderId ? { orderId } : {}),
      ...(productId ? { productId } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.orderItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sort]: order,
        },
        select: {
          id: true,
          orderId: true,
          productId: true,
          quantity: true,
          unitPrice: true,
          totalPrice: true,
          createdAt: true,
          product: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.orderItem.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Order items retrieved successfully",
      data: items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      source: "Database",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update order item quantity
 * Reserves/restores stock based on quantity difference
 * Auto-syncs order totalPrice with new line total
 * @param {Object} req - Express request
 * @param {string} req.params.orderItemId - Order item ID
 * @param {number} req.params.quantity - New quantity
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
export const updateOrderItemQuantity = async (req, res, next) => {
  try {
    const { orderItemId, quantity } = req.params;

    if (!orderItemId || quantity === undefined) {
      return next(
        new AppError("orderItemId and quantity are required in URL", 400),
      );
    }

    const newQuantity = parsePositiveInt(quantity, "quantity");

    const currentItem = await ensureOrderItemExists(orderItemId);

    const oldQuantity = currentItem.quantity;
    const diff = newQuantity - oldQuantity;

    if (diff === 0) {
      return res.status(200).json({
        success: true,
        message: "Quantity unchanged",
        data: currentItem,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (diff > 0) {
        await reserveStock(tx, currentItem.productId, diff);
      } else {
        await tx.product.update({
          where: { id: currentItem.productId },
          data: {
            stock: {
              increment: Math.abs(diff),
            },
          },
        });
      }

      const unitPrice = Number(currentItem.unitPrice);
      const newLineTotal = unitPrice * newQuantity;

      const updatedItem = await tx.orderItem.update({
        where: { id: orderItemId },
        data: {
          quantity: newQuantity,
          totalPrice: newLineTotal,
        },
        select: {
          id: true,
          orderId: true,
          productId: true,
          quantity: true,
          unitPrice: true,
          totalPrice: true,
          product: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      const allItems = await tx.orderItem.findMany({
        where: { orderId: currentItem.orderId },
        select: { totalPrice: true },
      });
      const newTotal = sumItems(allItems);
      const newFinal = applyBothDiscounts(newTotal, currentItem.order);

      await tx.order.update({
        where: { id: currentItem.orderId },
        data: { totalPrice: newTotal, finalPrice: newFinal },
      });

      return updatedItem;
    });

    invalidateOrderRelatedCaches();

    return res.status(200).json({
      success: true,
      message: "Order item quantity updated successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete an order item
 * Restores product stock atomically
 * Auto-decrements order totalPrice
 * @param {Object} req - Express request
 * @param {string} req.params.orderItemId - Order item ID
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
export const deleteOrderItem = async (req, res, next) => {
  try {
    const { orderItemId } = req.params;

    if (!orderItemId) {
      return next(new AppError("orderItemId is required", 400));
    }

    const item = await ensureOrderItemExists(orderItemId);

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: item.productId },
        data: {
          stock: {
            increment: item.quantity,
          },
        },
      });

      await tx.orderItem.delete({
        where: { id: orderItemId },
      });

      const remainingItems = await tx.orderItem.findMany({
        where: { orderId: item.orderId },
        select: { totalPrice: true },
      });
      const newTotal = sumItems(remainingItems);
      const newFinal = applyBothDiscounts(newTotal, item.order);

      await tx.order.update({
        where: { id: item.orderId },
        data: { totalPrice: newTotal, finalPrice: newFinal },
      });
    });

    invalidateOrderRelatedCaches();

    return res.status(200).json({
      success: true,
      message: "Order item deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
