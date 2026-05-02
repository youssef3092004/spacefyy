import multer from "multer";
import { AppError } from "../utils/appError.js";

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedMimes.includes(file.mimetype)) {
      return cb(
        new AppError("Only image files are allowed (JPG, PNG, GIF, WebP)", 400),
      );
    }
    cb(null, true);
  },
});
