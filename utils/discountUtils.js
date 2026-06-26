import { prisma } from "../configs/db.js";
import { AppError } from "./appError.js";

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

export const applyDiscount = (price, type, amount) => {
  if (!amount || amount <= 0) return price;
  const raw = type === "PERCENT" ? price * (1 - amount / 100) : price - amount;
  return Math.max(0, Math.round((raw + Number.EPSILON) * 100) / 100);
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

  if (customer.isBlocked) {
    throw new AppError(
      `Customer is blocked${customer.blockedReason ? `: ${customer.blockedReason}` : ""}`,
      403,
    );
  }

  if (isDiscountActiveNow(customer)) {
    return { type: customer.discountType, amount: Number(customer.discountAmount) };
  }

  return { type: "FLAT", amount: 0 };
};
