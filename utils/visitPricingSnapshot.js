import { AppError } from "./appError.js";

const roundMoney = (value) => {
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

export const freezePricingAtSessionStart = (pricingRule) => {
  if (!pricingRule?.id) {
    throw new AppError("Valid pricing rule is required", 400);
  }

  const unitPrice = Number(pricingRule.price);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new AppError("Pricing rule has invalid price", 400);
  }

  const pricingMode = pricingRule.pricingMode;
  if (!pricingMode) {
    throw new AppError("Pricing rule has invalid pricingMode", 400);
  }

  const totalPrice =
    pricingMode === "PER_HOUR" || pricingMode === "TIME_RANGE"
      ? null
      : roundMoney(unitPrice);

  return {
    pricingRuleId: pricingRule.id,
    pricingMode,
    unitPrice: roundMoney(unitPrice),
    totalPrice,
  };
};

export const freezePricingAtSessionClose = ({
  startedAt,
  endedAt,
  pricingMode,
  unitPrice,
  existingTotalPrice,
}) => {
  if (!startedAt || !endedAt) {
    throw new AppError("startedAt and endedAt are required", 400);
  }

  const start = new Date(startedAt);
  const end = new Date(endedAt);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new AppError("Invalid session time values", 400);
  }

  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) {
    throw new AppError("endedAt cannot be before startedAt", 400);
  }

  const durationMinutes = Math.ceil(diffMs / (1000 * 60));
  const normalizedUnitPrice = Number(unitPrice);

  if (!Number.isFinite(normalizedUnitPrice) || normalizedUnitPrice < 0) {
    throw new AppError("Session has invalid unitPrice snapshot", 400);
  }

  if (!pricingMode) {
    throw new AppError("Session has invalid pricingMode snapshot", 400);
  }

  let totalPrice;

  if (pricingMode === "PER_HOUR" || pricingMode === "TIME_RANGE") {
    totalPrice = roundMoney((normalizedUnitPrice * durationMinutes) / 60);
  } else {
    const fixedTotal =
      existingTotalPrice !== undefined && existingTotalPrice !== null
        ? Number(existingTotalPrice)
        : normalizedUnitPrice;
    totalPrice = roundMoney(fixedTotal);
  }

  return {
    durationMinutes,
    totalPrice,
  };
};
