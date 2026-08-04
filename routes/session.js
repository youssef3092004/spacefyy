import { Router } from "express";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import { requireOpenShift } from "../utils/requireOpenShift.js";
import {
  cancelSession,
  createSession,
  deleteSessionById,
  endSession,
  getAllSessionByVisitId,
  getAllSessionsByBranchId,
  getSessionById,
  updateSessionById,
} from "../controllers/session.js";
import {
  changeSessionMode,
  changeSessionPlayers,
} from "../controllers/sessionComponent.js";
import { cacheMiddleware } from "../middleware/cache.js";

const router = Router();

router.post(
  "/create/:branchId",
  verifyToken,
  checkPermission("CREATE-SESSIONS", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  requireOpenShift(),
  createSession,
);

router.get(
  "/getAll/:branchId",
  verifyToken,
  checkPermission("VIEW-SESSIONS"),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware(
    (req) =>
      `sessions:branchId=${req.params.branchId}:page=${req.query.page || 1}:limit=${req.query.limit || 10}:sort=${req.query.sort || "createdAt"}:order=${req.query.order || "desc"}`,
    "TTL_LIST",
  ),
  getAllSessionsByBranchId,
);

router.get(
  "/getById/:sessionId",
  verifyToken,
  checkPermission("VIEW-SESSIONS"),
  checkOwnership({ model: "session", paramId: "sessionId", scope: "branch" }),
  cacheMiddleware((req) => `session:${req.params.sessionId}`, "TTL_BY_ID"),
  getSessionById,
);

router.get(
  "/visit/:branchId/:visitId",
  verifyToken,
  checkPermission("VIEW-SESSIONS"),
  checkOwnership({ model: "visit", paramId: "visitId", scope: "branch" }),
  getAllSessionByVisitId,
);

router.patch(
  "/update/:sessionId",
  verifyToken,
  checkPermission("UPDATE-SESSIONS"),
  checkOwnership({ model: "session", paramId: "sessionId", scope: "branch" }),
  updateSessionById,
);

router.patch(
  "/end/:sessionId",
  verifyToken,
  checkPermission("UPDATE-SESSIONS"),
  checkOwnership({ model: "session", paramId: "sessionId", scope: "branch" }),
  requireOpenShift(),
  endSession,
);

router.patch(
  "/cancel/:sessionId",
  verifyToken,
  checkPermission("UPDATE-SESSIONS"),
  checkOwnership({ model: "session", paramId: "sessionId", scope: "branch" }),
  requireOpenShift(),
  cancelSession,
);

// Preferred name — takes gameModeId/modeCode and manages controllers.
router.patch(
  "/change-mode/:sessionId",
  verifyToken,
  checkPermission("UPDATE-SESSIONS"),
  checkOwnership({ model: "session", paramId: "sessionId", scope: "branch" }),
  requireOpenShift(),
  changeSessionMode,
);

// Back-compat alias for clients that predate GameMode; same handler, and a
// body carrying only `players` still just relabels the segment.
router.patch(
  "/change-players/:sessionId",
  verifyToken,
  checkPermission("UPDATE-SESSIONS"),
  checkOwnership({ model: "session", paramId: "sessionId", scope: "branch" }),
  requireOpenShift(),
  changeSessionPlayers,
);

router.delete(
  "/delete/:sessionId",
  verifyToken,
  checkPermission("DELETE-SESSIONS"),
  checkOwnership({ model: "session", paramId: "sessionId", scope: "branch" }),
  deleteSessionById,
);

export default router;
