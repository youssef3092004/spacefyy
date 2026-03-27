import { Router } from "express";
import {
  createInvoice,
  deleteInvoice,
  getAllInvoices,
  getInvoiceById,
  getInvoiceByVisitId,
  payInvoice,
} from "../controllers/invoice.js";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { cacheMiddleware } from "../middleware/cache.js";

const router = Router();

router.post(
  "/create/:visitId",
  verifyToken,
  checkPermission("CREATE-INVOICES"),
  createInvoice,
);

router.patch(
  "/pay/:visitId",
  verifyToken,
  checkPermission("UPDATE-INVOICES"),
  payInvoice,
);

router.get(
  "/getById/:invoiceId",
  verifyToken,
  checkPermission("VIEW-INVOICES"),
  cacheMiddleware((req) => `invoices:${req.params.invoiceId}`, "TTL_BY_ID"),
  getInvoiceById,
);

router.get(
  "/getByVisit/:visitId",
  verifyToken,
  checkPermission("VIEW-INVOICES"),
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
  deleteInvoice,
);

export default router;
