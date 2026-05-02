import { Router } from "express";
import {
  createSpace,
  getSpaceById,
  getAllByBranchId,
  getSpaceByIsActive,
  getSpacesByType,
  getSpaceHistoryFromSession,
  updateSpaceById,
  deleteSpaceById,
  deleteAllSpaces,
  deleteSpacesByBranchId,
} from "../controllers/space.js";
import { AppError } from "../utils/appError.js";
import { verifyToken } from "../middleware/auth.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import { upload } from "../middleware/multer.js";

const router = Router();

// Middleware to validate and parse date range parameters
const validateDateRange = (req, res, next) => {
  const { startDate, endDate } = req.query;
  req.parsedDates = {};

  if (startDate || endDate) {
    if (startDate) {
      const parsedStartDate = new Date(startDate);
      if (isNaN(parsedStartDate.getTime())) {
        return next(
          new AppError(
            "Invalid startDate format. Use ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)",
            400,
          ),
        );
      }
      req.parsedDates.startDate = parsedStartDate;
    }

    if (endDate) {
      const parsedEndDate = new Date(endDate);
      if (isNaN(parsedEndDate.getTime())) {
        return next(
          new AppError(
            "Invalid endDate format. Use ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)",
            400,
          ),
        );
      }
      // Set to end of day
      parsedEndDate.setHours(23, 59, 59, 999);
      req.parsedDates.endDate = parsedEndDate;
    }
  }

  next();
};

router.post(
  "/create",
  verifyToken,
  upload.single("image"),
  checkPermission("CREATE-SPACES", true),
  createSpace,
);
router.get(
  "/getAllByBranchId/:branchId",
  verifyToken,
  checkPermission("VIEW-SPACES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware((req) => {
    const {
      page = 1,
      limit = 10,
      sort = "createdAt",
      order = "desc",
      type,
      isActive,
      isBusy,
      priceType,
      capacity_min,
      capacity_max,
    } = req.query;

    const params = [
      `branchId=${req.params.branchId}`,
      `page=${page}`,
      `limit=${limit}`,
      `sort=${sort}`,
      `order=${order}`,
    ];

    if (type) params.push(`type=${String(type).toUpperCase()}`);
    if (isActive !== undefined) params.push(`isActive=${isActive}`);
    if (isBusy !== undefined) params.push(`isBusy=${isBusy}`);
    if (priceType) params.push(`priceType=${String(priceType).toUpperCase()}`);
    if (capacity_min) params.push(`capacity_min=${capacity_min}`);
    if (capacity_max) params.push(`capacity_max=${capacity_max}`);

    return `spaces:${params.join(":")}`;
  }, "TTL_LIST"),
  getAllByBranchId,
);
router.get(
  "/getById/:spaceId",
  verifyToken,
  checkPermission("VIEW-SPACES"),
  cacheMiddleware((req) => `space:${req.params.spaceId}`, "TTL_BY_ID"),
  getSpaceById,
);
router.get(
  "/history/:spaceId",
  verifyToken,
  checkPermission("VIEW-SPACES"),
  validateDateRange,
  cacheMiddleware(
    (req) =>
      `space-history:${req.params.spaceId}:page=${req.query.page || 1}:limit=${req.query.limit || 10}:sort=${req.query.sort || "createdAt"}:order=${req.query.order || "desc"}:status=${req.query.status || ""}:priceType=${req.query.priceType || ""}:startDate=${req.query.startDate || ""}:endDate=${req.query.endDate || ""}`,
    "TTL_LIST",
  ),
  getSpaceHistoryFromSession,
);
router.get(
  "/getByIsActive/:branchId/:isActive",
  verifyToken,
  checkPermission("VIEW-SPACES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware(
    (req) =>
      `spaces:branchId=${req.params.branchId}:isActive=${req.params.isActive}:isBusy=${req.query.isBusy || "false"}`,
    "TTL_LIST",
  ),
  getSpaceByIsActive,
);
router.get(
  "/getByType/:branchId/:type",
  verifyToken,
  checkPermission("VIEW-SPACES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware(
    (req) =>
      `spaces:branchId=${req.params.branchId}:type=${req.params.type}:isBusy=${req.query.isBusy || "false"}`,
    "TTL_LIST",
  ),
  getSpacesByType,
);
router.patch(
  "/update/:branchId/:spaceId",
  verifyToken,
  upload.single("image"),
  checkPermission("UPDATE-SPACES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  updateSpaceById,
);
router.delete(
  "/delete/:branchId/:spaceId",
  verifyToken,
  checkPermission("DELETE-SPACES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  deleteSpaceById,
);
router.delete(
  "/deleteAll",
  verifyToken,
  checkPermission("DELETE-SPACES"),
  deleteAllSpaces,
);
router.delete(
  "/deleteAllByBranchId/:branchId",
  verifyToken,
  checkPermission("DELETE-SPACES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  deleteSpacesByBranchId,
);

export default router;
