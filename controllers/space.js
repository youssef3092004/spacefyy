import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";
import { compressAndUpload } from "../utils/cloudinary.js";
import { incrementStorageUsage } from "../utils/storageUsage.js";
import { redisClient } from "../configs/redis.js";
import { invalidateSpaceCache } from "./spaceAvailability.js";
import { invalidateCacheByPattern } from "../utils/cacheInvalidation.js";
import { assertResourceNotInUse } from "../utils/resourceAvailability.js";

const SpaceType = ["PRIVATE", "PUBLIC", "DESK", "MEETING", "VIP", "OTHER"];
const PricingType = ["PER_HOUR", "PER_SESSION", "PER_GAME"];

const parseBusyFilter = (value) => {
  if (value === undefined) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new AppError("isBusy must be true or false", 400);
};

const parseBooleanInput = (value, fieldName) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue === "true") return true;
    if (normalizedValue === "false") return false;
  }
  throw new AppError(`${fieldName} must be true or false`, 400);
};

const fixType = (type) => {
  if (!SpaceType.includes(String(type).toUpperCase())) {
    throw new AppError("Invalid space type", 400);
  }
  return (type = String(type).toUpperCase());
};

export const createSpace = async (req, res, next) => {
  try {
    const {
      branchId,
      name,
      type,
      capacity,
      bookingCapacity,
      isActive,
      customTypeLabel,
      priceType,
      price,
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
    const existingBranch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!existingBranch || existingBranch === 0) {
      return next(new AppError("Branch not found", 404));
    }

    const normalizedType = fixType(type);
    const normalizedIsActive =
      isActive !== undefined ? parseBooleanInput(isActive, "isActive") : true;

    // Only PUBLIC spaces hold multiple resources (devices/units) and accept a
    // bookingCapacity from the client. Every other type is single-use:
    // bookingCapacity is always 1 and any client-supplied value is ignored.
    // bookingCapacity is the availability logic field (seeds/caps availableNumber).
    let normalizedBookingCapacity;
    if (normalizedType === "PUBLIC") {
      if (
        bookingCapacity === undefined ||
        bookingCapacity === null ||
        bookingCapacity === ""
      ) {
        return next(
          new AppError("bookingCapacity is required for PUBLIC spaces", 400),
        );
      }
      normalizedBookingCapacity = Number(bookingCapacity);
      if (
        !Number.isInteger(normalizedBookingCapacity) ||
        normalizedBookingCapacity <= 0
      ) {
        return next(
          new AppError("bookingCapacity must be a positive integer", 400),
        );
      }
    } else {
      normalizedBookingCapacity = 1;
    }

    // capacity is a display-only value the frontend supplies for all space
    // types. It is not used in any availability logic.
    let normalizedCapacity = 0;
    if (capacity !== undefined && capacity !== null && capacity !== "") {
      normalizedCapacity = Number(capacity);
      if (!Number.isInteger(normalizedCapacity) || normalizedCapacity <= 0) {
        return next(new AppError("capacity must be a positive integer", 400));
      }
    }

    const normalizedPriceType = String(priceType || "PER_HOUR").toUpperCase();

    if (!PricingType.includes(normalizedPriceType)) {
      return next(new AppError("Invalid price type", 400));
    }

    if (price !== undefined && (isNaN(Number(price)) || Number(price) < 0)) {
      return next(new AppError("price must be a valid number >= 0", 400));
    }

    if (customTypeLabel && normalizedType !== "OTHER") {
      return next(
        new AppError("customTypeLabel can only be set when type is OTHER", 400),
      );
    }

    let imageUrl =
      "https://media.istockphoto.com/id/1472933890/vector/no-image-vector-symbol-missing-available-icon-no-gallery-for-this-moment-placeholder.jpg?s=2048x2048&w=is&k=20&c=Qw0wGz-a6BpwFjaoxtkjgsf75C-DeOYs7GFPU8O9z20=";

    if (req.file) {
      try {
        const uploadResult = await compressAndUpload(req.file.buffer, "spaces");
        imageUrl = uploadResult.secure_url;
      } catch (error) {
        return next(error);
      }
    }
    ``;

    const { storageUsage, newSpace } = await prisma.$transaction(async (tx) => {
      const storageUsage = await incrementStorageUsage(
        existingBranch.businessId,
        "spaces",
        tx,
      );

      const newSpace = await tx.space.create({
        data: {
          branchId,
          name,
          type: normalizedType,
          capacity: normalizedCapacity,
          bookingCapacity: normalizedBookingCapacity,
          availableNumber: normalizedBookingCapacity,
          priceType: normalizedPriceType,
          price: Number(price || 0),
          isBusy: false,
          isActive: normalizedIsActive,
          customTypeLabel,
          image: imageUrl,
        },
      });

      return { storageUsage, newSpace };
    });

    // Invalidate cache for this branch
    const keysToDelete = await redisClient.keys(`spaces:branchId=${branchId}*`);
    if (keysToDelete.length > 0) {
      await redisClient.del(keysToDelete);
    }

    res.status(201).json({
      success: true,
      message: "Space created successfully",
      data: newSpace,
      storageUsage,
    });
  } catch (error) {
    next(error);
  }
};

