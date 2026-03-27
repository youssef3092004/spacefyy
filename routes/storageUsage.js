import express from "express";
import {
  getBusinessStorageUsage,
  getStorageUsageHistory,
  checkResourceCreationLimit,
  triggerStorageUsageUpdate,
  getAllBusinessesStorageUsage,
  triggerWeeklyStorageSnapshot,
} from "../controllers/storageUsage.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

/**
 * @route GET /api/storage-usage/:businessId
 * @desc Get storage usage summary for a business
 */
router.get("/:businessId", getBusinessStorageUsage);

/**
 * @route GET /api/storage-usage/:businessId/history
 * @desc Get storage usage history for analytics
 * @query days - Number of days to retrieve (default: 30)
 */
router.get("/history/:businessId", getStorageUsageHistory);

/**
 * @route GET /api/storage-usage/:businessId/check/:resourceType
 * @desc Check if a resource can be created based on plan limits
 * @params resourceType - branches, spaces, devices, tools, staff, users
 */
router.get("/check/:businessId/:resourceType", checkResourceCreationLimit);

/**
 * @route POST /api/storage-usage/:businessId/update
 * @desc Manually trigger storage usage update
 */
router.post("/update/:businessId", triggerStorageUsageUpdate);

/**
 * @route GET /api/storage-usage/admin/all
 * @desc Get storage usage for all businesses (admin only)
 */
router.get("/admin/all", getAllBusinessesStorageUsage);

/**
 * @route POST /api/v1/storage-usage/admin/run-weekly-snapshot
 * @desc Manually trigger weekly storage usage snapshots for all businesses
 */
router.post(
  "/admin/run-weekly-snapshot",
  verifyToken,
  triggerWeeklyStorageSnapshot,
);

export default router;
