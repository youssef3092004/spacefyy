import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";
import { ensureCanStartVisit } from "../utils/visitStatusLock.js";
import {
  applyDiscount,
  resolveCustomerDiscount,
  validateDiscountInput,
} from "../utils/discountUtils.js";
import { formatOrder, ORDER_INCLUDE } from "./order.js";
import {
  calculateComponentPrice,
  calculateDurationMinutes,
  roundMoney,
  roundToNearestTen,
  serializeComponent,
} from "../utils/sessionUtils.js";
import { releaseResourceAvailability } from "../utils/resourceAvailability.js";
import { invalidateResourceCachesSafe } from "../utils/cacheInvalidation.js";

const visitSelect = {
  id: true,
  branchId: true,
  customerId: true,
  customer: { select: { id: true, name: true } },
  pricingRuleId: true,
  pricingMode: true,
  totalPrice: true,
  startedAt: true,
  endedAt: true,
  status: true,
  notes: true,
  durationMinutes: true,
  cancelledAt: true,
  cancelledById: true,
  createdAt: true,
  updatedAt: true,
};

// A visit has at most one invoice (1-1 via Invoice.visitId). Mirror the order
// controller's invoice summary so clients get a consistent billing snapshot,
// with paymentMethod added.
const visitInvoiceSelect = { id: true, status: true, paymentMethod: true };

const formatVisitInvoiceSummary = (invoice) => ({
  isInvoiced: !!invoice,
  invoiceId: invoice?.id ?? null,
  status: invoice?.status ?? null,
  paymentMethod: invoice?.paymentMethod ?? null,
});

const validateManualDiscount = (discountType, discountAmount) => {
  if (!discountType && !discountAmount) return { type: "FLAT", amount: 0 };

  const error = validateDiscountInput(discountType, discountAmount);
  if (error) throw new AppError(error, 400);

  return { type: discountType || "FLAT", amount: Number(discountAmount ?? 0) };
};

