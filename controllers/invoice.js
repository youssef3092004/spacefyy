import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";
import { closeVisitCore } from "./visit.js";
import { invalidateCacheByPattern } from "../utils/cacheInvalidation.js";

const toNumber = (v) => (v === null || v === undefined ? 0 : Number(v));

// Order responses embed the invoice's id/status (order.invoice), so any
// invoice mutation must also bust the orders list/detail caches — they live
// under a different route/tag ("orders"/"order") than "invoices" and are
// never reached by the generic request-based invalidation.
const invalidateOrderRelatedCaches = () => {
  Promise.all([
    invalidateCacheByPattern("orders:*"),
    invalidateCacheByPattern("order:*"),
  ]).catch((error) => {
    console.error("Order cache invalidation failed:", error);
  });
};

// ─── Shapes ───────────────────────────────────────────────────────────────────

const INVOICE_INCLUDE = {
  visit: {
    select: {
      id: true,
      branchId: true,
      customerId: true,
      status: true,
      startedAt: true,
      endedAt: true,
      totalPrice: true,
    },
  },
  order: {
    select: {
      id: true,
      number: true,
      branchId: true,
      status: true,
      totalPrice: true,
      finalPrice: true,
      createdAt: true,
    },
  },
};

// ─── Formatters ───────────────────────────────────────────────────────────────

const normalizeInvoice = (invoice) => {
  if (!invoice) return invoice;
  return {
    ...invoice,
    totalAmount: toNumber(invoice.totalAmount),
    discountAmount: toNumber(invoice.discountAmount),
    customerDiscountAmount: toNumber(invoice.customerDiscountAmount),
    finalAmount: toNumber(invoice.finalAmount),
  };
};

// ─── Guards ───────────────────────────────────────────────────────────────────

const ensureVisitExists = async (visitId) => {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    select: { id: true, branchId: true, status: true, totalPrice: true },
  });
  if (!visit) throw new AppError("Visit not found", 404);
  return visit;
};

const ensureInvoiceExists = async (invoiceId) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: INVOICE_INCLUDE,
  });
  if (!invoice) throw new AppError("Invoice not found", 404);
  return invoice;
};

const VALID_STATUSES = new Set(["UNPAID", "PAID"]);
const VALID_PAYMENT_METHODS = new Set(["CASH", "BANK", "INSTAPAY", "CARD"]);

// ─── Controllers ──────────────────────────────────────────────────────────────

export const createInvoice = async (req, res, next) => {
  try {
    const { visitId } = req.params;
    if (!visitId) return next(new AppError("visitId is required", 400));

    const visit = await ensureVisitExists(visitId);
    const { discountType, discountAmount } = req.body ?? {};

    let statusCode = 200;
    let message = "Invoice retrieved successfully";

    if (visit.status === "ACTIVE") {
      // Closing the visit ends its sessions, releases resources, completes
      // its order, and upserts the Invoice — all in one call.
      await closeVisitCore(visitId, { discountType, discountAmount });
      statusCode = 201;
      message = "Visit closed and invoice created successfully";
    } else if (visit.status === "CANCELLED") {
      return next(new AppError("Cannot invoice a CANCELLED visit", 400));
    }

    const invoice = await prisma.invoice.findUnique({
      where: { visitId },
      include: INVOICE_INCLUDE,
    });

    if (!invoice)
      return next(new AppError("Invoice not found for this visit", 404));

    invalidateOrderRelatedCaches();

    res.status(statusCode).json({
      success: true,
      message,
      data: normalizeInvoice(invoice),
    });
  } catch (error) {
    next(error);
  }
};

export const payInvoice = async (req, res, next) => {
  try {
    const { visitId } = req.params;
    if (!visitId) return next(new AppError("Visit ID is required", 400));

    const { paymentMethod } = req.params ?? {};
    if (!paymentMethod || !VALID_PAYMENT_METHODS.has(paymentMethod)) {
      return next(
        new AppError(
          "paymentMethod is required. Use CASH, BANK, INSTAPAY or CARD",
          400,
        ),
      );
    }

    const invoice = await prisma.invoice.findUnique({
      where: { visitId },
      select: { id: true, visitId: true, status: true },
    });

    if (!invoice) return next(new AppError("Invoice not found", 404));
    if (invoice.status === "PAID")
      return next(new AppError("Invoice is already PAID", 400));

    const paidInvoice = await prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { visitId },
        data: { status: "PAID", paidAt: new Date(), paymentMethod },
        include: INVOICE_INCLUDE,
      });

      return updated;
    });

    invalidateOrderRelatedCaches();

    res.status(200).json({
      success: true,
      message: "Invoice marked as PAID",
      data: normalizeInvoice(paidInvoice),
    });
  } catch (error) {
    next(error);
  }
};

