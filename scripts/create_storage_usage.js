import "dotenv/config";
import { connectDB, prisma } from "../configs/db.js";
import { initializeStorageUsage } from "../utils/storageUsage.js";

const businessId = process.argv[2] || "52dc10db-6d71-4ee5-b575-327a26877292";

(async () => {
  try {
    await connectDB();
    const result = await initializeStorageUsage(businessId);
    console.log("Storage usage created/initialized:", result);
    process.exit(0);
  } catch (err) {
    console.error("Failed to create storage usage:", err);
    process.exit(1);
  } finally {
    try {
      await prisma.$disconnect();
    } catch (_) {}
  }
})();
