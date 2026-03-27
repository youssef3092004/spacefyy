import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";
import { validatePrice } from "../utils/validation.js";
import { validateDurationOverlap } from "../utils/validateDurationOverlap.js";
import { validatePricingConsistency } from "../utils/validatePricingConsistency.js";
import {
  PricingType,
  PricingMode,
  TargetFields,
  TargetModels,
  ensureSingleTarget,
  validateRanges,
  validateTargetOwnership,
  resolveRuleBranchId,
  normalizePricingMode,
} from "../utils/pricingRuleUtils.js";

export const createPricingRule = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    if (!branchId) return next(new AppError("Branch ID is required", 400));
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });
    if (!branch) return next(new AppError("Branch not found", 404));
    const {
      name,
      pricingType,
      minDurationMinutes,
      maxDurationMinutes,
      minPlayers,
      maxPlayers,
      price,
      priority,
      isActive,
      pricingMode,
      spaceId,
      deviceId,
      toolId,
    } = req.body;
    const normalizedPricingMode = normalizePricingMode(pricingMode);

    const requiredFields = {
      name,
      pricingType,
      minPlayers,
      maxPlayers,
      price,
      pricingMode: normalizedPricingMode,
    };

    for (let i in requiredFields) {
      if (!requiredFields[i]) {
        return next(
          new AppError(
            `${i.charAt(0).toUpperCase() + i.slice(1)} is required`,
            400,
          ),
        );
      }
    }

    validateRanges({
      minDurationMinutes,
      maxDurationMinutes,
      minPlayers,
      maxPlayers,
    });
    validatePricingConsistency({
      pricingMode: normalizedPricingMode,
      minDurationMinutes,
      maxDurationMinutes,
    });

    if (!PricingMode.includes(normalizedPricingMode)) {
      return next(new AppError("Invalid pricingMode", 400));
    }

    const numericPrice = validatePrice(price);

    if (priority !== undefined && !Number.isInteger(Number(priority))) {
      return next(new AppError("priority must be an integer", 400));
    }

    await validateTargetOwnership(prisma, branchId, {
      spaceId,
      deviceId,
      toolId,
    });
    const targetField = ensureSingleTarget({ spaceId, deviceId, toolId });

    const existingRule = await prisma.pricingRule.findFirst({
      where: {
        OR: [{ spaceId }, { deviceId }, { toolId }],
        name,
        space: spaceId ? { branchId } : undefined,
        device: deviceId ? { branchId } : undefined,
        tool: toolId ? { branchId } : undefined,
      },
    });
    if (existingRule) {
      return next(
        new AppError(
          "A pricing rule with the same name already exists for this target",
          400,
        ),
      );
    }

    const overlapCandidates = await prisma.pricingRule.findMany({
      where: {
        [targetField]: { equals: { spaceId, deviceId, toolId }[targetField] },
        pricingMode: normalizedPricingMode,
      },
    });

    validateDurationOverlap(
      {
        pricingMode: normalizedPricingMode,
        minDurationMinutes,
        maxDurationMinutes,
        spaceId,
        deviceId,
        toolId,
      },
      overlapCandidates,
    );

    const newRule = await prisma.pricingRule.create({
      data: {
        name,
        pricingType,
        minDurationMinutes,
        maxDurationMinutes,
        minPlayers,
        maxPlayers,
        price: numericPrice,
        priority: priority !== undefined ? Number(priority) : 0,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        pricingMode: normalizedPricingMode,
        branchId,
        spaceId,
        deviceId,
        toolId,
      },
    });

    res.status(201).json({
      status: "success",
      messages: "Pricing rule created successfully",
      data: newRule,
    });
  } catch (error) {
    next(error);
  }
};