export const getAllByBranchId = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    if (!branchId) return next(new AppError("Branch ID is required", 400));

    const { page, limit, skip, sort, order } = pagination(req);

    const normalizedStatus = req.query.status
      ? String(req.query.status).toUpperCase()
      : undefined;

    if (
      normalizedStatus &&
      !["ACTIVE", "INVOICED", "CANCELLED"].includes(normalizedStatus)
    ) {
      return next(new AppError("Invalid visit status", 400));
    }

    const { startDate, endDate } = req.query;

    const startedAtFilter = {};
    if (startDate) {
      const from = new Date(startDate);
      if (isNaN(from))
        return next(new AppError("Invalid startDate format", 400));
      startedAtFilter.gte = from;
    }
    if (endDate) {
      const to = new Date(endDate);
      if (isNaN(to)) return next(new AppError("Invalid endDate format", 400));
      // include the full end day
      to.setHours(23, 59, 59, 999);
      startedAtFilter.lte = to;
    }

    const where = {
      branchId,
      ...(normalizedStatus ? { status: normalizedStatus } : {}),
      ...(Object.keys(startedAtFilter).length
        ? { startedAt: startedAtFilter }
        : {}),
    };

    const [branch, visits, total] = await Promise.all([
      prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true },
      }),
      prisma.visit.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort]: order },
        select: {
          ...visitSelect,
          invoice: { select: visitInvoiceSelect },
          sessions: {
            where: { deletedAt: null },
            select: { status: true },
          },
          _count: {
            select: { orders: true },
          },
        },
      }),
      prisma.visit.count({ where }),
    ]);

    if (!branch) return next(new AppError("Branch not found", 404));

    const data = visits.map(({ sessions, _count, invoice, ...visit }) => ({
      ...visit,
      invoice: formatVisitInvoiceSummary(invoice),
      sessionCount: sessions.length,
      sessionStatuses: [...new Set(sessions.map((s) => s.status))],
      totalOrders: _count.orders,
    }));

    res.status(200).json({
      success: true,
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

export const startVisit = async (req, res, next) => {
  try {
    const { branchId, customerId, startedAt, notes } = req.body;

    if (!branchId || !customerId) {
      return next(new AppError("branchId and customerId are required", 400));
    }

    const [branch, customer, latestVisit] = await Promise.all([
      prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true, businessId: true },
      }),
      prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          businessId: true,
          isBlocked: true,
          blockedReason: true,
        },
      }),
      prisma.visit.findFirst({
        where: { branchId, customerId },
        orderBy: { startedAt: "desc" },
        select: { status: true },
      }),
    ]);

    if (!branch) return next(new AppError("Branch not found", 404));
    if (!customer) return next(new AppError("Customer not found", 404));

    // Customer and branch must belong to the same business. Nothing in the
    // schema enforces this (CustomerBranch carries two independent FKs), so a
    // cross-tenant pairing would otherwise be silently persisted.
    if (customer.businessId !== branch.businessId) {
      return next(
        new AppError("Customer does not belong to this branch's business", 400),
      );
    }

    if (customer.isBlocked) {
      return next(
        new AppError(
          `Customer is blocked${customer.blockedReason ? `: ${customer.blockedReason}` : ""}`,
          403,
        ),
      );
    }

    ensureCanStartVisit(latestVisit?.status);

    // The visit and its branch link are written together: a failure between
    // them used to leave a committed visit with no CustomerBranch row.
    const visit = await prisma.$transaction(async (tx) => {
      const created = await tx.visit.create({
        data: {
          branchId,
          customerId,
          status: "ACTIVE",
          startedAt: startedAt ? new Date(startedAt) : new Date(),
          totalPrice: 0,
          ...(notes ? { notes: String(notes) } : {}),
        },
        select: {
          id: true,
          branchId: true,
          customerId: true,
          customer: { select: { id: true, name: true } },
          status: true,
          startedAt: true,
          endedAt: true,
          durationMinutes: true,
          totalPrice: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Upsert, not find-then-create: two concurrent first visits both saw no
      // row and both inserted, and the unique constraint failed one of them
      // after the visit had already been created.
      await tx.customerBranch.upsert({
        where: { customerId_branchId: { customerId, branchId } },
        create: { customerId, branchId, firstVisitAt: created.startedAt },
        update: {},
      });

      // Stamp firstVisitAt only if this is genuinely their first visit here
      // (a customer registered at the desk has a row with firstVisitAt null).
      await tx.customerBranch.updateMany({
        where: { customerId, branchId, firstVisitAt: null },
        data: { firstVisitAt: created.startedAt },
      });

      return created;
    });

    res.status(201).json({
      success: true,
      message: "Visit started successfully",
      data: visit,
    });
  } catch (error) {
    next(error);
  }
};

export const getVisitById = async (req, res, next) => {
  try {
    const { visitId } = req.params;
    if (!visitId) return next(new AppError("Visit ID is required", 400));

    const [visit, rawOrders] = await Promise.all([
      prisma.visit.findUnique({
        where: { id: visitId },
        select: {
          ...visitSelect,
          invoice: { select: visitInvoiceSelect },
          sessions: {
            where: { deletedAt: null },
            select: {
              id: true,
              status: true,
              startedAt: true,
              endedAt: true,
              durationMinutes: true,
              totalPrice: true,
              currency: true,
              createdAt: true,
              components: {
                orderBy: { startedAt: "asc" },
                select: {
                  id: true,
                  resourceType: true,
                  resourceId: true,
                  priceType: true,
                  unitPrice: true,
                  quantity: true,
                  players: true,
                  modeLabel: true,
                  gameModeId: true,
                  startedAt: true,
                  endedAt: true,
                  durationMinutes: true,
                  totalPrice: true,
                },
              },
            },
          },
        },
      }),
      prisma.order.findMany({
        where: { visitId },
        include: ORDER_INCLUDE,
      }),
    ]);

    if (!visit) return next(new AppError("Visit not found", 404));

    const { sessions, invoice, ...visitData } = visit;

    // SessionComponent is polymorphic (resourceType + resourceId, no relation),
    // so batch-fetch the actual SPACE/DEVICE/UNIT/EQUIPMENT records and attach
    // each one's details to its component, so the customer breakdown reads by
    // name ("PS5 Station 3", "DualSense Controller") rather than a raw id.
    const allComponents = sessions.flatMap((s) => s.components ?? []);
    const idsByType = { SPACE: [], DEVICE: [], UNIT: [], EQUIPMENT: [] };
    for (const c of allComponents) {
      if (idsByType[c.resourceType]) idsByType[c.resourceType].push(c.resourceId);
    }

    const [spaces, devices, units, equipment] = await Promise.all([
      idsByType.SPACE.length
        ? prisma.space.findMany({
            where: { id: { in: idsByType.SPACE } },
            select: { id: true, name: true, type: true },
          })
        : [],
      idsByType.DEVICE.length
        ? prisma.device.findMany({
            where: { id: { in: idsByType.DEVICE } },
            select: { id: true, name: true, type: true, customTypeLabel: true },
          })
        : [],
      idsByType.UNIT.length
        ? prisma.unit.findMany({
            where: { id: { in: idsByType.UNIT } },
            select: { id: true, name: true, type: true, customTypeLabel: true },
          })
        : [],
      idsByType.EQUIPMENT.length
        ? prisma.equipment.findMany({
            where: { id: { in: idsByType.EQUIPMENT } },
            select: { id: true, name: true, type: true, customTypeLabel: true },
          })
        : [],
    ]);

    const resourceMap = new Map();
    for (const r of spaces) resourceMap.set(`SPACE:${r.id}`, r);
    for (const r of devices) resourceMap.set(`DEVICE:${r.id}`, r);
    for (const r of units) resourceMap.set(`UNIT:${r.id}`, r);
    for (const r of equipment) resourceMap.set(`EQUIPMENT:${r.id}`, r);

    // Attach the display-friendly modeLabel + the resolved resource to each
    // component, so the breakdown reads e.g. "PS5 Station 3 — DBL 15:00→17:00".
    const sessionsWithLabels = sessions.map((s) => ({
      ...s,
      components: (s.components ?? []).map((c) => ({
        ...serializeComponent(c),
        resource: resourceMap.get(`${c.resourceType}:${c.resourceId}`) ?? null,
      })),
    }));

    res.status(200).json({
      success: true,
      data: {
        ...visitData,
        invoice: formatVisitInvoiceSummary(invoice),
        sessions: sessionsWithLabels,
        orders: rawOrders.map(formatOrder),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Core close-visit logic, shared by PATCH /visits/close/:visitId and
// POST /invoices/create/:visitId (invoicing an ACTIVE visit closes it first).
// Ends active sessions, releases their resources, completes the visit's order,
// sums totals, applies discounts, upserts the Invoice, and marks the visit INVOICED.
export const closeVisitCore = async (
  visitId,
  { discountType, discountAmount } = {},
) => {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    select: {
      id: true,
      status: true,
      startedAt: true,
      branchId: true,
      customerId: true,
    },
  });

  if (!visit) throw new AppError("Visit not found", 404);
  if (visit.status !== "ACTIVE") {
    throw new AppError("Only ACTIVE visits can be closed", 400);
  }

  const manualDiscount = validateManualDiscount(discountType, discountAmount);
  const customerDiscount = await resolveCustomerDiscount(visit.customerId);

  const endedAt = new Date();

  // Auto-end any sessions that are still ACTIVE before calculating totals.
  // ALL components are loaded, not just the open ones: components ended earlier
  // (via endComponent or a change-players segment switch) already carry a price
  // that must still count toward the session total. Filtering to open
  // components here silently discarded that revenue.
  const activeSessions = await prisma.session.findMany({
    where: { visitId, status: "ACTIVE", deletedAt: null },
    select: {
      id: true,
      startedAt: true,
      components: {
        select: {
          id: true,
          resourceType: true,
          resourceId: true,
          branchId: true,
          priceType: true,
          unitPrice: true,
          quantity: true,
          gamesCount: true,
          startedAt: true,
          endedAt: true,
          totalPrice: true,
        },
      },
    },
  });

  if (activeSessions.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const session of activeSessions) {
        let sessionTotal = 0;

        for (const comp of session.components) {
          // Already ended: keep the price it was billed at and do NOT release
          // its resource again — the release happened when it was ended.
          if (comp.endedAt) {
            sessionTotal = roundMoney(
              sessionTotal + Number(comp.totalPrice ?? 0),
            );
            continue;
          }

          const compDuration = calculateDurationMinutes(
            comp.startedAt,
            endedAt,
          );
          const compPrice = calculateComponentPrice({
            priceType: comp.priceType,
            unitPrice: comp.unitPrice,
            quantity: comp.quantity,
            gamesCount: comp.gamesCount,
            startedAt: comp.startedAt,
            endedAt,
          });

          await tx.sessionComponent.update({
            where: { id: comp.id },
            data: {
              endedAt,
              durationMinutes: compDuration,
              totalPrice: compPrice,
            },
          });

          await releaseResourceAvailability(tx, {
            resourceType: comp.resourceType,
            resourceId: comp.resourceId,
            branchId: comp.branchId,
          });

          sessionTotal = roundMoney(sessionTotal + compPrice);
        }

        const sessionDuration = calculateDurationMinutes(
          session.startedAt,
          endedAt,
        );
        await tx.session.update({
          where: { id: session.id },
          data: {
            status: "ENDED",
            endedAt,
            durationMinutes: sessionDuration,
            totalPrice: sessionTotal,
          },
        });
      }
    });
  }

  const [sessionTotals, orderTotals] = await Promise.all([
    prisma.session.aggregate({
      where: { visitId, deletedAt: null, status: { not: "CANCELLED" } },
      _sum: { totalPrice: true, durationMinutes: true },
    }),
    // Use raw order.totalPrice — discount is applied at invoice level for visit orders
    prisma.order.aggregate({
      where: { visitId },
      _sum: { totalPrice: true },
    }),
  ]);

  const sessionTotal = Number(sessionTotals._sum.totalPrice ?? 0);
  const orderTotal = Number(orderTotals._sum.totalPrice ?? 0);
  const rawTotal =
    Math.round((sessionTotal + orderTotal + Number.EPSILON) * 100) / 100;

  const afterCustomerDiscount = applyDiscount(
    rawTotal,
    customerDiscount.type,
    customerDiscount.amount,
  );
  const finalAmount = roundToNearestTen(
    applyDiscount(afterCustomerDiscount, manualDiscount.type, manualDiscount.amount),
  );

  // Elapsed wall-clock time, not the sum of session durations. Sessions run in
  // parallel, so three concurrent 60-minute sessions summed to 180 minutes for
  // a visit that lasted one hour — and any per-minute reporting on this field
  // was 3x off.
  const durationMinutes = Math.max(
    0,
    Math.round((endedAt.getTime() - visit.startedAt.getTime()) / 60000),
  );

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.visit.updateMany({
      where: { id: visitId, status: "ACTIVE" },
      data: {
        endedAt,
        status: "INVOICED",
        durationMinutes,
        totalPrice: rawTotal,
      },
    });

    if (updated.count === 0)
      throw new AppError("Visit is no longer ACTIVE", 409);

    await tx.order.updateMany({
      where: { visitId, status: { in: ["OPEN", "COMPLETED"] } },
      data: { status: "INVOICED" },
    });

    await tx.invoice.upsert({
      where: { visitId },
      create: {
        visitId,
        branchId: visit.branchId,
        totalAmount: rawTotal,
        discountType: manualDiscount.type,
        discountAmount: manualDiscount.amount,
        customerDiscountType: customerDiscount.type,
        customerDiscountAmount: customerDiscount.amount,
        finalAmount,
        status: "UNPAID",
      },
      update: {
        totalAmount: rawTotal,
        discountType: manualDiscount.type,
        discountAmount: manualDiscount.amount,
        customerDiscountType: customerDiscount.type,
        customerDiscountAmount: customerDiscount.amount,
        finalAmount,
        status: "UNPAID",
        paidAt: null,
      },
    });

    return tx.visit.findUnique({ where: { id: visitId }, select: visitSelect });
  });

  // Closing frees every resource the visit was holding. Done here rather than
  // in the route handler so the invoice endpoint, which reuses this function,
  // is covered too — the route-derived auto-invalidation cannot see these
  // resources because /visits/close/:visitId carries no branchId.
  invalidateResourceCachesSafe(
    visit.branchId,
    activeSessions.flatMap((s) => s.components ?? []),
  );

  return result;
};

