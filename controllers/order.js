import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";
import { isDiscountActiveNow } from "../utils/discountUtils.js";
import { randomUUID } from "crypto";

// ─── Prisma include shape ─────────────────────────────────────────────────────

const ORDER_INCLUDE = {
  orderItems: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      totalPrice: true,
      product: {
        select: { id: true, name: true, image: true, price: true },
      },
    },
  },
};

const INVOICE_INCLUDE = {
  ...ORDER_INCLUDE,
  customer: {
    select: { id: true, name: true, phone: true, email: true },
  },
  branch: {
    select: { id: true, name: true, address: true },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const applyDiscount = (price, type, amount) => {
  if (!amount || amount <= 0) return price;
  const raw = type === "PERCENT" ? price * (1 - amount / 100) : price - amount;
  return Math.max(0, Math.round((raw + Number.EPSILON) * 100) / 100);
};

const applyBothDiscounts = (price, order) => {
  let result = applyDiscount(price, order.customerDiscountType, Number(order.customerDiscountAmount));
  result = applyDiscount(result, order.discountType, Number(order.discountAmount));
  return result;
};

const sumItems = (items) =>
  items.reduce((sum, i) => sum + Number(i.totalPrice), 0);

const enrichItems = async (items) => {
  const enriched = [];
  for (const { productId, quantity } of items) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        isActive: true,
      },
    });
    if (!product) throw new AppError(`Product not found: ${productId}`, 404);
    if (!product.isActive)
      throw new AppError(`"${product.name}" is no longer available`, 400);
    if (product.stock < quantity) {
      throw new AppError(
        `Insufficient stock for "${product.name}". Available: ${product.stock}, Requested: ${quantity}`,
        400,
      );
    }
    enriched.push({
      productId: product.id,
      quantity,
      unitPrice: Number(product.price).toFixed(2),
      totalPrice: (Number(product.price) * quantity).toFixed(2),
    });
  }
  return enriched;
};

const resolveCustomerDiscount = async (customerId) => {
  if (!customerId) return { type: "FLAT", amount: 0 };

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      isBlocked: true,
      blockedReason: true,
      hasDiscount: true,
      discountType: true,
      discountAmount: true,
      discountStartsAt: true,
      discountEndsAt: true,
      discountStartTime: true,
      discountEndTime: true,
    },
  });

  if (!customer) return { type: "FLAT", amount: 0 };

  if (customer.isBlocked) {
    throw new AppError(
      `Customer is blocked${customer.blockedReason ? `: ${customer.blockedReason}` : ""}`,
      403,
    );
  }

  if (isDiscountActiveNow(customer)) {
    return {
      type: customer.discountType,
      amount: Number(customer.discountAmount),
    };
  }

  return { type: "FLAT", amount: 0 };
};

const formatOrderItem = (item) => ({
  id: item.id,
  quantity: item.quantity,
  unitPrice: Number(item.unitPrice),
  totalPrice: Number(item.totalPrice),
  product: item.product
    ? {
        id: item.product.id,
        name: item.product.name,
        image: item.product.image ?? null,
        price: Number(item.product.price),
      }
    : null,
});

const formatOrder = (order) => ({
  id: order.id,
  number: order.number,
  isTakeaway: order.visitId === null,
  visitId: order.visitId ?? null,
  branchId: order.branchId ?? null,
  customerId: order.customerId ?? null,
  status: order.status,
  discount: {
    order: {
      type: order.discountType,
      amount: Number(order.discountAmount),
    },
    customer: {
      type: order.customerDiscountType,
      amount: Number(order.customerDiscountAmount),
    },
  },
  totalPrice: Number(order.totalPrice),
  finalPrice: Number(order.finalPrice),
  itemCount: Array.isArray(order.orderItems) ? order.orderItems.length : 0,
  orderItems: Array.isArray(order.orderItems)
    ? order.orderItems.map(formatOrderItem)
    : [],
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
});

const formatInvoice = (order) => ({
  id: order.id,
  number: order.number,
  isTakeaway: order.visitId === null,
  visitId: order.visitId ?? null,
  status: order.status,
  branch: order.branch
    ? { id: order.branch.id, name: order.branch.name, address: order.branch.address }
    : null,
  customer: order.customer
    ? {
        id: order.customer.id,
        name: order.customer.name,
        phone: order.customer.phone,
        email: order.customer.email ?? null,
      }
    : null,
  discount: {
    order: {
      type: order.discountType,
      amount: Number(order.discountAmount),
    },
    customer: {
      type: order.customerDiscountType,
      amount: Number(order.customerDiscountAmount),
    },
  },
  totalPrice: Number(order.totalPrice),
  finalPrice: Number(order.finalPrice),
  items: Array.isArray(order.orderItems) ? order.orderItems.map(formatOrderItem) : [],
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
});

