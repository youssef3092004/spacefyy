import { Router } from "express";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import {
  addComponent,
  getComponentsBySession,
  endComponent,
} from "../controllers/sessionComponent.js";

const router = Router();

// Add a resource component to an active session (e.g. mid-session controller add)
router.post(
  "/:branchId/:sessionId",
  verifyToken,
  checkPermission("UPDATE-SESSIONS"),
  checkOwnership({ model: "session", paramId: "sessionId", scope: "branch" }),
  addComponent,
);

// Get all components for a session
router.get(
  "/:branchId/:sessionId",
  verifyToken,
  checkPermission("VIEW-SESSIONS"),
  checkOwnership({ model: "session", paramId: "sessionId", scope: "branch" }),
  getComponentsBySession,
);

// End a specific component early (e.g. customer stops using a controller)
router.patch(
  "/:branchId/end/:componentId",
  verifyToken,
  checkPermission("UPDATE-SESSIONS"),
  checkOwnership({ model: "sessionComponent", paramId: "componentId", scope: "branch" }),
  endComponent,
);

export default router;
