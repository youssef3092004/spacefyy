import { prisma } from "../configs/db.js";

const PERMISSIONS = [
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
  { name: "CREATE-GAME-MODES", description: "Create game modes" },
  { name: "VIEW-GAME-MODES", description: "View game modes" },
  { name: "UPDATE-GAME-MODES", description: "Update game modes" },
  { name: "DELETE-GAME-MODES", description: "Delete game modes" },

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

  { name: "VIEW-PERMISSIONS-BY-USER", description: "View permissions by user" },

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

const ROLES = [
  { name: "ADMIN", description: "System administrator" },
  { name: "STAFF", description: "Staff member" },
  { name: "CUSTOMER", description: "Customer user" },
  { name: "OWNER", description: "Business owner" },
  { name: "DEVELOPER", description: "Developer with full access" },
];

// Define role -> permission mappings
const ROLE_PERMISSION_MAPPINGS = {
  DEVELOPER: null, // null means ALL permissions
  OWNER: null, // null means ALL permissions
  ADMIN: null, // null means ALL permissions
  STAFF: [
    "VIEW-BRANCHES",
    "VIEW-DEVICES",
    "VIEW-SPACES",
    "VIEW-UNITS",
    "VIEW-EQUIPMENT",
    "VIEW-GAME-MODES",
    "VIEW-PRICING-RULES",
    "CREATE-VISITS",
    "VIEW-VISITS",
    "UPDATE-VISITS",
    "CREATE-SESSIONS",
    "VIEW-SESSIONS",
    "UPDATE-SESSIONS",
    "VIEW-STAFF-PROFILES",
    "UPDATE-STAFF-PROFILES",
    "CREATE_CUSTOMER",
    "VIEW_CUSTOMER",
    "UPDATE_CUSTOMER",
    "createOrder",
    "viewOrder",
    "updateOrder",
    "viewOrderAnalytics",
    "viewOrderSummary",
    "createOrderItem",
    "viewOrderItem",
    "updateOrderItem",
    "READ-CATEGORY",
    "READ-PRODUCTS",
    "UPDATE-PRODUCTS",
    "CREATE-INVOICES",
    "VIEW-INVOICES",
    "UPDATE-INVOICES",
  ],
  CUSTOMER: [
    "VIEW_CUSTOMER",
    "VIEW-VISITS",
    "viewOrder",
    "viewOrderItem",
    "VIEW-INVOICES",
  ],
};

async function seed() {
  try {
    console.log("🌱 Starting permissions & roles seed...\n");

    await prisma.$transaction(async (tx) => {
      // Step 1: Create permissions
      console.log("📋 Creating permissions...");
      const permResult = await tx.permission.createMany({
        data: PERMISSIONS,
        skipDuplicates: true,
      });
      console.log(`✅ Permissions: ${permResult.count} new/updated\n`);

      // Step 2: Create roles
      console.log("👤 Creating roles...");
      const roleResult = await tx.role.createMany({
        data: ROLES,
        skipDuplicates: true,
      });
      console.log(`✅ Roles: ${roleResult.count} new/updated\n`);

      // Step 3: Fetch all permissions and roles with IDs
      console.log("🔍 Fetching permission and role IDs...");
      const [allPermissions, allRoles] = await Promise.all([
        tx.permission.findMany({ select: { id: true, name: true } }),
        tx.role.findMany({ select: { id: true, name: true } }),
      ]);

      const permissionMap = new Map(allPermissions.map((p) => [p.name, p.id]));
      const roleMap = new Map(allRoles.map((r) => [r.name, r.id]));

      console.log(
        `Found ${permissionMap.size} permissions and ${roleMap.size} roles\n`,
      );

      // Step 4: Build role-permission assignments
      console.log("🔗 Building role-permission assignments...");
      const rolePermissionEntries = [];

      for (const [roleName, permissionNames] of Object.entries(
        ROLE_PERMISSION_MAPPINGS,
      )) {
        const roleId = roleMap.get(roleName);
        if (!roleId) {
          console.warn(`⚠️  Role ${roleName} not found, skipping`);
          continue;
        }

        let permsToAssign = [];

        if (permissionNames === null) {
          // Assign ALL permissions
          permsToAssign = Array.from(permissionMap.values());
        } else {
          // Assign specific permissions
          permsToAssign = permissionNames
            .map((name) => {
              const id = permissionMap.get(name);
              if (!id) {
                console.warn(
                  `⚠️  Permission ${name} not found for role ${roleName}`,
                );
              }
              return id;
            })
            .filter((id) => id !== undefined);
        }

        for (const permissionId of permsToAssign) {
          rolePermissionEntries.push({ roleId, permissionId });
        }

        console.log(`  ✓ ${roleName}: ${permsToAssign.length} permissions`);
      }

      console.log(
        `\n📊 Total role-permission entries: ${rolePermissionEntries.length}\n`,
      );

      // Step 5: Bulk create role-permission relations with chunking
      console.log("💾 Saving role-permission assignments...");
      const chunkSize = 1000;
      let chunkCount = 0;

      for (let i = 0; i < rolePermissionEntries.length; i += chunkSize) {
        const chunk = rolePermissionEntries.slice(i, i + chunkSize);
        const chunkResult = await tx.rolePermission.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        chunkCount += 1;
        console.log(
          `  ✓ Chunk ${chunkCount}: ${chunkResult.count} assignments`,
        );
      }

      console.log(`\n✅ Successfully created ${chunkCount} chunk(s)\n`);
    });

    console.log("🎉 Seed completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seed failed:", error.message);
    console.error(error);
    process.exit(1);
  }
}

seed();
