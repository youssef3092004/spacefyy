import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { pagination, isComputedSort } from "../utils/pagination.js";
import {
  isValidName,
  isValidEmail,
  isValidPhone,
} from "../utils/validation.js";
import { messages } from "../locales/message.js";
import { isValidTimeFormat } from "../utils/discountUtils.js";

const VALID_TAGS = ["VIP", "Regular", "Blacklisted", "New", "Loyal"];

const formatCustomer = (customer) => {
  if (!customer) return customer;
  const {
    isBlocked,
    blockedReason,
    hasDiscount,
    discountType,
    discountAmount,
    discountStartsAt,
    discountEndsAt,
    discountStartTime,
    discountEndTime,
    ...rest
  } = customer;

  return {
    ...rest,
    block: { isBlocked, blockedReason },
    discount: {
      hasDiscount,
      discountType,
      discountAmount,
      discountStartsAt,
      discountEndsAt,
      discountStartTime,
      discountEndTime,
    },
  };
};

const formatOrder = (order) => {
  if (!order) return null;

  const { orderItems = [], ...orderData } = order;

  return {
    ...orderData,
    orderItems,
  };
};

const formatVisitWithOrder = (visit) => {
  const { orders = [], ...visitData } = visit;
  const [firstOrder] = orders;

  if (!firstOrder) {
    return visitData;
  }

  return {
    ...visitData,
    order: formatOrder(firstOrder),
  };
};

const createCustomerWithScopedSequence = async ({
  businessId,
  name,
  phone,
  email,
  password,
  tags,
  notes,
  birthday,
  hasDiscount = false,
  discountType = "FLAT",
  discountAmount = 0,
  discountStartsAt = null,
  discountEndsAt = null,
  discountStartTime = null,
  discountEndTime = null,
}) => {
  const maxRetries = 5;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const lastCustomer = await tx.customer.findFirst({
          where: { businessId },
          orderBy: { seqNumber: "desc" },
          select: { seqNumber: true },
        });

        const seqNumber = (lastCustomer?.seqNumber || 0) + 1;

        return tx.customer.create({
          data: {
            businessId,
            seqNumber,
            name,
            phone,
            email: email || null,
            password: password || null,
            tags: tags || [],
            notes: notes || null,
            birthday: birthday ? new Date(birthday) : null,
            hasDiscount,
            discountType,
            discountAmount,
            discountStartsAt,
            discountEndsAt,
            discountStartTime,
            discountEndTime,
          },
        });
      });
    } catch (error) {
      const isUniqueConflict =
        error?.code === "P2002" &&
        Array.isArray(error?.meta?.target) &&
        error.meta.target.includes("businessId") &&
        error.meta.target.includes("seqNumber");

      if (!isUniqueConflict || attempt === maxRetries) {
        throw error;
      }
    }
  }

  throw new AppError("Failed to allocate customer sequence", 500);
};

