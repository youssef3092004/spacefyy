import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";

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
      visitId: true,
      totalPrice: true,
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

  return order;
};

const ensureProductUsable = async (productId) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      price: true,
      quantity: true,
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
          totalPrice: true,
        },
      },
    },
  });

  if (!orderItem) {
    throw new AppError("Order item not found", 404);
  }

  return orderItem;
};

const reserveStock = async (tx, productId, quantity) => {
  const result = await tx.product.updateMany({
    where: {
      id: productId,
      isActive: true,
      quantity: {
        gte: quantity,
      },
    },
    data: {
      quantity: {
        decrement: quantity,
      },
    },
  });

  if (result.count === 0) {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { quantity: true, name: true, isActive: true },
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
      `Insufficient stock for ${product.name}. Available: ${product.quantity}, Requested: ${quantity}`,
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

    if (order.visit.branchId !== product.branchId) {
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

      await tx.order.update({
        where: { id: orderId },
        data: {
          totalPrice: {
            increment: lineTotal,
          },
        },
      });

      return item;
    });

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
        updatedAt: true,
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
          updatedAt: true,
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
            quantity: {
              increment: Math.abs(diff),
            },
          },
        });
      }

      const unitPrice = Number(currentItem.unitPrice);
      const newLineTotal = unitPrice * newQuantity;
      const oldLineTotal = Number(currentItem.totalPrice);
      const totalDiff = newLineTotal - oldLineTotal;

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
          updatedAt: true,
          product: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      await tx.order.update({
        where: { id: currentItem.orderId },
        data: {
          totalPrice: {
            increment: totalDiff,
          },
        },
      });

      return updatedItem;
    });

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
          quantity: {
            increment: item.quantity,
          },
        },
      });

      await tx.orderItem.delete({
        where: { id: orderItemId },
      });

      await tx.order.update({
        where: { id: item.orderId },
        data: {
          totalPrice: {
            decrement: Number(item.totalPrice),
          },
        },
      });
    });

    return res.status(200).json({
      success: true,
      message: "Order item deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