export const closeVisit = async (req, res, next) => {
  try {
    const { visitId } = req.params;
    if (!visitId) return next(new AppError("Visit ID is required", 400));

    const { discountType, discountAmount } = req.body ?? {};

    const result = await closeVisitCore(visitId, {
      discountType,
      discountAmount,
    });

    res.status(200).json({
      success: true,
      message: "Visit closed and invoice created",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const CANCEL_WINDOW_MINUTES = 15;

export const cancelVisit = async (req, res, next) => {
  try {
    const { visitId } = req.params;
    if (!visitId) return next(new AppError("Visit ID is required", 400));

    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
      select: {
        id: true,
        status: true,
        startedAt: true,
        branchId: true,
        _count: { select: { orders: true } },
      },
    });

    if (!visit) return next(new AppError("Visit not found", 404));
    if (visit.status !== "ACTIVE") {
      return next(new AppError("Only ACTIVE visits can be cancelled", 400));
    }

    const minutesElapsed =
      (Date.now() - new Date(visit.startedAt).getTime()) / 60000;
    if (minutesElapsed > CANCEL_WINDOW_MINUTES) {
      return next(
        new AppError(
          `Visit cannot be cancelled after ${CANCEL_WINDOW_MINUTES} minutes`,
          400,
        ),
      );
    }

    if (visit._count.orders > 0) {
      return next(new AppError("Cannot cancel a visit that has orders", 400));
    }

    const authUserId = req.user?.userId || req.user?.id;
    if (!authUserId)
      return next(new AppError("Cannot resolve user from token", 401));

    const cancelledAt = new Date();

    // Auto-cancel any active sessions and release their resources
    const activeSessions = await prisma.session.findMany({
      where: { visitId, status: "ACTIVE", deletedAt: null },
      select: {
        id: true,
        // Only components still open: an ended one already released its
        // resource, and re-releasing it overbooks the space.
        components: {
          where: { endedAt: null },
          select: {
            id: true,
            resourceType: true,
            resourceId: true,
            branchId: true,
          },
        },
      },
    });

    if (activeSessions.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const session of activeSessions) {
          for (const comp of session.components) {
            await tx.sessionComponent.update({
              where: { id: comp.id },
              data: { endedAt: cancelledAt, durationMinutes: 0, totalPrice: 0 },
            });
            await releaseResourceAvailability(tx, {
              resourceType: comp.resourceType,
              resourceId: comp.resourceId,
              branchId: comp.branchId,
            });
          }
          await tx.session.updateMany({
            where: { id: session.id, status: "ACTIVE" },
            data: {
              status: "CANCELLED",
              endedAt: cancelledAt,
              durationMinutes: 0,
              totalPrice: 0,
              canceledById: authUserId,
            },
          });
        }
      });
    }

    const result = await prisma.visit.update({
      where: { id: visitId },
      data: {
        status: "CANCELLED",
        endedAt: cancelledAt,
        cancelledAt,
        cancelledById: authUserId,
        totalPrice: 0,
      },
      select: visitSelect,
    });

    invalidateResourceCachesSafe(
      visit.branchId,
      activeSessions.flatMap((s) => s.components ?? []),
    );

    res.status(200).json({
      success: true,
      message: "Visit cancelled successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
