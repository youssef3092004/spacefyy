import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";

/**
 * Validates the existence of a visit record
 * @param {string} visitId - The visit ID to validate
 * @param {object} options - Query options
 * @returns {Promise<object>} - The visit record with specified fields
 */
const ensureVisitExists = async (visitId, options = {}) => {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    select: {
      id: true,
      branchId: true,
      customerId: true,
      status: true,
      ...options.select,
    },
  });

  if (!visit) {
    throw new AppError("Visit not found", 404);
  }

  return visit;
};

/**
 * Validates the existence of a product and checks quantity availability
 * @param {string} productId - The product ID to validate
 * @param {number} requestedQuantity - The quantity being requested
 * @returns {Promise<object>} - The product record
 */
const ensureProductExists = async (productId, requestedQuantity = 1) => {
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

  if (!product.isActive || product.isActive === false) {
    throw new AppError(`Product "${product.name}" is no longer available`, 400);
  }

  if (product.quantity < requestedQuantity) {
    throw new AppError(
      `Insufficient stock for ${product.name}. Available: ${product.quantity}, Requested: ${requestedQuantity}`,
      400,
    );
  }

  return product;
};

/**
 * Validates order items structure and prepares data
 * @param {array} items - Array of order items
 * @returns {Promise<array>} - Validated and enriched item data
 */
const validateAndPrepareOrderItems = async (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError("Order must contain at least one item", 400);
  }

  const validatedItems = [];
  let totalPrice = 0;

  for (const item of items) {
    const { productId, quantity } = item;

    if (!productId || !quantity) {
      throw new AppError("Each item must have productId and quantity", 400);
    }

    const parsedQuantity = Number(quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      throw new AppError("Item quantity must be a positive integer", 400);
    }

    const product = await ensureProductExists(productId, parsedQuantity);

    const itemTotal = Number(product.price) * parsedQuantity;
    totalPrice += itemTotal;

    validatedItems.push({
      productId: product.id,
      quantity: parsedQuantity,
      unitPrice: product.price,
      totalPrice: itemTotal,
    });
  }

  return { items: validatedItems, totalPrice };
};

/**
 * Ensures order exists and retrieves it with relationships
 * @param {string} orderId - The order ID
 * @param {object} options - Query options
 * @returns {Promise<object>} - The order record
 */
const ensureOrderExists = async (orderId, options = {}) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      visitId: true,
      number: true,
      totalPrice: true,
      createdAt: true,
      updatedAt: true,
      visit: {
        select: {
          id: true,
          branchId: true,
          customerId: true,
          status: true,
        },
      },
      orderItems: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          unitPrice: true,
          totalPrice: true,
          product: {
            select: {
              name: true,
              category: { select: { id: true, name: true } },
            },
          },
        },
      },
      ...options.select,
    },
  });

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  return order;
};

/**
 * Calculates order total from items
 * @param {array} items - Order items with totalPrice
 * @returns {number} - Total price
 */
const calculateOrderTotal = (items) => {
  return items.reduce((sum, item) => sum + Number(item.totalPrice), 0);
};

/**
 * Create a new order with items
 * POST /orders
 * Body: { visitId, items: [{ productId, quantity }, ...] }
 */
