import { Router } from "express";
import {
  createGameMode,
  getGameModesByBranchId,
  getGameModeById,
  getGameModePricing,
  updateGameModeById,
  deleteGameModeById,
} from "../controllers/gameMode.js";
import { verifyToken } from "../middleware/auth.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";

const router = Router();

// NOTE on middleware order: cacheMiddleware always goes LAST. A cache hit
// short-circuits with res.json(), so anything registered after it is skipped —
// putting it before the permission checks would serve branch data to users who
// are not allowed to see it.

router.post(
  "/create/:branchId",
  verifyToken,
  checkPermission("CREATE-GAME-MODES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  createGameMode,
);

router.get(
  "/getAllByBranchId/:branchId",
  verifyToken,
  checkPermission("VIEW-GAME-MODES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware(
    (req) =>
      `gameModes:branchId=${req.params.branchId}:page=${req.query.page || 1}:limit=${
        req.query.limit || 10
      }:sort=${req.query.sort || "sortOrder"}:order=${
        req.query.order || "desc"
      }:isActive=${req.query.isActive ?? "all"}:deviceType=${
        req.query.deviceType || "all"
      }`,
    "TTL_LIST",
  ),
  getGameModesByBranchId,
);

// Intentionally uncached: the availability half is live controller inventory,
// and a stale entry would offer a mode the switch then rejects with 409.
router.get(
  "/pricing/:branchId",
  verifyToken,
  checkPermission("VIEW-GAME-MODES", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  getGameModePricing,
);

router.get(
  "/getById/:branchId/:gameModeId",
  verifyToken,
  checkPermission("VIEW-GAME-MODES", true),
  checkOwnership({ model: "gameMode", paramId: "gameModeId", scope: "branch" }),
  cacheMiddleware((req) => `gameMode:${req.params.gameModeId}`, "TTL_BY_ID"),
  getGameModeById,
);

router.patch(
  "/update/:branchId/:gameModeId",
  verifyToken,
  checkPermission("UPDATE-GAME-MODES", true),
  checkOwnership({ model: "gameMode", paramId: "gameModeId", scope: "branch" }),
  updateGameModeById,
);

router.delete(
  "/delete/:branchId/:gameModeId",
  verifyToken,
  checkPermission("DELETE-GAME-MODES", true),
  checkOwnership({ model: "gameMode", paramId: "gameModeId", scope: "branch" }),
  deleteGameModeById,
);

export default router;
