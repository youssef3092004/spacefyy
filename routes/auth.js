import { Router } from "express";
import {
  registerOwner,
  registerAdmin,
  registerStaff,
  registerDeveloper,
  login,
  logout,
  forgetPassword,
} from "../controllers/auth.js";
import { verifyToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { checkOwnership } from "../middleware/checkOwnership.js";
import { upload } from "../middleware/multer.js";

const router = Router();

router.post(
  "/registerOwner",
  verifyToken,
  upload.single("profileImage"),
  registerOwner,
);
router.post(
  "/registerAdmin",
  verifyToken,
  checkPermission("REGISTER-ADMIN"),
  upload.single("profileImage"),
  registerAdmin,
);
router.post(
  "/registerStaff",
  verifyToken,
  checkPermission("REGISTER-STAFF"),
  upload.single("profileImage"),
  registerStaff,
);
router.post(
  "/registerDeveloper",
  upload.single("profileImage"),
  registerDeveloper,
);
router.post("/login", login);
router.post("/logout", verifyToken, logout);
router.post(
  "/changePassword/:id",
  verifyToken,
  checkOwnership({ model: "user", paramId: "id", scope: "user" }),
  forgetPassword,
);

export default router;