export const createOrder = async (req, res, next) => {
  try {
    const { visitId, items } = req.body;

    if (!visitId) {
      return next(new AppError("visitId is required", 400));
    }

    if (!Array.isArray(items) || items.length === 0) {
      return next(new AppError("Order must contain at least one item", 400));
    }

    await ensureVisitExists(visitId);

    const { items: validatedItems, totalPrice } =
      await validateAndPrepareOrderItems(items);

    const order = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Visit" WHERE id = ${visitId} FOR UPDATE`;

      const existingOrder = await tx.order.findFirst({
        where: { visitId },
        select: { id: true },
      });

      if (existingOrder) {
        throw new AppError(
          "An order for this visit already exists. Please update the existing order instead.",
          400,
        );
      }

      const visitOrderCount = await tx.order.count({
        where: { visitId },
      });
      const nextOrderNumber = visitOrderCount + 1;

      const newOrder = await tx.order.create({
        data: {
          visitId,
          number: nextOrderNumber,
          totalPrice,
          orderItems: {
            create: validatedItems,
          },
        },
        include: {
          visit: {
            select: {
              id: true,
              branchId: true,
              customerId: true,
            },
          },
          orderItems: {
            select: {
              id: true,
              productId: true,
              quantity: true,
              unitPrice: true,
              totalPrice: true,
            },
          },
        },
      });

      for (const item of validatedItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            quantity: {
              decrement: item.quantity,
            },
          },
        });
      }

      return newOrder;
    });

    res.status(201).json({
      success: true,
      message: "Order created successfully",
      data: {
        ...order,
        totalPrice: Number(order.totalPrice || totalPrice),
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    if (error.code === "P2002") {
      return next(
        new AppError(
          "An order for this visit already exists. Please update the existing order instead.",
          409,
        ),
      );
    }
    if (error.code === "P2025") {
      return next(new AppError("Related record not found", 404));
    }
    next(error);
  }
};

/**
 * Get order by ID with items and product details
 * GET /orders/:orderId
 */
export const getOrderById = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return next(new AppError("Order ID is required", 400));
    }

    const order = await ensureOrderExists(orderId);

    const orderTotal = calculateOrderTotal(order.orderItems);

    res.status(200).json({
      success: true,
      data: {
        ...order,
        totalPrice: orderTotal,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all orders with pagination and filters
 * GET /orders?page=1&limit=10&visitId=xxx&branchId=xxx
 */
export const getAllOrders = async (req, res, next) => {
  try {
    const { page, limit, skip, sort, order } = pagination(req);
    const { visitId, branchId } = req.query;

    const whereClause = {};

    if (visitId) {
      whereClause.visitId = visitId;
    }

    if (branchId) {
      whereClause.visit = {
        branchId,
      };
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: whereClause,
        skip,
        take: limit,
        select: {
          id: true,
          visitId: true,
          number: true,
          createdAt: true,
          updatedAt: true,
          visit: {
            select: {
              id: true,
              branchId: true,
              customerId: true,
            },
          },
          orderItems: {
            select: {
              id: true,
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
          },
        },
        orderBy: {
          [sort]: order,
        },
      }),
      prisma.order.count({ where: whereClause }),
    ]);

    const ordersWithTotals = orders.map((order) => ({
      ...order,
      totalPrice: calculateOrderTotal(order.orderItems),
    }));

    res.status(200).json({
      success: true,
      data: ordersWithTotals,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all orders for a specific visit
 * GET /orders/visit/:visitId
 */
export const getOrdersByVisit = async (req, res, next) => {
  try {
    const { visitId } = req.params;
    const { page, limit, skip, sort, order } = pagination(req);

    if (!visitId) {
      return next(new AppError("Visit ID is required", 400));
    }

    await ensureVisitExists(visitId);

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { visitId },
        skip,
        take: limit,
        select: {
          id: true,
          number: true,
          createdAt: true,
          updatedAt: true,
          orderItems: {
            select: {
              id: true,
              quantity: true,
              unitPrice: true,
              totalPrice: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  category: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: {
          [sort]: order,
        },
      }),
      prisma.order.count({ where: { visitId } }),
    ]);

    const ordersWithTotals = orders.map((order) => ({
      ...order,
      totalPrice: calculateOrderTotal(order.orderItems),
    }));

    res.status(200).json({
      success: true,
      data: ordersWithTotals,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update order items (remove items or change quantities)
 * PUT /orders/:orderId
 * Body: { itemsToRemove: [itemId, ...], quantityUpdates: [{ itemId, newQuantity }, ...] }
 */
export const updateOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { itemsToRemove = [], quantityUpdates = [] } = req.body;

    if (!orderId) {
      return next(new AppError("Order ID is required", 400));
    }

    if (!Array.isArray(itemsToRemove) && !Array.isArray(quantityUpdates)) {
      return next(
        new AppError("itemsToRemove and quantityUpdates must be arrays", 400),
      );
    }

    await ensureOrderExists(orderId);

    const updatedOrder = await prisma.$transaction(async (tx) => {
      for (const itemId of itemsToRemove) {
        const item = await tx.orderItem.findUnique({
          where: { id: itemId },
          select: { productId: true, quantity: true },
        });

        if (item) {
          await tx.product.update({
            where: { id: item.productId },
            data: { quantity: { increment: item.quantity } },
          });

          await tx.orderItem.delete({
            where: { id: itemId },
          });
        }
      }

      for (const { itemId, newQuantity } of quantityUpdates) {
        const parsedQuantity = Number(newQuantity);

        if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
          throw new AppError("Quantity must be a positive integer", 400);
        }

        const item = await tx.orderItem.findUnique({
          where: { id: itemId },
          select: {
            quantity: true,
            productId: true,
            unitPrice: true,
          },
        });

        if (!item) {
          throw new AppError("Order item not found", 404);
        }

        const quantityDiff = parsedQuantity - item.quantity;

        if (quantityDiff > 0) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
            select: { quantity: true, name: true },
          });

          if (product.quantity < quantityDiff) {
            throw new AppError(
              `Insufficient stock for ${product.name}. Available: ${product.quantity}, Requested: ${quantityDiff}`,
              400,
            );
          }
        }

        await tx.orderItem.update({
          where: { id: itemId },
          data: {
            quantity: parsedQuantity,
            totalPrice: Number(item.unitPrice) * parsedQuantity,
          },
        });

        await tx.product.update({
          where: { id: item.productId },
          data: {
            quantity: { decrement: quantityDiff },
          },
        });
      }

      return await tx.order.findUnique({
        where: { id: orderId },
        include: {
          orderItems: {
            select: {
              id: true,
              productId: true,
              quantity: true,
              unitPrice: true,
              totalPrice: true,
              product: { select: { name: true } },
            },
          },
        },
      });
    });

    const orderTotal = calculateOrderTotal(updatedOrder.orderItems);

    res.status(200).json({
      success: true,
      message: "Order updated successfully",
      data: {
        ...updatedOrder,
        totalPrice: orderTotal,
      },
    });
  } catch (error) {
    if (error.code === "P2025") {
      return next(new AppError("Related record not found", 404));
    }
    next(error);
  }
};

/**
 * Delete order and restore product quantities
 * DELETE /orders/:orderId
 */
export const deleteOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return next(new AppError("Order ID is required", 400));
    }

    const order = await ensureOrderExists(orderId);

    await prisma.$transaction(async (tx) => {
      for (const item of order.orderItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            quantity: { increment: item.quantity },
          },
        });
      }

      await tx.order.delete({
        where: { id: orderId },
      });
    });

    res.status(200).json({
      success: true,
      message: "Order deleted successfully",
      data: { id: orderId },
    });
  } catch (error) {
    if (error.code === "P2025") {
      return next(new AppError("Order not found", 404));
    }
    next(error);
  }
};

