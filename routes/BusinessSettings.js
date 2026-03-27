import { Router } from "express";
import {
  getBusinessSettingsBybusinessId,
  updateBusinessSettings,
  deleteBusinessSettings,
  createBusinessSettings,
} from "../controllers/businessSettings.js";
import { verifyToken } from "../middleware/auth.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { checkPermission } from "../middleware/checkPermission.js";

const router = Router();

router.post(
  "/create/:businessId",
  verifyToken,
  checkPermission("CREATE-BUSINESS-SETTINGS"),
  createBusinessSettings,
);
router.get(
  "/get/:businessId",
  verifyToken,
  checkPermission("VIEW-BUSINESS-SETTINGS"),
  cacheMiddleware(
    (req) => `businessSettings:${req.params.businessId}`,
    "TTL_BY_ID",
  ),
  getBusinessSettingsBybusinessId,
);
router.put(
  "/update/:businessId",
  verifyToken,
  checkPermission("UPDATE-BUSINESS-SETTINGS"),
  updateBusinessSettings,
);
router.delete(
  "/delete/:businessId",
  verifyToken,
  checkPermission("DELETE-BUSINESS-SETTINGS"),
  deleteBusinessSettings,
);

export default router;
