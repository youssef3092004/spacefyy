import { Router } from "express";
import {
  createPricingRule,
  getBranchPricingPanel,
  getPricingRuleById,
  getPriceingRulesByTarget,
  getAllPricingRules,
  updatePricingRuleById,
  updatePricingByTarget,
  deletePricingRuleById,
  deletePricingRuleByTarget,
} from "../controllers/pricingRules.js";
import { verifyToken } from "../middleware/auth.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";

const router = Router();

router.get(
  "/panel/:branchId",
  verifyToken,
  checkPermission("VIEW-PRICING-RULES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware((req) => `pricing-panel:${req.params.branchId}`, "TTL_LIST"),
  getBranchPricingPanel,
);

router.post(
  "/create/:branchId",
  verifyToken,
  checkPermission("CREATE-PRICING-RULES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  createPricingRule,
);

router.get(
  "/getAll/:branchId",
  verifyToken,
  checkPermission("VIEW-PRICING-RULES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware(
    (req) =>
      `pricingRules:${req.params.branchId}:page=${req.query.page || 1}:limit=${req.query.limit || 10}:pricingType=${req.query.pricingType || "all"}:pricingMode=${req.query.pricingMode || "all"}:isActive=${req.query.isActive || "all"}:spaceId=${req.query.spaceId || "all"}:deviceId=${req.query.deviceId || "all"}:unitId=${req.query.unitId || "all"}:equipmentId=${req.query.equipmentId || "all"}`,
    "TTL_LIST",
  ),
  getAllPricingRules,
);
router.get(
  "/getByTarget/:branchId/:target/:targetId",
  verifyToken,
  checkPermission("VIEW-PRICING-RULES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware(
    (req) =>
      `pricingRules:${req.params.branchId}:target=${req.query.target}:${req.query.targetId}`,
    "TTL_LIST",
  ),
  getPriceingRulesByTarget,
);
router.get(
  "/getById/:branchId/:pricingRuleId",
  verifyToken,
  checkPermission("VIEW-PRICING-RULES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware(
    (req) => `pricingRule:${req.params.pricingRuleId}`,
    "TTL_BY_ID",
  ),
  getPricingRuleById,
);

router.patch(
  "/update/:branchId/:pricingRuleId",
  verifyToken,
  checkPermission("UPDATE-PRICING-RULES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  updatePricingRuleById,
);

router.patch(
  "/updateByTarget/:branchId/:target/:targetId",
  verifyToken,
  checkPermission("UPDATE-PRICING-RULES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  updatePricingByTarget,
);

router.delete(
  "/delete/:branchId/:pricingRuleId",
  verifyToken,
  checkPermission("DELETE-PRICING-RULES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  deletePricingRuleById,
);

router.delete(
  "/deleteByTarget/:branchId/:target/:targetId",
  verifyToken,
  checkPermission("DELETE-PRICING-RULES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  deletePricingRuleByTarget,
);

export default router;
