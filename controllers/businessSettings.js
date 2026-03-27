import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";

export const createBusinessSettings = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    const {
      defaultLanguage = "EN",
      notificationsEnabled = true,
      autoApprovePayroll = false,
    } = req.body || {};

    if (!businessId) {
      return next(new AppError("Business ID is required", 400));
    }
    const existingBusiness = await prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!existingBusiness) {
      return next(new AppError("Business not found", 404));
    }
    const existingSettings = await prisma.businessSettings.findUnique({
      where: { businessId },
    });
    if (existingSettings) {
      return next(
        new AppError("Business settings already exist for this business", 400),
      );
    }
    let Language = String(defaultLanguage).toUpperCase();
    if (!["EN", "AR"].includes(Language)) {
      return next(new AppError("Invalid default language", 400));
    }
    const newSettings = await prisma.businessSettings.create({
      data: {
        businessId,
        defaultLanguage: Language,
        notificationsEnabled,
        autoApprovePayroll,
      },
    });
    res.status(201).json({
      status: "success",
      data: newSettings,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getBusinessSettingsBybusinessId = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    if (!businessId) {
      return next(new AppError("Business ID is required", 400));
    }
    const existingSettings = await prisma.businessSettings.findUnique({
      where: { businessId },
    });
    if (!existingSettings) {
      return next(new AppError("Business settings not found", 404));
    }

    res.status(200).json({
      status: "success",
      data: existingSettings,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const deleteBusinessSettings = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    if (!businessId) {
      return next(new AppError("Business ID is required", 400));
    }
    const existingSettings = await prisma.businessSettings.findUnique({
      where: { businessId },
    });
    if (!existingSettings) {
      return next(new AppError("Business settings not found", 404));
    }
    await prisma.businessSettings.delete({
      where: { businessId },
    });
    res.status(200).json({
      status: "success",
      message: "Business settings deleted successfully",
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const updateBusinessSettings = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    if (!businessId) {
      return next(new AppError("Business ID is required", 400));
    }
    const existingSettings = await prisma.businessSettings.findUnique({
      where: { businessId },
    });
    if (!existingSettings) {
      return next(new AppError("Business settings not found", 404));
    }
    const allowedFields = [
      "defaultLanguage",
      "notificationsEnabled",
      "autoApprovePayroll",
    ];
    const updateData = { ...req.body };
    for (const key of Object.keys(updateData)) {
      if (!allowedFields.includes(key)) {
        return next(new AppError(`Field '${key}' cannot be updated`, 400));
      }
    }
    if (updateData.defaultLanguage) {
      let Language = String(updateData.defaultLanguage).toUpperCase();
      if (!["EN", "AR"].includes(Language)) {
        return next(new AppError("Invalid default language", 400));
      }
      updateData.defaultLanguage = Language;
    }
    const updatedSettings = await prisma.businessSettings.update({
      where: { businessId },
      data: updateData,
    });
    res.status(200).json({
      status: "success",
      data: updatedSettings,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};
