import { AppError } from "./appError.js";

export const PricingType = ["PER_HOUR", "PER_SESSION", "PER_GAME"];
export const PricingMode = ["TIME_RANGE", "PER_HOUR", "FIXED_PRICE"];
export const TargetFields = ["spaceId", "deviceId", "unitId", "equipmentId"];
export const TargetModels = ["space", "device", "unit", "equipment"];

export const normalizePricingMode = (pricingMode) => {
  if (pricingMode === "PER_SESSION") {
    return "FIXED_PRICE";
  }
  return pricingMode;
};

export const ensureSingleTarget = (data = {}) => {
  const targets = TargetFields.filter((field) => Boolean(data[field]));
  if (targets.length !== 1) {
    throw new AppError(
      "Exactly one target (spaceId, deviceId, unitId, equipmentId) is required",
      400,
    );
  }

  return targets[0];
};

export const validateRanges = ({
  minDurationMinutes,
  maxDurationMinutes,
  minPlayers,
  maxPlayers,
}) => {
  if (minDurationMinutes !== undefined && minDurationMinutes < 0) {
    throw new AppError("minDurationMinutes must be >= 0", 400);
  }
  if (maxDurationMinutes !== undefined && maxDurationMinutes < 0) {
    throw new AppError("maxDurationMinutes must be >= 0", 400);
  }
  if (
    minDurationMinutes !== undefined &&
    maxDurationMinutes !== undefined &&
    minDurationMinutes > maxDurationMinutes
  ) {
    throw new AppError(
      "minDurationMinutes cannot exceed maxDurationMinutes",
      400,
    );
  }
  if (minPlayers !== undefined && minPlayers < 0) {
    throw new AppError("minPlayers must be >= 0", 400);
  }
  if (maxPlayers !== undefined && maxPlayers < 0) {
    throw new AppError("maxPlayers must be >= 0", 400);
  }
  if (
    minPlayers !== undefined &&
    maxPlayers !== undefined &&
    minPlayers > maxPlayers
  ) {
    throw new AppError("minPlayers cannot exceed maxPlayers", 400);
  }
};

export const validateTargetOwnership = async (prisma, branchId, data = {}) => {
  const targetField = ensureSingleTarget(data);

  if (targetField === "spaceId") {
    const space = await prisma.space.findFirst({
      where: {
        id: data.spaceId,
        branchId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!space) throw new AppError("Space not found for this branch", 404);
  }

  if (targetField === "deviceId") {
    const device = await prisma.device.findFirst({
      where: {
        id: data.deviceId,
        branchId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!device) throw new AppError("Device not found for this branch", 404);
  }

  if (targetField === "unitId") {
    const unit = await prisma.unit.findFirst({
      where: { id: data.unitId, branchId, isActive: true, isDeleted: false },
      select: { id: true },
    });
    if (!unit) throw new AppError("Unit not found for this branch", 404);
  }

  if (targetField === "equipmentId") {
    const equipment = await prisma.equipment.findFirst({
      where: { id: data.equipmentId, branchId, isActive: true, isDeleted: false },
      select: { id: true },
    });
    if (!equipment) throw new AppError("Equipment not found for this branch", 404);
  }

  return targetField;
};

export const resolveRuleBranchId = (pricingRule) => {
  return (
    pricingRule?.space?.branchId ||
    pricingRule?.device?.branchId ||
    pricingRule?.unit?.branchId ||
    pricingRule?.equipment?.branchId ||
    null
  );
};

export const resolveTarget = (rule = {}) => {
  const targetField = TargetFields.find((field) => Boolean(rule[field]));
  if (!targetField) {
    return null;
  }

  return {
    field: targetField,
    value: rule[targetField],
  };
};

export const resolvePricingMode = (rule = {}) => {
  return normalizePricingMode(rule.pricingMode ?? rule.pricingType ?? null);
};

export const getDurationValue = (rule, keys) => {
  for (const key of keys) {
    if (rule[key] !== undefined) {
      return rule[key];
    }
  }
  return undefined;
};

export const normalizeDuration = (rule = {}) => {
  const minRaw = getDurationValue(rule, [
    "minDuration",
    "minDurationMinutes",
    "min",
  ]);
  const maxRaw = getDurationValue(rule, [
    "maxDuration",
    "maxDurationMinutes",
    "max",
  ]);

  const min = Number(minRaw);
  const max = Number(maxRaw);

  return {
    min,
    max,
    minRaw,
    maxRaw,
    isValid: Number.isFinite(min) && Number.isFinite(max),
  };
};
