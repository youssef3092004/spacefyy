import sharp from "sharp";
import cloudinary from "../configs/cloud.js";

export const compressAndUpload = async (buffer, folder) => {
  const compressed = await sharp(buffer)
    .resize({ width: 1024 }) // resize large images
    .jpeg({ quality: 80 })
    .toBuffer();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      },
    );
    stream.end(compressed);
  });
};
