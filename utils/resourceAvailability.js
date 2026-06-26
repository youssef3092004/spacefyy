import { prisma } from "../configs/db.js";
import { AppError } from "./appError.js";
import { normalizeSessionPriceType, parseMoney } from "./sessionUtils.js";

// ─── Resource existence ───────────────────────────────────────────────────────

export const ensureResourceExists = async ({ resourceType, resourceId, branchId }) => {
  if (resourceType === "SPACE") {
    const space = await prisma.space.findFirst({
      where: { id: resourceId, branchId, isActive: true },
      select: { id: true },
    });
    if (!space) throw new AppError("Space not found for this branch", 404);
    return;
  }

  if (resourceType === "DEVICE") {
    const device = await prisma.device.findFirst({
      where: { id: resourceId, branchId, isActive: true },
      select: { id: true },
    });
    if (!device) throw new AppError("Device not found for this branch", 404);
    return;
  }

  if (resourceType === "UNIT") {
    const unit = await prisma.unit.findFirst({
      where: { id: resourceId, branchId, isActive: true, isDeleted: false },
      select: { id: true },
    });
    if (!unit) throw new AppError("Unit not found for this branch", 404);
    return;
  }

  if (resourceType === "EQUIPMENT") {
    const equipment = await prisma.equipment.findFirst({
      where: { id: resourceId, branchId, isActive: true, isDeleted: false },
      select: { id: true },
    });
    if (!equipment) throw new AppError("Equipment not found for this branch", 404);
    return;
  }

  throw new AppError(`Unknown resourceType: ${resourceType}`, 400);
};

// ─── Pricing resolution ───────────────────────────────────────────────────────

export const resolveResourcePricing = async ({ resourceType, resourceId, branchId }) => {
  if (resourceType === "SPACE") {
    const space = await prisma.space.findFirst({
      where: { id: resourceId, branchId, isActive: true },
      select: { priceType: true, price: true },
    });
    if (!space) throw new AppError("Space not found for this branch", 404);
    return {
      priceType: normalizeSessionPriceType(space.priceType, "PER_HOUR"),
      price: parseMoney(space.price || 0, "space.price"),
    };
  }

  if (resourceType === "DEVICE") {
    const device = await prisma.device.findFirst({
      where: { id: resourceId, branchId, isActive: true },
      select: { priceType: true, price: true },
    });
    if (!device) throw new AppError("Device not found for this branch", 404);
    return {
      priceType: normalizeSessionPriceType(device.priceType, "PER_HOUR"),
      price: parseMoney(device.price || 0, "device.price"),
    };
  }

  if (resourceType === "UNIT") {
    const unit = await prisma.unit.findFirst({
      where: { id: resourceId, branchId, isActive: true, isDeleted: false },
      select: { priceType: true, price: true },
    });
    if (!unit) throw new AppError("Unit not found for this branch", 404);
    return {
      priceType: normalizeSessionPriceType(unit.priceType, "PER_HOUR"),
      price: parseMoney(unit.price || 0, "unit.price"),
    };
  }

  const equipment = await prisma.equipment.findFirst({
    where: { id: resourceId, branchId, isActive: true, isDeleted: false },
    select: { priceType: true, price: true },
  });
  if (!equipment) throw new AppError("Equipment not found for this branch", 404);
  return {
    priceType: normalizeSessionPriceType(equipment.priceType, "PER_SESSION"),
    price: parseMoney(equipment.price || 0, "equipment.price"),
  };
};

export const resolvePricingRule = async ({ resourceType, resourceId, branchId }) => {
  const resourceFilter =
    resourceType === "SPACE"    ? { spaceId: resourceId }
    : resourceType === "DEVICE" ? { deviceId: resourceId }
    : resourceType === "UNIT"   ? { unitId: resourceId }
    : { equipmentId: resourceId };

  return prisma.pricingRule.findFirst({
    where: { branchId, isActive: true, ...resourceFilter },
    orderBy: { priority: "desc" },
    select: { id: true, pricingMode: true, price: true, currency: true, pricingType: true },
  });
};

