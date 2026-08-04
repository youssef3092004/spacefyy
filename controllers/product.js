import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { validatePrice } from "../utils/validation.js";
import cloudinary from "../configs/cloud.js";
import { invalidateCacheByPattern } from "../utils/cacheInvalidation.js";

// ─── Private Helpers ──────────────────────────────────────────────────────────

const formatProduct = ({ alertIsActivated, alertValue, stock, ...rest }) => ({
  ...rest,
  stock,
  Alert: {
    isActivated: alertIsActivated,
    value: alertValue,
    Alert: alertIsActivated && stock <= alertValue,
  },
});

const SORT_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "name",
  "price",
  "stock",
]);

const parsePagination = (req) => {
  const sort = req.query.sort || "createdAt";
  const order = (req.query.order || "desc").toLowerCase();

  if (!SORT_FIELDS.has(sort)) {
    throw new AppError(
      `Invalid sort field. Allowed: ${[...SORT_FIELDS].join(", ")}`,
      400,
    );
  }
  if (order !== "asc" && order !== "desc") {
    throw new AppError("order must be 'asc' or 'desc'", 400);
  }

  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Number(req.query.limit) || 10, 100);

  return { page, limit, skip: (page - 1) * limit, sort, order };
};

const ensureCategoryExists = async (categoryId) => {
  const category = await prisma.categoryProduct.findUnique({
    where: { id: categoryId },
    select: { id: true, name: true },
  });
  if (!category) throw new AppError("Category not found", 404);
  return category;
};

const ensureProductExists = async (
  productId,
  select = { id: true, branchId: true },
) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select,
  });
  if (!product) throw new AppError("Product not found", 404);
  return product;
};

const uploadImage = (buffer) =>
  new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        { folder: "spacefyy/products", resource_type: "image" },
        (err, result) => {
          if (err) reject(new AppError("Image upload failed", 500));
          else resolve(result.secure_url);
        },
      )
      .end(buffer);
  });

const invalidateProductCaches = async () => {
  await Promise.all([
    invalidateCacheByPattern("products:*"),
    invalidateCacheByPattern("product:*"),
  ]);
};

// Handles boolean values from both JSON bodies (boolean) and multipart forms (string)
const parseBoolean = (val) => {
  if (typeof val === "boolean") return val;
  if (val === "true" || val === "1") return true;
  if (val === "false" || val === "0") return false;
  return undefined;
};

const buildWhereClause = (branchId, query = {}) => {
  const { isActive, categoryId, minPrice, maxPrice, search } = query;
  const where = { branchId };

  const active = parseBoolean(isActive);
  if (active !== undefined) where.isActive = active;
  if (categoryId) where.categoryId = categoryId;

  if (search?.trim()) {
    const term = search.trim();
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
      { sku: { contains: term, mode: "insensitive" } },
    ];
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    where.price = {};
    const min = Number(minPrice);
    const max = Number(maxPrice);
    if (minPrice !== undefined && !isNaN(min)) where.price.gte = min;
    if (maxPrice !== undefined && !isNaN(max)) where.price.lte = max;
  }

  return where;
};

// ─── Analytics Helpers ────────────────────────────────────────────────────────

const calcChange = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
};

const makeMetric = (value, changePercent) => ({
  value,
  changePercent,
  trend: changePercent >= 0 ? "positive" : "negative",
});

const buildProductSummary = async (branchId) => {
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

  const [
    totalProducts,
    newThisMonth,
    newLastMonth,
    revenueThisMonth,
    revenueLastMonth,
    soldThisMonth,
    soldLastMonth,
    lowStockProducts,
  ] = await Promise.all([
    prisma.product.count({ where: { branchId } }),
    prisma.product.count({
      where: { branchId, createdAt: { gte: startOfThisMonth } },
    }),
    prisma.product.count({
      where: {
        branchId,
        createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
      },
    }),
    prisma.orderItem.aggregate({
      where: { order: { branchId, createdAt: { gte: startOfThisMonth } } },
      _sum: { totalPrice: true },
    }),
    prisma.orderItem.aggregate({
      where: {
        order: {
          branchId,
          createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
        },
      },
      _sum: { totalPrice: true },
    }),
    prisma.orderItem
      .findMany({
        where: { order: { branchId, createdAt: { gte: startOfThisMonth } } },
        select: { productId: true },
        distinct: ["productId"],
      })
      .then((r) => r.length),
    prisma.orderItem
      .findMany({
        where: {
          order: {
            branchId,
            createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
          },
        },
        select: { productId: true },
        distinct: ["productId"],
      })
      .then((r) => r.length),
    prisma.product
      .findMany({
        where: { branchId, alertIsActivated: true },
        select: { stock: true, alertValue: true },
      })
      .then(
        (products) => products.filter((p) => p.stock <= p.alertValue).length,
      ),
  ]);

  const revThis = Number(revenueThisMonth._sum.totalPrice ?? 0);
  const revLast = Number(revenueLastMonth._sum.totalPrice ?? 0);
  const avgThis = soldThisMonth > 0 ? revThis / soldThisMonth : 0;
  const avgLast = soldLastMonth > 0 ? revLast / soldLastMonth : 0;

  return {
    totalProducts: makeMetric(
      totalProducts,
      calcChange(newThisMonth, newLastMonth),
    ),
    newThisMonth: makeMetric(
      newThisMonth,
      calcChange(newThisMonth, newLastMonth),
    ),
    totalRevenue: makeMetric(
      Math.round(revThis * 100) / 100,
      calcChange(revThis, revLast),
    ),
    avgRevenuePerProduct: makeMetric(
      Math.round(avgThis * 100) / 100,
      calcChange(avgThis, avgLast),
    ),
    lowStockAlerts: lowStockProducts,
  };
};