export const getSpaceById = async (req, res, next) => {
  try {
    const { spaceId } = req.params;

    if (!spaceId) {
      return next(new AppError("Space ID is required", 400));
    }
    const space = await prisma.space.findFirst({
      where: { id: spaceId, deletedAt: null, isDeleted: false },
      select: {
        id: true,
        branchId: true,
        name: true,
        type: true,
        customTypeLabel: true,
        image: true,
        capacity: true,
        bookingCapacity: true,
        availableNumber: true,
        priceType: true,
        price: true,
        isActive: true,
        isBusy: true,
        createdAt: true,
        updatedAt: true,
        devices: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        units: {
          where: { isDeleted: false },
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });
    if (!space || space === 0) {
      return next(new AppError("Space not found", 404));
    }

    // Fetch all sessions that used this space (via components)
    const allSessions = await prisma.session.findMany({
      where: {
        deletedAt: null,
        components: { some: { resourceType: "SPACE", resourceId: spaceId } },
      },
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        durationMinutes: true,
        status: true,
        totalPrice: true,
      },
    });

    const now = new Date();

    const analytics = allSessions.reduce(
      (acc, session) => {
        const sessionDurationMinutes =
          session.durationMinutes ??
          (session.startedAt && session.endedAt
            ? Math.max(
                0,
                Math.round(
                  (new Date(session.endedAt).getTime() -
                    new Date(session.startedAt).getTime()) /
                    60000,
                ),
              )
            : session.status === "ACTIVE"
              ? Math.max(
                  0,
                  Math.round(
                    (now.getTime() - new Date(session.startedAt).getTime()) /
                      60000,
                  ),
                )
              : 0);

        acc.totalSessions += 1;
        acc.activeSessions += session.status === "ACTIVE" ? 1 : 0;
        acc.endedSessions += session.status === "ENDED" ? 1 : 0;
        acc.cancelledSessions += session.status === "CANCELLED" ? 1 : 0;
        acc.totalDurationMinutes += sessionDurationMinutes;
        acc.totalRevenue += Number(session.totalPrice || 0);

        return acc;
      },
      {
        totalSessions: 0,
        activeSessions: 0,
        endedSessions: 0,
        cancelledSessions: 0,
        totalDurationMinutes: 0,
        totalRevenue: 0,
      },
    );

    const totalHoursSpent = Number(
      (analytics.totalDurationMinutes / 60).toFixed(2),
    );
    const averageSessionDurationMinutes = analytics.totalSessions
      ? Math.round(analytics.totalDurationMinutes / analytics.totalSessions)
      : 0;

    res.status(200).json({
      success: true,
      data: {
        ...space,
        analytics: {
          totalSessions: analytics.totalSessions,
          activeSessions: analytics.activeSessions,
          endedSessions: analytics.endedSessions,
          cancelledSessions: analytics.cancelledSessions,
          totalDurationMinutes: analytics.totalDurationMinutes,
          totalHoursSpent,
          averageSessionDurationMinutes,
          totalRevenue: Number(analytics.totalRevenue.toFixed(2)),
        },
      },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getAllByBranchId = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }
    const { page, limit, skip, sort, order } = pagination(req);

    // Build where clause with all filters
    const where = { branchId, deletedAt: null, isDeleted: false };

    if (req.query.type) {
      where.type = String(req.query.type).toUpperCase();
      const SpaceType = [
        "PRIVATE",
        "PUBLIC",
        "DESK",
        "MEETING",
        "VIP",
        "OTHER",
      ];
      if (!SpaceType.includes(where.type)) {
        return next(new AppError("Invalid space type", 400));
      }
    }

    if (req.query.isActive !== undefined) {
      where.isActive = req.query.isActive === "true";
    }

    if (req.query.isBusy !== undefined) {
      where.isBusy = req.query.isBusy === "true";
    }

    if (req.query.priceType) {
      where.priceType = String(req.query.priceType).toUpperCase();
    }

    // Handle capacity range filters
    if (req.query.capacity_min || req.query.capacity_max) {
      where.capacity = {};
      if (req.query.capacity_min) {
        where.capacity.gte = parseInt(req.query.capacity_min);
      }
      if (req.query.capacity_max) {
        where.capacity.lte = parseInt(req.query.capacity_max);
      }
    }

    const [spaces, total] = await prisma.$transaction([
      prisma.space.findMany({
        skip,
        take: limit,
        orderBy: { [sort]: order },
        where,
      }),
      prisma.space.count({ where }),
    ]);

    if (!spaces || spaces.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: spaces,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getSpaceByIsActive = async (req, res, next) => {
  try {
    const { branchId, isActive } = req.params;
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }
    const existingBranch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!existingBranch || existingBranch === 0) {
      return next(new AppError("Branch not found", 404));
    }
    if (!isActive) {
      return next(new AppError("isActive parameter is required", 400));
    }
    if (isActive !== "true" && isActive !== "false") {
      return next(new AppError("isActive must be true or false", 400));
    }
    const isActiveBool = isActive === "true";
    const isBusy = parseBusyFilter(req.query.isBusy);
    const spaces = await prisma.space.findMany({
      where: {
        branchId,
        isActive: isActiveBool,
        isBusy,
        deletedAt: null,
        isDeleted: false,
      },
    });
    if (!spaces || spaces.length === 0) {
      return next(
        new AppError("No spaces found with the specified isActive status", 404),
      );
    }
    res.status(200).json({ success: true, data: spaces, source: "database" });
  } catch (error) {
    next(error);
  }
};

export const getSpacesByType = async (req, res, next) => {
  try {
    let { branchId, type } = req.params;
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }
    const existingBranch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!existingBranch || existingBranch === 0) {
      return next(new AppError("Branch not found", 404));
    }
    if (!type) {
      return next(new AppError("Type is required", 400));
    }
    type = String(type).toUpperCase();
    if (!SpaceType.includes(type)) {
      return next(new AppError("Invalid space type", 400));
    }
    const isBusy = parseBusyFilter(req.query.isBusy);
    const spaces = await prisma.space.findMany({
      where: { branchId, type, isBusy, deletedAt: null, isDeleted: false },
    });
    if (!spaces || spaces.length === 0) {
      return next(new AppError("No spaces found with the specified type", 404));
    }
    res.status(200).json({ success: true, data: spaces, source: "database" });
  } catch (error) {
    next(error);
  }
};

export const deleteSpaceById = async (req, res, next) => {
  try {
    const { branchId, spaceId } = req.params;
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }
    if (!spaceId) {
      return next(new AppError("Space ID is required", 400));
    }
    const existingSpace = await prisma.space.findUnique({
      where: { id: spaceId },
      include: {
        branch: {
          select: { businessId: true },
        },
      },
    });
    if (!existingSpace || existingSpace === 0) {
      return next(new AppError("Space not found", 404));
    }

    await prisma.$transaction(async (tx) => {
      await assertResourceNotInUse(tx, {
        resourceType: "SPACE",
        resourceId: spaceId,
      });

      // Soft delete the space
      await tx.space.update({
        where: { id: spaceId },
        data: {
          deletedAt: new Date(),
          isDeleted: true,
          deletedBy: req.user.id,
        },
      });
    });

    // Invalidate cache for this branch, plus the by-id key — without the
    // latter GET /spaces/getById/:spaceId kept serving the deleted space as
    // bookable until TTL_BY_ID expired.
    const keysToDelete = await redisClient.keys(`spaces:branchId=${branchId}*`);
    keysToDelete.push(`space:${spaceId}`);
    await redisClient.del(keysToDelete);

    res
      .status(200)
      .json({ success: true, message: "Space deleted successfully" });
  } catch (error) {
    next(error);
  }
};

