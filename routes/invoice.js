import { Router } from "express";
import {
  createInvoice,
  createOrderInvoice,
  deleteInvoice,
  getAllInvoices,
  getInvoiceById,
  getInvoiceByVisitId,
  payInvoice,
  payInvoiceById,
} from "../controllers/invoice.js";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { requireOpenShift } from "../utils/requireOpenShift.js";

const router = Router();

router.post(
  "/create/:visitId",
  verifyToken,
  checkPermission("CREATE-INVOICES"),
  checkOwnership({ model: "visit", paramId: "visitId", scope: "branch" }),
  requireOpenShift(),
  createInvoice,
);

router.post(
  "/createOrder/:orderId",
  verifyToken,
  checkPermission("CREATE-INVOICES"),
  checkOwnership({ model: "order", paramId: "orderId", scope: "branch" }),
  requireOpenShift(),
  createOrderInvoice,
);

router.patch(
  "/payById/:invoiceId",
  verifyToken,
  checkPermission("UPDATE-INVOICES"),
  checkOwnership({ model: "invoice", paramId: "invoiceId", scope: "branch" }),
  requireOpenShift(),
  payInvoiceById,
);

router.patch(
  "/pay/:visitId",
  verifyToken,
  checkPermission("UPDATE-INVOICES"),
  checkOwnership({ model: "visit", paramId: "visitId", scope: "branch" }),
  requireOpenShift(),
  payInvoice,
);

router.get(
  "/getById/:invoiceId",
  verifyToken,
  checkPermission("VIEW-INVOICES"),
  checkOwnership({ model: "invoice", paramId: "invoiceId", scope: "branch" }),
  cacheMiddleware((req) => `invoices:${req.params.invoiceId}`, "TTL_BY_ID"),
  getInvoiceById,
);

router.get(
  "/getByVisit/:visitId",
  verifyToken,
  checkPermission("VIEW-INVOICES"),
  checkOwnership({ model: "visit", paramId: "visitId", scope: "branch" }),
  cacheMiddleware(
    (req) => `invoices:visit:${req.params.visitId}`,
    "TTL_BY_VISIT",
  ),
  getInvoiceByVisitId,
);

router.get(
  "/getAll/:branchId",
  verifyToken,
  checkPermission("VIEW-INVOICES"),
  checkOwnership({ model: "branch", paramId: "branchId", scope: "branch" }),
  cacheMiddleware(
    (req) =>
      `invoices:page=${req.query.page || 1}:limit=${req.query.limit || 10}:branchId=${req.params.branchId || "all"}:status=${req.query.status || "all"}`,
    "TTL_LIST",
  ),
  getAllInvoices,
);

router.delete(
  "/delete/:invoiceId",
  verifyToken,
  checkPermission("DELETE-INVOICES"),
  checkOwnership({ model: "invoice", paramId: "invoiceId", scope: "branch" }),
  deleteInvoice,
);

export default router;