export const payInvoiceById = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;

    const { paymentMethod } = req.params ?? {};
    if (!paymentMethod || !VALID_PAYMENT_METHODS.has(paymentMethod)) {
      return next(
        new AppError(
          "paymentMethod is required. Use CASH, BANK, INSTAPAY or CARD",
          400,
        ),
      );
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, status: true, visitId: true },
    });

    if (!invoice) return next(new AppError("Invoice not found", 404));
    if (invoice.status === "PAID")
      return next(new AppError("Invoice is already PAID", 400));

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: "PAID", paidAt: new Date(), paymentMethod },
        include: INVOICE_INCLUDE,
      });

      return result;
    });

    invalidateOrderRelatedCaches();

    res.status(200).json({
      success: true,
      message: "Invoice marked as PAID",
      data: normalizeInvoice(updated),
    });
  } catch (error) {
    next(error);
  }
};

export const getInvoiceById = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;
    if (!invoiceId) return next(new AppError("Invoice ID is required", 400));

    const invoice = await ensureInvoiceExists(invoiceId);

    res.status(200).json({ success: true, data: normalizeInvoice(invoice) });
  } catch (error) {
    next(error);
  }
};

export const getInvoiceByVisitId = async (req, res, next) => {
  try {
    const { visitId } = req.params;
    if (!visitId) return next(new AppError("visitId is required", 400));

    const invoice = await prisma.invoice.findUnique({
      where: { visitId },
      include: INVOICE_INCLUDE,
    });

    if (!invoice)
      return next(new AppError("Invoice not found for this visit", 404));

    res.status(200).json({ success: true, data: normalizeInvoice(invoice) });
  } catch (error) {
    next(error);
  }
};

export const getAllInvoices = async (req, res, next) => {
  try {
    const { page, limit, skip, sort, order } = pagination(req);
    const { branchId } = req.params;
    const { status } = req.query;

    if (!branchId) return next(new AppError("branchId is required", 400));

    if (status && !VALID_STATUSES.has(status)) {
      return next(new AppError("Invalid status. Use UNPAID or PAID", 400));
    }

    const where = {
      ...(status ? { status } : {}),
      OR: [{ branchId }, { visit: { branchId } }],
    };

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort]: order },
        include: INVOICE_INCLUDE,
      }),
      prisma.invoice.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      data: invoices.map(normalizeInvoice),
    });
  } catch (error) {
    next(error);
  }
};

export const createOrderInvoice = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        branchId: true,
        status: true,
        visitId: true,
        finalPrice: true,
      },
    });

    if (!order) return next(new AppError("Order not found", 404));
    if (order.visitId) {
      return next(
        new AppError("Use the visit invoice endpoint for visit orders", 400),
      );
    }
    if (order.status !== "COMPLETED") {
      return next(
        new AppError("Cannot invoice an order that is not completed", 400),
      );
    }

    const existing = await prisma.invoice.findUnique({
      where: { orderId },
      select: { id: true },
    });
    if (existing)
      return next(new AppError("Invoice already exists for this order", 409));

    const totalAmount = Number(order.finalPrice);
    const invoice = await prisma.$transaction(async (tx) => {
      const createdInvoice = await tx.invoice.create({
        data: {
          orderId,
          branchId: order.branchId,
          totalAmount,
          finalAmount: totalAmount,
          status: "UNPAID",
        },
        include: INVOICE_INCLUDE,
      });

      await tx.order.update({
        where: { id: orderId },
        data: { status: "INVOICED" },
      });

      return tx.invoice.findUnique({
        where: { id: createdInvoice.id },
        include: INVOICE_INCLUDE,
      });
    });

    invalidateOrderRelatedCaches();

    res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      data: normalizeInvoice(invoice),
    });
  } catch (error) {
    if (error?.code === "P2002") {
      return next(new AppError("Invoice already exists for this order", 409));
    }
    next(error);
  }
};

export const deleteInvoice = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;
    if (!invoiceId) return next(new AppError("Invoice ID is required", 400));

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, visitId: true, status: true },
    });

    if (!invoice) return next(new AppError("Invoice not found", 404));
    if (invoice.status === "PAID") {
      return next(new AppError("Cannot delete a PAID invoice", 400));
    }

    await prisma.$transaction(async (tx) => {
      await tx.invoice.delete({ where: { id: invoiceId } });

      await tx.visit.updateMany({
        where: { id: invoice.visitId, status: "INVOICED" },
        data: { status: "ACTIVE" },
      });
    });

    invalidateOrderRelatedCaches();

    res
      .status(200)
      .json({ success: true, message: "Invoice deleted successfully" });
  } catch (error) {
    next(error);
  }
};
