import { Router } from "express";
import {
  getBusinessDashboard,
  getRevenueReport,
} from "../controllers/analytics.js";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import { cacheMiddleware } from "../middleware/cache.js";

const router = Router();

// Without this, holding viewOrderAnalytics was enough to read any competitor's
// revenue curve, active visits and unpaid invoices by passing their businessId.
// Cache must come last: a hit short-circuits with res.json(), so anything
// registered after it never runs.
const ownsBusiness = checkOwnership({
  model: "business",
  paramId: "businessId",
  scope: "tenant",
});

router.get(
  "/dashboard/:businessId",
  verifyToken,
  checkPermission("viewOrderAnalytics"),
  ownsBusiness,
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
  ownsBusiness,
  cacheMiddleware((req) => {
    const q = req.query;
    return `analytics:revenue:${req.params.businessId}:branch=${q.branchId || "all"}:from=${q.startDate || ""}:to=${q.endDate || ""}:by=${q.groupBy || "day"}`;
  }, "TTL_ANALYTICS"),
  getRevenueReport,
);

export default router;
