import { prisma } from "../configs/db.js";
import { toNum } from "./analyticsHelpers.js";

const PAYMENT_TOTAL_FIELD = {
  CASH: "cashTotal",
  BANK: "bankTotal",
  INSTAPAY: "instapayTotal",
  CARD: "cardTotal",
};

const INVOICE_SELECT = {
  visitId: true,
  orderId: true,
  totalAmount: true,
  finalAmount: true,
  paymentMethod: true,
  paidAt: true,
  order: { select: { totalPrice: true } },
};

export const emptyDayMetrics = () => ({
  totalRevenue: 0,
  sessionRevenue: 0,
  productRevenue: 0,
  paidInvoiceCount: 0,
  grossRevenueBeforeDiscount: 0,
  discountGiven: 0,
  cashTotal: 0,
  cardTotal: 0,
  instapayTotal: 0,
  bankTotal: 0,
  unknownPaymentTotal: 0,
});

const applyInvoiceToMetrics = (acc, inv) => {
  const net = Number(inv.finalAmount ?? 0);
  const gross = inv.visitId
    ? Number(inv.totalAmount ?? 0)
    : Number(inv.order?.totalPrice ?? inv.finalAmount ?? 0);

  if (inv.visitId) {
    acc.sessionRevenue += net;
  } else {
    acc.productRevenue += net;
  }
  acc.totalRevenue += net;
  acc.grossRevenueBeforeDiscount += gross;
  acc.discountGiven += Math.max(0, gross - net);
  acc.paidInvoiceCount += 1;

  const field = PAYMENT_TOTAL_FIELD[inv.paymentMethod] ?? "unknownPaymentTotal";
  acc[field] += net;
};

const roundMetrics = (m) => ({
  totalRevenue: toNum(m.totalRevenue),
  sessionRevenue: toNum(m.sessionRevenue),
  productRevenue: toNum(m.productRevenue),
  paidInvoiceCount: m.paidInvoiceCount,
  grossRevenueBeforeDiscount: toNum(m.grossRevenueBeforeDiscount),
  discountGiven: toNum(m.discountGiven),
  cashTotal: toNum(m.cashTotal),
  cardTotal: toNum(m.cardTotal),
  instapayTotal: toNum(m.instapayTotal),
  bankTotal: toNum(m.bankTotal),
  unknownPaymentTotal: toNum(m.unknownPaymentTotal),
});

// Computes the income/payment-breakdown/customer figures for a set of
// branches over [dayStart, dayEnd) — a single day. "Outstanding" (unpaid
// invoices) is deliberately NOT here: it's a point-in-time balance, not a
// per-day flow, so summing it across days would either double-count or
// misrepresent staleness — it stays a live query in the report controller
// instead. `activeCustomers` here is only valid for THIS single day —
// summing it across multiple days would double-count repeat visitors, so a
// multi-day/multi-branch caller (controllers/report.js) must always
// recompute activeCustomers with its own dedicated dedup query over the
// full requested range, never by summing per-day values.
// Used by the daily snapshot cron (persists a finished day per branch) and
// the live report path (today's in-progress day).
export const computeDailyBranchAggregate = async (branchIds, dayStart, dayEnd) => {
  const branchFilter = {
    OR: [{ branchId: { in: branchIds } }, { visit: { branchId: { in: branchIds } } }],
  };

  const [paidInvoices, newCustomers, activeCustomerRows] = await Promise.all([
    prisma.invoice.findMany({
      where: { ...branchFilter, status: "PAID", paidAt: { gte: dayStart, lt: dayEnd } },
      select: INVOICE_SELECT,
    }),
    prisma.customerBranch.count({
      where: { branchId: { in: branchIds }, registeredAt: { gte: dayStart, lt: dayEnd } },
    }),
    prisma.visit.findMany({
      where: { branchId: { in: branchIds }, startedAt: { gte: dayStart, lt: dayEnd } },
      select: { customerId: true },
      distinct: ["customerId"],
    }),
  ]);

  const acc = emptyDayMetrics();
  for (const inv of paidInvoices) applyInvoiceToMetrics(acc, inv);

  return { ...roundMetrics(acc), newCustomers, activeCustomers: activeCustomerRows.length };
};

// Same figures as computeDailyBranchAggregate, but for a single shift:
// prefers invoices explicitly linked via invoice.shiftId (the source of
// truth now that every payment is gated behind an open shift — see
// utils/requireOpenShift.js) over the time window. Invoices paid before
// shiftId existed (shiftId: null) still fall back to the [windowStart,
// windowEnd) time match, so shifts closed before this migration stay
// accurate. Only one shift can be OPEN per branch at a time, so these two
// matching strategies never double-count within a single shift's figures.
export const computeShiftBoundMetrics = async (branchId, shiftId, windowStart, windowEnd) => {
  const branchFilter = {
    OR: [{ branchId }, { visit: { branchId } }],
  };

  const paidInvoices = await prisma.invoice.findMany({
    where: {
      AND: [
        branchFilter,
        { status: "PAID" },
        {
          OR: [
            { shiftId },
            { shiftId: null, paidAt: { gte: windowStart, lt: windowEnd } },
          ],
        },
      ],
    },
    select: INVOICE_SELECT,
  });

  const acc = emptyDayMetrics();
  for (const inv of paidInvoices) applyInvoiceToMetrics(acc, inv);
  return roundMetrics(acc);
};

// Fetches every paid invoice in [start, end] in ONE query and buckets the
// income/payment figures per UTC calendar day in JS. Used as the live
// fallback when daily snapshots have gaps (or don't cover the range at
// all) — avoids issuing one query per day for a long range.
export const computeIncomeByDay = async (branchIds, start, end) => {
  const branchFilter = {
    OR: [{ branchId: { in: branchIds } }, { visit: { branchId: { in: branchIds } } }],
  };

  const paidInvoices = await prisma.invoice.findMany({
    where: { ...branchFilter, status: "PAID", paidAt: { gte: start, lte: end } },
    select: INVOICE_SELECT,
  });

  const byDay = new Map();
  for (const inv of paidInvoices) {
    const p = inv.paidAt;
    const key = new Date(Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate()))
      .toISOString()
      .slice(0, 10);
    const acc = byDay.get(key) ?? emptyDayMetrics();
    applyInvoiceToMetrics(acc, inv);
    byDay.set(key, acc);
  }

  const result = new Map();
  for (const [key, acc] of byDay) result.set(key, roundMetrics(acc));
  return result;
};
