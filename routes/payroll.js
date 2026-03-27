import { Router } from "express";
import {
  createPayroll,
  getPayrollById,
  getPayrollByStaffId,
  getPayrolls,
  changeStatusToPaidPayroll,
  changeStatusPayroll,
  deleteAllPayrolls,
  deleteAllPayrollsByBranchId,
  deletePayrollById,
} from "../controllers/payroll.js";
import { verifyToken } from "../middleware/auth.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";

const router = Router();

router.post(
  "/create",
  verifyToken,
  checkPermission("CREATE-PAYROLLS"),
  createPayroll,
);
router.get(
  "/getAll/:branchId",
  verifyToken,
  checkPermission("VIEW-PAYROLLS", true),
  checkOwnership({ model: "payroll", paramId: "branchId", scope: "branch" }),
  cacheMiddleware(
    (req) =>
      `payrolls:page=${req.query.page || 1}:limit=${req.query.limit || 10}:staffProfileId=${
        req.query.staffProfileId || "all"
      }:status=${req.query.status || "all"}:month=${
        req.query.month || "all"
      }:year=${req.query.year || "all"}`,
    "TTL_LIST",
  ),
  getPayrolls,
);
router.get(
  "/getById/:branchId/:payrollId",
  verifyToken,
  checkPermission("VIEW-PAYROLLS", true),
  checkOwnership({ model: "payroll", paramId: "payrollId", scope: "branch" }),
  cacheMiddleware((req) => `payroll:${req.params.payrollId}`, "TTL_BY_ID"),
  getPayrollById,
);
router.get(
  "/getByStaffId/:branchId/:staffId",
  verifyToken,
  checkPermission("VIEW-PAYROLLS", true),
  checkOwnership({ model: "payroll", paramId: "staffId", scope: "branch" }),
  cacheMiddleware(
    (req) =>
      `payrolls:staffId=${req.params.staffId}:branchId=${req.params.branchId}`,
    "TTL_BY_ID",
  ),
  getPayrollByStaffId,
);
router.patch(
  "/changeStatusToPaid/:branchId/:payrollId",
  verifyToken,
  checkPermission("UPDATE-PAYROLLS", true),
  checkOwnership({ model: "payroll", paramId: "payrollId", scope: "branch" }),
  changeStatusToPaidPayroll,
);
router.patch(
  "/changeStatus/:branchId/:payrollId",
  verifyToken,
  checkPermission("UPDATE-PAYROLLS", true),
  checkOwnership({ model: "payroll", paramId: "payrollId", scope: "branch" }),
  changeStatusPayroll,
);
router.delete(
  "/delete/:branchId/:payrollId",
  verifyToken,
  checkPermission("DELETE-PAYROLLS", true),
  checkOwnership({ model: "payroll", paramId: "payrollId", scope: "branch" }),
  deletePayrollById,
);
router.delete(
  "/deleteAllByBranchId/:branchId",
  verifyToken,
  checkPermission("DELETE-PAYROLLS", true),
  checkOwnership({ model: "payroll", paramId: "branchId", scope: "branch" }),
  deleteAllPayrollsByBranchId,
);
router.delete(
  "/deleteAll",
  verifyToken,
  checkPermission("DELETE-PAYROLLS"),
  deleteAllPayrolls,
);

export default router;
