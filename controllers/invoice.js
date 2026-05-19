import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";

const toNumber = (value) => {
  if (value === null || value === undefined) return 0;
  return Number(value);
};

const normalizeInvoice = (invoice) => {
  if (!invoice) return invoice;

  return {
    ...invoice,
    totalAmount: toNumber(invoice.totalAmount),
  };
};

const ensureVisitExists = async (visitId) => {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    select: {
      id: true,
      branchId: true,
      status: true,
      totalPrice: true,
    },
  });

  if (!visit) {
    throw new AppError("Visit not found", 404);
  }

  return visit;
};

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
      finalPrice: true,
      createdAt: true,
    },
  },
};

const ensureInvoiceExists = async (invoiceId) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: INVOICE_INCLUDE,
  });

  if (!invoice) {
    throw new AppError("Invoice not found", 404);
  }

  return invoice;
};

const VALID_INVOICE_STATUSES = new Set(["UNPAID", "PAID"]);

const calculateInvoiceTotal = async (visitId, tx = prisma) => {
  const [visit, orderAgg] = await Promise.all([
    tx.visit.findUnique({
      where: { id: visitId },
      select: {
        totalPrice: true,
      },
    }),
    tx.order.aggregate({
      where: { visitId },
      _sum: {
        totalPrice: true,
      },
    }),
  ]);

  if (!visit) {
    throw new AppError("Visit not found", 404);
  }

  // Prefer visit.totalPrice because visit closing logic already computes the final bill.
  const visitTotal = toNumber(visit.totalPrice);
  const orderTotal = toNumber(orderAgg._sum.totalPrice);
  const resolvedTotal = visitTotal > 0 ? visitTotal : orderTotal;

  return Math.round((resolvedTotal + Number.EPSILON) * 100) / 100;
};

/**
 * POST /invoices/create
 * Body: { visitId }
 */
export const createInvoice = async (req, res, next) => {
  try {
    const { visitId } = req.params;

    if (!visitId) {
      return next(new AppError("visitId is required", 400));
    }

    const visit = await ensureVisitExists(visitId);

    if (visit.status === "ACTIVE") {
      return next(new AppError("Cannot invoice an ACTIVE visit", 400));
    }

    if (visit.status === "PAID") {
      return next(
        new AppError("Cannot create an invoice for a PAID visit", 400),
      );
    }

    if (visit.status === "CANCELLED") {
      return next(
        new AppError("Cannot create an invoice for a CANCELLED visit", 400),
      );
    }

    const existing = await prisma.invoice.findUnique({
      where: { visitId },
      select: { id: true },
    });

    if (existing) {
      return next(new AppError("Invoice already exists for this visit", 409));
    }

    const createdInvoice = await prisma.$transaction(async (tx) => {
      const totalAmount = await calculateInvoiceTotal(visitId, tx);

      const invoice = await tx.invoice.create({
        data: {
          visitId,
          branchId: visit.branchId,
          totalAmount,
          status: "UNPAID",
        },
        include: INVOICE_INCLUDE,
      });

      await tx.visit.update({
        where: { id: visitId },
        data: {
          status: "INVOICED",
        },
      });

      return invoice;
    });

    res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      data: normalizeInvoice(createdInvoice),
    });
  } catch (error) {
    if (error?.code === "P2002") {
      return next(new AppError("Invoice already exists for this visit", 409));
    }
    next(error);
  }
};

/**
 * PATCH /invoices/pay/:visitId
 */