/**
 * Get order analytics for a branch
 * GET /orders/analytics/branch/:branchId
 */
export const getOrderAnalytics = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { startDate, endDate } = req.query;

    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }

    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const whereClause = {
      visit: {
        branchId,
        ...(Object.keys(dateFilter).length > 0 && {
          createdAt: dateFilter,
        }),
      },
    };

    const [totalOrders, totalOrderItems, ordersByProduct, topProducts] =
      await Promise.all([
        prisma.order.count({ where: whereClause }),
        prisma.orderItem.count({
          where: { order: whereClause },
        }),
        prisma.orderItem.groupBy({
          by: ["productId"],
          where: { order: whereClause },
          _sum: {
            quantity: true,
            totalPrice: true,
          },
          orderBy: {
            _sum: { totalPrice: "desc" },
          },
          take: 10,
        }),
        prisma.product.findMany({
          where: { branchId },
          select: { id: true, name: true },
          take: undefined,
        }),
      ]);

    const productMap = Object.fromEntries(
      topProducts.map((p) => [p.id, p.name]),
    );
    const enrichedByProduct = ordersByProduct.map((item) => ({
      productId: item.productId,
      productName: productMap[item.productId] || "Unknown",
      totalQuantity: item._sum.quantity,
      totalRevenue: item._sum.totalPrice,
    }));

    res.status(200).json({
      success: true,
      data: {
        totalOrders,
        totalOrderItems,
        topProducts: enrichedByProduct,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get order summary for a specific date range
 * GET /orders/summary?startDate=2026-01-01&endDate=2026-03-22
 */
export const getOrderSummary = async (req, res, next) => {
  try {
    const { bussinessId } = req.params;
    const { startDate, endDate, branchId } = req.query;

    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const whereClause = {
      bussinessId,
      ...(Object.keys(dateFilter).length > 0 && {
        createdAt: dateFilter,
      }),
      ...(branchId && {
        visit: { branchId },
      }),
    };

    const orders = await prisma.order.findMany({
      where: whereClause,
      select: {
        id: true,
        createdAt: true,
        orderItems: {
          select: {
            totalPrice: true,
            quantity: true,
          },
        },
      },
    });

    const summary = orders.reduce(
      (acc, order) => {
        const orderTotal = calculateOrderTotal(order.orderItems);
        const itemCount = order.orderItems.reduce(
          (sum, item) => sum + item.quantity,
          0,
        );

        return {
          totalOrders: acc.totalOrders + 1,
          totalItems: acc.totalItems + itemCount,
          totalRevenue: acc.totalRevenue + orderTotal,
          averageOrderValue:
            (acc.totalRevenue + orderTotal) / (acc.totalOrders + 1),
        };
      },
      {
        totalOrders: 0,
        totalItems: 0,
        totalRevenue: 0,
        averageOrderValue: 0,
      },
    );

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
};
