import { Router } from "express";
import {
  getBusinessDashboard,
  getRevenueReport,
} from "../controllers/analytics.js";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { cacheMiddleware } from "../middleware/cache.js";

const router = Router();

router.get(
  "/dashboard/:businessId",
  verifyToken,
  checkPermission("viewOrderAnalytics"),
  cacheMiddleware(
    (req) =>
      `analytics:dashboard:${req.params.businessId}:branch=${req.query.branchId || "all"}`,
    "TTL_ANALYTICS",
  ),
  getBusinessDashboard,
);

router.get(
  "/revenue/:businessId",
  verifyToken,
  checkPermission("viewOrderAnalytics"),
  cacheMiddleware((req) => {
    const q = req.query;
    return `analytics:revenue:${req.params.businessId}:branch=${q.branchId || "all"}:from=${q.startDate || ""}:to=${q.endDate || ""}:by=${q.groupBy || "day"}`;
  }, "TTL_ANALYTICS"),
  getRevenueReport,
);

export default router;
