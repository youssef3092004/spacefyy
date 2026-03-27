/* eslint-disable no-unused-vars */
import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { compressAndUpload } from "../utils/cloudinary.js";
import { messages } from "../locales/message.js";
import {
  incrementStorageUsage,
  decrementStorageUsage,
} from "../utils/storageUsage.js";

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

const fixType = (type) => {
  if (!ToolType.includes(String(type).toUpperCase())) {
    throw new AppError("Invalid tool type", 400);
  }
  return (type = String(type).toUpperCase());
};

export const createTool = async (req, res, next) => {
  try {
    const {
      branchId,
      spaceId,
      name,
      type,
      pricePerSession,
      customTypeLabel,
      isActive,
    } = req.body;

    const requiredFields = { branchId, spaceId, name, type, pricePerSession };

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

    const fixedType = fixType(type);

    if (fixedType === "OTHER" && !customTypeLabel) {
      return next(
        new AppError("Custom type label is required when type is OTHER", 400),
      );
    }

    if (isNaN(Number(pricePerSession)) || Number(pricePerSession) < 0) {
      return next(
        new AppError("Price per session must be a positive number", 400),
      );
    }

    const branch = await prisma.branch.findFirst({
      where: { id: branchId },
    });
    if (!branch) return next(new AppError("Branch not found", 404));

    const space = await prisma.space.findFirst({
      where: { id: spaceId, branchId },
    });
    if (!space) return next(new AppError("Space not found", 404));

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
          branchId,
          spaceId,
          name,
          type: fixedType,
          customTypeLabel,
          pricePerSession: Number(pricePerSession),
          isActive: isActive !== undefined ? Boolean(isActive) : true,
          image: imageUrl,
          createdBy: req.user.id,
          updatedBy: req.user.id,
        },
      });
      return [storageUsage, newTool];
    });

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
    const tools = await prisma.tool.findMany({
      where: { branchId, deletedAt: null },
    });
    if (!tools || tools.length === 0) {
      return next(new AppError("No tools found for this branch", 404));
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
    const branch = await prisma.branch.findFirst({
      where: { id: branchId },
    });

    if (!branch || branch.length === 0) {
      return next(new AppError("Branch not found", 404));
    }
    const tools = await prisma.tool.findMany({
      where: { branchId, isActive: isActiveBool, deletedAt: null },
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
        data: { deletedAt: new Date() },
      });

      return { storageUsage, tool: deletedTool };
    });
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
        where: { branchId, deletedAt: null },
        data: { deletedAt: new Date() },
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
      where: { deletedAt: null },
      data: { deletedAt: new Date() },
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
      "name",
      "type",
      "pricePerSession",
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
    if (updates.pricePerSession) {
      if (
        isNaN(Number(updates.pricePerSession)) ||
        Number(updates.pricePerSession) < 0
      ) {
        return next(
          new AppError("Price per session must be a positive number", 400),
        );
      }
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
      data: { ...updates, updatedBy: req.user.id },
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
