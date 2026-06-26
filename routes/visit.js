import { Router } from "express";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import {
  closeVisit,
  getAllByBranchId,
  getVisitById,
  startVisit,
} from "../controllers/visit.js";

const router = Router();

router.post(
  "/start",
  verifyToken,
  checkPermission("CREATE-VISITS"),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  startVisit,
);
router.get(
  "/getAllByBranchId/:branchId",
  verifyToken,
  checkPermission("VIEW-VISITS", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  getAllByBranchId,
);
router.get(
  "/getById/:visitId",
  verifyToken,
  checkPermission("VIEW-VISITS"),
  checkOwnership({ model: "visit", paramId: "visitId", scope: "branch" }),
  getVisitById,
);
router.patch(
  "/close/:visitId",
  verifyToken,
  checkPermission("UPDATE-VISITS"),
  checkOwnership({ model: "visit", paramId: "visitId", scope: "branch" }),
  closeVisit,
);

export default router;
