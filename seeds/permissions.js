import { prisma } from "../configs/db.js";
import { redisClient } from "../configs/redis.js";
import { Router } from "express";
import { verifyToken } from "../middleware/auth.js";
import { AppError } from "../utils/appError.js";

const router = Router();

const requireDeveloper = (req, res, next) => {
  if (req.user?.roleName !== "DEVELOPER") {
    return next(
      new AppError("Forbidden: Only DEVELOPER can perform this action", 403),
    );
  }
  next();
};

export const PERMISSIONS = [
  { name: "REGISTER-OWNER", description: "Register business owner" },
  { name: "REGISTER-ADMIN", description: "Register admin user" },
  { name: "REGISTER-STAFF", description: "Register staff user" },

  { name: "CREATE-BRANCHES", description: "Create branches" },
  { name: "VIEW-BRANCHES", description: "View branches" },
  { name: "UPDATE-BRANCHES", description: "Update branches" },
  { name: "DELETE-BRANCHES", description: "Delete branches" },

  { name: "CREATE-BUSINESSES", description: "Create businesses" },
  { name: "VIEW-BUSINESSES", description: "View businesses" },
  { name: "UPDATE-BUSINESSES", description: "Update businesses" },
  { name: "DELETE-BUSINESSES", description: "Delete businesses" },

  { name: "CREATE-BUSINESS-SETTINGS", description: "Create business settings" },
  { name: "VIEW-BUSINESS-SETTINGS", description: "View business settings" },
  { name: "UPDATE-BUSINESS-SETTINGS", description: "Update business settings" },
  { name: "DELETE-BUSINESS-SETTINGS", description: "Delete business settings" },

  { name: "CREATE-DEVICES", description: "Create devices" },
  { name: "VIEW-DEVICES", description: "View devices" },
  { name: "UPDATE-DEVICES", description: "Update devices" },
  { name: "DELETE-DEVICES", description: "Delete devices" },

  { name: "CREATE-PAYROLLS", description: "Create payrolls" },
  { name: "VIEW-PAYROLLS", description: "View payrolls" },
  { name: "UPDATE-PAYROLLS", description: "Update payrolls" },
  { name: "DELETE-PAYROLLS", description: "Delete payrolls" },

  { name: "OPEN-SHIFTS", description: "Open shifts" },
  { name: "CLOSE-SHIFTS", description: "Close shifts" },
  { name: "VIEW-SHIFTS", description: "View shifts" },
  { name: "MANAGE-ATTENDANCE", description: "Manage shift attendance" },
  { name: "MANAGE-EXPENSES", description: "Manage shift petty-cash expenses" },

  { name: "CREATE-PERMISSIONS", description: "Create permissions" },
  { name: "VIEW-PERMISSIONS", description: "View permissions" },
  { name: "UPDATE-PERMISSIONS", description: "Update permissions" },
  { name: "DELETE-PERMISSIONS", description: "Delete permissions" },

  { name: "CREATE-ROLES", description: "Create roles" },
  { name: "VIEW-ROLES", description: "View roles" },
  { name: "UPDATE-ROLES", description: "Update roles" },
  { name: "DELETE-ROLES", description: "Delete roles" },

  { name: "CREATE-PLANS", description: "Create subscription plans" },
  { name: "VIEW-PLANS", description: "View subscription plans" },
  { name: "UPDATE-PLANS", description: "Update subscription plans" },
  { name: "DELETE-PLANS", description: "Delete subscription plans" },
  {
    name: "VIEW-PRIVATE-PLANS",
    description: "View private subscription plans",
  },

  { name: "CREATE-SUBSCRIPTIONS", description: "Create/change a business subscription" },
  { name: "VIEW-SUBSCRIPTIONS", description: "View business subscriptions" },
  { name: "RENEW-SUBSCRIPTIONS", description: "Renew a business subscription" },
  { name: "CANCEL-SUBSCRIPTIONS", description: "Cancel a business subscription" },

  {
    name: "CREATE-ROLE-PERMISSIONS",
    description: "Assign permissions to roles",
  },
  { name: "VIEW-ROLE-PERMISSIONS", description: "View role permissions" },
  { name: "UPDATE-ROLE-PERMISSIONS", description: "Update role permissions" },
  { name: "DELETE-ROLE-PERMISSIONS", description: "Delete role permissions" },

  { name: "CREATE-SPACES", description: "Create spaces" },
  { name: "VIEW-SPACES", description: "View spaces" },
  { name: "UPDATE-SPACES", description: "Update spaces" },
  { name: "DELETE-SPACES", description: "Delete spaces" },

  { name: "CREATE-PRICING-RULES", description: "Create pricing rules" },
  { name: "VIEW-PRICING-RULES", description: "View pricing rules" },
  { name: "UPDATE-PRICING-RULES", description: "Update pricing rules" },
  { name: "DELETE-PRICING-RULES", description: "Delete pricing rules" },

  { name: "CREATE-VISITS", description: "Create visits" },
  { name: "VIEW-VISITS", description: "View visits" },
  { name: "UPDATE-VISITS", description: "Update visits" },
  { name: "DELETE-VISITS", description: "Delete visits" },

  { name: "CREATE-SESSIONS", description: "Create sessions" },
  { name: "VIEW-SESSIONS", description: "View sessions" },
  { name: "UPDATE-SESSIONS", description: "Update sessions" },
  { name: "DELETE-SESSIONS", description: "Delete sessions" },

  { name: "CREATE-STAFF-PROFILES", description: "Create staff profiles" },
  { name: "VIEW-STAFF-PROFILES", description: "View staff profiles" },
  { name: "UPDATE-STAFF-PROFILES", description: "Update staff profiles" },
  { name: "DELETE-STAFF-PROFILES", description: "Delete staff profiles" },

  { name: "CREATE-UNITS", description: "Create units" },
  { name: "VIEW-UNITS", description: "View units" },
  { name: "UPDATE-UNITS", description: "Update units" },
  { name: "DELETE-UNITS", description: "Delete units" },

  { name: "CREATE-EQUIPMENT", description: "Create equipment" },
  { name: "VIEW-EQUIPMENT", description: "View equipment" },
  { name: "UPDATE-EQUIPMENT", description: "Update equipment" },
  { name: "DELETE-EQUIPMENT", description: "Delete equipment" },

  { name: "VIEW-USERS", description: "View users" },
  { name: "UPDATE-USERS", description: "Update users" },
  { name: "DELETE-USERS", description: "Delete users" },

  {
    name: "CREATE-BRANCH-USER-PERMISSIONS",
    description: "Create branch user permissions",
  },
  {
    name: "VIEW-BRANCH-USER-PERMISSIONS",
    description: "View branch user permissions",
  },
  {
    name: "UPDATE-BRANCH-USER-PERMISSIONS",
    description: "Update branch user permissions",
  },
  {
    name: "DELETE-BRANCH-USER-PERMISSIONS",
    description: "Delete branch user permissions",
  },
  { name: "CREATE-USER-PERMISSIONS", description: "Create user permissions" },
  { name: "VIEW-USER-PERMISSIONS", description: "View user permissions" },
  { name: "UPDATE-USER-PERMISSIONS", description: "Update user permissions" },
  { name: "DELETE-USER-PERMISSIONS", description: "Delete user permissions" },

  { name: "CREATE-CATEGORY", description: "Create categories" },
  { name: "READ-CATEGORY", description: "Read categories" },
  { name: "UPDATE-CATEGORY", description: "Update categories" },
  { name: "DELETE-CATEGORY", description: "Delete categories" },

  { name: "CREATE-PRODUCTS", description: "Create products" },
  { name: "READ-PRODUCTS", description: "Read products" },
  { name: "UPDATE-PRODUCTS", description: "Update products" },
  { name: "DELETE-PRODUCTS", description: "Delete products" },

  { name: "CREATE-INVOICES", description: "Create invoices" },
  { name: "VIEW-INVOICES", description: "View invoices" },
  { name: "UPDATE-INVOICES", description: "Update invoices" },
  { name: "DELETE-INVOICES", description: "Delete invoices" },

  { name: "CREATE_CUSTOMER", description: "Create customer" },
  { name: "VIEW_CUSTOMER", description: "View customer" },
  { name: "UPDATE_CUSTOMER", description: "Update customer" },
  { name: "DELETE_CUSTOMER", description: "Delete customer" },
  { name: "DELETE_ALL_CUSTOMERS", description: "Delete all customers" },

  {
    name: "VIEW-PERMISSIONS-BY-USER",
    description: "View permissions by user",
  },

  { name: "createOrder", description: "Create orders" },
  { name: "viewOrder", description: "View orders" },
  { name: "updateOrder", description: "Update orders" },
  { name: "deleteOrder", description: "Delete orders" },
  { name: "viewOrderAnalytics", description: "View order analytics" },
  { name: "viewOrderSummary", description: "View order summary" },

  { name: "createOrderItem", description: "Create order items" },
  { name: "viewOrderItem", description: "View order items" },
  { name: "updateOrderItem", description: "Update order items" },
  { name: "deleteOrderItem", description: "Delete order items" },
];