export const createCustomer = async (req, res, next) => {
  try {
    const {
      businessId,
      name,
      phone,
      email,
      password,
      notes,
      birthday,
      branchId,
      hasDiscount = false,
      discountType = "FLAT",
      discountAmount = 0,
      discountStartsAt,
      discountEndsAt,
      discountStartTime,
      discountEndTime,
    } = req.body;
    const rawTags = req.body.tags;
    const tags =
      rawTags === undefined
        ? undefined
        : Array.isArray(rawTags)
          ? rawTags
          : [rawTags];
    const requiredFields = { businessId, name, phone };

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
    const existingBusiness = await prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!existingBusiness) {
      return next(new AppError("Business not found", 404));
    }
    if (!isValidName(name)) {
      return next(new AppError("Invalid name format", 400));
    }

    if (!isValidPhone(phone)) {
      return next(new AppError("Invalid phone format", 400));
    }

    if (email && !isValidEmail(email)) {
      return next(new AppError("Invalid email format", 400));
    }

    if (tags !== undefined) {
      if (!Array.isArray(tags)) {
        return next(new AppError("Tags must be an array", 400));
      }
      const invalid = tags.filter((t) => !VALID_TAGS.includes(t));
      if (invalid.length) {
        return next(
          new AppError(
            `Invalid tags: ${invalid.join(", ")}. Allowed: ${VALID_TAGS.join(", ")}`,
            400,
          ),
        );
      }
    }

    if (birthday !== undefined && isNaN(new Date(birthday).getTime())) {
      return next(new AppError("Invalid birthday date", 400));
    }

    if (!["FLAT", "PERCENT"].includes(discountType)) {
      return next(new AppError("discountType must be FLAT or PERCENT", 400));
    }
    const parsedDiscount = Number(discountAmount);
    if (isNaN(parsedDiscount) || parsedDiscount < 0) {
      return next(
        new AppError("discountAmount must be a non-negative number", 400),
      );
    }
    if (discountType === "PERCENT" && parsedDiscount > 100) {
      return next(new AppError("Percent discount cannot exceed 100", 400));
    }

    if (
      discountStartsAt !== undefined &&
      isNaN(new Date(discountStartsAt).getTime())
    ) {
      return next(new AppError("Invalid discountStartsAt date", 400));
    }
    if (
      discountEndsAt !== undefined &&
      isNaN(new Date(discountEndsAt).getTime())
    ) {
      return next(new AppError("Invalid discountEndsAt date", 400));
    }
    if (
      discountStartsAt &&
      discountEndsAt &&
      new Date(discountStartsAt) > new Date(discountEndsAt)
    ) {
      return next(
        new AppError("discountStartsAt must be before discountEndsAt", 400),
      );
    }
    if (
      discountStartTime !== undefined &&
      !isValidTimeFormat(discountStartTime)
    ) {
      return next(
        new AppError("discountStartTime must be in HH:MM format", 400),
      );
    }
    if (discountEndTime !== undefined && !isValidTimeFormat(discountEndTime)) {
      return next(new AppError("discountEndTime must be in HH:MM format", 400));
    }
    if (
      discountStartTime &&
      discountEndTime &&
      discountStartTime >= discountEndTime
    ) {
      return next(
        new AppError("discountStartTime must be before discountEndTime", 400),
      );
    }

    if (branchId) {
      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true, businessId: true },
      });
      if (!branch) return next(new AppError("Branch not found", 404));
      if (branch.businessId !== businessId)
        return next(
          new AppError("Branch does not belong to this business", 400),
        );
    }

    const existingPhone = await prisma.customer.findUnique({
      where: {
        businessId_phone: {
          businessId,
          phone,
        },
      },
    });

    if (existingPhone) {
      return next(new AppError("Phone number already in use", 409));
    }

    if (email) {
      const existingEmail = await prisma.customer.findUnique({
        where: {
          businessId_email: {
            businessId,
            email,
          },
        },
      });

      if (existingEmail) {
        return next(new AppError("Email already in use", 409));
      }
    }

    const customer = await createCustomerWithScopedSequence({
      businessId,
      name,
      phone,
      email,
      password,
      tags,
      notes,
      birthday,
      hasDiscount: Boolean(hasDiscount),
      discountType,
      discountAmount: parsedDiscount,
      discountStartsAt: discountStartsAt ? new Date(discountStartsAt) : null,
      discountEndsAt: discountEndsAt ? new Date(discountEndsAt) : null,
      discountStartTime: discountStartTime || null,
      discountEndTime: discountEndTime || null,
    });

    if (branchId) {
      await prisma.customerBranch.create({
        data: { customerId: customer.id, branchId },
      });
    }

    res.status(201).json({
      success: true,
      data: formatCustomer(customer),
      source: "database",
    });
  } catch (error) {
    if (error.code === "P2002") {
      return next(
        new AppError(
          "A customer with the same phone number or email already exists for this business",
          409,
        ),
      );
    }
    next(error);
  }
};

