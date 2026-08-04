import "dotenv/config";
import process from "process";
import express from "express";
import { createServer } from "http";
import { connectDB } from "./configs/db.js";
import helmet from "helmet";
import cors from "cors";
import { errorHandler } from "./middleware/errorHandler.js";
import { connectRedis } from "./configs/redis.js";
import xss from "xss";
import path from "path";
import { fileURLToPath } from "url";
import { startStorageUsageCron } from "./utils/storageUsageCron.js";
import { startBranchStatsCron } from "./utils/branchStatsCron.js";
import { startDailyReportCron } from "./utils/dailyReportCron.js";
import { startVisitAutoCancelCron } from "./utils/visitAutoCancelCron.js";
import { startSubscriptionCron } from "./utils/subscriptionCron.js";
import { autoInvalidateCache } from "./middleware/autoInvalidateCache.js";
import { Server } from "socket.io";
import { initializeWebSocketSpaceOverView } from "./controllers/webSocketSpaceOverView.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
app.use(express.json());
app.use(express.static(path.join(__dirname, "images")));

const PORT = process.env.PORT;

// database connection
await connectDB();
await connectRedis();
startStorageUsageCron();
startBranchStatsCron();
startDailyReportCron();
startVisitAutoCancelCron();
startSubscriptionCron();

app.set("trust proxy", 1);

// Security Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

app.use((req, res, next) => {
  const sanitize = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === "string") {
        obj[key] = xss(obj[key]);
      }
    }
  };
  sanitize(req.body);
  sanitize(req.query);
  sanitize(req.params);
  next();
});

app.use(autoInvalidateCache());

import { apiLimiter, authLimiter } from "./middleware/rateLimit.js";

// Routes
import authRouter from "./routes/auth.js";
import roleRouter from "./routes/role.js";
import userRouter from "./routes/user.js";
import permissionRouter from "./routes/permission.js";
import rolePermissionRouter from "./routes/rolePermission.js";
import userPermissionRouter from "./routes/userPermission.js";
import businessRouter from "./routes/business.js";
import branchRouter from "./routes/branch.js";
import branchUserPermissionRouter from "./routes/branchUserPermission.js";
import staffProfileRouter from "./routes/staffProfile.js";
import businessSettingsRouter from "./routes/BusinessSettings.js";
import payrollRouter from "./routes/payroll.js";
import spaceRouter from "./routes/space.js";
import deviceRouter from "./routes/device.js";
import unitRouter from "./routes/unit.js";
import equipmentRouter from "./routes/equipment.js";
import pricingRulesRouter from "./routes/pricingRules.js";
import gameModeRouter from "./routes/gameMode.js";
import resourcePricingRouter from "./routes/resourcePricing.js";
import planRouter from "./routes/plan.js";
import subscriptionRouter from "./routes/subscription.js";
import storageUsageRouter from "./routes/storageUsage.js";
import customerRouter from "./routes/customer.js";
import visitRouter from "./routes/visit.js";
import sessionRouter from "./routes/session.js";
import sessionComponentRouter from "./routes/sessionComponent.js";
import productRouter from "./routes/product.js";
import categoryRouter from "./routes/category.js";
import orderRouter from "./routes/order.js";
import orderItemRouter from "./routes/orderItem.js";
import invoiceRouter from "./routes/invoice.js";
import analyticsRouter from "./routes/analytics.js";
import reportRouter from "./routes/report.js";
import shiftRouter from "./routes/shift.js";
import shiftAttendanceRouter from "./routes/shiftAttendance.js";
import shiftExpenseRouter from "./routes/shiftExpense.js";
import webSocketSpaceOverViewRouter from "./routes/webSocketSpaceOverView.js";

import seedRouter from "./seeds/permissions.js";

app.use("/api/v1", apiLimiter);
app.use("/api/v1/auth", authLimiter, authRouter);
app.use("/api/v1/roles", roleRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/permissions", permissionRouter);
app.use("/api/v1/role-permissions", rolePermissionRouter);
app.use("/api/v1/user-permissions", userPermissionRouter);
app.use("/api/v1/businesses", businessRouter);
app.use("/api/v1/branches", branchRouter);
app.use("/api/v1/branch-user-permissions", branchUserPermissionRouter);
app.use("/api/v1/staff-profiles", staffProfileRouter);
app.use("/api/v1/business-settings", businessSettingsRouter);
app.use("/api/v1/payrolls", payrollRouter);
app.use("/api/v1/spaces", spaceRouter);
app.use("/api/v1/devices", deviceRouter);
app.use("/api/v1/units", unitRouter);
app.use("/api/v1/equipments", equipmentRouter);
app.use("/api/v1/game-modes", gameModeRouter);
app.use("/api/v1/pricing-rules", pricingRulesRouter);
app.use("/api/v1/resource-pricing", resourcePricingRouter);
app.use("/api/v1/plans", planRouter);
app.use("/api/v1/subscriptions", subscriptionRouter);
app.use("/api/v1/storage-usage", storageUsageRouter);
app.use("/api/v1/customers", customerRouter);
app.use("/api/v1/visits", visitRouter);
app.use("/api/v1/sessions", sessionRouter);
app.use("/api/v1/session-components", sessionComponentRouter);
app.use("/api/v1/products", productRouter);
app.use("/api/v1/categories", categoryRouter);
app.use("/api/v1/orders", orderRouter);
app.use("/api/v1/order-items", orderItemRouter);
app.use("/api/v1/invoices", invoiceRouter);
app.use("/api/v1/analytics", analyticsRouter);
app.use("/api/v1/reports", reportRouter);
app.use("/api/v1/shifts", shiftRouter);
app.use("/api/v1/shift-attendance", shiftAttendanceRouter);
app.use("/api/v1/shift-expenses", shiftExpenseRouter);
app.use("/api/v1/websocket-space-overview", webSocketSpaceOverViewRouter);

app.use("/api/v1/seed-permissions", seedRouter);

app.get("/", (req, res) => {
  res.send("Welcome to Spacefy API");
});

// Error Handling Middleware
app.use(errorHandler);

// CORS_ORIGINS is a comma-separated allow-list; it falls back to "*" only when
// unset, so a deploy that forgets it is loud in review rather than silently open.
const socketOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : "*";

const io = new Server(httpServer, {
  cors: {
    origin: socketOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

initializeWebSocketSpaceOverView(io);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// // 2 minutes — increase as needed for long-running operations (e.g. billing, reports)
// server.timeout = 120_000;       //  minute
// server.keepAliveTimeout = 65_000;