export const ROLES = [
  { name: "ADMIN", description: "System administrator" },
  { name: "STAFF", description: "Staff member" },
  { name: "CUSTOMER", description: "Customer user" },
  { name: "OWNER", description: "Business owner" },
  { name: "DEVELOPER", description: "Developer with full access" },
];

const STAFF_PERMISSIONS = [
  // View branches assigned to them
  "VIEW-BRANCHES",

  // Devices
  "VIEW-DEVICES",

  // Spaces
  "VIEW-SPACES",

  // Units & Equipment
  "VIEW-UNITS",
  "VIEW-EQUIPMENT",

  // Pricing Rules (view only)
  "VIEW-PRICING-RULES",

  // Visits
  "CREATE-VISITS",
  "VIEW-VISITS",
  "UPDATE-VISITS",

  // Sessions
  "CREATE-SESSIONS",
  "VIEW-SESSIONS",
  "UPDATE-SESSIONS",

  // Staff profile (self or limited)
  "VIEW-STAFF-PROFILES",
  "UPDATE-STAFF-PROFILES",

  // Customers
  "CREATE_CUSTOMER",
  "VIEW_CUSTOMER",
  "UPDATE_CUSTOMER",

  // Orders
  "createOrder",
  "viewOrder",
  "updateOrder",
  "viewOrderAnalytics",
  "viewOrderSummary",

  // Order items
  "createOrderItem",
  "viewOrderItem",
  "updateOrderItem",

  // Catalog (read and light management)
  "READ-CATEGORY",
  "READ-PRODUCTS",
  "UPDATE-PRODUCTS",

  // Invoices
  "CREATE-INVOICES",
  "VIEW-INVOICES",
  "UPDATE-INVOICES",

  // Shifts
  "OPEN-SHIFTS",
  "CLOSE-SHIFTS",
  "VIEW-SHIFTS",
  "MANAGE-ATTENDANCE",
  "MANAGE-EXPENSES",
];