// ─── Controllers ──────────────────────────────────────────────────────────────

export const addOrderItems = async (req, res, next) => {
  try {
    const {
      visitId,
      branchId: bodyBranchId,
      customerId: bodyCustomerId,
      items,
      discountType: bodyDiscountType,
      discountAmount: bodyDiscountAmount,
    } = req.body ?? {};

    if (!Array.isArray(items) || items.length === 0) {
      return next(new AppError("items must be a non-empty array", 400));
    }

    const parsed = items.map((item, i) => {
      const { productId, quantity } = item ?? {};
      if (!productId || typeof productId !== "string" || !productId.trim()) {
        throw new AppError(`items[${i}].productId is required`, 400);
      }
      const qty = Number(quantity);
      if (!quantity || !Number.isInteger(qty) || qty <= 0) {
        throw new AppError(
          `items[${i}].quantity must be a positive integer`,
          400,
        );
      }
      return { productId: productId.trim(), quantity: qty };
    });

    let resolvedVisitId = null;
    let resolvedBranchId = null;
    let resolvedCustomerId = null;
    let isTakeaway = false;
    let existing = null;

    if (visitId) {
      // ── Visit order ──────────────────────────────────────────────────────────
      const visit = await prisma.visit.findUnique({
        where: { id: visitId },
        select: { id: true, branchId: true, customerId: true, status: true },
      });
      if (!visit) return next(new AppError("Visit not found", 404));
      if (visit.status !== "ACTIVE") {
        return next(
          new AppError("Cannot add items to a visit that is not active", 409),
        );
      }

      existing = await prisma.order.findFirst({
        where: { visitId },
        select: {
          id: true,
          status: true,
          discountType: true,
          discountAmount: true,
          customerDiscountType: true,
          customerDiscountAmount: true,
        },
      });
      if (existing?.status === "COMPLETED") {
        return next(
          new AppError(
            "This order is already completed. No more items can be added.",
            409,
          ),
        );
      }

      resolvedVisitId = visit.id;
      resolvedBranchId = visit.branchId;
      resolvedCustomerId = visit.customerId;
    } else {
      // ── Takeaway order ───────────────────────────────────────────────────────
      if (
        !bodyBranchId ||
        typeof bodyBranchId !== "string" ||
        !bodyBranchId.trim()
      ) {
        return next(
          new AppError("branchId is required for takeaway orders", 400),
        );
      }

      const branch = await prisma.branch.findUnique({
        where: { id: bodyBranchId.trim() },
        select: { id: true },
      });
      if (!branch) return next(new AppError("Branch not found", 404));

      resolvedBranchId = branch.id;
      resolvedCustomerId = bodyCustomerId?.trim() || null;
      isTakeaway = true;
    }

    // ── Discount resolution ───────────────────────────────────────────────────
    // Customer discount is always resolved from profile.
    // Order discount is a manual per-order addition on top.
    const customerDiscount = await resolveCustomerDiscount(resolvedCustomerId);

    let orderDiscount = { type: "FLAT", amount: 0 };
    if (bodyDiscountType && bodyDiscountAmount !== undefined) {
      if (!["FLAT", "PERCENT"].includes(bodyDiscountType)) {
        return next(new AppError("discountType must be FLAT or PERCENT", 400));
      }
      const amt = Number(bodyDiscountAmount);
      if (isNaN(amt) || amt < 0) {
        return next(
          new AppError("discountAmount must be a non-negative number", 400),
        );
      }
      orderDiscount = { type: bodyDiscountType, amount: amt };
    }

    const enriched = await enrichItems(parsed);

    const order = await prisma.$transaction(async (tx) => {
      let orderId;

      if (!existing) {
        orderId = randomUUID();
        const branchOrderCount = await tx.order.count({
          where: { branchId: resolvedBranchId },
        });
        await tx.order.create({
          data: {
            id: orderId,
            number: branchOrderCount + 1,
            ...(resolvedVisitId ? { visitId: resolvedVisitId } : {}),
            branchId: resolvedBranchId,
            ...(resolvedCustomerId ? { customerId: resolvedCustomerId } : {}),
            status: "OPEN",
            discountType: orderDiscount.type,
            discountAmount: orderDiscount.amount,
            customerDiscountType: customerDiscount.type,
            customerDiscountAmount: customerDiscount.amount,
            totalPrice: 0,
            finalPrice: 0,
          },
        });
      } else {
        orderId = existing.id;
      }

      for (const item of enriched) {
        await tx.orderItem.create({
          data: {
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            order: { connect: { id: orderId } },
            product: { connect: { id: item.productId } },
          },
        });
      }

      for (const item of enriched) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      const allItems = await tx.orderItem.findMany({
        where: { orderId },
        select: { totalPrice: true },
      });
      const newTotal = sumItems(allItems);
      const discountSnapshot = existing
        ? existing
        : {
            customerDiscountType: customerDiscount.type,
            customerDiscountAmount: customerDiscount.amount,
            discountType: orderDiscount.type,
            discountAmount: orderDiscount.amount,
          };
      const newFinal = applyBothDiscounts(newTotal, discountSnapshot);

      await tx.order.update({
        where: { id: orderId },
        data: { totalPrice: newTotal, finalPrice: newFinal },
      });

      return tx.order.findUnique({
        where: { id: orderId },
        include: ORDER_INCLUDE,
      });
    });

    res.status(!existing ? 201 : 200).json({
      success: true,
      message: !existing
        ? isTakeaway
          ? "Takeaway order created"
          : "Order created"
        : "Items added to order",
      data: formatOrder(order),
    });
  } catch (error) {
    next(error);
  }
};

