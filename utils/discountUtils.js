import { prisma } from "../configs/db.js";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isValidTimeFormat = (t) => TIME_RE.test(t);

export const isDiscountActiveNow = (customer) => {
  if (!customer?.hasDiscount) return false;
  if (Number(customer.discountAmount) <= 0) return false;

  const now = new Date();

  if (customer.discountStartsAt && now < new Date(customer.discountStartsAt))
    return false;
  if (customer.discountEndsAt && now > new Date(customer.discountEndsAt))
    return false;

  if (customer.discountStartTime || customer.discountEndTime) {
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (customer.discountStartTime && hhmm < customer.discountStartTime)
      return false;
    if (customer.discountEndTime && hhmm > customer.discountEndTime)
      return false;
  }

  return true;
};

export const MAX_PERCENT_DISCOUNT = 100;

// A PERCENT amount above 100 would flip the sign of the remainder; it is far
// more likely a typo (200 meaning 20) than an intent to pay nothing, so it is
// rejected at the validation boundary and clamped here as a last resort.
export const applyDiscount = (price, type, amount) => {
  if (!amount || amount <= 0) return price;
  const raw =
    type === "PERCENT"
      ? price * (1 - Math.min(amount, MAX_PERCENT_DISCOUNT) / 100)
      : price - amount;
  return Math.max(0, Math.round((raw + Number.EPSILON) * 100) / 100);
};

// Shared by every endpoint that accepts a discount pair.
export const validateDiscountInput = (type, amount) => {
  if (type !== undefined && type !== null && !["FLAT", "PERCENT"].includes(type)) {
    return "discountType must be FLAT or PERCENT";
  }
  if (amount === undefined || amount === null) return null;

  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return "discountAmount must be a non-negative number";
  }
  if (type === "PERCENT" && parsed > MAX_PERCENT_DISCOUNT) {
    return "A PERCENT discountAmount cannot exceed 100";
  }
  return null;
};

export const resolveCustomerDiscount = async (customerId) => {
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

  // A blocked customer simply forfeits their discount. Throwing here made an
  // open visit impossible to close — the block is enforced at visit START
  // (ensureCanStartVisit), which is the point where it can still be acted on.
  if (customer.isBlocked) return { type: "FLAT", amount: 0 };

  if (isDiscountActiveNow(customer)) {
    return { type: customer.discountType, amount: Number(customer.discountAmount) };
  }

  return { type: "FLAT", amount: 0 };
};