const createPermissionsBulk = async (req, res, next) => {
  try {
    const { permissionsCount, rolesCount } = await prisma.$transaction(
      async (tx) => {
        const permissionsResult = await tx.permission.createMany({
          data: PERMISSIONS,
          skipDuplicates: true,
        });

        const rolesResult = await tx.role.createMany({
          data: ROLES,
          skipDuplicates: true,
        });

        return {
          permissionsCount: permissionsResult.count,
          rolesCount: rolesResult.count,
        };
      },
    );

    // Clear permissions and roles caches
    const [permissionKeys, roleKeys] = await Promise.all([
      redisClient.keys("permissions:*"),
      redisClient.keys("roles:*"),
    ]);
    const keys = [...permissionKeys, ...roleKeys];
    if (keys.length > 0) {
      await redisClient.del(keys);
    }

    res.status(201).json({
      status: "success",
      message: "Permissions and roles created successfully",
      insertedPermissionsCount: permissionsCount,
      insertedRolesCount: rolesCount,
      source: "database",
    });
  } catch (error) {
    next(error);
  }
};

const assignPermissionsToRole = async (roleName, permissionNames) => {
  try {
    // 1️⃣ Get role
    const role = await prisma.role.findUnique({
      where: { name: roleName },
    });

    if (!role) {
      throw new Error(`Role ${roleName} not found`);
    }

    // 2️⃣ Get permissions by names
    const permissions = await prisma.permission.findMany({
      where: {
        name: {
          in: permissionNames,
        },
      },
    });

    if (permissions.length !== permissionNames.length) {
      throw new Error("Some permissions were not found");
    }

    // 3️⃣ Create role-permission relations
    const rolePermissionsData = permissions.map((permission) => ({
      roleId: role.id,
      permissionId: permission.id,
    }));

    const result = await prisma.rolePermission.createMany({
      data: rolePermissionsData,
      skipDuplicates: true,
    });

    console.log(`✅ Assigned ${result.count} permissions to role ${roleName}`);
  } catch (error) {
    console.error(error);
  }
};

router.post("/seed", verifyToken, requireDeveloper, createPermissionsBulk);

router.post("/assign/staff", verifyToken, requireDeveloper, async (req, res, next) => {
  try {
    await assignPermissionsToRole("STAFF", STAFF_PERMISSIONS);

    res.status(200).json({
      status: "success",
      message: "Staff permissions assigned successfully",
      count: STAFF_PERMISSIONS.length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