export const deleteSpacesByBranchId = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER" && req.user.roleName !== "OWNER") {
      return next(
        new AppError("Unauthorized to delete spaces for this branch", 403),
      );
    }
    const { branchId } = req.params;
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }
    const existingBranch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!existingBranch || existingBranch === 0) {
      return next(new AppError("Branch not found", 404));
    }

    const result = await prisma.$transaction(async (tx) => {
      // Soft delete all spaces in this branch
      const result = await tx.space.updateMany({
        where: { branchId, deletedAt: null, isDeleted: false },
        data: {
          deletedAt: new Date(),
          isDeleted: true,
          deletedBy: req.user.id,
        },
      });

      if (!result.count || result.count === 0) {
        throw new AppError("No space records to delete for this branch", 404);
      }

      return result;
    });

    res.status(200).json({
      success: true,
      message: `Deleted spaces Successfully`,
      count: result.count,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAllSpaces = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(new AppError("Unauthorized to delete all spaces", 403));
    }
    const result = await prisma.space.updateMany({
      where: { deletedAt: null, isDeleted: false },
      data: { deletedAt: new Date(), isDeleted: true, deletedBy: req.user.id },
    });
    if (!result.count || result.count === 0) {
      return next(new AppError("No space records to delete", 404));
    }
    res.status(200).json({
      success: true,
      message: "All spaces deleted",
      count: result.count,
    });
  } catch (error) {
    next(error);
  }
};

