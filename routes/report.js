import { Router } from "express";
import { getBranchReport, getBusinessReport } from "../controllers/report.js";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import { cacheMiddleware } from "../middleware/cache.js";

const router = Router();

router.get(
  "/branch/:branchId",
  verifyToken,
  checkPermission("viewOrderAnalytics", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware((req) => {
    const q = req.query;
    return `reports:branch:${req.params.branchId}:from=${q.startDate || ""}:to=${q.endDate || ""}:cmp=${q.compare || "false"}:by=${q.trendGroupBy || "day"}:role=${req.user.roleName}`;
  }, "TTL_ANALYTICS"),
  getBranchReport,
);

router.get(
  "/business/:businessId",
  verifyToken,
  checkPermission("viewOrderAnalytics"),
  checkOwnership({ model: "business", paramId: "businessId", scope: "business" }),
  cacheMiddleware((req) => {
    const q = req.query;
    return `reports:business:${req.params.businessId}:from=${q.startDate || ""}:to=${q.endDate || ""}:cmp=${q.compare || "false"}:by=${q.trendGroupBy || "day"}:role=${req.user.roleName}`;
  }, "TTL_ANALYTICS"),
  getBusinessReport,
);

export default router;