export const mapPricingRuleToPriceType = (pricingRule) => {
  if (!pricingRule) return "PER_HOUR";
  if (pricingRule.pricingMode === "FIXED_PRICE") return "PER_SESSION";
  return normalizeSessionPriceType(pricingRule.pricingType, "PER_HOUR");
};

// ─── Reserve availability ─────────────────────────────────────────────────────

export const reserveResourceAvailability = async (tx, { resourceType, resourceId, branchId, quantity }) => {
  if (resourceType === "SPACE") {
    const updated = await tx.space.updateMany({
      where: { id: resourceId, branchId, isActive: true, availableNumber: { gt: 0 } },
      data: { availableNumber: { decrement: 1 } },
    });
    if (updated.count === 0) throw new AppError("Space is not available", 400);

    const space = await tx.space.findFirst({
      where: { id: resourceId, branchId },
      select: { availableNumber: true },
    });
    await tx.space.update({
      where: { id: resourceId },
      data: { isBusy: Number(space?.availableNumber || 0) <= 0 },
    });
    return;
  }

  if (resourceType === "DEVICE") {
    const updated = await tx.device.updateMany({
      where: { id: resourceId, branchId, isActive: true, isBusy: false },
      data: { isBusy: true },
    });
    if (updated.count === 0) throw new AppError("Device is not available", 400);
    return;
  }

  if (resourceType === "UNIT") {
    const updated = await tx.unit.updateMany({
      where: { id: resourceId, branchId, isActive: true, isDeleted: false, isBusy: false },
      data: { isBusy: true },
    });
    if (updated.count === 0) throw new AppError("Unit is not available", 400);
    return;
  }

  if (resourceType === "EQUIPMENT") {
    const equipment = await tx.equipment.findFirst({
      where: { id: resourceId, branchId, isActive: true, isDeleted: false },
      select: { quantity: true },
    });
    if (!equipment) throw new AppError("Equipment not found for this branch", 404);

    const inUseAgg = await tx.sessionComponent.aggregate({
      where: { resourceType: "EQUIPMENT", resourceId, endedAt: null },
      _sum: { quantity: true },
    });
    const inUse = inUseAgg._sum.quantity ?? 0;
    const reserving = quantity ?? 1;

    if (inUse + reserving > equipment.quantity) {
      throw new AppError(
        `Equipment is not available: only ${equipment.quantity - inUse} unit(s) remaining`,
        400,
      );
    }

    await tx.equipment.update({
      where: { id: resourceId },
      data: { isBusy: inUse + reserving >= equipment.quantity },
    });
  }
};

// ─── Release availability ─────────────────────────────────────────────────────

export const releaseResourceAvailability = async (tx, { resourceType, resourceId, branchId }) => {
  if (resourceType === "SPACE") {
    const space = await tx.space.findFirst({
      where: { id: resourceId, branchId },
      select: { availableNumber: true, capacity: true },
    });
    if (!space) return;

    const next = Math.min(space.capacity, space.availableNumber + 1);
    await tx.space.update({
      where: { id: resourceId },
      data: { availableNumber: next, isBusy: next <= 0 },
    });
    return;
  }

  if (resourceType === "DEVICE") {
    await tx.device.updateMany({ where: { id: resourceId, branchId }, data: { isBusy: false } });
    return;
  }

  if (resourceType === "UNIT") {
    await tx.unit.updateMany({
      where: { id: resourceId, branchId, isDeleted: false },
      data: { isBusy: false },
    });
    return;
  }

  if (resourceType === "EQUIPMENT") {
    const inUseAgg = await tx.sessionComponent.aggregate({
      where: { resourceType: "EQUIPMENT", resourceId, endedAt: null },
      _sum: { quantity: true },
    });
    const inUse = inUseAgg._sum.quantity ?? 0;

    const equipment = await tx.equipment.findFirst({
      where: { id: resourceId },
      select: { quantity: true },
    });

    await tx.equipment.updateMany({
      where: { id: resourceId, branchId, isDeleted: false },
      data: { isBusy: inUse >= (equipment?.quantity ?? 0) },
    });
  }
};