export const updateSpaceById = async (req, res, next) => {
  try {
    const { branchId, spaceId } = req.params;
    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }
    if (!spaceId) {
      return next(new AppError("Space ID is required", 400));
    }
    const allowedUpdates = [
      "name",
      "type",
      "capacity",
      "bookingCapacity",
      "availableNumber",
      "priceType",
      "price",
      "isActive",
      "customTypeLabel",
      "isBusy",
      "image",
    ];
    let updates = { ...req.body };

    // Filter to only allowed fields
    updates = Object.keys(updates)
      .filter((key) => allowedUpdates.includes(key))
      .reduce((obj, key) => {
        obj[key] = updates[key];
        return obj;
      }, {});

    if (Object.keys(updates).length === 0 && !req.file) {
      return next(new AppError("No valid fields to update", 400));
    }

    if (updates.type) {
      updates.type = String(updates.type).toUpperCase();
      if (!SpaceType.includes(updates.type)) {
        return next(new AppError("Invalid space type", 400));
      }
    }
    if (updates.customTypeLabel && updates.type !== "OTHER") {
      return next(
        new AppError("customTypeLabel can only be set when type is OTHER", 400),
      );
    }

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

    // capacity is display-only: validate shape but never drive availability.
    if (updates.capacity !== undefined) {
      updates.capacity = Number(updates.capacity);
      if (!Number.isInteger(updates.capacity) || updates.capacity <= 0) {
        return next(new AppError("capacity must be a positive integer", 400));
      }
    }

    if (updates.bookingCapacity !== undefined) {
      updates.bookingCapacity = Number(updates.bookingCapacity);
      if (
        !Number.isInteger(updates.bookingCapacity) ||
        updates.bookingCapacity <= 0
      ) {
        return next(
          new AppError("bookingCapacity must be a positive integer", 400),
        );
      }
    }

    if (updates.availableNumber !== undefined) {
      updates.availableNumber = Number(updates.availableNumber);
      if (
        !Number.isInteger(updates.availableNumber) ||
        updates.availableNumber < 0
      ) {
        return next(
          new AppError("availableNumber must be an integer >= 0", 400),
        );
      }
    }

    const existingSpace = await prisma.space.findUnique({
      where: { id: spaceId },
    });
    if (updates.isActive !== undefined) {
      updates.isActive = parseBooleanInput(updates.isActive, "isActive");
    }
    if (updates.isBusy !== undefined) {
      updates.isBusy = parseBooleanInput(updates.isBusy, "isBusy");
    }
    if (!existingSpace || existingSpace === 0) {
      return next(new AppError("Space not found", 404));
    }

    // Non-PUBLIC spaces are single-use: bookingCapacity is always 1 and any
    // client-supplied value is ignored. Keep availableNumber within [0, 1].
    const effectiveType = updates.type ?? existingSpace.type;
    if (effectiveType !== "PUBLIC") {
      updates.bookingCapacity = 1;
      const currentAvailable =
        updates.availableNumber !== undefined
          ? updates.availableNumber
          : existingSpace.availableNumber;
      updates.availableNumber = Math.min(Math.max(currentAvailable, 0), 1);
    }

    // Handle image upload if file is provided
    if (req.file) {
      try {
        const uploadResult = await compressAndUpload(req.file.buffer, "spaces");
        updates.image = uploadResult.secure_url;
      } catch (error) {
        return next(error);
      }
    }

    // Validate the invariant against the MERGED post-update values. Checking
    // only when availableNumber was supplied let `PATCH {bookingCapacity: 1}`
    // land on a PUBLIC space holding availableNumber 5 — reserve only tests
    // `availableNumber > 0`, so five sessions could enter a one-slot space.
    const effectiveAvailable =
      updates.availableNumber !== undefined
        ? updates.availableNumber
        : existingSpace.availableNumber;
    const effectiveBookingCapacity =
      updates.bookingCapacity !== undefined
        ? updates.bookingCapacity
        : existingSpace.bookingCapacity;

    if (effectiveAvailable > effectiveBookingCapacity) {
      return next(
        new AppError(
          `availableNumber (${effectiveAvailable}) cannot exceed bookingCapacity (${effectiveBookingCapacity}). Lower availableNumber in the same request, or free the space first.`,
          400,
        ),
      );
    }

    // isBusy is derived, never client-set: accepting it directly let it drift
    // from availableNumber and hide a space that was actually free.
    updates.isBusy = effectiveAvailable === 0;

    const updatedSpace = await prisma.space.update({
      where: { id: spaceId },
      data: updates,
    });

    // Invalidate all cached views that can show stale space data.
    await Promise.all([
      invalidateSpaceCache(branchId),
      invalidateCacheByPattern(`space:${spaceId}`),
      invalidateCacheByPattern(`spaces:branchId=${branchId}*`),
      invalidateCacheByPattern(`space-history:${spaceId}*`),
    ]);

    res.status(200).json({ success: true, data: updatedSpace });
  } catch (error) {
    next(error);
  }
};

