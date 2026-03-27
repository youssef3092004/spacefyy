import { v2 as cloudinary } from "cloudinary";
import process from "process";

cloudinary.config({
  CLOUDINARY_URL: process.env.CLOUDINARY_URL,
});

export default cloudinary;
