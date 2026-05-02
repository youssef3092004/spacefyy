import { prisma } from "../configs/db.js";
import { redisClient } from "../configs/redis.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";
import { compressAndUpload } from "../utils/cloudinary.js";
import { messages } from "../locales/message.js";
import { validateIdNumber } from "../utils/validation.js";

export const createStaffProfile = async (req, res, next) => {
  try {
    const {
      userId,
      branchId,
      baseSalary,
      hireDate,
      position,
      department,
      nationalIdNumber,
      nationalIdFrontImage,
      nationalIdBackImage,
    } = req.body;
    const requiredFields = {
      userId,
      branchId,
      baseSalary,
      hireDate,
      position,
    };

    for (const [key, value] of Object.entries(requiredFields)) {
      if (!value) {
        return next(
          new AppError(
            `${key.charAt(0).toUpperCase() + key.slice(1)} is required`,
            400,
          ),
        );
      }
    }
    if (!hireDate || isNaN(Date.parse(hireDate))) {
      return next(new AppError("hireDate must be a valid datetime", 400));
    }
    if (!parseFloat(baseSalary) || parseFloat(baseSalary) < 0) {
      return next(new AppError("baseSalary must be a positive number", 400));
    }
    const nationalId = {
      number: validateIdNumber(nationalIdNumber),
      frontImage: nationalIdFrontImage,
      backImage: nationalIdBackImage,
    };
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!existingUser) {
      return next(new AppError("user not found", 404));
    }
    const existingProfile = await prisma.staffProfile.findUnique({
      where: { userId },
    });
    if (existingProfile) {
      return next(
        new AppError("Staff profile for this user already exists", 400),
      );
    }
    const existingBranch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!existingBranch) {
      return next(new AppError("branch not found", 404));
    }
    const newStaffProfile = await prisma.staffProfile.create({
      data: {
        userId,
        branchId,
        baseSalary: parseFloat(baseSalary),
        hireDate: new Date(hireDate),
        position,
        department,
        nationalId: {
          create: nationalId,
        },
      },
    });
    await redisClient.keys("staffProfile:*");
    const keys = await redisClient.keys("staffProfiles:*");
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
    res.status(201).json({
      success: true,
      data: newStaffProfile,
      nationalId,
    });
  } catch (error) {
    next(error);
  }
};

