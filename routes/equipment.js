import { Router } from "express";
import {
  createEquipment,
  getEquipmentById,
  getAllByBranchId,
  getEquipmentByType,
  updateEquipmentById,
  deleteEquipmentById,
  deleteEquipmentByBranchId,
  deleteAllEquipment,
} from "../controllers/equipment.js";
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
  checkPermission("CREATE-EQUIPMENT", true),
  createEquipment,
);

router.get(
  "/getById/:branchId/:equipmentId",
  verifyToken,
  checkPermission("VIEW-EQUIPMENT", true),
  checkOwnership({
    model: "equipment",
    paramId: "equipmentId",
    scope: "branch",
  }),
  cacheMiddleware(
    (req) => `equipment:${req.params.equipmentId}`,
    "TTL_BY_ID",
  ),
  getEquipmentById,
);

router.get(
  "/getAllByBranchId/:branchId",
  verifyToken,
  checkPermission("VIEW-EQUIPMENT", true),
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
      name,
      quantityMin,
      quantityMax,
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
    if (name) params.push(`name=${name}`);
    if (quantityMin) params.push(`quantityMin=${quantityMin}`);
    if (quantityMax) params.push(`quantityMax=${quantityMax}`);

    return `equipment:${params.join(":")}`;
  }, "TTL_LIST"),
  getAllByBranchId,
);

router.get(
  "/getByType/:branchId/:type",
  verifyToken,
  checkPermission("VIEW-EQUIPMENT", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware((req) => {
    const { isActive, isBusy, priceType } = req.query;

    const params = [
      `branchId=${req.params.branchId}`,
      `type=${String(req.params.type).toUpperCase()}`,
    ];

    if (isActive !== undefined) params.push(`isActive=${isActive}`);
    if (isBusy !== undefined) params.push(`isBusy=${isBusy}`);
    if (priceType) params.push(`priceType=${String(priceType).toUpperCase()}`);

    return `equipment:${params.join(":")}`;
  }, "TTL_LIST"),
  getEquipmentByType,
);

router.patch(
  "/update/:branchId/:equipmentId",
  verifyToken,
  upload.single("image"),
  checkPermission("UPDATE-EQUIPMENT", true),
  checkOwnership({
    model: "equipment",
    paramId: "equipmentId",
    scope: "branch",
  }),
  updateEquipmentById,
);

router.delete(
  "/delete/:branchId/:equipmentId",
  verifyToken,
  checkPermission("DELETE-EQUIPMENT", true),
  checkOwnership({
    model: "equipment",
    paramId: "equipmentId",
    scope: "branch",
  }),
  deleteEquipmentById,
);

router.delete(
  "/deleteByBranchId/:branchId",
  verifyToken,
  checkPermission("DELETE-EQUIPMENT", true),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  deleteEquipmentByBranchId,
);

router.delete(
  "/deleteAll",
  verifyToken,
  checkPermission("DELETE-EQUIPMENT"),
  deleteAllEquipment,
);

export default router;