export const getPricingRuleById = async (req, res, next) => {
  try {
    const { branchId, pricingRuleId } = req.params;
    if (!branchId) return next(new AppError("Branch ID is required", 400));
    if (!pricingRuleId)
      return next(new AppError("Pricing rule ID is required", 400));

    const pricingRule = await prisma.pricingRule.findUnique({
      where: { id: pricingRuleId },
      include: {
        space: { select: { branchId: true } },
        device: { select: { branchId: true } },
        tool: { select: { branchId: true } },
      },
    });

    if (!pricingRule) return next(new AppError("Pricing rule not found", 404));

    const ruleBranchId = resolveRuleBranchId(pricingRule);
    if (!ruleBranchId || ruleBranchId !== branchId) {
      return next(
        new AppError(
          "Pricing rule does not belong to the specified branch",
          403,
        ),
      );
    }

    res
      .status(200)
      .json({ status: "success", data: pricingRule, source: "database" });
  } catch (error) {
    next(error);
  }
};

export const getPriceingRulesByTarget = async (req, res, next) => {
  try {
    const { branchId, target, targetId } = req.params;

    if (!branchId) return next(new AppError("Branch ID is required", 400));
    if (!target || !targetId)
      return next(new AppError("Target and target ID are required", 400));

    if (!TargetModels.includes(target)) {
      return next(new AppError("Invalid target type", 400));
    }

    const existingTarget = await prisma[target].findFirst({
      where: {
        id: targetId,
        branchId,
      },
    });
    if (!existingTarget) {
      return next(new AppError("Target not found or not accessible", 404));
    }
    const includeObj = {
      space: target === "space" ? { select: { branchId: true } } : false,
      device: target === "device" ? { select: { branchId: true } } : false,
      tool: target === "tool" ? { select: { branchId: true } } : false,
    };

    const pricingRules = await prisma.pricingRule.findMany({
      where: {
        [target + "Id"]: targetId,
      },
      include: includeObj,
    });
    if (!pricingRules || pricingRules.length === 0) {
      return next(new AppError("No pricing rules found for this target", 404));
    }

    // Verify each rule belongs to the correct branch
    for (const rule of pricingRules) {
      const ruleBranchId = resolveRuleBranchId(rule);
      if (!ruleBranchId || ruleBranchId !== branchId) {
        return next(
          new AppError(
            "Pricing rule does not belong to the specified branch",
            403,
          ),
        );
      }
    }
    res.status(200).json({
      status: "success",
      message: "Pricing rules retrieved successfully",
      data: pricingRules,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getAllPricingRules = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }

    const { page, limit, skip, order, sort } = pagination(req);
    const { spaceId, deviceId, toolId, isActive, pricingMode, pricingType } =
      req.query;
    const normalizedPricingMode = normalizePricingMode(pricingMode);

    const targets = [spaceId, deviceId, toolId].filter(Boolean);
    if (targets.length > 1) {
      return next(new AppError("Only one target filter allowed", 400));
    }

    const parseBoolean = (value, field) => {
      if (value === undefined) return undefined;
      if (value === "true") return true;
      if (value === "false") return false;
      throw new AppError(`${field} must be true or false`, 400);
    };

    const parsedIsActive = parseBoolean(isActive, "isActive");
    if (pricingType && !Object.values(PricingType).includes(pricingType)) {
      return next(new AppError("Invalid pricingType", 400));
    }

    if (normalizedPricingMode && !PricingMode.includes(normalizedPricingMode)) {
      return next(new AppError("Invalid pricingMode", 400));
    }

    const allowedSortFields = ["createdAt", "price", "name", "priority"];
    if (!allowedSortFields.includes(sort)) {
      return next(new AppError("Invalid sort field", 400));
    }

    const baseFilters = {
      ...(pricingType && { pricingType }),
      ...(normalizedPricingMode && { pricingMode: normalizedPricingMode }),
      ...(parsedIsActive !== undefined && { isActive: parsedIsActive }),
    };

    // 🚀 OPTIMIZED STRATEGY:
    // If target specified → no OR
    let where;

    if (spaceId) {
      where = {
        spaceId,
        ...baseFilters,
        space: { branchId },
      };
    } else if (deviceId) {
      where = {
        deviceId,
        ...baseFilters,
        device: { branchId },
      };
    } else if (toolId) {
      where = {
        toolId,
        ...baseFilters,
        tool: { branchId },
      };
    } else {
      // Only use OR if absolutely needed
      where = {
        OR: [
          { space: { branchId } },
          { device: { branchId } },
          { tool: { branchId } },
        ],
        ...baseFilters,
      };
    }

    const [pricingRules, total] = await prisma.$transaction([
      prisma.pricingRule.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort]: order },
      }),
      prisma.pricingRule.count({ where }),
    ]);

    res.status(200).json({
      status: "success",
      data: pricingRules,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const updatePricingRuleById = async (req, res, next) => {
  try {
    const { branchId, pricingRuleId } = req.params;
    if (!branchId) return next(new AppError("Branch ID is required", 400));
    if (!pricingRuleId)
      return next(new AppError("Pricing rule ID is required", 400));

    const allowedUpdates = [
      "name",
      "pricingType",
      "minDurationMinutes",
      "maxDurationMinutes",
      "minPlayers",
      "maxPlayers",
      "price",
      "priority",
      "isActive",
      "pricingMode",
      "spaceId",
      "deviceId",
      "toolId",
    ];
    const updates = { ...req.body };
    const validUpdates = Object.keys(updates).filter((update) =>
      allowedUpdates.includes(update),
    );
    if (!validUpdates || validUpdates.length === 0) {
      return next(new AppError("No valid fields to update", 400));
    }

    const sanitizedUpdates = {};
    validUpdates.forEach((field) => {
      sanitizedUpdates[field] = updates[field];
    });

    const existingRule = await prisma.pricingRule.findUnique({
      where: { id: pricingRuleId },
      include: {
        space: { select: { branchId: true } },
        device: { select: { branchId: true } },
        tool: { select: { branchId: true } },
      },
    });

    if (!existingRule) {
      return next(new AppError("Pricing rule not found", 404));
    }

    const existingBranchId = resolveRuleBranchId(existingRule);
    if (!existingBranchId || existingBranchId !== branchId) {
      return next(
        new AppError(
          "Pricing rule does not belong to the specified branch",
          403,
        ),
      );
    }

    if (updates.pricingType && !PricingType.includes(updates.pricingType)) {
      return next(new AppError("Invalid pricingType", 400));
    }

    if (updates.price !== undefined) {
      updates.price = validatePrice(updates.price);
    }

    if (updates.priority !== undefined) {
      const normalizedPriority = Number(updates.priority);
      if (!Number.isInteger(normalizedPriority)) {
        return next(new AppError("priority must be an integer", 400));
      }
      updates.priority = normalizedPriority;
    }

    if (updates.isActive !== undefined) {
      updates.isActive = Boolean(updates.isActive);
    }
    if (updates.pricingMode !== undefined) {
      updates.pricingMode = normalizePricingMode(updates.pricingMode);
    }
    if (
      updates.pricingMode !== undefined &&
      !PricingMode.includes(updates.pricingMode)
    ) {
      return next(new AppError("Invalid pricingMode", 400));
    }

    validateRanges({
      minDurationMinutes:
        updates.minDurationMinutes ?? existingRule.minDurationMinutes,
      maxDurationMinutes:
        updates.maxDurationMinutes ?? existingRule.maxDurationMinutes,
      minPlayers: updates.minPlayers ?? existingRule.minPlayers,
      maxPlayers: updates.maxPlayers ?? existingRule.maxPlayers,
    });

    const nextRuleState = {
      pricingMode: updates.pricingMode ?? existingRule.pricingMode,
      minDurationMinutes:
        updates.minDurationMinutes ?? existingRule.minDurationMinutes,
      maxDurationMinutes:
        updates.maxDurationMinutes ?? existingRule.maxDurationMinutes,
      spaceId:
        updates.spaceId !== undefined ? updates.spaceId : existingRule.spaceId,
      deviceId:
        updates.deviceId !== undefined
          ? updates.deviceId
          : existingRule.deviceId,
      toolId:
        updates.toolId !== undefined ? updates.toolId : existingRule.toolId,
    };

    validatePricingConsistency(nextRuleState);

    const targetField = ensureSingleTarget(nextRuleState);

    const targetUpdateRequested = TargetFields.some(
      (field) => field in updates,
    );
    if (targetUpdateRequested) {
      await validateTargetOwnership(prisma, branchId, {
        spaceId: nextRuleState.spaceId,
        deviceId: nextRuleState.deviceId,
        toolId: nextRuleState.toolId,
      });
    }

    const overlapCandidates = await prisma.pricingRule.findMany({
      where: {
        [targetField]: { equals: nextRuleState[targetField] },
        pricingMode: nextRuleState.pricingMode,
        id: { not: pricingRuleId },
      },
    });

    validateDurationOverlap(nextRuleState, overlapCandidates);

    const updatedRule = await prisma.pricingRule.update({
      where: { id: pricingRuleId },
      data: updates,
    });

    res.status(200).json({ status: "success", data: updatedRule });
  } catch (error) {
    next(error);
  }
};

export const updatePricingByTarget = async (req, res, next) => {
  try {
    const { branchId, target, targetId } = req.params;
    if (!branchId) return next(new AppError("Branch ID is required", 400));
    if (!target || !targetId) {
      return next(new AppError("Target and target ID are required", 400));
    }

    if (!TargetModels.includes(target)) {
      return next(new AppError("Invalid target type", 400));
    }

    const targetField = `${target}Id`;
    const targetFilter = { [targetField]: targetId };

    const targetExists = await prisma[target].findFirst({
      where: {
        id: targetId,
        branchId,
        ...(target === "tool" ? { deletedAt: null } : { isActive: true }),
      },
      select: { id: true },
    });
    if (!targetExists) {
      return next(new AppError("Target not found or not accessible", 404));
    }

    const allowedUpdates = [
      "name",
      "pricingType",
      "minDurationMinutes",
      "maxDurationMinutes",
      "minPlayers",
      "maxPlayers",
      "price",
      "priority",
      "isActive",
      "pricingMode",
    ];
    const updates = { ...req.body };
    const validUpdates = Object.keys(updates).filter((update) =>
      allowedUpdates.includes(update),
    );
    if (!validUpdates || validUpdates.length === 0) {
      return next(new AppError("No valid fields to update", 400));
    }

    const sanitizedUpdates = {};
    validUpdates.forEach((field) => {
      sanitizedUpdates[field] = updates[field];
    });

    if (
      sanitizedUpdates.pricingType &&
      !PricingType.includes(sanitizedUpdates.pricingType)
    ) {
      return next(new AppError("Invalid pricingType", 400));
    }

    if (sanitizedUpdates.pricingMode !== undefined) {
      sanitizedUpdates.pricingMode = normalizePricingMode(
        sanitizedUpdates.pricingMode,
      );
    }

    if (
      sanitizedUpdates.pricingMode &&
      !PricingMode.includes(sanitizedUpdates.pricingMode)
    ) {
      return next(new AppError("Invalid pricingMode", 400));
    }

    if (sanitizedUpdates.price !== undefined) {
      sanitizedUpdates.price = validatePrice(sanitizedUpdates.price);
    }

    if (sanitizedUpdates.priority !== undefined) {
      const normalizedPriority = Number(sanitizedUpdates.priority);
      if (!Number.isInteger(normalizedPriority)) {
        return next(new AppError("priority must be an integer", 400));
      }
      sanitizedUpdates.priority = normalizedPriority;
    }

    if (sanitizedUpdates.isActive !== undefined) {
      sanitizedUpdates.isActive = Boolean(sanitizedUpdates.isActive);
    }

    validateRanges({
      minDurationMinutes: sanitizedUpdates.minDurationMinutes,
      maxDurationMinutes: sanitizedUpdates.maxDurationMinutes,
      minPlayers: sanitizedUpdates.minPlayers,
      maxPlayers: sanitizedUpdates.maxPlayers,
    });

    const existingRules = await prisma.pricingRule.findMany({
      where: targetFilter,
      select: {
        id: true,
        pricingMode: true,
        minDurationMinutes: true,
        maxDurationMinutes: true,
      },
    });

    if (!existingRules || existingRules.length === 0) {
      return next(new AppError("No pricing rules found for this target", 404));
    }

    for (const existingRule of existingRules) {
      validatePricingConsistency({
        pricingMode: sanitizedUpdates.pricingMode ?? existingRule.pricingMode,
        minDurationMinutes:
          sanitizedUpdates.minDurationMinutes !== undefined
            ? sanitizedUpdates.minDurationMinutes
            : existingRule.minDurationMinutes,
        maxDurationMinutes:
          sanitizedUpdates.maxDurationMinutes !== undefined
            ? sanitizedUpdates.maxDurationMinutes
            : existingRule.maxDurationMinutes,
      });
    }

    const updateResult = await prisma.pricingRule.updateMany({
      where: targetFilter,
      data: sanitizedUpdates,
    });

    if (!updateResult || updateResult.count === 0) {
      return next(new AppError("No pricing rules found for this target", 404));
    }

    const updatedRules = await prisma.pricingRule.findMany({
      where: targetFilter,
    });

    res.status(200).json({
      status: "success",
      message: "Pricing rules updated successfully",
      data: updatedRules,
      meta: { updated: updateResult.count },
    });
  } catch (error) {
    next(error);
  }
};

export const deletePricingRuleById = async (req, res, next) => {
  try {
    const { branchId, pricingRuleId } = req.params;
    if (!branchId) return next(new AppError("Branch ID is required", 400));
    if (!pricingRuleId)
      return next(new AppError("Pricing rule ID is required", 400));

    const pricingRule = await prisma.pricingRule.findUnique({
      where: { id: pricingRuleId },
      include: {
        space: { select: { branchId: true } },
        device: { select: { branchId: true } },
        tool: { select: { branchId: true } },
      },
    });

    if (!pricingRule) {
      return next(new AppError("Pricing rule not found", 404));
    }

    const ruleBranchId = resolveRuleBranchId(pricingRule);
    if (!ruleBranchId || ruleBranchId !== branchId) {
      return next(
        new AppError(
          "Pricing rule does not belong to the specified branch",
          403,
        ),
      );
    }

    const linkedSessionsCount = await prisma.session.count({
      where: { pricingRuleId },
    });

    if (linkedSessionsCount > 0) {
      return next(
        new AppError(
          "Cannot delete pricing rule because it is used by existing sessions",
          409,
        ),
      );
    }

    await prisma.pricingRule.delete({ where: { id: pricingRuleId } });

    res.status(200).json({
      status: "success",
      message: "Pricing rule deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const deletePricingRuleByTarget = async (req, res, next) => {
  try {
    const { branchId, target, targetId } = req.params;
    if (!branchId) return next(new AppError("Branch ID is required", 400));
    if (!target || !targetId) {
      return next(new AppError("Target and target ID are required", 400));
    }

    if (!TargetModels.includes(target)) {
      return next(new AppError("Invalid target type", 400));
    }

    const targetField = `${target}Id`;
    const targetFilter = { [targetField]: targetId };

    const targetExists = await prisma[target].findFirst({
      where: {
        id: targetId,
        branchId,
        ...(target === "tool" ? { deletedAt: null } : { isActive: true }),
      },
      select: { id: true },
    });
    if (!targetExists) {
      return next(new AppError("Target not found or not accessible", 404));
    }

    const rulesToDelete = await prisma.pricingRule.findMany({
      where: targetFilter,
      select: { id: true },
    });

    if (!rulesToDelete || rulesToDelete.length === 0) {
      return next(new AppError("No pricing rules found for this target", 404));
    }

    const linkedSessionsCount = await prisma.session.count({
      where: {
        pricingRuleId: {
          in: rulesToDelete.map((rule) => rule.id),
        },
      },
    });

    if (linkedSessionsCount > 0) {
      return next(
        new AppError(
          "Cannot delete pricing rules because one or more are used by existing sessions",
          409,
        ),
      );
    }

    const deleteResult = await prisma.pricingRule.deleteMany({
      where: targetFilter,
    });

    if (!deleteResult || deleteResult.count === 0) {
      return next(new AppError("No pricing rules found for this target", 404));
    }

    res.status(200).json({
      status: "success",
      message: "Pricing rules deleted successfully",
      meta: { deleted: deleteResult.count },
    });
  } catch (error) {
    next(error);
  }
};
