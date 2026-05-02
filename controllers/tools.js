/* eslint-disable no-unused-vars */
import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { compressAndUpload } from "../utils/cloudinary.js";
import { messages } from "../locales/message.js";
import {
  incrementStorageUsage,
  decrementStorageUsage,
} from "../utils/storageUsage.js";
import { redisClient } from "../configs/redis.js";

const ToolType = [
  "CONTROLLER",
  "HEADSET",
  "STEERING_WHEEL",
  "PEDALS",
  "PING_PONG",
  "BILLIARDO",
  "BOARD_GAME",
  "OTHER",
];

const PricingType = ["PER_HOUR", "PER_SESSION", "PER_GAME"];

const parseBusyFilter = (value) => {
  if (value === undefined) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new AppError("isBusy must be true or false", 400);
};

const fixType = (type) => {
  if (!ToolType.includes(String(type).toUpperCase())) {
    throw new AppError("Invalid tool type", 400);
  }
  return (type = String(type).toUpperCase());
};

const resolveToolSpaceId = (spaceId, device) =>
  spaceId || device?.spaceId || null;

export const createTool = async (req, res, next) => {
  try {
    const {
      branchId,
      spaceId,
      deviceId,
      name,
      type,
      priceType,
      price,
      customTypeLabel,
      isActive,
      isBusy,
    } = req.body;

    const requiredFields = { branchId, name, type };

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

    if (!spaceId && !deviceId) {
      return next(new AppError("Either spaceId or deviceId is required", 400));
    }

    if (spaceId && deviceId) {
      return next(
        new AppError("Provide only one target: spaceId or deviceId", 400),
      );
    }

    const fixedType = fixType(type);

    if (fixedType === "OTHER" && !customTypeLabel) {
      return next(
        new AppError("Custom type label is required when type is OTHER", 400),
      );
    }

    const resolvedPrice = Number(price ?? 0);
    if (Number.isNaN(resolvedPrice) || resolvedPrice < 0) {
      return next(new AppError("price must be a valid number >= 0", 400));
    }

    const resolvedPriceType = String(priceType || "PER_SESSION").toUpperCase();
    if (!PricingType.includes(resolvedPriceType)) {
      return next(new AppError("Invalid price type", 400));
    }

    if (price !== undefined && (isNaN(Number(price)) || Number(price) < 0)) {
      return next(new AppError("price must be a valid number >= 0", 400));
    }

    const branch = await prisma.branch.findFirst({
      where: { id: branchId },
    });
    if (!branch) return next(new AppError("Branch not found", 404));

    const [space, device] = await Promise.all([
      spaceId
        ? prisma.space.findFirst({
            where: { id: spaceId, branchId },
          })
        : Promise.resolve(null),
      deviceId
        ? prisma.device.findFirst({
            where: { id: deviceId, branchId },
          })
        : Promise.resolve(null),
    ]);

    if (spaceId && !space) return next(new AppError("Space not found", 404));
    if (deviceId && !device) return next(new AppError("Device not found", 404));

    const effectiveSpaceId = resolveToolSpaceId(spaceId, device);

    if (!effectiveSpaceId) {
      return next(
        new AppError(
          "A tool must belong to a space or to a device assigned to a space",
          400,
        ),
      );
    }

    let imageUrl =
      "https://media.istockphoto.com/id/1472933890/vector/no-image-vector-symbol-missing-available-icon-no-gallery-for-this-moment-placeholder.jpg?s=2048x2048&w=is&k=20&c=Qw0wGz-a6BpwFjaoxtkjgsf75C-DeOYs7GFPU8O9z20=";

    if (req.file) {
      try {
        const uploadResult = await compressAndUpload(req.file.buffer, "tools");
        imageUrl = uploadResult.secure_url;
      } catch (error) {
        return next(new AppError("Failed to upload image", 500));
      }
    }

    const [storageUsage, newTool] = await prisma.$transaction(async (tx) => {
      const storageUsage = await incrementStorageUsage(
        branch.businessId,
        "tools",
        tx,
      );
      if (!storageUsage) {
        throw new AppError("Failed to update storage usage", 500);
      }
      const newTool = await tx.tool.create({
        data: {
          branch: {
            connect: { id: branchId },
          },
          space: {
            connect: { id: effectiveSpaceId },
          },
          ...(deviceId
            ? {
                device: {
                  connect: { id: deviceId },
                },
              }
            : {}),
          name,
          type: fixedType,
          customTypeLabel,
          priceType: resolvedPriceType,
          price: resolvedPrice,
          isBusy: isBusy !== undefined ? Boolean(isBusy) : false,
          isActive: isActive !== undefined ? Boolean(isActive) : true,
          image: imageUrl,
          createdBy: req.user.id,
          updatedBy: req.user.id,
        },
      });
      return [storageUsage, newTool];
    });

    // Invalidate cache for this branch
    const keysToDelete = await redisClient.keys(`tools:branchId=${branchId}*`);
    if (keysToDelete.length > 0) {
      await redisClient.del(keysToDelete);
    }

    res.status(201).json({
      success: true,
      message: "Tool created successfully",
      data: newTool,
      storageUsage,
    });
  } catch (error) {
    next(error);
  }
};

