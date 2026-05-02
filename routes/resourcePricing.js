import { Router } from "express";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import { cacheMiddleware } from "../middleware/cache.js";
import {
  bulkUpdatePricing,
  getAllPricingByBranch,
  getPricingByModel,
} from "../controllers/resourcePricing.js";

const router = Router();

router.get(
  "/:branchId",
  verifyToken,
  checkPermission("VIEW-PRICING-RULES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware(
    (req) => `resource-pricing:${req.params.branchId}`,
    "TTL_LIST",
  ),
  getAllPricingByBranch,
);

router.get(
  "/:branchId/model/:model",
  verifyToken,
  checkPermission("VIEW-PRICING-RULES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware(
    (req) =>
      `resource-pricing:${req.params.branchId}:model:${req.params.model}`,
    "TTL_LIST",
  ),
  getPricingByModel,
);

router.patch(
  "/:branchId/bulk-update",
  verifyToken,
  checkPermission("UPDATE-PRICING-RULES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  bulkUpdatePricing,
);

export default router;