export const payInvoice = async (req, res, next) => {
  try {
    const { visitId } = req.params;

    if (!visitId) {
      return next(new AppError("Visit ID is required", 400));
    }

    const invoice = await prisma.invoice.findUnique({
      where: { visitId },

      select: {
        id: true,
        visitId: true,
        status: true,
      },
    });

    if (!invoice) {
      return next(new AppError("Invoice not found", 404));
    }

    if (invoice.status === "PAID") {
      return next(new AppError("Invoice is already PAID", 400));
    }

    const paidInvoice = await prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { visitId },
        data: { status: "PAID", paidAt: new Date() },
        include: INVOICE_INCLUDE,
      });

      await tx.visit.update({
        where: { id: invoice.visitId },
        data: { status: "PAID" },
      });

      return updated;
    });

    res.status(200).json({
      success: true,
      message: "Invoice marked as PAID",
      data: normalizeInvoice(paidInvoice),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /invoices/getById/:invoiceId
 */
export const getInvoiceById = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;

    if (!invoiceId) {
      return next(new AppError("Invoice ID is required", 400));
    }

    const invoice = await ensureInvoiceExists(invoiceId);

    res.status(200).json({
      success: true,
      data: normalizeInvoice(invoice),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /invoices/visit/:visitId
 */
export const getInvoiceByVisitId = async (req, res, next) => {
  try {
    const { visitId } = req.params;

    if (!visitId) {
      return next(new AppError("visitId is required", 400));
    }

    const invoice = await prisma.invoice.findUnique({
      where: { visitId },
      include: INVOICE_INCLUDE,
    });

    if (!invoice) {
      return next(new AppError("Invoice not found for this visit", 404));
    }

    res.status(200).json({
      success: true,
      data: normalizeInvoice(invoice),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /invoices/getAll?branchId=:branchId&status=UNPAID|PAID&page=1&limit=10
 */
export const getAllInvoices = async (req, res, next) => {
  try {
    const { page, limit, skip, sort, order } = pagination(req);
    const { branchId } = req.params;
    const { status } = req.query;

    if (!branchId) {
      return next(new AppError("branchId is required", 400));
    }

    if (status && !VALID_INVOICE_STATUSES.has(status)) {
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
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      data: invoices.map(normalizeInvoice),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /invoices/createOrder/:orderId
 */
export const createOrderInvoice = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, branchId: true, status: true, visitId: true, finalPrice: true },
    });

    if (!order) return next(new AppError("Order not found", 404));
    if (order.visitId) {
      return next(new AppError("Use the visit invoice endpoint for visit orders", 400));
    }
    if (order.status !== "COMPLETED") {
      return next(new AppError("Cannot invoice an order that is not completed", 400));
    }

    const existing = await prisma.invoice.findUnique({
      where: { orderId },
      select: { id: true },
    });
    if (existing) return next(new AppError("Invoice already exists for this order", 409));

    const invoice = await prisma.invoice.create({
      data: {
        orderId,
        branchId: order.branchId,
        totalAmount: Number(order.finalPrice),
        status: "UNPAID",
      },
      include: INVOICE_INCLUDE,
    });

    res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      data: normalizeInvoice(invoice),
    });
  } catch (error) {
    if (error?.code === "P2002") return next(new AppError("Invoice already exists for this order", 409));
    next(error);
  }
};

/**
 * PATCH /invoices/payById/:invoiceId
 */
export const payInvoiceById = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, status: true, visitId: true },
    });

    if (!invoice) return next(new AppError("Invoice not found", 404));
    if (invoice.status === "PAID") return next(new AppError("Invoice is already PAID", 400));

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: "PAID", paidAt: new Date() },
        include: INVOICE_INCLUDE,
      });

      if (invoice.visitId) {
        await tx.visit.update({
          where: { id: invoice.visitId },
          data: { status: "PAID" },
        });
      }

      return result;
    });

    res.status(200).json({
      success: true,
      message: "Invoice marked as PAID",
      data: normalizeInvoice(updated),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /invoices/delete/:invoiceId
 */
export const deleteInvoice = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;

    if (!invoiceId) {
      return next(new AppError("Invoice ID is required", 400));
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        visitId: true,
        status: true,
      },
    });

    if (!invoice) {
      return next(new AppError("Invoice not found", 404));
    }

    if (invoice.status === "PAID") {
      return next(new AppError("Cannot delete a PAID invoice", 400));
    }

    await prisma.$transaction(async (tx) => {
      await tx.invoice.delete({
        where: { id: invoiceId },
      });

      await tx.visit.updateMany({
        where: {
          id: invoice.visitId,
          status: "INVOICED",
        },
        data: {
          status: "CLOSED",
        },
      });
    });

    res.status(200).json({
      success: true,
      message: "Invoice deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
