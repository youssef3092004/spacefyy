import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";
import { validatePrice } from "../utils/validation.js";

const ensureCategoryExisting = async (categoryId) => {
  const category = await prisma.categoryProduct.findUnique({
    where: { id: categoryId },
    select: { id: true, name: true },
  });
  if (!category) throw new AppError("Category not found", 404);
  return category;
};

const ensureBranchExisting = async (branchId) => {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true },
  });
  if (!branch) throw new AppError("Branch not found", 404);
  return branch;
};

const ensureProductExisting = async (
  productId,
  { includeCategory = false } = {},
) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    ...(includeCategory
      ? { include: { category: { select: { id: true, name: true } } } }
      : { select: { id: true } }),
  });

  if (!product) throw new AppError("Product not found", 404);
  return product;
};

export const createProduct = async (req, res, next) => {
  try {
    let { name, price, categoryId, quantity, isActive } = req.body;
    const { branchId } = req.params;

    const requiredFields = { name, price, categoryId, quantity, branchId };

    for (const [key, value] of Object.entries(requiredFields)) {
      if (value === undefined || value === null) {
        return next(new AppError(`${key} is required`, 400));
      }
    }

    const productName = String(name).trim();
    const parsedPrice = Number(price);
    const parsedQuantity = Number(quantity);

    if (productName.length === 0) {
      return next(new AppError("Name cannot be empty", 400));
    }

    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      return next(new AppError("Invalid price", 400));
    }

    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 0) {
      return next(new AppError("Invalid quantity", 400));
    }

    const product = await prisma.product.create({
      data: {
        name: productName,
        price: parsedPrice,
        categoryId,
        branchId,
        quantity: parsedQuantity,
        isActive: isActive ?? true,
      },
      include: {
        category: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Product Created Successfully",
      data: product,
    });
  } catch (error) {
    if (error.code === "P2002") {
      return next(
        new AppError(
          "Product with this name already exists in this branch",
          400,
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
    const { productId } = req.params;

    if (!productId) return next(new AppError("Product Id is Required", 400));

    const product = await ensureProductExisting(productId, {
      includeCategory: true,
    });

    return res.status(200).json({
      success: true,
      data: product,
      source: "Database",
    });
  } catch (error) {
    next(error);
  }
};

export const getAllProducts = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { page, limit, skip, sort, order } = pagination(req);
    const { isActive } = req.query;

    if (!branchId) return next(new AppError("Branch Id is Required", 400));

    const whereClause = {
      branchId,
      ...(isActive !== undefined && { isActive: isActive === "true" }),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: whereClause,
        skip,
        take: limit,
        include: { category: { select: { id: true, name: true } } },
        orderBy: { [sort]: order },
      }),
      prisma.product.count({ where: whereClause }),
    ]);

    return res.status(200).json({
      success: true,
      data: products,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      source: "Database",
    });
  } catch (error) {
    next(error);
  }
};

export const getProductsByCategory = async (req, res, next) => {
  try {
    const { branchId, categoryId } = req.params;
    const { page, limit, skip, sort, order } = pagination(req);

    if (!branchId) return next(new AppError("Branch Id is Required", 400));
    if (!categoryId) return next(new AppError("Category Id is Required", 400));

    const [, category] = await Promise.all([
      ensureBranchExisting(branchId),
      ensureCategoryExisting(categoryId),
    ]);

    const whereClause = {
      branchId,
      categoryId,
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: whereClause,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          price: true,
          quantity: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { [sort]: order },
      }),
      prisma.product.count({ where: whereClause }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        category: {
          id: category.id,
          name: category.name,
        },
        products,
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      source: "Database",
    });
  } catch (error) {
    next(error);
  }
};

export const searchProducts = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { search, limit = 10 } = req.query;

    if (!branchId) return next(new AppError("Branch Id is Required", 400));
    if (!search || search.length < 2)
      return next(
        new AppError("Search query must be at least 2 characters", 400),
      );

    const products = await prisma.product.findMany({
      where: {
        branchId,
        name: { contains: search, mode: "insensitive" },
      },
      orderBy: { name: "asc" },
      take: parseInt(limit),
      select: {
        id: true,
        name: true,
        price: true,
        quantity: true,
        category: { select: { id: true, name: true } },
      },
    });

    return res.status(200).json({
      success: true,
      data: products,
      count: products.length,
      source: "Database",
    });
  } catch (error) {
    next(error);
  }
};

export const updateProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;

    if (!productId) return next(new AppError("Product Id is Required", 400));

    const allowedFields = [
      "name",
      "price",
      "categoryId",
      "quantity",
      "isActive",
    ];
    const updateData = { ...(req.body || {}) };

    const invalidKeys = Object.keys(updateData).filter(
      (key) => !allowedFields.includes(key),
    );
    if (invalidKeys.length > 0) {
      return next(
        new AppError(
          `Invalid fields: ${invalidKeys.join(", ")}. Allowed fields are: ${allowedFields.join(", ")}`,
          400,
        ),
      );
    }

    if (Object.keys(updateData).length === 0) {
      return next(new AppError("No valid fields to update", 400));
    }

    await ensureProductExisting(productId);

    if (updateData.categoryId) {
      await ensureCategoryExisting(updateData.categoryId);
    }

    if (updateData.price !== undefined) {
      validatePrice(updateData.price);
    }

    if (updateData.quantity !== undefined && updateData.quantity < 0) {
      return next(new AppError("Quantity cannot be negative", 400));
    }

    if (updateData.name !== undefined) {
      const normalizedName = String(updateData.name).trim();
      if (!normalizedName) {
        return next(new AppError("Name cannot be empty", 400));
      }
      updateData.name = normalizedName;
    }

    const product = await prisma.product.update({
      where: { id: productId },
      data: updateData,
      include: { category: true, branch: true },
    });

    return res.status(200).json({
      success: true,
      message: "Product Updated Successfully",
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;

    if (!productId) return next(new AppError("Product Id is Required", 400));

    // const activeOrders = await prisma.orderItem.count({
    //   where: { productId },
    // });

    // if (activeOrders > 0) {
    //   return next(
    //     new AppError(
    //       "Cannot delete product with existing orders. Mark as inactive instead.",
    //       400,
    //     ),
    //   );
    // }

    await prisma.product.delete({
      where: { id: productId },
    });

    return res.status(204).send();
  } catch (error) {
    if (error.code === "P2025") {
      return next(new AppError("Product not found", 404));
    }
    next(error);
  }
};