const buildAnalyticsMap = async (productIds) => {
  if (!productIds.length) return {};

  const stats = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds } },
    _count: { id: true },
    _sum: { quantity: true, totalPrice: true },
    _max: { createdAt: true },
    _min: { createdAt: true },
    _avg: { quantity: true },
  });

  return Object.fromEntries(
    stats.map((s) => [
      s.productId,
      {
        totalOrders: s._count.id,
        totalQuantitySold: s._sum.quantity ?? 0,
        totalRevenue: Math.round(Number(s._sum.totalPrice ?? 0) * 100) / 100,
        lastOrderAt: s._max.createdAt,
        firstOrderAt: s._min.createdAt,
        avgQuantityPerOrder: s._avg.quantity
          ? Math.round(s._avg.quantity * 10) / 10
          : 0,
      },
    ]),
  );
};

const emptyAnalytics = () => ({
  totalOrders: 0,
  totalQuantitySold: 0,
  totalRevenue: 0,
  lastOrderAt: null,
  firstOrderAt: null,
  avgQuantityPerOrder: 0,
});

// ─── Controllers ──────────────────────────────────────────────────────────────

export const createProduct = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const {
      name,
      price,
      categoryId,
      description,
      sku,
      stock,
      isActive,
      alertIsActivated,
      alertValue,
    } = req.body;

    if (!name || !price || !categoryId) {
      return next(
        new AppError("name, price, and categoryId are required", 400),
      );
    }

    const productName = String(name).trim();
    if (productName.length < 2) {
      return next(new AppError("Name must be at least 2 characters", 400));
    }

    const parsedPrice = validatePrice(price);

    const parsedStock = stock !== undefined ? Number(stock) : 0;
    if (!Number.isInteger(parsedStock) || parsedStock < 0) {
      return next(new AppError("Stock must be a non-negative integer", 400));
    }

    await ensureCategoryExists(categoryId);

    let imageUrl = null;
    if (req.file?.buffer) {
      imageUrl = await uploadImage(req.file.buffer);
    }

    const activeValue = parseBoolean(isActive);

    const parsedAlertValue = alertValue !== undefined ? Number(alertValue) : 0;
    if (!Number.isInteger(parsedAlertValue) || parsedAlertValue < 0) {
      return next(
        new AppError("alertValue must be a non-negative integer", 400),
      );
    }
    const parsedAlertIsActivated =
      alertIsActivated !== undefined
        ? (parseBoolean(alertIsActivated) ?? false)
        : false;

    const product = await prisma.product.create({
      data: {
        name: productName,
        price: parsedPrice,
        categoryId,
        branchId,
        description: description ? String(description).trim() : null,
        sku: sku ? String(sku).trim() : null,
        stock: parsedStock,
        image: imageUrl,
        isActive: activeValue !== undefined ? activeValue : true,
        alertIsActivated: parsedAlertIsActivated,
        alertValue: parsedAlertValue,
      },
      include: {
        category: { select: { id: true, name: true } },
      },
    });

    await invalidateProductCaches();

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: formatProduct(product),
    });
  } catch (error) {
    if (error.code === "P2002") {
      return next(
        new AppError(
          "A product with this SKU already exists in this branch",
          409,
        ),
      );
    }
    if (error.code === "P2003") {
      return next(new AppError("Invalid categoryId or branchId", 400));
    }
    next(error);
  }
};