export const getToolById = async (req, res, next) => {
  try {
    const { branchId, toolId } = req.params;
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }
    if (!toolId) {
      return next(new AppError("Tool ID is required", 400));
    }

    const branch = await prisma.branch.findFirst({
      where: { id: branchId },
    });

    if (!branch || branch.length === 0) {
      return next(new AppError("Branch not found", 404));
    }

    const tool = await prisma.tool.findFirst({
      where: { id: toolId, branchId, deletedAt: null },
    });
    if (!tool || tool.length === 0)
      return next(new AppError("Tool not found", 404));

    if (tool.branchId !== branchId) {
      return next(
        new AppError("Tool does not belong to the specified branch", 400),
      );
    }
    res.status(200).json({
      success: true,
      message: "Tool retrieved successfully",
      data: tool,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getToolsByBranchId = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }

    const branch = await prisma.branch.findFirst({
      where: { id: branchId },
    });

    if (!branch || branch.length === 0) {
      return next(new AppError("Branch not found", 404));
    }

    // Build where clause with all filters
    const whereClause = { branchId, deletedAt: null, isDeleted: false };

    if (req.query.type) {
      whereClause.type = String(req.query.type).toUpperCase();
      if (!ToolType.includes(whereClause.type)) {
        return next(new AppError("Invalid tool type", 400));
      }
    }

    if (req.query.isActive !== undefined) {
      whereClause.isActive = req.query.isActive === "true";
    }

    if (req.query.isBusy !== undefined) {
      whereClause.isBusy = req.query.isBusy === "true";
    }

    if (req.query.spaceId) {
      whereClause.spaceId = req.query.spaceId;
    }

    if (req.query.deviceId) {
      whereClause.deviceId = req.query.deviceId;
    }

    if (req.query.priceType) {
      whereClause.priceType = String(req.query.priceType).toUpperCase();
    }

    const tools = await prisma.tool.findMany({
      where: whereClause,
    });

    if (!tools || tools.length === 0) {
      return next(new AppError("No tools found for this branch", 404));
    }

    res.status(200).json({
      success: true,
      message: "Tools retrieved successfully",
      data: tools,
    });
  } catch (error) {
    next(error);
  }
};

