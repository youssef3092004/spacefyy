import { AppError } from "./appError.js";

export const pagination = (req) => {
  const allowedSortFields = ["createdAt", "email", "updatedAt", "name"];
  const allowedOrder = ["asc", "desc"];

  if (req.query.sort && !allowedSortFields.includes(req.query.sort)) {
    throw new AppError("Invalid sort field", 400);
  }

  if (
    req.query.order &&
    !allowedOrder.includes(req.query.order.toLowerCase())
  ) {
    throw new AppError("Invalid order, must be 'asc' or 'desc'", 400);
  }

  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Number(req.query.limit) || 10, 100);
  const skip = (page - 1) * limit;
  const sort = req.query.sort || "createdAt";
  const order = (req.query.order || "desc").toLowerCase();

  return { page, limit, skip, sort, order };
};
