import { Router } from "express";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import {
  getWebSocketSpaceOverViewStatus,
  emitSpaceOverviewUpdate,
} from "../controllers/webSocketSpaceOverView.js";
import { buildSpacesOverviewData } from "../controllers/spaceOverview.js";

const router = Router();

router.get(
  "/status/:branchId",
  verifyToken,
  checkPermission("VIEW-SPACES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  getWebSocketSpaceOverViewStatus,
);

// Protected test endpoint to emit a sample update to the branch room.
router.post(
  "/emit-test/:branchId",
  verifyToken,
  checkPermission("VIEW-SPACES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  (req, res) => {
    const { branchId } = req.params;

    const ok = emitSpaceOverviewUpdate(branchId, {
      test: true,
      message: "manual emit from /api/v1/websocket-space-overview/emit-test",
    });

    if (!ok) {
      return res.status(500).json({ status: "error", message: "emit failed" });
    }

    return res.status(200).json({ status: "success", data: { branchId } });
  },
);

// Protected endpoint to emit the live overview payload for a branch
router.post(
  "/emit-live/:branchId",
  verifyToken,
  checkPermission("VIEW-SPACES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  async (req, res, next) => {
    const { branchId } = req.params;
    try {
      const data = await buildSpacesOverviewData(branchId);
      const ok = emitSpaceOverviewUpdate(branchId, data);
      if (!ok)
        return res
          .status(500)
          .json({ status: "error", message: "emit failed" });
      return res.status(200).json({ status: "success", data: { branchId } });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