export const getToolsByIsActive = async (req, res, next) => {
  try {
    const { branchId, isActive } = req.params;
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }
    if (isActive === undefined) {
      return next(new AppError("isActive parameter is required", 400));
    }
    if (isActive !== "true" && isActive !== "false") {
      return next(new AppError("isActive must be true or false", 400));
    }
    const isActiveBool = isActive === "true";
    const isBusy = parseBusyFilter(req.query.isBusy);
    const branch = await prisma.branch.findFirst({
      where: { id: branchId },
    });

    if (!branch || branch.length === 0) {
      return next(new AppError("Branch not found", 404));
    }
    const tools = await prisma.tool.findMany({
      where: {
        branchId,
        isActive: isActiveBool,
        deletedAt: null,
        isBusy,
        isDeleted: false,
      },
    });
    if (!tools || tools.length === 0) {
      return next(
        new AppError("No tools found with the specified isActive status", 404),
      );
    }
    res.status(200).json({
      success: true,
      message: "Tools retrieved successfully",
      data: tools,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const deleteToolById = async (req, res, next) => {
  try {
    const { branchId, toolId } = req.params;
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }
    if (!toolId) {
      return next(new AppError("Tool ID is required", 400));
    }
    const branch = await prisma.branch.findFirst({
      where: { id: branchId },
    });

    if (!branch || branch.length === 0) {
      return next(new AppError("Branch not found", 404));
    }

    const { storageUsage, tool } = await prisma.$transaction(async (tx) => {
      const tool = await tx.tool.findFirst({
        where: { id: toolId, branchId, deletedAt: null },
      });

      if (!tool || tool.length === 0) {
        throw new AppError("Tool not found", 404);
      }

      if (tool.branchId !== branchId) {
        throw new AppError("Tool does not belong to the specified branch", 400);
      }

      const storageUsage = await decrementStorageUsage(
        branch.businessId,
        "tools",
        tx,
      );

      const deletedTool = await tx.tool.update({
        where: { id: toolId },
        data: {
          deletedAt: new Date(),
          isDeleted: true,
          deletedBy: req.user.id,
        },
      });

      return { storageUsage, tool: deletedTool };
    });

    // Invalidate cache for this branch
    const keysToDelete = await redisClient.keys(`tools:branchId=${branchId}*`);
    if (keysToDelete.length > 0) {
      await redisClient.del(keysToDelete);
    }

    res.status(200).json({
      success: true,
      message: "Tool deleted successfully",
      storageUsage,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteToolsByBranchId = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER" && req.user.roleName !== "OWNER") {
      return next(
        new AppError("You do not have permission to perform this action", 403),
      );
    }
    const { branchId } = req.params;
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }

    const branch = await prisma.branch.findFirst({
      where: { id: branchId },
    });

    if (!branch || branch.length === 0) {
      return next(new AppError("Branch not found", 404));
    }

    const tools = await prisma.tool.findMany({
      where: { branchId, deletedAt: null },
    });
    if (!tools || tools.length === 0) {
      return next(new AppError("No tools found for this branch", 404));
    }

    const { storageUsage, result } = await prisma.$transaction(async (tx) => {
      const result = await tx.tool.updateMany({
        where: { branchId, deletedAt: null, isDeleted: false },
        data: {
          deletedAt: new Date(),
          isDeleted: true,
          deletedBy: req.user.id,
        },
      });

      const storageUsage = await decrementStorageUsage(
        branch.businessId,
        "tools",
        tx,
        result.count,
      );

      return { storageUsage, result };
    });

    res.status(200).json({
      success: true,
      message: "Tools deleted successfully",
      count: result.count,
      storageUsage,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAllTools = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(new AppError(messages.FORBIDDEN.en, 403));
    }
    const result = await prisma.tool.updateMany({
      where: { deletedAt: null, isDeleted: false },
      data: { deletedAt: new Date(), isDeleted: true, deletedBy: req.user.id },
    });

    if (!result || result.length === 0) {
      return next(new AppError(messages.DATA_NOT_FOUND.en, 403));
    }

    res.status(200).json({
      success: true,
      message: "All tools deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const updateToolById = async (req, res, next) => {
  try {
    const { branchId, toolId } = req.params;
    const allowedUpdates = [
      "branchId",
      "spaceId",
      "deviceId",
      "name",
      "type",
      "priceType",
      "price",
      "isBusy",
      "customTypeLabel",
      "isActive",
    ];
    const updates = { ...req.body };
    const isValidOperation = Object.keys(updates).every((update) =>
      allowedUpdates.includes(update),
    );
    if (!isValidOperation) {
      return next(
        new AppError(
          `Invalid updates! Allowed fields: ${allowedUpdates.join(", ")}`,
          400,
        ),
      );
    }
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }
    if (!toolId) {
      return next(new AppError("Tool ID is required", 400));
    }
    const branch = await prisma.branch.findFirst({
      where: { id: branchId },
    });
    if (!branch || branch.length === 0) {
      return next(new AppError("Branch not found", 404));
    }
    const tool = await prisma.tool.findFirst({
      where: { id: toolId, branchId, deletedAt: null },
    });
    if (!tool || tool.length === 0)
      return next(new AppError("Tool not found", 404));

    if (tool.branchId !== branchId) {
      return next(
        new AppError("Tool does not belong to the specified branch", 400),
      );
    }
    if (updates.type) {
      if (
        String(updates.type).toUpperCase() === "OTHER" &&
        !ToolType.includes(String(updates.type).toUpperCase()) &&
        updates.type.toUpperCase() === "OTHER" &&
        !updates.customTypeLabel
      ) {
        return next(
          new AppError("Custom type label is required when type is OTHER", 400),
        );
      }
      updates.type = fixType(updates.type);
    }
    if (updates.pricePerSession !== undefined && updates.price === undefined) {
      updates.price = updates.pricePerSession;
    }
    delete updates.pricePerSession;

    if (updates.priceType !== undefined) {
      updates.priceType = String(updates.priceType).toUpperCase();
      if (!PricingType.includes(updates.priceType)) {
        return next(new AppError("Invalid price type", 400));
      }
    }

    if (updates.price !== undefined) {
      updates.price = Number(updates.price);
      if (Number.isNaN(updates.price) || updates.price < 0) {
        return next(new AppError("price must be a valid number >= 0", 400));
      }
    }

    if (updates.isBusy !== undefined) {
      updates.isBusy = Boolean(updates.isBusy);
    }

    const nextSpaceId =
      updates.spaceId !== undefined ? updates.spaceId : tool.spaceId;
    const nextDeviceId =
      updates.deviceId !== undefined ? updates.deviceId : tool.deviceId;

    if (!nextSpaceId && !nextDeviceId) {
      return next(new AppError("Either spaceId or deviceId is required", 400));
    }

    if (nextSpaceId && nextDeviceId) {
      return next(
        new AppError("Provide only one target: spaceId or deviceId", 400),
      );
    }

    const [nextSpace, nextDevice] = await Promise.all([
      updates.spaceId !== undefined && updates.spaceId !== null
        ? prisma.space.findFirst({
            where: { id: updates.spaceId, branchId },
          })
        : Promise.resolve(null),
      updates.deviceId !== undefined && updates.deviceId !== null
        ? prisma.device.findFirst({
            where: { id: updates.deviceId, branchId },
          })
        : Promise.resolve(null),
    ]);

    if (
      updates.spaceId !== undefined &&
      updates.spaceId !== null &&
      !nextSpace
    ) {
      return next(new AppError("Space not found", 404));
    }

    if (
      updates.deviceId !== undefined &&
      updates.deviceId !== null &&
      !nextDevice
    ) {
      return next(new AppError("Device not found", 404));
    }

    const effectiveSpaceId =
      updates.spaceId !== undefined
        ? updates.spaceId
        : nextDevice?.spaceId || tool.spaceId;

    if (!effectiveSpaceId) {
      return next(
        new AppError(
          "A tool must belong to a space or to a device assigned to a space",
          400,
        ),
      );
    }
    let imageUrl =
      "https://media.istockphoto.com/id/1472933890/vector/no-image-vector-symbol-missing-available-icon-no-gallery-for-this-moment-placeholder.jpg?s=2048x2048&w=is&k=20&c=Qw0wGz-a6BpwFjaoxtkjgsf75C-DeOYs7GFPU8O9z20=";

    if (req.file) {
      try {
        const uploadResult = await compressAndUpload(req.file.buffer, "tools");
        imageUrl = uploadResult.secure_url;
      } catch (error) {
        return next(new AppError("Failed to upload image", 500));
      }
    }

    if (updates.image) {
      updates.image = imageUrl;
    }

    if (updates.isActive) {
      if (updates.isActive !== "true" && updates.isActive !== "false") {
        return next(new AppError("isActive must be true or false", 400));
      }
      updates.isActive = updates.isActive === "true";
    }

    const updatedTool = await prisma.tool.update({
      where: { id: toolId },
      data: {
        ...updates,
        spaceId: effectiveSpaceId,
        updatedBy: req.user.id,
      },
    });
    res.status(200).json({
      success: true,
      message: "Tool updated successfully",
      data: updatedTool,
    });
  } catch (error) {
    next(error);
  }
};
