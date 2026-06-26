import { prisma } from "../configs/db.js";
import { AppError } from "../utils/appError.js";

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
    const branchId = req.branchId;
    const { name } = req.body;

    if (!name) return next(new AppError("Category Name is Required", 400));
    if (name.trim().length < 2) {
      return next(new AppError("Category name must be at least 2 characters", 400));
    }

    const existing = await prisma.categoryProduct.findUnique({
      where: { name_branchId: { name: name.trim(), branchId } },
    });

    if (existing) {
      return next(new AppError("Category with this name already exists in this branch", 409));
    }

    const category = await prisma.categoryProduct.create({
      data: { name: name.trim(), branchId },
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
    const branchId = req.branchId;

    const categories = await prisma.categoryProduct.findMany({
      where: { branchId },
      include: { _count: { select: { products: true } } },
      orderBy: { createdAt: "asc" },
    });

    return res.status(200).json({
      success: true,
      data: categories,
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

    if (!name || name.trim().length < 2) {
      return next(new AppError("Category name must be at least 2 characters", 400));
    }

    const existing = await ensureCategoryExisting(categoryId);

    const duplicate = await prisma.categoryProduct.findUnique({
      where: { name_branchId: { name: name.trim(), branchId: existing.branchId } },
    });

    if (duplicate && duplicate.id !== categoryId) {
      return next(new AppError("Category with this name already exists in this branch", 409));
    }

    const category = await prisma.categoryProduct.update({
      where: { id: categoryId },
      data: { name: name.trim() },
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

    const category = await ensureCategoryExisting(categoryId);

    if (category.products.length > 0) {
      return next(
        new AppError(
          `Cannot delete category with ${category.products.length} product(s). Move products to another category first.`,
          400,
        ),
      );
    }

    await prisma.categoryProduct.delete({ where: { id: categoryId } });

    return res.status(200).json({
      success: true,
      message: "Category Deleted Successfully",
    });
  } catch (error) {
    next(error);
  }
};
