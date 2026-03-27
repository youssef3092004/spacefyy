import { Router } from "express";
import {
  createPlan,
  getPlanById,
  getAllPlans,
  getAllPublicPlans,
  getAllPrivatePlans,
  getPlanByBussinessId,
  updatePlanById,
  deletePlanById,
} from "../controllers/plan.js";
import { verifyToken } from "../middleware/auth.js";
// import { cacheMiddleware } from "../middleware/cache.js";
import { checkPermission } from "../middleware/checkPermission.js";

const router = Router();

router.post(
  "/create",
  verifyToken,
  checkPermission("CREATE-PLANS"),
  createPlan,
);

router.get("/getAll", verifyToken, checkPermission("VIEW-PLANS"), getAllPlans);

router.get(
  "/getById/:id",
  verifyToken,
  checkPermission("VIEW-PLANS"),
  getPlanById,
);
router.get(
  "/getByBusinessId/:businessId",
  verifyToken,
  checkPermission("VIEW-PLANS"),
  getPlanByBussinessId,
);
router.get("/getPublicPlans", verifyToken, getAllPublicPlans);

router.get(
  "/getPrivatePlans",
  verifyToken,
  checkPermission("VIEW-PRIVATE-PLANS"),
  getAllPrivatePlans,
);
router.get(
  "/getByBusinessId/:businessId",
  verifyToken,
  checkPermission("VIEW-PLANS"),
  getPlanByBussinessId,
);

router.patch(
  "/update/:id",
  verifyToken,
  checkPermission("UPDATE-PLANS"),
  updatePlanById,
);

router.delete(
  "/delete/:id",
  verifyToken,
  checkPermission("DELETE-PLANS"),
  deletePlanById,
);

export default router;
