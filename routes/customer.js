import { Router } from "express";
import {
  createCustomer,
  getCustomerById,
  getAllCustomers,
  getAllCustomersBybusinessId,
  getCustomersHistoryByBranchId,
  getBranchMonthlyStats,
  updateCustomerByIdPatch,
  deleteCustomerById,
  deleteAllCustomers,
  deleteCustomersByBusinessId,
  blockCustomer,
  unblockCustomer,
  getCustomerAnalytics,
} from "../controllers/customer.js";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { upload } from "../configs/multer.js";
const router = Router();

const ownsBranch = checkOwnership({
  model: "branch",
  paramId: "branchId",
  scope: "branch",
});

router.post(
  "/create/:branchId",
  verifyToken,
  upload.none(),
  checkPermission("CREATE_CUSTOMER"),
  ownsBranch,
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

const ownsCustomer = checkOwnership({
  model: "customer",
  paramId: "customerId",
  scope: "tenant",
});

router.get(
  "/getById/:customerId",
  verifyToken,
  checkPermission("VIEW_CUSTOMER"),
  ownsCustomer,
  cacheMiddleware((req) => {
    const q = req.query;
    return [
      `customer:${req.params.customerId}`,
      `visitsPage=${q.visitsPage || 1}`,
      `visitsLimit=${q.visitsLimit || 10}`,
      `visitsSort=${q.visitsSort || "startedAt"}`,
      `visitsOrder=${q.visitsOrder || "desc"}`,
      `ordersPage=${q.ordersPage || 1}`,
      `ordersLimit=${q.ordersLimit || 10}`,
      `ordersSort=${q.ordersSort || "createdAt"}`,
      `ordersOrder=${q.ordersOrder || "desc"}`,
    ].join(":");
  }, "TTL_BY_ID"),
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
      }:order=${req.query.order || "desc"}:search=${req.query.search || ""}`,
    "TTL_LIST",
  ),
  getAllCustomersBybusinessId,
);

router.get(
  "/getByBranchId/:branchId",
  verifyToken,
  checkPermission("VIEW_CUSTOMER"),
  ownsBranch,
  getCustomersHistoryByBranchId,
);

router.get(
  "/monthly-stats/:branchId",
  verifyToken,
  checkPermission("VIEW_CUSTOMER"),
  ownsBranch,
  getBranchMonthlyStats,
);

router.get(
  "/:customerId/analytics",
  verifyToken,
  checkPermission("VIEW_CUSTOMER"),
  ownsCustomer,
  cacheMiddleware(
    (req) => `customer:analytics:${req.params.customerId}`,
    "TTL_BY_ID",
  ),
  getCustomerAnalytics,
);

router.patch(
  "/update/:customerId",
  verifyToken,
  upload.none(),
  checkPermission("UPDATE_CUSTOMER"),
  ownsCustomer,
  updateCustomerByIdPatch,
);

router.patch(
  "/block/:customerId",
  verifyToken,
  upload.none(),
  checkPermission("UPDATE_CUSTOMER"),
  ownsCustomer,
  blockCustomer,
);

router.patch(
  "/unblock/:customerId",
  verifyToken,
  checkPermission("UPDATE_CUSTOMER"),
  ownsCustomer,
  unblockCustomer,
);

router.delete(
  "/delete/:customerId",
  verifyToken,
  checkPermission("DELETE_CUSTOMER"),
  ownsCustomer,
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