export const getProductById = async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.productId },
      include: {
        category: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
    });
    if (!product) return next(new AppError("Product not found", 404));

    const analyticsMap = await buildAnalyticsMap([product.id]);

    return res.status(200).json({
      success: true,
      data: {
        ...formatProduct(product),
        analytics: analyticsMap[product.id] ?? emptyAnalytics(),
      },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getAllProducts = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { page, limit, skip, sort, order } = parsePagination(req);
    const where = buildWhereClause(branchId, req.query);

    const [[products, total], summary] = await Promise.all([
      Promise.all([
        prisma.product.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sort]: order },
          include: { category: { select: { id: true, name: true } } },
        }),
        prisma.product.count({ where }),
      ]),
      buildProductSummary(branchId),
    ]);

    const analyticsMap = await buildAnalyticsMap(products.map((p) => p.id));

    return res.status(200).json({
      success: true,
      summary,
      data: products.map((p) => ({
        ...formatProduct(p),
        analytics: analyticsMap[p.id] ?? emptyAnalytics(),
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const getProductsByCategory = async (req, res, next) => {
  try {
    const { branchId, categoryId } = req.params;
    const { page, limit, skip, sort, order } = parsePagination(req);

    const category = await ensureCategoryExists(categoryId);
    const where = buildWhereClause(branchId, { ...req.query, categoryId });

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort]: order },
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          stock: true,
          image: true,
          sku: true,
          isActive: true,
          alertIsActivated: true,
          alertValue: true,
          createdAt: true,
        },
      }),
      prisma.product.count({ where }),
    ]);

    const analyticsMap = await buildAnalyticsMap(products.map((p) => p.id));

    return res.status(200).json({
      success: true,
      data: {
        category: { id: category.id, name: category.name },
        products: products.map((p) => ({
          ...formatProduct(p),
          analytics: analyticsMap[p.id] ?? emptyAnalytics(),
        })),
      },
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const searchProducts = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { search, limit: rawLimit = 15, isActive } = req.query;

    const searchTerm = search?.trim();
    if (!searchTerm || searchTerm.length < 2) {
      return next(
        new AppError("Search query must be at least 2 characters", 400),
      );
    }

    const limit = Math.min(Math.max(parseInt(rawLimit) || 15, 1), 50);
    const active = parseBoolean(isActive);

    const products = await prisma.product.findMany({
      where: {
        branchId,
        isActive: active !== undefined ? active : true,
        OR: [
          { name: { contains: searchTerm, mode: "insensitive" } },
          { description: { contains: searchTerm, mode: "insensitive" } },
          { sku: { contains: searchTerm, mode: "insensitive" } },
        ],
      },
      take: limit,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        image: true,
        sku: true,
        alertIsActivated: true,
        alertValue: true,
        category: { select: { id: true, name: true } },
      },
    });

    const analyticsMap = await buildAnalyticsMap(products.map((p) => p.id));

    return res.status(200).json({
      success: true,
      data: products.map((p) => ({
        ...formatProduct(p),
        analytics: analyticsMap[p.id] ?? emptyAnalytics(),
      })),
      count: products.length,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

export const updateProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const ALLOWED = new Set([
      "name",
      "description",
      "price",
      "categoryId",
      "sku",
      "stock",
      "isActive",
      "alertIsActivated",
      "alertValue",
    ]);

    const unknown = Object.keys(req.body).filter((k) => !ALLOWED.has(k));
    if (unknown.length) {
      return next(new AppError(`Unknown fields: ${unknown.join(", ")}`, 400));
    }

    const updateData = {};

    if (req.body.name !== undefined) {
      const n = String(req.body.name).trim();
      if (n.length < 2) {
        return next(new AppError("Name must be at least 2 characters", 400));
      }
      updateData.name = n;
    }

    if (req.body.description !== undefined) {
      updateData.description = String(req.body.description).trim() || null;
    }

    if (req.body.price !== undefined) {
      updateData.price = validatePrice(req.body.price);
    }

    if (req.body.stock !== undefined) {
      const s = Number(req.body.stock);
      if (!Number.isInteger(s) || s < 0) {
        return next(new AppError("Stock must be a non-negative integer", 400));
      }
      updateData.stock = s;
    }

    if (req.body.sku !== undefined) {
      updateData.sku = String(req.body.sku).trim() || null;
    }

    if (req.body.categoryId !== undefined) {
      await ensureCategoryExists(req.body.categoryId);
      updateData.categoryId = req.body.categoryId;
    }

    if (req.body.isActive !== undefined) {
      const active = parseBoolean(req.body.isActive);
      if (active === undefined) {
        return next(new AppError("isActive must be a boolean", 400));
      }
      updateData.isActive = active;
    }

    if (req.body.alertIsActivated !== undefined) {
      const val = parseBoolean(req.body.alertIsActivated);
      if (val === undefined) {
        return next(new AppError("alertIsActivated must be a boolean", 400));
      }
      updateData.alertIsActivated = val;
    }

    if (req.body.alertValue !== undefined) {
      const val = Number(req.body.alertValue);
      if (!Number.isInteger(val) || val < 0) {
        return next(
          new AppError("alertValue must be a non-negative integer", 400),
        );
      }
      updateData.alertValue = val;
    }

    if (req.file?.buffer) {
      updateData.image = await uploadImage(req.file.buffer);
    }

    if (Object.keys(updateData).length === 0) {
      return next(new AppError("No valid fields to update", 400));
    }

    await ensureProductExists(productId);

    const product = await prisma.product.update({
      where: { id: productId },
      data: updateData,
      include: {
        category: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    await invalidateProductCaches();

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: formatProduct(product),
    });
  } catch (error) {
    if (error.code === "P2002") {
      return next(
        new AppError(
          "A product with this SKU already exists in this branch",
          409,
        ),
      );
    }
    if (error.code === "P2025") {
      return next(new AppError("Product not found", 404));
    }
    next(error);
  }
};

export const toggleProductStatus = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const product = await ensureProductExists(productId, {
      id: true,
      isActive: true,
    });

    const updated = await prisma.product.update({
      where: { id: productId },
      data: { isActive: !product.isActive },
      select: { id: true, name: true, isActive: true, updatedAt: true },
    });

    await invalidateProductCaches();

    const label = updated.isActive ? "activated" : "deactivated";
    return res.status(200).json({
      success: true,
      message: `Product ${label} successfully`,
      data: updated,
    });
  } catch (error) {
    if (error.code === "P2025")
      return next(new AppError("Product not found", 404));
    next(error);
  }
};

