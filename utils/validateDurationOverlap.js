import { AppError } from "./appError.js";
import {
  normalizeDuration,
  resolvePricingMode,
  resolveTarget,
} from "./pricingRuleUtils.js";

export const validateDurationOverlap = (newRule, existingRules = []) => {
  const newTarget = resolveTarget(newRule);
  const newPricingMode = resolvePricingMode(newRule);
  const newDuration = normalizeDuration(newRule);

  if (!newTarget || !newPricingMode || !newDuration.isValid) {
    return;
  }

  const overlappingRule = existingRules.find((existingRule) => {
    const existingTarget = resolveTarget(existingRule);
    const existingPricingMode = resolvePricingMode(existingRule);
    const existingDuration = normalizeDuration(existingRule);

    if (!existingTarget || !existingDuration.isValid) {
      return false;
    }

    const isSameTarget =
      existingTarget.field === newTarget.field &&
      existingTarget.value === newTarget.value;
    const isSamePricingMode = existingPricingMode === newPricingMode;

    if (!isSameTarget || !isSamePricingMode) {
      return false;
    }

    // Overlap exists when ranges intersect with strict bounds.
    return (
      newDuration.min < existingDuration.max &&
      newDuration.max > existingDuration.min
    );
  });

  if (overlappingRule) {
    throw new AppError(
      "Duration range overlaps with an existing pricing rule for the same target and pricing mode",
      400,
    );
  }
};
