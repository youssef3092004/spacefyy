import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";

const PricingType = ["PER_HOUR", "PER_SESSION", "PER_GAME"];

const MODEL_CONFIG = {
  space: {
    prismaModel: "space",
    where: (branchId) => ({ branchId }),
    select: {
      id: true,
      name: true,
      type: true,
      isActive: true,
      priceType: true,
      price: true,
      updatedAt: true,
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  },
  device: {
    prismaModel: "device",
    where: (branchId) => ({ branchId }),
    select: {
      id: true,
      name: true,
      type: true,
      customTypeLabel: true,
      spaceId: true,
      isActive: true,
      priceType: true,
      price: true,
      updatedAt: true,
    },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  },
  unit: {
    prismaModel: "unit",
    where: (branchId) => ({ branchId, isDeleted: false }),
    select: {
      id: true,
      name: true,
      type: true,
      customTypeLabel: true,
      spaceId: true,
      isActive: true,
      priceType: true,
      price: true,
      updatedAt: true,
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  },
  equipment: {
    prismaModel: "equipment",
    where: (branchId) => ({ branchId, isDeleted: false }),
    select: {
      id: true,
      name: true,
      type: true,
      customTypeLabel: true,
      spaceId: true,
      unitId: true,
      isActive: true,
      priceType: true,
      price: true,
      quantity: true,
      updatedAt: true,
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  },
};

const ensureBranchExists = async (branchId) => {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, name: true },
  });

  if (!branch) {
    throw new AppError("Branch not found", 404);
  }

  return branch;
};

const normalizeModelKey = (model) => String(model || "").toLowerCase();

const validateModelKey = (model) => {
  const normalized = normalizeModelKey(model);
  if (!MODEL_CONFIG[normalized]) {
    throw new AppError("Invalid model. Use space, device, unit, or equipment", 400);
  }
  return normalized;
};

const normalizePriceType = (priceType) => {
  const normalized = String(priceType || "").toUpperCase();
  if (!PricingType.includes(normalized)) {
    throw new AppError("Invalid priceType", 400);
  }
  return normalized;
};

const normalizePrice = (price) => {
  const numeric = Number(price);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new AppError("price must be a valid number >= 0", 400);
  }
  return numeric;
};

const fetchModelPricing = async (model, branchId) => {
  const config = MODEL_CONFIG[model];
  return prisma[config.prismaModel].findMany({
    where: config.where(branchId),
    select: config.select,
    orderBy: config.orderBy,
  });
};

export const getAllPricingByBranch = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }

    const branch = await ensureBranchExists(branchId);

    const entries = await Promise.all(
      Object.keys(MODEL_CONFIG).map(async (model) => [
        model,
        await fetchModelPricing(model, branchId),
      ]),
    );

    const data = Object.fromEntries(entries);

    res.status(200).json({
      status: "success",
      data: {
        branch,
        ...data,
      },
      meta: {
        space: data.space.length,
        device: data.device.length,
        unit: data.unit.length,
        equipment: data.equipment.length,
      },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getPricingByModel = async (req, res, next) => {
  try {
    const { branchId, model } = req.params;
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }

    const normalizedModel = validateModelKey(model);
    await ensureBranchExists(branchId);

    const records = await fetchModelPricing(normalizedModel, branchId);

    res.status(200).json({
      status: "success",
      data: records,
      meta: {
        model: normalizedModel,
        total: records.length,
      },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const bulkUpdatePricing = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }

    await ensureBranchExists(branchId);

    const payload = req.body || {};
    const requestedModels = Object.keys(payload);

    if (!requestedModels.length) {
      return next(new AppError("Request body is empty", 400));
    }

    const updatesPerModel = requestedModels.map((rawModelKey) => {
      const model = validateModelKey(rawModelKey);
      return {
        model,
        items: payload[rawModelKey],
      };
    });

    for (const group of updatesPerModel) {
      if (!Array.isArray(group.items)) {
        return next(new AppError(`${group.model} must be an array`, 400));
      }

      for (const item of group.items) {
        if (!item?.id) {
          return next(new AppError(`${group.model}.id is required`, 400));
        }

        if (item.price !== undefined) {
          normalizePrice(item.price);
        }

        if (item.priceType !== undefined) {
          normalizePriceType(item.priceType);
        }
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const summary = {
        space: 0,
        device: 0,
        unit: 0,
        equipment: 0,
      };

      for (const group of updatesPerModel) {
        const config = MODEL_CONFIG[group.model];

        for (const item of group.items) {
          const existing = await tx[config.prismaModel].findFirst({
            where: {
              id: item.id,
              ...config.where(branchId),
            },
            select: { id: true },
          });

          if (!existing) {
            throw new AppError(
              `${group.model} with id ${item.id} not found for this branch`,
              404,
            );
          }

          const updateData = {};

          if (item.price !== undefined) {
            updateData.price = normalizePrice(item.price);
          }

          if (item.priceType !== undefined) {
            updateData.priceType = normalizePriceType(item.priceType);
          }

          if (item.isActive !== undefined) {
            updateData.isActive = Boolean(item.isActive);
          }

          if (!Object.keys(updateData).length) {
            continue;
          }

          await tx[config.prismaModel].update({
            where: { id: item.id },
            data: updateData,
          });

          summary[group.model] += 1;
        }
      }

      return summary;
    });

    res.status(200).json({
      status: "success",
      message: "Pricing updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
