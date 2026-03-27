import { prisma } from "../configs/db.js";
import { Router } from "express";

const router = Router();

export const getPermissionIdsByNames = async (req, res, next) => {
  try {
    const permissionIds = await prisma.permission.findMany({
      where: {
        name: {
          in: [
            "REGISTER-ADMIN",
            "REGISTER-STAFF",
            "CREATE-BRANCHES",
            "VIEW-BRANCHES",
            "UPDATE-BRANCHES",
            "DELETE-BRANCHES",
            "CREATE-BUSINESSES",
            "VIEW-BUSINESSES",
            "UPDATE-BUSINESSES",
            "DELETE-BUSINESSES",
            "CREATE-BUSINESS-SETTINGS",
            "VIEW-BUSINESS-SETTINGS",
            "UPDATE-BUSINESS-SETTINGS",
            "DELETE-BUSINESS-SETTINGS",
            "CREATE-DEVICES",
            "VIEW-DEVICES",
            "UPDATE-DEVICES",
            "DELETE-DEVICES",
            "CREATE-PAYROLLS",
            "VIEW-PAYROLLS",
            "UPDATE-PAYROLLS",
            "DELETE-PAYROLLS",
            "CREATE-SPACES",
            "VIEW-SPACES",
            "UPDATE-SPACES",
            "DELETE-SPACES",
            "CREATE-STAFF-PROFILES",
            "VIEW-STAFF-PROFILES",
            "UPDATE-STAFF-PROFILES",
            "DELETE-STAFF-PROFILES",
            "CREATE-SESSIONS",
            "VIEW-SESSIONS",
            "UPDATE-SESSIONS",
            "DELETE-SESSIONS",
            "CREATE-VISITS",
            "VIEW-VISITS",
            "UPDATE-VISITS",
            "DELETE-VISITS",
            "CREATE-TOOLS",
            "VIEW-USERS",
            "DELETE-USERS",
            "UPDATE-USERS",
          ],
        },
      },
      select: {
        id: true,
      },
    });

    res.status(200).json({
      success: true,
      count: permissionIds.length,
      data: permissionIds,
    });
  } catch (error) {
    next(error);
  }
};

router.post("/get-ids", getPermissionIdsByNames);

export default router;
