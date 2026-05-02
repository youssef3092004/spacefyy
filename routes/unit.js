import { Router } from "express";
import {
  createUnit,
  getUnitById,
  getAllByBranchId,
  getUnitsByType,
  updateUnitById,
  deleteUnitById,
  deleteUnitsByBranchId,
  deleteAllUnits,
} from "../controllers/unit.js";
import { verifyToken } from "../middleware/auth.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import { upload } from "../middleware/multer.js";

const router = Router();

router.post(
  "/create",
  verifyToken,
  upload.single("image"),
  checkPermission("CREATE-UNITS", true),
  createUnit,
);

router.get(
  "/getById/:branchId/:unitId",
  verifyToken,
  checkPermission("VIEW-UNITS", true),
  checkOwnership({ model: "unit", paramId: "unitId", scope: "branch" }),
  cacheMiddleware((req) => `unit:${req.params.unitId}`, "TTL_BY_ID"),
  getUnitById,
);

router.get(
  "/getAllByBranchId/:branchId",
  verifyToken,
  checkPermission("VIEW-UNITS", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware((req) => {
    const {
      page = 1,
      limit = 10,
      sort = "createdAt",
      order = "desc",
      type,
      isActive,
      isBusy,
      priceType,
      priceMin,
      priceMax,
      spaceId,
      name,
    } = req.query;

    const params = [
      `branchId=${req.params.branchId}`,
      `page=${page}`,
      `limit=${limit}`,
      `sort=${sort}`,
      `order=${order}`,
    ];

    if (type) params.push(`type=${String(type).toUpperCase()}`);
    if (isActive !== undefined) params.push(`isActive=${isActive}`);
    if (isBusy !== undefined) params.push(`isBusy=${isBusy}`);
    if (priceType) params.push(`priceType=${String(priceType).toUpperCase()}`);
    if (priceMin) params.push(`priceMin=${priceMin}`);
    if (priceMax) params.push(`priceMax=${priceMax}`);
    if (spaceId) params.push(`spaceId=${spaceId}`);
    if (name) params.push(`name=${name}`);

    return `units:${params.join(":")}`;
  }, "TTL_LIST"),
  getAllByBranchId,
);

router.get(
  "/getByType/:branchId/:type",
  verifyToken,
  checkPermission("VIEW-UNITS", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware((req) => {
    const { isActive, isBusy, priceType, spaceId } = req.query;

    const params = [
      `branchId=${req.params.branchId}`,
      `type=${String(req.params.type).toUpperCase()}`,
    ];

    if (isActive !== undefined) params.push(`isActive=${isActive}`);
    if (isBusy !== undefined) params.push(`isBusy=${isBusy}`);
    if (priceType) params.push(`priceType=${String(priceType).toUpperCase()}`);
    if (spaceId) params.push(`spaceId=${spaceId}`);

    return `units:${params.join(":")}`;
  }, "TTL_LIST"),
  getUnitsByType,
);

router.patch(
  "/update/:branchId/:unitId",
  verifyToken,
  upload.single("image"),
  checkPermission("UPDATE-UNITS", true),
  checkOwnership({ model: "unit", paramId: "unitId", scope: "branch" }),
  updateUnitById,
);

router.delete(
  "/delete/:branchId/:unitId",
  verifyToken,
  checkPermission("DELETE-UNITS", true),
  checkOwnership({ model: "unit", paramId: "unitId", scope: "branch" }),
  deleteUnitById,
);

router.delete(
  "/deleteByBranchId/:branchId",
  verifyToken,
  checkPermission("DELETE-UNITS", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  deleteUnitsByBranchId,
);

router.delete(
  "/deleteAll",
  verifyToken,
  checkPermission("DELETE-UNITS"),
  deleteAllUnits,
);

export default router;
