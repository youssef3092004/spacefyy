import { Router } from "express";
import {
  createSubscription,
  renewSubscription,
  cancelSubscription,
  getCurrentSubscription,
  getSubscriptionHistory,
  getSubscriptionById,
} from "../controllers/subscription.js";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";

const router = Router();

router.post(
  "/create/:businessId",
  verifyToken,
  checkPermission("CREATE-SUBSCRIPTIONS"),
  createSubscription,
);

router.get(
  "/getAll/:businessId",
  verifyToken,
  checkPermission("VIEW-SUBSCRIPTIONS"),
  checkOwnership({ model: "business", paramId: "businessId", scope: "business" }),
  getSubscriptionHistory,
);

router.get(
  "/current/:businessId",
  verifyToken,
  checkPermission("VIEW-SUBSCRIPTIONS"),
  checkOwnership({ model: "business", paramId: "businessId", scope: "business" }),
  getCurrentSubscription,
);

router.get(
  "/getById/:id",
  verifyToken,
  checkPermission("VIEW-SUBSCRIPTIONS"),
  getSubscriptionById,
);

router.patch(
  "/renew/:id",
  verifyToken,
  checkPermission("RENEW-SUBSCRIPTIONS"),
  renewSubscription,
);

router.patch(
  "/cancel/:businessId",
  verifyToken,
  checkPermission("CANCEL-SUBSCRIPTIONS"),
  checkOwnership({ model: "business", paramId: "businessId", scope: "business" }),
  cancelSubscription,
);

export default router;