export const getVisitOrder = async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { visitId: req.params.visitId },
      include: ORDER_INCLUDE,
    });
    if (!order) return next(new AppError("No order found for this visit", 404));

    res.status(200).json({ success: true, data: formatOrder(order) });
  } catch (error) {
    next(error);
  }
};

export const updateItemQuantity = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body ?? {};

    if (quantity === undefined || quantity === null) {
      return next(new AppError("quantity is required", 400));
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      return next(new AppError("quantity must be a positive integer", 400));
    }

    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        orderId: true,
        productId: true,
        quantity: true,
        unitPrice: true,
        order: {
          select: {
            id: true,
            status: true,
            discountType: true,
            discountAmount: true,
            customerDiscountType: true,
            customerDiscountAmount: true,
          },
        },
      },
    });

    if (!item) return next(new AppError("Order item not found", 404));
    if (item.order.status === "COMPLETED") {
      return next(
        new AppError("Cannot modify items in a completed order", 409),
      );
    }

    const diff = qty - item.quantity;

    if (diff > 0) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        select: { stock: true, name: true },
      });
      if (product.stock < diff) {
        return next(
          new AppError(
            `Insufficient stock for "${product.name}". Available: ${product.stock}, Needed: ${diff}`,
            400,
          ),
        );
      }
    }

    const order = await prisma.$transaction(async (tx) => {
      await tx.orderItem.update({
        where: { id: itemId },
        data: { quantity: qty, totalPrice: Number(item.unitPrice) * qty },
      });

      if (diff > 0) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: diff } },
        });
      } else if (diff < 0) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: Math.abs(diff) } },
        });
      }

      const allItems = await tx.orderItem.findMany({
        where: { orderId: item.orderId },
        select: { totalPrice: true },
      });
      const newTotal = sumItems(allItems);
      const newFinal = applyBothDiscounts(newTotal, item.order);

      await tx.order.update({
        where: { id: item.orderId },
        data: { totalPrice: newTotal, finalPrice: newFinal },
      });

      return tx.order.findUnique({
        where: { id: item.orderId },
        include: ORDER_INCLUDE,
      });
    });

    res.status(200).json({
      success: true,
      message: "Item quantity updated",
      data: formatOrder(order),
    });
  } catch (error) {
    next(error);
  }
};