export const getStaffProfileById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      return next(new AppError("Staff Profile ID is required", 400));
    }
    const staffProfile = await prisma.staffProfile.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            role: { select: { id: true, name: true } },
          },
        },
        nationalId: true,
      },
    });
    if (!staffProfile) {
      return next(new AppError("Staff Profile not found", 404));
    }
    res.status(200).json({
      success: true,
      data: staffProfile,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getAllStaffProfiles = async (req, res, next) => {
  try {
    const { page, limit, skip, sort, order } = pagination(req);

    const [staffProfiles, total] = await prisma.$transaction([
      prisma.staffProfile.findMany({
        skip,
        take: limit,
        orderBy: { [sort]: order },
        select: {
          id: true,
          userId: true,
          branchId: true,
          department: true,
          hireDate: true,
          baseSalary: true,
          user: {
            select: {
              name: true,
              email: true,
              phone: true,
              profileImage: true,
              role: {
                select: {
                  name: true,
                },
              },
            },
          },
          nationalId: true,
        },
      }),
      prisma.staffProfile.count(),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: staffProfiles,
      meta: {
        page,
        limit,
        total,
        totalPages,
        sort,
        order,
      },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getStaffProfilesByBranchId = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { page, limit, skip, sort, order } = pagination(req);
    const [staffProfiles, total] = await prisma.$transaction([
      prisma.staffProfile.findMany({
        where: { branchId },
        skip,
        take: limit,
        orderBy: { [sort]: order },
        select: {
          id: true,
          userId: true,
          branchId: true,
          department: true,
          hireDate: true,
          baseSalary: true,
          user: {
            select: {
              name: true,
              email: true,
              phone: true,
              profileImage: true,
              role: {
                select: {
                  name: true,
                },
              },
            },
          },
          nationalId: true,
        },
      }),
      prisma.staffProfile.count({ where: { branchId } }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: staffProfiles,
      meta: {
        page,
        limit,
        total,
        totalPages,
        sort,
        order,
      },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getStaffProfileByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return next(new AppError("User ID is required", 400));
    }
    const staffProfile = await prisma.staffProfile.findUnique({
      where: { userId },
      include: {
        user: {
          include: {
            role: { select: { id: true, name: true } },
          },
        },
        nationalId: true,
      },
    });
    if (!staffProfile) {
      return next(new AppError("Staff Profile not found for this user", 404));
    }
    res.status(200).json({
      success: true,
      data: staffProfile,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getStaffProfilesCount = async (req, res, next) => {
  try {
    const count = await prisma.staffProfile.count();
    if (count === 0) {
      return next(new AppError("No staff profiles found", 404));
    }
    res.status(200).json({
      success: true,
      data: { count },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const updateStaffProfileById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      userId,
      branchId,
      baseSalary,
      hireDate,
      position,
      department,
      nationalIdNumber,
      nationalIdFrontImage,
      nationalIdBackImage,
    } = req.body;
    if (!id) {
      return next(new AppError("Staff Profile ID is required", 400));
    }
    const requiredFields = {
      userId,
      branchId,
      baseSalary,
      hireDate,
      position,
      department,
      nationalIdNumber,
      nationalIdFrontImage,
      nationalIdBackImage,
    };
    for (const i in requiredFields) {
      if (!requiredFields[i]) {
        return next(
          new AppError(
            `${i.charAt(0).toUpperCase() + i.slice(1)} is required`,
            400,
          ),
        );
      }
    }

    if (!hireDate || isNaN(Date.parse(hireDate))) {
      return next(new AppError("hireDate must be a valid datetime", 400));
    }
    if (!parseFloat(baseSalary) || parseFloat(baseSalary) < 0) {
      return next(new AppError("baseSalary must be a positive number", 400));
    }

    const updatedStaffProfile = await prisma.staffProfile.update({
      where: { id },
      data: {
        userId,
        branchId,
        baseSalary: parseFloat(baseSalary),
        hireDate: new Date(hireDate),
        position,
        department,
        nationalId: {
          upsert: {
            update: {
              number: nationalIdNumber,
              frontImage: nationalIdFrontImage,
              backImage: nationalIdBackImage,
            },
            create: {
              number: nationalIdNumber,
              frontImage: nationalIdFrontImage,
              backImage: nationalIdBackImage,
            },
          },
        },
      },
    });
    res.status(200).json({
      status: "success",
      data: updatedStaffProfile,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteStaffProfileById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      return next(new AppError("Staff Profile ID is required", 400));
    }
    const nationalId = await prisma.nationalId.findUnique({
      where: { staffProfileId: id },
    });
    if (!nationalId) {
      return next(new AppError("Associated national ID not found", 404));
    }
    const staffProfile = await prisma.staffProfile.findUnique({
      where: { id },
    });
    if (!staffProfile) {
      return next(new AppError("Staff Profile not found", 404));
    }

    await prisma.$transaction([
      prisma.nationalId.delete({
        where: { id: nationalId.id },
      }),
      prisma.staffProfile.delete({
        where: { id },
      }),
    ]);
    res.status(200).json({
      status: "success",
      message: "Staff Profile & national ID deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAllStaffProfiles = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(new AppError(messages.FORBIDDEN.en, 403));
    }
    const [nationalIdDeletions, staffProfileDeletions] =
      await prisma.$transaction([
        prisma.nationalId.deleteMany({}),
        prisma.staffProfile.deleteMany({}),
      ]);
    if (nationalIdDeletions.count === 0) {
      return next(new AppError("No national IDs to delete", 404));
    }
    if (staffProfileDeletions.count === 0) {
      return next(new AppError("No staff profiles to delete", 404));
    }
    res.status(200).json({
      status: "success",
      message: "All staff profiles deleted successfully",
      nationalIdCount: nationalIdDeletions.count,
      staffProfileCount: staffProfileDeletions.count,
    });
  } catch (error) {
    next(error);
  }
};

export const updateStaffProfileByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const {
      branchId,
      baseSalary,
      hireDate,
      position,
      department,
      nationalIdNumber,
      nationalIdFrontImage,
      nationalIdBackImage,
    } = req.body;

    const requiredFields = {
      branchId,
      baseSalary,
      hireDate,
      position,
      department,
      nationalIdNumber,
      nationalIdFrontImage,
      nationalIdBackImage,
    };
    if (!userId) {
      return next(new AppError("User ID is required", 400));
    }

    for (const [key, value] of Object.entries(requiredFields)) {
      if (!value) {
        return next(new AppError(`${key} is required`, 400));
      }
    }

    if (!hireDate || isNaN(Date.parse(hireDate))) {
      return next(new AppError("hireDate must be a valid datetime", 400));
    }
    if (!parseFloat(baseSalary) || parseFloat(baseSalary) < 0) {
      return next(new AppError("baseSalary must be a positive number", 400));
    }

    validateIdNumber(nationalIdNumber);

    const staffProfile = await prisma.staffProfile.findUnique({
      where: { userId },
    });
    if (!staffProfile) {
      return next(new AppError("Staff Profile not found for this user", 404));
    }
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) {
      return next(new AppError("branch not found", 404));
    }
    const updatedStaffProfile = await prisma.staffProfile.update({
      where: { userId },
      data: {
        branchId,
        baseSalary: parseFloat(baseSalary),
        hireDate: new Date(hireDate),
        position,
        department,
        nationalId: {
          upsert: {
            update: {
              number: validateIdNumber(nationalIdNumber),
              frontImage: nationalIdFrontImage,
              backImage: nationalIdBackImage,
            },
            create: {
              number: validateIdNumber(nationalIdNumber),
              frontImage: nationalIdFrontImage,
              backImage: nationalIdBackImage,
            },
          },
        },
      },
    });

    res.status(200).json({
      status: "success",
      data: updatedStaffProfile,
    });
  } catch (error) {
    next(error);
  }
};

export const updateStaffProfileByUserIdPatch = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return next(new AppError("User ID is required", 400));
    }

    const staffProfile = await prisma.staffProfile.findUnique({
      where: { userId },
      include: { nationalId: true },
    });

    if (!staffProfile) {
      return next(new AppError("Staff profile not found", 404));
    }

    const { branchId, baseSalary, hireDate, position, department, nationalId } =
      req.body;

    const existingNationalId = await prisma.nationalId.findUnique({
      where: { staffProfileId: staffProfile.id },
    });

    const uploadedFrontFile = req.files?.frontImage?.[0];
    const uploadedBackFile = req.files?.backImage?.[0];

    const updateData = {};

    if (branchId) {
      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
      });
      if (!branch) {
        return next(new AppError("Branch not found", 404));
      }
      updateData.branchId = branchId;
    }

    if (baseSalary !== undefined) {
      const parsedSalary = parseFloat(baseSalary);
      if (isNaN(parsedSalary) || parsedSalary < 0) {
        return next(new AppError("baseSalary must be a positive number", 400));
      }
      updateData.baseSalary = parsedSalary;
    }

    if (hireDate) updateData.hireDate = new Date(hireDate);
    if (position) updateData.position = position;
    if (department) updateData.department = department;

    if (hireDate && isNaN(Date.parse(hireDate))) {
      return next(new AppError("hireDate must be a valid datetime", 400));
    }

    const hasNationalIdChanges =
      nationalId !== undefined ||
      uploadedFrontFile ||
      uploadedBackFile ||
      req.body.nationalIdNumber !== undefined ||
      req.body.number !== undefined;

    if (hasNationalIdChanges) {
      let parsedNationalId = nationalId;

      if (typeof parsedNationalId === "string") {
        try {
          parsedNationalId = JSON.parse(parsedNationalId);
        } catch {
          return next(
            new AppError("nationalId must be a valid JSON object", 400),
          );
        }
      }

      if (
        parsedNationalId !== undefined &&
        (!parsedNationalId ||
          typeof parsedNationalId !== "object" ||
          Array.isArray(parsedNationalId))
      ) {
        return next(new AppError("nationalId must be an object", 400));
      }

      const nationalIdPayload = {
        ...(parsedNationalId || {}),
      };

      if (
        nationalIdPayload.number === undefined &&
        req.body.nationalIdNumber !== undefined
      ) {
        nationalIdPayload.number = req.body.nationalIdNumber;
      }

      if (
        nationalIdPayload.number === undefined &&
        req.body.number !== undefined
      ) {
        nationalIdPayload.number = req.body.number;
      }

      if (uploadedFrontFile) {
        const uploadResult = await compressAndUpload(
          uploadedFrontFile.buffer,
          "staffProfiles",
        );
        nationalIdPayload.frontImage = uploadResult.secure_url;
      }

      if (uploadedBackFile) {
        const uploadResult = await compressAndUpload(
          uploadedBackFile.buffer,
          "staffProfiles",
        );
        nationalIdPayload.backImage = uploadResult.secure_url;
      }

      const {
        number,
        frontImage: normalizedFrontImage,
        forntImage,
        backImage,
      } = nationalIdPayload;
      const frontImage = normalizedFrontImage ?? forntImage;

      const hasNumber = number !== undefined;
      const hasFrontImage = frontImage !== undefined;
      const hasBackImage = backImage !== undefined;

      if (!hasNumber && !hasFrontImage && !hasBackImage) {
        return next(
          new AppError(
            "Provide at least one nationalId field: number, frontImage, or backImage",
            400,
          ),
        );
      }

      if (hasNumber && !number) {
        return next(new AppError("nationalId.number cannot be empty", 400));
      }
      if (hasFrontImage && !frontImage) {
        return next(new AppError("nationalId.frontImage cannot be empty", 400));
      }
      if (hasBackImage && !backImage) {
        return next(new AppError("nationalId.backImage cannot be empty", 400));
      }

      const nationalIdData = {};
      if (hasNumber) nationalIdData.number = validateIdNumber(number);
      if (hasFrontImage) nationalIdData.frontImage = frontImage;
      if (hasBackImage) nationalIdData.backImage = backImage;

      if (hasNumber) {
        const existingNationalId = await prisma.nationalId.findUnique({
          where: { number: nationalIdData.number },
        });

        if (
          existingNationalId &&
          existingNationalId.staffProfileId !== staffProfile.id
        ) {
          return next(new AppError("nationalId.number already exists", 409));
        }
      }

      if (existingNationalId) {
        updateData.nationalId = { update: nationalIdData };
      } else {
        updateData.nationalId = {
          create: {
            number: number || "Pending",
            frontImage: frontImage || "Pending",
            backImage: backImage || "Pending",
          },
        };
      }
    }

    if (!Object.keys(updateData).length) {
      return next(new AppError("No valid fields to update", 400));
    }

    const updatedStaffProfile = await prisma.staffProfile.update({
      where: { userId },
      data: updateData,
      include: { nationalId: true },
    });

    res.status(200).json({
      success: true,
      data: updatedStaffProfile,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};
