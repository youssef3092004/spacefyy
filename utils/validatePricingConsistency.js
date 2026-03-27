import { AppError } from "./appError.js";
import { getDurationValue, normalizePricingMode } from "./pricingRuleUtils.js";

export const validatePricingConsistency = (rule = {}) => {
  const pricingMode = normalizePricingMode(rule.pricingMode);
  const minDuration = getDurationValue(rule, [
    "minDuration",
    "minDurationMinutes",
    "min",
  ]);
  const maxDuration = getDurationValue(rule, [
    "maxDuration",
    "maxDurationMinutes",
    "max",
  ]);

  if (!pricingMode) {
    throw new AppError("pricingMode is required", 400);
  }

  if (pricingMode === "TIME_RANGE") {
    if (minDuration === undefined || minDuration === null) {
      throw new AppError("minDuration is required for TIME_RANGE", 400);
    }
    if (maxDuration === undefined || maxDuration === null) {
      throw new AppError("maxDuration is required for TIME_RANGE", 400);
    }

    const min = Number(minDuration);
    const max = Number(maxDuration);

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      throw new AppError("Duration values must be valid numbers", 400);
    }

    if (min >= max) {
      throw new AppError("minDuration must be less than maxDuration", 400);
    }

    return;
  }

  if (pricingMode === "PER_HOUR" || pricingMode === "FIXED_PRICE") {
    const hasDuration =
      minDuration !== undefined ||
      minDuration === null ||
      maxDuration !== undefined ||
      maxDuration === null;

    if (hasDuration && (minDuration !== null || maxDuration !== null)) {
      throw new AppError(
        `Duration must be null for ${pricingMode} pricing mode`,
        400,
      );
    }

    return;
  }

  throw new AppError("Invalid pricingMode", 400);
};