export const adjustStock = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { operation, amount } = req.body;

    const VALID_OPS = new Set(["add", "subtract", "set"]);
    if (!operation || !VALID_OPS.has(operation)) {
      return next(
        new AppError("operation must be 'add', 'subtract', or 'set'", 400),
      );
    }
    if (amount === undefined || amount === null) {
      return next(new AppError("amount is required", 400));
    }

    const parsedAmount = Number(amount);
    if (!Number.isInteger(parsedAmount) || parsedAmount < 0) {
      return next(new AppError("amount must be a non-negative integer", 400));
    }

    // Existence check only — the new stock is derived by the database below,
    // never from a value read here.
    await ensureProductExists(productId, { id: true });

    const stockSelect = {
      id: true,
      name: true,
      stock: true,
      alertIsActivated: true,
      alertValue: true,
      updatedAt: true,
    };

    // add/subtract are relative, so they must be atomic. Reading the stock and
    // writing back an absolute total lost updates: two restocks of 5 landing
    // together both read 10 and both wrote 15, so one delivery vanished. The
    // same read-then-write also raced against an order's own decrement.
    let updated;
    if (operation === "set") {
      updated = await prisma.product.update({
        where: { id: productId },
        data: { stock: parsedAmount },
        select: stockSelect,
      });
    } else if (operation === "add") {
      updated = await prisma.product.update({
        where: { id: productId },
        data: { stock: { increment: parsedAmount } },
        select: stockSelect,
      });
    } else {
      // Guarded so a concurrent order cannot let this drive stock negative.
      const { count } = await prisma.product.updateMany({
        where: { id: productId, stock: { gte: parsedAmount } },
        data: { stock: { decrement: parsedAmount } },
      });

      if (count === 0) {
        const current = await prisma.product.findUnique({
          where: { id: productId },
          select: { stock: true },
        });
        return next(
          new AppError(
            `Insufficient stock. Current: ${current?.stock ?? 0}, Requested: ${parsedAmount}`,
            409,
          ),
        );
      }

      updated = await prisma.product.findUnique({
        where: { id: productId },
        select: stockSelect,
      });
    }

    await invalidateProductCaches();

    return res.status(200).json({
      success: true,
      message: "Stock updated successfully",
      data: formatProduct(updated),
    });
  } catch (error) {
    if (error.code === "P2025")
      return next(new AppError("Product not found", 404));
    next(error);
  }
};

export const deleteProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;

    const orderCount = await prisma.orderItem.count({ where: { productId } });
    if (orderCount > 0) {
      return next(
        new AppError(
          "Cannot delete a product with order history. Deactivate it instead.",
          409,
        ),
      );
    }

    await prisma.product.delete({ where: { id: productId } });
    await invalidateProductCaches();
    return res.status(204).send();
  } catch (error) {
    if (error.code === "P2025")
      return next(new AppError("Product not found", 404));
    next(error);
  }
};