export const getCustomerById = async (req, res, next) => {
  try {
    const { customerId } = req.params;

    if (!customerId) {
      return next(new AppError("Customer ID is required", 400));
    }

    const visitsPage = Math.max(1, parseInt(req.query.visitsPage) || 1);
    const visitsLimit = Math.min(
      100,
      Math.max(1, parseInt(req.query.visitsLimit) || 10),
    );
    const visitsSkip = (visitsPage - 1) * visitsLimit;
    const VISITS_SORT_FIELDS = [
      "startedAt",
      "endedAt",
      "totalPrice",
      "durationMinutes",
      "createdAt",
    ];
    const visitsSort = VISITS_SORT_FIELDS.includes(req.query.visitsSort)
      ? req.query.visitsSort
      : "startedAt";
    const visitsOrder = req.query.visitsOrder === "asc" ? "asc" : "desc";

    const ordersPage = Math.max(1, parseInt(req.query.ordersPage) || 1);
    const ordersLimit = Math.min(
      100,
      Math.max(1, parseInt(req.query.ordersLimit) || 10),
    );
    const ordersSkip = (ordersPage - 1) * ordersLimit;
    const ORDERS_SORT_FIELDS = [
      "createdAt",
      "totalPrice",
      "finalPrice",
      "number",
    ];
    const ordersSort = ORDERS_SORT_FIELDS.includes(req.query.ordersSort)
      ? req.query.ordersSort
      : "createdAt";
    const ordersOrder = req.query.ordersOrder === "asc" ? "asc" : "desc";

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      omit: { password: true },
      include: {
        customerBranches: {
          include: {
            branch: { select: { id: true, name: true, address: true } },
          },
          orderBy: { registeredAt: "asc" },
        },
      },
    });

    if (!customer) {
      return next(new AppError("Customer not found", 404));
    }

    const [visitsTotal, ordersTotal, visitStats, visits, orders] =
      await Promise.all([
        prisma.visit.count({ where: { customerId } }),
        prisma.order.count({ where: { customerId, visitId: null } }),
        prisma.visit.aggregate({
          where: { customerId },
          _sum: { totalPrice: true },
          _min: { startedAt: true },
          _max: { startedAt: true },
          _avg: { durationMinutes: true },
        }),
        prisma.visit.findMany({
          where: { customerId },
          orderBy: { [visitsSort]: visitsOrder },
          skip: visitsSkip,
          take: visitsLimit,
          select: {
            id: true,
            branchId: true,
            status: true,
            totalPrice: true,
            startedAt: true,
            endedAt: true,
            durationMinutes: true,
            createdAt: true,
            sessions: {
              where: { deletedAt: null },
              select: {
                id: true,
                totalPrice: true,
                startedAt: true,
                endedAt: true,
                durationMinutes: true,
                status: true,
                components: {
                  select: {
                    id: true,
                    resourceType: true,
                    resourceId: true,
                    priceType: true,
                    unitPrice: true,
                    quantity: true,
                    gamesCount: true,
                    totalPrice: true,
                    startedAt: true,
                    endedAt: true,
                    durationMinutes: true,
                  },
                },
              },
            },
            orders: {
              select: {
                id: true,
                number: true,
                discountType: true,
                discountAmount: true,
                totalPrice: true,
                finalPrice: true,
                createdAt: true,
                orderItems: {
                  select: {
                    id: true,
                    quantity: true,
                    unitPrice: true,
                    totalPrice: true,
                    product: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        }),
        prisma.order.findMany({
          where: { customerId, visitId: null },
          orderBy: { [ordersSort]: ordersOrder },
          skip: ordersSkip,
          take: ordersLimit,
          select: {
            id: true,
            branchId: true,
            number: true,
            discountType: true,
            discountAmount: true,
            totalPrice: true,
            finalPrice: true,
            createdAt: true,
            orderItems: {
              select: {
                id: true,
                quantity: true,
                unitPrice: true,
                totalPrice: true,
                product: { select: { id: true, name: true } },
              },
            },
          },
        }),
      ]);

    const analytics = {
      totalVisits: visitsTotal,
      totalSpend: Number(visitStats._sum.totalPrice ?? 0),
      lastActivity: visitStats._max.startedAt ?? null,
      firstVisitAt: visitStats._min.startedAt ?? null,
      avgDurationMinutes: visitStats._avg.durationMinutes
        ? Math.round(visitStats._avg.durationMinutes)
        : null,
    };

    res.status(200).json({
      success: true,
      data: {
        ...formatCustomer(customer),
        analytics,
        visits: {
          data: visits.map(formatVisitWithOrder),
          pagination: {
            total: visitsTotal,
            page: visitsPage,
            limit: visitsLimit,
            totalPages: Math.ceil(visitsTotal / visitsLimit),
            sort: visitsSort,
            order: visitsOrder,
          },
        },
        orders: {
          data: orders,
          pagination: {
            total: ordersTotal,
            page: ordersPage,
            limit: ordersLimit,
            totalPages: Math.ceil(ordersTotal / ordersLimit),
            sort: ordersSort,
            order: ordersOrder,
          },
        },
      },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getAllCustomersBybusinessId = async (req, res, next) => {
  try {
    const { page, limit, skip, sort, order } = pagination(req);
    const { businessId } = req.params;
    const { search } = req.query;
    const dbSort = isComputedSort(sort) ? "createdAt" : sort;

    if (!businessId) {
      return next(new AppError("Business ID is required", 400));
    }

    const where = {
      businessId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [customers, total] = await prisma.$transaction([
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [dbSort]: order },
      }),
      prisma.customer.count({ where }),
    ]);

    if (!customers.length) {
      return next(new AppError("No customers found for this business", 404));
    }

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: customers.map(formatCustomer),
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

export const getAllCustomers = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(new AppError(messages.FORBIDDEN.en, 403));
    }
    const { page, limit, skip, sort, order } = pagination(req);
    const dbSort = isComputedSort(sort) ? "createdAt" : sort;
    const [customers, total] = await prisma.$transaction([
      prisma.customer.findMany({
        skip,
        take: limit,
        orderBy: { [dbSort]: order },
      }),
      prisma.customer.count(),
    ]);
    if (!customers.length) {
      return next(new AppError("No customers found", 404));
    }
    const totalPages = Math.ceil(total / limit);
    res.status(200).json({
      success: true,
      message: "Customers retrieved successfully",
      data: customers.map(formatCustomer),
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

export const updateCustomerByIdPatch = async (req, res, next) => {
  try {
    const { customerId } = req.params;

    if (!customerId) {
      return next(new AppError("Customer ID is required", 400));
    }

    const existingCustomer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!existingCustomer) {
      return next(new AppError("Customer not found", 404));
    }

    const allowedFields = [
      "name",
      "phone",
      "email",
      "password",
      "tags",
      "notes",
      "birthday",
      "hasDiscount",
      "discountType",
      "discountAmount",
      "discountStartsAt",
      "discountEndsAt",
      "discountStartTime",
      "discountEndTime",
    ];
    const updateData = { ...req.body };

    for (const key of Object.keys(updateData)) {
      if (!allowedFields.includes(key)) {
        return next(new AppError(`Field '${key}' cannot be updated`, 400));
      }
    }

    if (updateData.name && !isValidName(updateData.name)) {
      return next(new AppError("Invalid name format", 400));
    }

    if (updateData.phone && !isValidPhone(updateData.phone)) {
      return next(new AppError("Invalid phone format", 400));
    }

    if (updateData.email && !isValidEmail(updateData.email)) {
      return next(new AppError("Invalid email format", 400));
    }

    if (updateData.tags !== undefined) {
      if (!Array.isArray(updateData.tags)) {
        return next(new AppError("Tags must be an array", 400));
      }
      const invalid = updateData.tags.filter((t) => !VALID_TAGS.includes(t));
      if (invalid.length) {
        return next(
          new AppError(
            `Invalid tags: ${invalid.join(", ")}. Allowed: ${VALID_TAGS.join(", ")}`,
            400,
          ),
        );
      }
    }

    if (
      updateData.birthday !== undefined &&
      isNaN(new Date(updateData.birthday).getTime())
    ) {
      return next(new AppError("Invalid birthday date", 400));
    }

    if (updateData.birthday) {
      updateData.birthday = new Date(updateData.birthday);
    }

    if (updateData.discountType !== undefined) {
      if (!["FLAT", "PERCENT"].includes(updateData.discountType)) {
        return next(new AppError("discountType must be FLAT or PERCENT", 400));
      }
    }

    if (updateData.discountAmount !== undefined) {
      const parsed = Number(updateData.discountAmount);
      if (isNaN(parsed) || parsed < 0) {
        return next(
          new AppError("discountAmount must be a non-negative number", 400),
        );
      }
      const type = updateData.discountType ?? existingCustomer.discountType;
      if (type === "PERCENT" && parsed > 100) {
        return next(new AppError("Percent discount cannot exceed 100", 400));
      }
      updateData.discountAmount = parsed;
    }

    if (
      updateData.discountStartsAt !== undefined &&
      updateData.discountStartsAt !== null &&
      isNaN(new Date(updateData.discountStartsAt).getTime())
    ) {
      return next(new AppError("Invalid discountStartsAt date", 400));
    }
    if (
      updateData.discountEndsAt !== undefined &&
      updateData.discountEndsAt !== null &&
      isNaN(new Date(updateData.discountEndsAt).getTime())
    ) {
      return next(new AppError("Invalid discountEndsAt date", 400));
    }

    const resolvedStartsAt =
      updateData.discountStartsAt !== undefined
        ? updateData.discountStartsAt
        : existingCustomer.discountStartsAt;
    const resolvedEndsAt =
      updateData.discountEndsAt !== undefined
        ? updateData.discountEndsAt
        : existingCustomer.discountEndsAt;

    if (
      resolvedStartsAt &&
      resolvedEndsAt &&
      new Date(resolvedStartsAt) > new Date(resolvedEndsAt)
    ) {
      return next(
        new AppError("discountStartsAt must be before discountEndsAt", 400),
      );
    }

    if (
      updateData.discountStartTime !== undefined &&
      updateData.discountStartTime !== null &&
      !isValidTimeFormat(updateData.discountStartTime)
    ) {
      return next(
        new AppError("discountStartTime must be in HH:MM format", 400),
      );
    }
    if (
      updateData.discountEndTime !== undefined &&
      updateData.discountEndTime !== null &&
      !isValidTimeFormat(updateData.discountEndTime)
    ) {
      return next(new AppError("discountEndTime must be in HH:MM format", 400));
    }

    const resolvedStartTime =
      updateData.discountStartTime !== undefined
        ? updateData.discountStartTime
        : existingCustomer.discountStartTime;
    const resolvedEndTime =
      updateData.discountEndTime !== undefined
        ? updateData.discountEndTime
        : existingCustomer.discountEndTime;

    if (
      resolvedStartTime &&
      resolvedEndTime &&
      resolvedStartTime >= resolvedEndTime
    ) {
      return next(
        new AppError("discountStartTime must be before discountEndTime", 400),
      );
    }

    if (updateData.discountStartsAt)
      updateData.discountStartsAt = new Date(updateData.discountStartsAt);
    if (updateData.discountEndsAt)
      updateData.discountEndsAt = new Date(updateData.discountEndsAt);
    if (updateData.hasDiscount !== undefined)
      updateData.hasDiscount = Boolean(updateData.hasDiscount);

    if (updateData.phone && updateData.phone !== existingCustomer.phone) {
      const existingPhone = await prisma.customer.findUnique({
        where: {
          businessId_phone: {
            businessId: existingCustomer.businessId,
            phone: updateData.phone,
          },
        },
      });

      if (existingPhone) {
        return next(new AppError("Phone number already in use", 409));
      }
    }

    if (updateData.email && updateData.email !== existingCustomer.email) {
      const existingEmail = await prisma.customer.findUnique({
        where: {
          businessId_email: {
            businessId: existingCustomer.businessId,
            email: updateData.email,
          },
        },
      });

      if (existingEmail) {
        return next(new AppError("Email already in use", 409));
      }
    }

    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      data: formatCustomer(updatedCustomer),
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getCustomerAnalytics = async (req, res, next) => {
  try {
    const { customerId } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true },
    });
    if (!customer) return next(new AppError("Customer not found", 404));

    const [visitStats, orderStats, lastVisit] = await Promise.all([
      prisma.visit.aggregate({
        where: { customerId },
        _count: { id: true },
        _sum: { totalPrice: true },
      }),
      prisma.order.aggregate({
        where: { customerId, visitId: null, status: "COMPLETED" },
        _count: { id: true },
        _sum: { finalPrice: true },
      }),
      prisma.visit.findFirst({
        where: { customerId },
        orderBy: { startedAt: "desc" },
        select: { startedAt: true, status: true },
      }),
    ]);

    const visitRevenue = Number(visitStats._sum.totalPrice ?? 0);
    const orderRevenue = Number(orderStats._sum.finalPrice ?? 0);
    const visitCount = visitStats._count.id;

    res.status(200).json({
      success: true,
      data: {
        visitCount,
        takeawayOrderCount: orderStats._count.id,
        visitRevenue: Math.round(visitRevenue * 100) / 100,
        orderRevenue: Math.round(orderRevenue * 100) / 100,
        totalSpend: Math.round((visitRevenue + orderRevenue) * 100) / 100,
        averageSpendPerVisit:
          visitCount > 0 ? Math.round((visitRevenue / visitCount) * 100) / 100 : 0,
        lastVisitAt: lastVisit?.startedAt ?? null,
        lastVisitStatus: lastVisit?.status ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteCustomerById = async (req, res, next) => {
  try {
    const { customerId } = req.params;

    if (!customerId) {
      return next(new AppError("Customer ID is required", 400));
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return next(new AppError("Customer not found", 404));
    }

    await prisma.customer.delete({
      where: { id: customerId },
    });

    res.status(200).json({
      success: true,
      message: "Customer deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAllCustomers = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(new AppError(messages.FORBIDDEN.en, 403));
    }

    const deletedCustomers = await prisma.customer.deleteMany({});

    if (deletedCustomers.count === 0) {
      return next(new AppError("No customers to delete", 404));
    }

    res.status(200).json({
      success: true,
      message: "All customers deleted successfully",
      count: deletedCustomers.count,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteCustomersByBusinessId = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER" && req.user.roleName !== "OWNER") {
      return next(new AppError(messages.FORBIDDEN.en, 403));
    }
    const { businessId } = req.params;

    if (!businessId) {
      return next(new AppError("Business ID is required", 400));
    }
    const existingBusiness = await prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!existingBusiness) {
      return next(new AppError("Business not found", 404));
    }
    const deletedCustomers = await prisma.customer.deleteMany({
      where: { businessId },
    });

    if (deletedCustomers.count === 0) {
      return next(
        new AppError("No customers to delete for this business", 404),
      );
    }
    res.status(200).json({
      success: true,
      message: "Customers deleted successfully for the business",
      count: deletedCustomers.count,
    });
  } catch (error) {
    next(error);
  }
};

export const getCustomersHistoryByBranchId = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { page, limit, skip, sort, order } = pagination(req);
    const { search } = req.query;

    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }

    const branchExists = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branchExists) {
      return next(new AppError("Branch not found", 404));
    }

    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
      999,
    );

    // ── Base customer set from CustomerBranch (includes registered-not-visited) ─
    const allCustomerBranches = await prisma.customerBranch.findMany({
      where: { branchId },
      select: { customerId: true },
    });
    const allCustomerIds = allCustomerBranches.map((cb) => cb.customerId);

    // ── Search filter (applies to list only, not summary) ────────────────
    let filteredCustomerIds = allCustomerIds;
    if (search) {
      const matches = await prisma.customer.findMany({
        where: {
          id: { in: allCustomerIds },
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      filteredCustomerIds = matches.map((c) => c.id);
    }

    const total = filteredCustomerIds.length;

    if (total === 0) {
      return res.status(200).json({ success: true, summary: null, data: [] });
    }

    // ── Summary — always branch-wide, ignores search ──────────────────────
    const [
      totalCount,
      newThisMonth,
      newLastMonth,
      visitorsThisMonth,
      visitorsLastMonth,
      revenueThisMonth,
      revenueLastMonth,
    ] = await Promise.all([
      prisma.customerBranch.count({ where: { branchId } }),
      prisma.customerBranch.count({
        where: { branchId, registeredAt: { gte: startOfThisMonth } },
      }),
      prisma.customerBranch.count({
        where: {
          branchId,
          registeredAt: { gte: startOfLastMonth, lte: endOfLastMonth },
        },
      }),
      prisma.visit
        .findMany({
          where: { branchId, startedAt: { gte: startOfThisMonth } },
          select: { customerId: true },
          distinct: ["customerId"],
        })
        .then((r) => r.length),
      prisma.visit
        .findMany({
          where: {
            branchId,
            startedAt: { gte: startOfLastMonth, lte: endOfLastMonth },
          },
          select: { customerId: true },
          distinct: ["customerId"],
        })
        .then((r) => r.length),
      prisma.visit.aggregate({
        where: {
          branchId,
          startedAt: { gte: startOfThisMonth },
          status: "INVOICED",
        },
        _sum: { totalPrice: true },
      }),
      prisma.visit.aggregate({
        where: {
          branchId,
          startedAt: { gte: startOfLastMonth, lte: endOfLastMonth },
          status: "INVOICED",
        },
        _sum: { totalPrice: true },
      }),
    ]);

    const revThis = Number(revenueThisMonth._sum.totalPrice ?? 0);
    const revLast = Number(revenueLastMonth._sum.totalPrice ?? 0);
    const avgSpendThis =
      visitorsThisMonth > 0 ? revThis / visitorsThisMonth : 0;
    const avgSpendLast =
      visitorsLastMonth > 0 ? revLast / visitorsLastMonth : 0;

    const calcChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 1000) / 10;
    };
    const makeMetric = (value, changePercent) => ({
      value,
      changePercent,
      trend: changePercent >= 0 ? "positive" : "negative",
    });

    const summary = {
      totalCustomers: makeMetric(
        totalCount,
        calcChange(newThisMonth, newLastMonth),
      ),
      activeCustomers: makeMetric(
        visitorsThisMonth,
        calcChange(visitorsThisMonth, visitorsLastMonth),
      ),
      newThisMonth: makeMetric(
        newThisMonth,
        calcChange(newThisMonth, newLastMonth),
      ),
      totalRevenue: makeMetric(revThis, calcChange(revThis, revLast)),
      avgSpendPerCustomer: makeMetric(
        Math.round(avgSpendThis * 100) / 100,
        calcChange(avgSpendThis, avgSpendLast),
      ),
    };

    // ── Per-customer list ────────────────────────────────────────────────
    const buildCustomerRow = (customer, stats) => ({
      ...formatCustomer(customer),
      analytics: {
        totalVisits: stats?._count.id ?? 0,
        totalSpend: Number(stats?._sum.totalPrice ?? 0),
        lastActivity: stats?._max.startedAt ?? null,
        firstVisitAt: stats?._min.startedAt ?? null,
        avgDurationMinutes: stats?._avg.durationMinutes
          ? Math.round(stats._avg.durationMinutes)
          : null,
      },
    });

    let data;

    if (isComputedSort(sort)) {
      const [allCustomers, allVisitStats] = await prisma.$transaction([
        prisma.customer.findMany({
          where: { id: { in: filteredCustomerIds } },
        }),
        prisma.visit.groupBy({
          by: ["customerId"],
          where: { branchId, customerId: { in: filteredCustomerIds } },
          _count: { id: true },
          _sum: { totalPrice: true },
          _max: { startedAt: true },
          _min: { startedAt: true },
          _avg: { durationMinutes: true },
        }),
      ]);

      const statsMap = Object.fromEntries(
        allVisitStats.map((s) => [s.customerId, s]),
      );
      const merged = allCustomers.map((c) =>
        buildCustomerRow(c, statsMap[c.id]),
      );

      merged.sort((a, b) => {
        if (sort === "totalSpent") {
          return order === "asc"
            ? a.analytics.totalSpend - b.analytics.totalSpend
            : b.analytics.totalSpend - a.analytics.totalSpend;
        }
        const aVal = a.analytics.lastActivity
          ? new Date(a.analytics.lastActivity).getTime()
          : 0;
        const bVal = b.analytics.lastActivity
          ? new Date(b.analytics.lastActivity).getTime()
          : 0;
        return order === "asc" ? aVal - bVal : bVal - aVal;
      });

      data = merged.slice(skip, skip + limit);
    } else {
      const customers = await prisma.customer.findMany({
        where: { id: { in: filteredCustomerIds } },
        orderBy: { [sort]: order },
        skip,
        take: limit,
      });

      const paginatedIds = customers.map((c) => c.id);
      const visitStats = await prisma.visit.groupBy({
        by: ["customerId"],
        where: { branchId, customerId: { in: paginatedIds } },
        _count: { id: true },
        _sum: { totalPrice: true },
        _max: { startedAt: true },
        _min: { startedAt: true },
        _avg: { durationMinutes: true },
      });

      const statsMap = Object.fromEntries(
        visitStats.map((s) => [s.customerId, s]),
      );
      data = customers.map((c) => buildCustomerRow(c, statsMap[c.id]));
    }

    res.status(200).json({
      success: true,
      summary,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        sort,
        order,
      },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getBranchMonthlyStats = async (req, res, next) => {
  try {
    const { branchId } = req.params;

    if (!branchId) {
      return next(new AppError("Branch ID is required", 400));
    }

    const branchExists = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branchExists) {
      return next(new AppError("Branch not found", 404));
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const startOfThisMonth = new Date(currentYear, now.getMonth(), 1);
    const endOfLastMonth = new Date(
      currentYear,
      now.getMonth(),
      0,
      23,
      59,
      59,
      999,
    );
    const startOfLastMonth = new Date(currentYear, now.getMonth() - 1, 1);

    // Historical months from DB + current month computed live — both in parallel
    const [
      historical,
      newThisMonth,
      newLastMonth,
      activeCustomersResult,
      revenueResult,
    ] = await Promise.all([
      prisma.branchMonthlyStats.findMany({
        where: { branchId },
        orderBy: [{ year: "asc" }, { month: "asc" }],
      }),
      prisma.customerBranch.count({
        where: { branchId, registeredAt: { gte: startOfThisMonth } },
      }),
      prisma.customerBranch.count({
        where: {
          branchId,
          registeredAt: { gte: startOfLastMonth, lte: endOfLastMonth },
        },
      }),
      prisma.visit.findMany({
        where: { branchId, startedAt: { gte: startOfThisMonth } },
        select: { customerId: true },
        distinct: ["customerId"],
      }),
      prisma.visit.aggregate({
        where: {
          branchId,
          startedAt: { gte: startOfThisMonth },
          status: "INVOICED",
        },
        _sum: { totalPrice: true },
      }),
    ]);

    const activeCustomers = activeCustomersResult.length;
    const totalRevenue = Number(revenueResult._sum.totalPrice ?? 0);
    const avgSpendPerCustomer =
      activeCustomers > 0
        ? Math.round((totalRevenue / activeCustomers) * 100) / 100
        : 0;

    const currentMonthEntry = {
      month: currentMonth,
      year: currentYear,
      newCustomers: newThisMonth,
      activeCustomers,
      totalRevenue,
      avgSpendPerCustomer,
      isLive: true,
    };

    // Remove current month from historical if it was already snapshotted mid-month
    const filteredHistorical = historical
      .filter((r) => !(r.month === currentMonth && r.year === currentYear))
      .map((r) => ({
        month: r.month,
        year: r.year,
        newCustomers: r.newCustomers,
        activeCustomers: r.activeCustomers,
        totalRevenue: Number(r.totalRevenue),
        avgSpendPerCustomer: Number(r.avgSpendPerCustomer),
        isLive: false,
      }));

    // Previous month comparison for each metric trend
    const lastMonthStored = historical.find(
      (r) =>
        r.month === (currentMonth === 1 ? 12 : currentMonth - 1) &&
        r.year === (currentMonth === 1 ? currentYear - 1 : currentYear),
    );

    const calcChange = (current, previous) => {
      if (!previous || previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 1000) / 10;
    };

    const makeTrend = (current, previous) => {
      const changePercent = calcChange(current, previous);
      return {
        changePercent,
        trend: changePercent >= 0 ? "positive" : "negative",
      };
    };

    const trends = {
      newCustomers: makeTrend(newThisMonth, newLastMonth),
      activeCustomers: makeTrend(
        activeCustomers,
        Number(lastMonthStored?.activeCustomers ?? 0),
      ),
      totalRevenue: makeTrend(
        totalRevenue,
        Number(lastMonthStored?.totalRevenue ?? 0),
      ),
      avgSpendPerCustomer: makeTrend(
        avgSpendPerCustomer,
        Number(lastMonthStored?.avgSpendPerCustomer ?? 0),
      ),
    };

    res.status(200).json({
      success: true,
      currentMonth: currentMonthEntry,
      trends,
      history: [...filteredHistorical, currentMonthEntry],
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const blockCustomer = async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const { reason } = req.body;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, isBlocked: true },
    });

    if (!customer) return next(new AppError("Customer not found", 404));
    if (customer.isBlocked)
      return next(new AppError("Customer is already blocked", 400));

    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: { isBlocked: true, blockedReason: reason || null },
    });

    res.status(200).json({ success: true, data: formatCustomer(updated) });
  } catch (error) {
    next(error);
  }
};

export const unblockCustomer = async (req, res, next) => {
  try {
    const { customerId } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, isBlocked: true },
    });

    if (!customer) return next(new AppError("Customer not found", 404));
    if (!customer.isBlocked)
      return next(new AppError("Customer is not blocked", 400));

    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: { isBlocked: false, blockedReason: null },
    });

    res.status(200).json({ success: true, data: formatCustomer(updated) });
  } catch (error) {
    next(error);
  }
};
