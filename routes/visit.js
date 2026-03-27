import { Router } from "express";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import {
  closeVisit,
  invoiceVisit,
  payVisit,
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
router.patch(
  "/close/:visitId",
  verifyToken,
  checkPermission("UPDATE-VISITS"),
  checkOwnership({ model: "visit", paramId: "visitId", scope: "branch" }),
  closeVisit,
);
router.patch(
  "/invoice/:visitId",
  verifyToken,
  checkPermission("UPDATE-VISITS"),
  checkOwnership({ model: "visit", paramId: "visitId", scope: "branch" }),
  invoiceVisit,
);
router.patch(
  "/pay/:visitId",
  verifyToken,
  checkPermission("UPDATE-VISITS"),
  checkOwnership({ model: "visit", paramId: "visitId", scope: "branch" }),
  payVisit,
);

export default router;
