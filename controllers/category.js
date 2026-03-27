import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";
import { pagination } from "../utils/pagination.js";

const ensureCategoryExisting = async (categoryId) => {
  const category = await prisma.categoryProduct.findUnique({
    where: { id: categoryId },
    include: { products: { select: { id: true } } },
  });
  if (!category) throw new AppError("Category not found", 404);
  return category;
};

export const createCategory = async (req, res, next) => {
  try {
    const { name } = req.body;

    if (!name) return next(new AppError("Category Name is Required", 400));
    if (name.trim().length < 2) {
      return next(
        new AppError("Category name must be at least 2 characters", 400),
      );
    }

    const existingCategory = await prisma.categoryProduct.findUnique({
      where: { name },
    });

    if (existingCategory) {
      return next(new AppError("Category with this name already exists", 409));
    }

    const category = await prisma.categoryProduct.create({
      data: {
        name: name.trim(),
      },
    });

    return res.status(201).json({
      success: true,
      message: "Category Created Successfully",
      data: category,
    });
  } catch (error) {
    next(error);
  }
};

export const getCategoryById = async (req, res, next) => {
  try {
    const { categoryId } = req.params;

    if (!categoryId) return next(new AppError("Category Id is Required", 400));

    const category = await ensureCategoryExisting(categoryId);

    return res.status(200).json({
      success: true,
      data: category,
      source: "Database",
    });
  } catch (error) {
    next(error);
  }
};

export const getAllCategories = async (req, res, next) => {
  try {
    const { page, limit, skip, sort, order } = pagination(req);

    const [categories, total] = await Promise.all([
      prisma.categoryProduct.findMany({
        skip,
        take: limit,
        include: { _count: { select: { products: true } } },
        orderBy: { [sort]: order },
      }),
      prisma.categoryProduct.count(),
    ]);

    return res.status(200).json({
      success: true,
      data: categories,
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

export const updateCategory = async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    const { name } = req.body;

    if (!categoryId) return next(new AppError("Category Id is Required", 400));
    if (!name || name.trim().length < 2) {
      return next(
        new AppError("Category name must be at least 2 characters", 400),
      );
    }

    await ensureCategoryExisting(categoryId);

    // Check if new name already exists (excluding current category)
    const existingCategory = await prisma.categoryProduct.findUnique({
      where: { name: name.trim() },
    });

    if (existingCategory && existingCategory.id !== categoryId) {
      return next(new AppError("Category with this name already exists", 409));
    }

    const category = await prisma.categoryProduct.update({
      where: { id: categoryId },
      data: {
        name: name.trim(),
      },
      include: { _count: { select: { products: true } } },
    });

    return res.status(200).json({
      success: true,
      message: "Category Updated Successfully",
      data: category,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteCategory = async (req, res, next) => {
  try {
    const { categoryId } = req.params;

    if (!categoryId) return next(new AppError("Category Id is Required", 400));

    const category = await ensureCategoryExisting(categoryId);

    // Check if category has products
    if (category.products.length > 0) {
      return next(
        new AppError(
          `Cannot delete category with ${category.products.length} product(s). Move products to another category first.`,
          400,
        ),
      );
    }

    await prisma.categoryProduct.delete({
      where: { id: categoryId },
    });

    return res.status(200).json({
      success: true,
      message: "Category Deleted Successfully",
    });
  } catch (error) {
    next(error);
  }
};
