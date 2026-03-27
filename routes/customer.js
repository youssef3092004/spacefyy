import { Router } from "express";
import {
  createCustomer,
  getCustomerById,
  getAllCustomers,
  getAllCustomersBybusinessId,
  updateCustomerByIdPatch,
  deleteCustomerById,
  deleteAllCustomers,
  deleteCustomersByBusinessId,
} from "../controllers/customer.js";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import { cacheMiddleware } from "../middleware/cache.js";

const router = Router();

router.post(
  "/create",
  verifyToken,
  checkPermission("CREATE_CUSTOMER"),
  createCustomer,
);

router.get(
  "/getAll",
  verifyToken,
  checkPermission("VIEW_CUSTOMER"),
  cacheMiddleware(
    (req) =>
      `customers:page=${req.query.page || 1}:limit=${req.query.limit || 10}:sort=${
        req.query.sort || "createdAt"
      }:order=${req.query.order || "desc"}`,
    "TTL_LIST",
  ),
  getAllCustomers,
);

router.get(
  "/getById/:customerId",
  verifyToken,
  checkPermission("VIEW_CUSTOMER"),
  cacheMiddleware((req) => `customer:${req.params.customerId}`, "TTL_BY_ID"),
  getCustomerById,
);

router.get(
  "/getByBusinessId/:businessId",
  verifyToken,
  checkPermission("VIEW_CUSTOMER"),
  checkOwnership({
    model: "business",
    paramId: "businessId",
    scope: "business",
  }),
  cacheMiddleware(
    (req) =>
      `customers:businessId=${req.params.businessId}:page=${req.query.page || 1}:limit=${req.query.limit || 10}:sort=${
        req.query.sort || "createdAt"
      }:order=${req.query.order || "desc"}`,
    "TTL_LIST",
  ),
  getAllCustomersBybusinessId,
);

router.patch(
  "/update/:customerId",
  verifyToken,
  checkPermission("UPDATE_CUSTOMER"),
  updateCustomerByIdPatch,
);

router.delete(
  "/delete/:customerId",
  verifyToken,
  checkPermission("DELETE_CUSTOMER"),
  deleteCustomerById,
);

router.delete(
  "/deleteAll",
  verifyToken,
  checkPermission("DELETE_ALL_CUSTOMERS"),
  deleteAllCustomers,
);

router.delete(
  "/deleteByBusinessId/:businessId",
  verifyToken,
  checkPermission("DELETE_ALL_CUSTOMERS"),
  checkOwnership({
    model: "business",
    paramId: "businessId",
    scope: "business",
  }),
  deleteCustomersByBusinessId,
);

export default router;
