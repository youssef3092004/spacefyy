import { Router } from "express";
import {
  createStaffProfile,
  getAllStaffProfiles,
  getStaffProfileById,
  updateStaffProfileById,
  deleteAllStaffProfiles,
  deleteStaffProfileById,
  getStaffProfilesByBranchId,
  getStaffProfileByUserId,
  getStaffProfilesCount,
  updateStaffProfileByUserId,
  updateStaffProfileByUserIdPatch,
} from "../controllers/staffProfile.js";
import { verifyToken } from "../middleware/auth.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import { upload } from "../middleware/multer.js";

const router = Router();

router.post(
  "/create",
  verifyToken,
  checkPermission("CREATE-STAFF-PROFILES"),
  createStaffProfile,
);
router.get(
  "/getAll",
  verifyToken,
  checkPermission("VIEW-STAFF-PROFILES"),
  cacheMiddleware(
    (req) =>
      `staffProfiles:page=${req.query.page || 1}:limit=${
        req.query.limit || 10
      }:sort=${req.query.sort || "createdAt"}:order=${
        req.query.order || "desc"
      }`,
    "TTL_LIST",
  ),
  getAllStaffProfiles,
);
router.get(
  "/getById/:id",
  verifyToken,
  cacheMiddleware((req) => `staffProfile:${req.params.id}`, "TTL_BY_ID"),
  checkPermission("VIEW-STAFF-PROFILES"),
  checkOwnership({
    model: "staffProfile",
    paramId: "id",
    scope: "branch",
  }),
  getStaffProfileById,
);
router.get(
  "/getByBranchId/:branchId",
  verifyToken,
  cacheMiddleware(
    (req) => `staffProfilesBranch:${req.params.branchId}`,
    "TTL_BY_ID",
  ),
  checkPermission("VIEW-STAFF-PROFILES", true),
  checkOwnership({
    model: "branch",
    paramId: "branchId",
    scope: "branch",
  }),
  getStaffProfilesByBranchId,
);
router.put(
  "/updateById/:id",
  verifyToken,
  checkPermission("UPDATE-STAFF-PROFILES"),
  checkOwnership({
    model: "staffProfile",
    paramId: "id",
    scope: "branch",
  }),
  updateStaffProfileById,
);
router.delete(
  "/deleteById/:id",
  verifyToken,
  checkPermission("DELETE-STAFF-PROFILES"),
  checkOwnership({
    model: "staffProfile",
    paramId: "id",
    scope: "branch",
  }),
  deleteStaffProfileById,
);
router.delete(
  "/deleteAll",
  verifyToken,
  checkPermission("DELETE-STAFF-PROFILES"),
  deleteAllStaffProfiles,
);
router.get(
  "/getByUserId/:userId",
  verifyToken,
  checkPermission("VIEW-STAFF-PROFILES"),
  cacheMiddleware(
    (req) => `staffProfileUser:${req.params.userId}`,
    "TTL_BY_ID",
  ),
  checkOwnership({
    model: "staffProfile",
    paramId: "userId",
    scope: "branch",
  }),
  getStaffProfileByUserId,
);
router.get(
  "/getStaffProfilesCount",
  verifyToken,
  checkPermission("VIEW-STAFF-PROFILES"),
  cacheMiddleware(() => `staffProfilesCount`, "TTL_BY_ID"),
  getStaffProfilesCount,
);
router.put(
  "/updateByUserId/:userId",
  verifyToken,
  checkPermission("UPDATE-STAFF-PROFILES"),
  checkOwnership({
    model: "staffProfile",
    paramId: "userId",
    scope: "branch",
  }),
  updateStaffProfileByUserId,
);
router.patch(
  "/updateByUserId/:userId",
  verifyToken,
  checkPermission("UPDATE-STAFF-PROFILES"),
  checkOwnership({
    model: "staffProfile",
    paramId: "userId",
    scope: "branch",
  }),
  upload.fields([
    { name: "frontImage", maxCount: 1 },
    { name: "backImage", maxCount: 1 },
    { name: "profileImage", maxCount: 1 },
  ]),
  updateStaffProfileByUserIdPatch,
);

export default router;