export const getSpaceHistoryFromSession = async (req, res, next) => {
  try {
    const { spaceId } = req.params;

    if (!spaceId) {
      return next(new AppError("Space ID is required", 400));
    }

    // 🔥 FIXED pagination
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const skip = (page - 1) * limit;

    const { status, priceType } = req.query;
    const sort = req.query.sort || "createdAt";
    const order = req.query.order === "asc" ? "asc" : "desc";

    // Check if space exists (optional verification), but don't return error
    const space = await prisma.space.findUnique({
      where: { id: spaceId },
      select: { id: true, isDeleted: true, deletedAt: true },
    });

    // If space is deleted or doesn't exist, return empty list with success
    if (!space || space.isDeleted || space.deletedAt) {
      return res.status(200).json({
        success: true,
        data: [],
        meta: {
          total: 0,
          page: 1,
          limit: parseInt(req.query.limit) || 10,
          totalPages: 0,
        },
        source: "database",
      });
    }

    const validSessionSortFields = [
      "id",
      "visitId",
      "startedAt",
      "endedAt",
      "durationMinutes",
      "status",
      "totalPrice",
      "currency",
      "createdAt",
      "updatedAt",
    ];

    const sortField = validSessionSortFields.includes(sort)
      ? sort
      : "createdAt";

    // 🔥 Dynamic filtering with date range
    const where = {
      deletedAt: null,
      components: { some: { resourceType: "SPACE", resourceId: spaceId } },
    };

    if (status) where.status = status;
    if (priceType) {
      where.components = {
        some: {
          resourceType: "SPACE",
          resourceId: spaceId,
          priceType: String(priceType).toUpperCase(),
        },
      };
    }

    // Add date range filtering on createdAt using pre-parsed dates from middleware
    if (req.parsedDates?.startDate || req.parsedDates?.endDate) {
      where.createdAt = {};
      if (req.parsedDates.startDate) {
        where.createdAt.gte = req.parsedDates.startDate;
      }
      if (req.parsedDates.endDate) {
        where.createdAt.lte = req.parsedDates.endDate;
      }
    }

    const [sessions, totalSessions] = await prisma.$transaction([
      prisma.session.findMany({
        where,
        select: {
          id: true,
          visitId: true,
          startedAt: true,
          endedAt: true,
          durationMinutes: true,
          status: true,
          totalPrice: true,
          currency: true,
          createdAt: true,
          updatedAt: true,
          components: {
            where: { resourceType: "SPACE", resourceId: spaceId },
            select: {
              priceType: true,
              unitPrice: true,
              quantity: true,
              totalPrice: true,
            },
          },
          visit: {
            select: {
              customer: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  email: true,
                },
              },
            },
          },
        },
        orderBy: {
          [sortField]: order,
        },
        skip,
        take: limit,
      }),

      prisma.session.count({ where }),
    ]);

    // Transform response to include customer at top level
    const transformedSessions = sessions.map((session) => ({
      id: session.id,
      visitId: session.visitId,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationMinutes: session.durationMinutes,
      status: session.status,
      totalPrice: session.totalPrice,
      currency: session.currency,
      spaceComponent: session.components?.[0] ?? null,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      customer: {
        id: session.visit?.customer?.id || null,
        name: session.visit?.customer?.name || null,
        phone: session.visit?.customer?.phone || null,
        email: session.visit?.customer?.email || null,
      },
    }));

    res.status(200).json({
      success: true,
      data: transformedSessions,
      meta: {
        total: totalSessions,
        page,
        limit,
        totalPages: Math.ceil(totalSessions / limit),
      },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};
