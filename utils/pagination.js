import { AppError } from "./appError.js";

const COMPUTED_SORT_FIELDS = [
  "totalSpent",
  "lastBookingAt",
  "lastActivity",
  "firstVisitAt",
  "totalVisits",
];

export const isComputedSort = (sort) => COMPUTED_SORT_FIELDS.includes(sort);

// createdAt is on every model and is the default sort, so it is always allowed.
// updatedAt is not universal (Payroll has none), so it stays opt-in.
const UNIVERSAL_SORT_FIELDS = ["createdAt"];

const DEFAULT_SORT_FIELDS = [
  ...UNIVERSAL_SORT_FIELDS,
  "updatedAt",
  "email",
  "name",
  "totalSpent",
  "lastBookingAt",
];

/**
 * @param {object} req
 * @param {object} [options]
 * @param {string[]} [options.allowedSortFields] Overrides the default list for
 *   models that don't have name/email — Payroll and Subscription have neither,
 *   so `?sort=email` there reached Prisma and became a 500.
 */
export const pagination = (req, { allowedSortFields } = {}) => {
  const sortFields = allowedSortFields
    ? [...new Set([...UNIVERSAL_SORT_FIELDS, ...allowedSortFields])]
    : DEFAULT_SORT_FIELDS;
  const allowedOrder = ["asc", "desc"];

  if (req.query.sort && !sortFields.includes(req.query.sort)) {
    throw new AppError(
      `Invalid sort field. Allowed: ${sortFields.join(", ")}`,
      400,
    );
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
