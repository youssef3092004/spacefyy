import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { pagination, isComputedSort } from "../utils/pagination.js";
import {
  isValidName,
  isValidEmail,
  isValidPhone,
} from "../utils/validation.js";
import { messages } from "../locales/message.js";

const VALID_TAGS = ["VIP", "Regular", "Blacklisted", "New", "Loyal"];

const createCustomerWithScopedSequence = async ({
  businessId,
  name,
  phone,
  email,
  password,
  tags,
  notes,
  birthday,
  discountType = "FLAT",
  discountAmount = 0,
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
            discountType,
            discountAmount,
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
      discountType = "FLAT",
      discountAmount = 0,
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
      return next(new AppError("discountAmount must be a non-negative number", 400));
    }
    if (discountType === "PERCENT" && parsedDiscount > 100) {
      return next(new AppError("Percent discount cannot exceed 100", 400));
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
      discountType,
      discountAmount: parsedDiscount,
    });

    if (branchId) {
      await prisma.customerBranch.create({
        data: { customerId: customer.id, branchId },
      });
    }

    res.status(201).json({
      success: true,
      data: customer,
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
        visits: {
          orderBy: { startedAt: "desc" },
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
                resourceType: true,
                resourceId: true,
                priceType: true,
                totalPrice: true,
                startedAt: true,
                endedAt: true,
                durationMinutes: true,
                status: true,
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
        },
        orders: {
          where: { visitId: null },
          orderBy: { createdAt: "desc" },
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
        },
      },
    });

    if (!customer) {
      return next(new AppError("Customer not found", 404));
    }

    const visits = customer.visits ?? [];
    const durations = visits
      .map((v) => v.durationMinutes)
      .filter((d) => d != null);

    const analytics = {
      totalVisits: visits.length,
      totalSpend: visits.reduce((sum, v) => sum + Number(v.totalPrice ?? 0), 0),
      lastActivity:
        visits.length > 0
          ? visits.reduce((latest, v) =>
              new Date(v.startedAt) > new Date(latest.startedAt) ? v : latest,
            ).startedAt
          : null,
      firstVisitAt:
        visits.length > 0
          ? visits.reduce((earliest, v) =>
              new Date(v.startedAt) < new Date(earliest.startedAt) ? v : earliest,
            ).startedAt
          : null,
      avgDurationMinutes:
        durations.length > 0
          ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
          : null,
    };

    res.status(200).json({
      success: true,
      data: { ...customer, analytics },
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
      data: customers,
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
      data: customers,
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
      "discountType",
      "discountAmount",
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
        return next(new AppError("discountAmount must be a non-negative number", 400));
      }
      const type = updateData.discountType ?? existingCustomer.discountType;
      if (type === "PERCENT" && parsed > 100) {
        return next(new AppError("Percent discount cannot exceed 100", 400));
      }
      updateData.discountAmount = parsed;
    }

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
      data: updatedCustomer,
      source: "database",
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
          status: { in: ["INVOICED", "PAID"] },
        },
        _sum: { totalPrice: true },
      }),
      prisma.visit.aggregate({
        where: {
          branchId,
          startedAt: { gte: startOfLastMonth, lte: endOfLastMonth },
          status: { in: ["INVOICED", "PAID"] },
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
      ...customer,
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
          status: { in: ["INVOICED", "PAID"] },
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

    res.status(200).json({ success: true, data: updated });
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

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};