export const removeItem = async (req, res, next) => {
  try {
    const { itemId } = req.params;

    const item = await prisma.orderItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        orderId: true,
        productId: true,
        quantity: true,
        order: {
          select: {
            id: true,
            status: true,
            discountType: true,
            discountAmount: true,
            customerDiscountType: true,
            customerDiscountAmount: true,
          },
        },
      },
    });

    if (!item) return next(new AppError("Order item not found", 404));
    if (item.order.status === "COMPLETED") {
      return next(
        new AppError("Cannot remove items from a completed order", 409),
      );
    }

    const order = await prisma.$transaction(async (tx) => {
      await tx.orderItem.delete({ where: { id: itemId } });

      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      });

      const remaining = await tx.orderItem.findMany({
        where: { orderId: item.orderId },
        select: { totalPrice: true },
      });
      const newTotal = sumItems(remaining);
      const newFinal = applyBothDiscounts(newTotal, item.order);

      await tx.order.update({
        where: { id: item.orderId },
        data: { totalPrice: newTotal, finalPrice: newFinal },
      });

      return tx.order.findUnique({
        where: { id: item.orderId },
        include: ORDER_INCLUDE,
      });
    });

    res.status(200).json({
      success: true,
      message: "Item removed",
      data: formatOrder(order),
    });
  } catch (error) {
    next(error);
  }
};

export const completeOrder = async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { visitId: req.params.visitId },
      select: { id: true, status: true },
    });

    if (!order) return next(new AppError("No order found for this visit", 404));
    if (order.status === "COMPLETED")
      return next(new AppError("Order is already completed", 409));

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: "COMPLETED" },
      include: ORDER_INCLUDE,
    });

    res.status(200).json({
      success: true,
      message: "Order completed",
      data: formatOrder(updated),
    });
  } catch (error) {
    next(error);
  }
};

export const cancelOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderItems: { select: { productId: true, quantity: true } },
      },
    });

    if (!order) return next(new AppError("Order not found", 404));

    await prisma.$transaction(async (tx) => {
      for (const item of order.orderItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
      await tx.order.delete({ where: { id: orderId } });
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const getOrderById = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!order) return next(new AppError("Order not found", 404));

    res.status(200).json({ success: true, data: formatOrder(order) });
  } catch (error) {
    next(error);
  }
};

export const getAllOrders = async (req, res, next) => {
  try {
    const { page, limit, skip, sort, order } = pagination(req);
    const { visitId, branchId } = req.query ?? {};

    const where = {};
    if (visitId?.trim()) where.visitId = visitId.trim();
    if (branchId?.trim()) where.branchId = branchId.trim();

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort]: order },
        include: ORDER_INCLUDE,
      }),
      prisma.order.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: orders.map(formatOrder),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

export const completeTakeawayOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, visitId: true },
    });

    if (!order) return next(new AppError("Order not found", 404));
    if (order.visitId) {
      return next(
        new AppError(
          "This order belongs to a visit. Use the visit completion endpoint instead.",
          400,
        ),
      );
    }
    if (order.status === "COMPLETED") {
      return next(new AppError("Order is already completed", 409));
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { status: "COMPLETED" },
      include: ORDER_INCLUDE,
    });

    res.status(200).json({
      success: true,
      message: "Takeaway order completed",
      data: formatOrder(updated),
    });
  } catch (error) {
    next(error);
  }
};

export const getOrderInvoice = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: INVOICE_INCLUDE,
    });

    if (!order) return next(new AppError("Order not found", 404));

    res.status(200).json({ success: true, data: formatInvoice(order) });
  } catch (error) {
    next(error);
  }
};

export const getOrderAnalytics = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { startDate, endDate } = req.query ?? {};

    if (startDate && isNaN(Date.parse(startDate))) {
      return next(
        new AppError("startDate must be a valid date (e.g. 2026-01-01)", 400),
      );
    }
    if (endDate && isNaN(Date.parse(endDate))) {
      return next(
        new AppError("endDate must be a valid date (e.g. 2026-12-31)", 400),
      );
    }
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      return next(new AppError("startDate must be before endDate", 400));
    }

    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const where = {
      branchId,
      ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
    };

    const [totalOrders, topItems] = await Promise.all([
      prisma.order.count({ where }),
      prisma.orderItem.groupBy({
        by: ["productId"],
        where: { order: where },
        _sum: { quantity: true, totalPrice: true },
        orderBy: { _sum: { totalPrice: "desc" } },
        take: 10,
      }),
    ]);

    const productIds = topItems.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });
    const productMap = Object.fromEntries(products.map((p) => [p.id, p.name]));

    res.status(200).json({
      success: true,
      data: {
        totalOrders,
        topProducts: topItems.map((i) => ({
          productId: i.productId,
          productName: productMap[i.productId] ?? "Unknown",
          totalQuantity: i._sum.quantity,
          totalRevenue: Number(i._sum.totalPrice),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};
