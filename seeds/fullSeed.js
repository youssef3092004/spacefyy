import pkg from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcrypt";
import process from "process";
import "dotenv/config";

const { PrismaClient } = pkg;

const connectionString =
  process.env.SUPABASE_URL ||
  process.env.PRISMA_URL ||
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing database connection string.");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ═══════════════════════════════════════════════════════════════════
// FIXED IDs
// ═══════════════════════════════════════════════════════════════════

const BUSINESS_ID = "52dc10db-6d71-4ee5-b575-327a26877292";
const BRANCH_ID   = "2d5fc02a-1e68-4f11-8515-bcb9a3967632";
const PLAN_ID     = "11223344-5566-4789-aaaa-bbbbccccdddd";
const OWNER_ID    = "23344556-7788-49bb-ccdd-eeff00113322";
const STAFF_ID    = "34455667-8899-4cc0-ddee-ff0011334422";

// Spaces
const SPACE_GAMING_ID  = "sp000001-0000-4000-8000-000000000001";
const SPACE_VIP_ID     = "sp000002-0000-4000-8000-000000000002";
const SPACE_MEETING_ID = "sp000003-0000-4000-8000-000000000003";

// Devices (match session.json resourceIds)
const DEVICE_IDS = [
  "de000001-0000-4000-8000-000000000000",
  "de000002-0000-4000-8000-000000000000",
  "de000003-0000-4000-8000-000000000000",
  "de000004-0000-4000-8000-000000000000",
  "de000005-0000-4000-8000-000000000000",
  "de000006-0000-4000-8000-000000000000",
  "de000007-0000-4000-8000-000000000000",
  "de000008-0000-4000-8000-000000000000",
  "de000009-0000-4000-8000-000000000000",
  "de00000a-0000-4000-8000-000000000000",
];

// Units
const UNIT_IDS = [
  "un000001-0000-4000-8000-000000000001",
  "un000002-0000-4000-8000-000000000002",
  "un000003-0000-4000-8000-000000000003",
  "un000004-0000-4000-8000-000000000004",
  "un000005-0000-4000-8000-000000000005",
];

// Equipment
const EQUIP_IDS = [
  "eq000001-0000-4000-8000-000000000001",
  "eq000002-0000-4000-8000-000000000002",
  "eq000003-0000-4000-8000-000000000003",
  "eq000004-0000-4000-8000-000000000004",
];

// Pricing Rules
const PR_IDS = [
  "pr000001-0000-4000-8000-000000000001",
  "pr000002-0000-4000-8000-000000000002",
  "pr000003-0000-4000-8000-000000000003",
  "pr000004-0000-4000-8000-000000000004",
  "pr000005-0000-4000-8000-000000000005",
];

// Staff
const STAFF_PROFILE_ID = "sp100001-0000-4000-8000-000000000001";
const NATIONAL_ID_ID   = "ni000001-0000-4000-8000-000000000001";
const PAYROLL_ID       = "pa000001-0000-4000-8000-000000000001";

// Customers (match customer.json IDs)
const CUSTOMER_IDS = [
  "c0000001-0000-4000-8000-000000000000",
  "c0000002-0000-4000-8000-000000000000",
  "c0000003-0000-4000-8000-000000000000",
  "c0000004-0000-4000-8000-000000000000",
  "c0000005-0000-4000-8000-000000000000",
  "c0000006-0000-4000-8000-000000000000",
  "c0000007-0000-4000-8000-000000000000",
  "c0000008-0000-4000-8000-000000000000",
  "c0000009-0000-4000-8000-000000000000",
  "c000000a-0000-4000-8000-000000000000",
  "c000000b-0000-4000-8000-000000000000",
  "c000000c-0000-4000-8000-000000000000",
  "c000000d-0000-4000-8000-000000000000",
  "c000000e-0000-4000-8000-000000000000",
  "c000000f-0000-4000-8000-000000000000",
];

// Customer Branches
const CB_IDS = [
  "cb000001-0000-4000-8000-000000000000",
  "cb000002-0000-4000-8000-000000000000",
  "cb000003-0000-4000-8000-000000000000",
  "cb000004-0000-4000-8000-000000000000",
  "cb000005-0000-4000-8000-000000000000",
  "cb000006-0000-4000-8000-000000000000",
  "cb000007-0000-4000-8000-000000000000",
  "cb000008-0000-4000-8000-000000000000",
  "cb000009-0000-4000-8000-000000000000",
  "cb00000a-0000-4000-8000-000000000000",
  "cb00000b-0000-4000-8000-000000000000",
  "cb00000c-0000-4000-8000-000000000000",
  "cb00000d-0000-4000-8000-000000000000",
  "cb00000e-0000-4000-8000-000000000000",
  "cb00000f-0000-4000-8000-000000000000",
];

// Visits (match visitSession.json IDs)
const VISIT_IDS = [
  "b0000001-0000-4000-8000-000000000000",
  "b0000002-0000-4000-8000-000000000000",
  "b0000003-0000-4000-8000-000000000000",
  "b0000004-0000-4000-8000-000000000000",
  "b0000005-0000-4000-8000-000000000000",
  "b0000006-0000-4000-8000-000000000000",
  "b0000007-0000-4000-8000-000000000000",
  "b0000008-0000-4000-8000-000000000000",
  "b0000009-0000-4000-8000-000000000000",
  "b000000a-0000-4000-8000-000000000000",
];

// Sessions (match session.json IDs)
const SESSION_IDS = [
  "e5000001-0000-4000-8000-000000000000",
  "e5000002-0000-4000-8000-000000000000",
  "e5000003-0000-4000-8000-000000000000",
  "e5000004-0000-4000-8000-000000000000",
  "e5000005-0000-4000-8000-000000000000",
  "e5000006-0000-4000-8000-000000000000",
  "e5000007-0000-4000-8000-000000000000",
  "e5000008-0000-4000-8000-000000000000",
  "e5000009-0000-4000-8000-000000000000",
  "e500000a-0000-4000-8000-000000000000",
];

// Invoices
const INVOICE_IDS = [
  "iv000001-0000-4000-8000-000000000001",
  "iv000002-0000-4000-8000-000000000002",
  "iv000003-0000-4000-8000-000000000003",
  "iv000004-0000-4000-8000-000000000004",
  "iv000005-0000-4000-8000-000000000005",
  "iv000006-0000-4000-8000-000000000006",
  "iv000007-0000-4000-8000-000000000007",
  "iv000008-0000-4000-8000-000000000008",
  "iv000009-0000-4000-8000-000000000009",
  "iv00000a-0000-4000-8000-000000000010",
];

// Categories
const CAT_FOOD_ID   = "ca000001-0000-4000-8000-000000000001";
const CAT_GAMING_ID = "ca000002-0000-4000-8000-000000000002";
const CAT_MERCH_ID  = "ca000003-0000-4000-8000-000000000003";

// Products
const PROD_IDS = [
  "pd000001-0000-4000-8000-000000000001",
  "pd000002-0000-4000-8000-000000000002",
  "pd000003-0000-4000-8000-000000000003",
  "pd000004-0000-4000-8000-000000000004",
  "pd000005-0000-4000-8000-000000000005",
  "pd000006-0000-4000-8000-000000000006",
];

// Orders
const ORDER_IDS = [
  "or000001-0000-4000-8000-000000000001",
  "or000002-0000-4000-8000-000000000002",
  "or000003-0000-4000-8000-000000000003",
  "or000004-0000-4000-8000-000000000004",
  "or000005-0000-4000-8000-000000000005",
];

// Order Items
const OI_IDS = [
  "oi000001-0000-4000-8000-000000000001",
  "oi000002-0000-4000-8000-000000000002",
  "oi000003-0000-4000-8000-000000000003",
  "oi000004-0000-4000-8000-000000000004",
  "oi000005-0000-4000-8000-000000000005",
  "oi000006-0000-4000-8000-000000000006",
  "oi000007-0000-4000-8000-000000000007",
  "oi000008-0000-4000-8000-000000000008",
];

// ═══════════════════════════════════════════════════════════════════
// STATIC DATA
// ═══════════════════════════════════════════════════════════════════

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
  { name: "VIEW-PRIVATE-PLANS", description: "View private subscription plans" },
  { name: "CREATE-ROLE-PERMISSIONS", description: "Assign permissions to roles" },
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
  { name: "CREATE-BRANCH-USER-PERMISSIONS", description: "Create branch user permissions" },
  { name: "VIEW-BRANCH-USER-PERMISSIONS", description: "View branch user permissions" },
  { name: "UPDATE-BRANCH-USER-PERMISSIONS", description: "Update branch user permissions" },
  { name: "DELETE-BRANCH-USER-PERMISSIONS", description: "Delete branch user permissions" },
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
  { name: "ADMIN",     description: "System administrator" },
  { name: "STAFF",     description: "Staff member" },
  { name: "CUSTOMER",  description: "Customer user" },
  { name: "OWNER",     description: "Business owner" },
  { name: "DEVELOPER", description: "Developer with full access" },
];

// Permissions granted to staff at branch level
const STAFF_BRANCH_PERMISSIONS = [
  "VIEW-BRANCHES",
  "VIEW-DEVICES",
  "VIEW-SPACES",
  "VIEW-UNITS",
  "VIEW-EQUIPMENT",
  "VIEW-PRICING-RULES",
  "CREATE-VISITS", "VIEW-VISITS", "UPDATE-VISITS",
  "CREATE-SESSIONS", "VIEW-SESSIONS", "UPDATE-SESSIONS",
  "VIEW-STAFF-PROFILES", "UPDATE-STAFF-PROFILES",
  "CREATE_CUSTOMER", "VIEW_CUSTOMER", "UPDATE_CUSTOMER",
  "CREATE-INVOICES", "VIEW-INVOICES", "UPDATE-INVOICES",
  "READ-CATEGORY", "READ-PRODUCTS", "UPDATE-PRODUCTS",
  "createOrder", "viewOrder", "updateOrder", "viewOrderAnalytics", "viewOrderSummary",
  "createOrderItem", "viewOrderItem", "updateOrderItem",
];

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log("🌱 Full seed starting...\n");

  const hashedPw = await bcrypt.hash("Demo@1234", 10);

  // ── 1. Plan ──────────────────────────────────────────────────────────────
  console.log("📋 [1/27] Plan...");
  await prisma.plan.upsert({
    where: { id: PLAN_ID },
    update: {},
    create: {
      id: PLAN_ID,
      name: "Professional Plan",
      type: "PRO",
      description: "Professional plan for growing businesses",
      price: 299.99,
      currency: "EGP",
      billingInterval: "MONTHLY",
      isActive: true,
      isPublic: true,
      maxStaff: 25,
      maxBranches: 5,
      maxSpaces: 50,
      maxDevices: 100,
      maxUnits: 250,
      maxEquipment: 200,
    },
  });
  console.log("  ✓ Plan");

  // ── 2. Roles ─────────────────────────────────────────────────────────────
  console.log("👑 [2/27] Roles...");
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }
  console.log("  ✓ Roles (5)");

  // ── 3. Permissions ────────────────────────────────────────────────────────
  console.log("🔑 [3/27] Permissions...");
  await prisma.permission.createMany({ data: PERMISSIONS, skipDuplicates: true });
  const allPerms = await prisma.permission.findMany({ select: { id: true, name: true } });
  console.log(`  ✓ Permissions (${allPerms.length})`);

  // ── 4. RolePermissions ────────────────────────────────────────────────────
  console.log("🔗 [4/27] Role permissions...");
  const allRoles = await prisma.role.findMany({ select: { id: true, name: true } });
  for (const role of allRoles) {
    await prisma.rolePermission.createMany({
      data: allPerms.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }
  console.log(`  ✓ RolePermissions (${allRoles.length} roles × ${allPerms.length} permissions)`);

  // ── 5. Users ─────────────────────────────────────────────────────────────
  console.log("👤 [5/27] Users...");
  const ownerRole = allRoles.find((r) => r.name === "OWNER");
  const staffRole = allRoles.find((r) => r.name === "STAFF");

  await prisma.user.upsert({
    where: { id: OWNER_ID },
    update: {},
    create: {
      id: OWNER_ID,
      name: "Owner User",
      email: "owner@spacefyy.io",
      phone: "01000000001",
      password: hashedPw,
      roleId: ownerRole?.id ?? null,
    },
  });

  await prisma.user.upsert({
    where: { id: STAFF_ID },
    update: {},
    create: {
      id: STAFF_ID,
      name: "Staff User",
      email: "staff@spacefyy.io",
      phone: "01000000002",
      password: hashedPw,
      roleId: staffRole?.id ?? null,
    },
  });
  console.log("  ✓ Users (owner, staff)");

  // ── 6. Business ───────────────────────────────────────────────────────────
  console.log("🏢 [6/27] Business...");
  await prisma.business.upsert({
    where: { id: BUSINESS_ID },
    update: {},
    create: {
      id: BUSINESS_ID,
      name: "Spacefyy Main Business",
      ownerId: OWNER_ID,
      planId: PLAN_ID,
    },
  });
  console.log("  ✓ Business");

  // ── 7. BusinessSettings ───────────────────────────────────────────────────
  console.log("⚙️  [7/27] BusinessSettings...");
  await prisma.businessSettings.upsert({
    where: { businessId: BUSINESS_ID },
    update: {},
    create: {
      businessId: BUSINESS_ID,
      defaultLanguage: "EN",
      notificationsEnabled: true,
      autoApprovePayroll: false,
    },
  });
  console.log("  ✓ BusinessSettings");

  // ── 8. StorageUsage ───────────────────────────────────────────────────────
  console.log("📦 [8/27] StorageUsage...");
  await prisma.storageUsage.upsert({
    where: { businessId: BUSINESS_ID },
    update: {},
    create: {
      businessId: BUSINESS_ID,
      currentBranches: 1,
      currentSpaces: 3,
      currentDevices: 10,
      currentUnits: 5,
      currentEquipment: 4,
      currentStaff: 1,
      currentUsers: 2,
    },
  });
  console.log("  ✓ StorageUsage");

  // ── 9. Branch ─────────────────────────────────────────────────────────────
  console.log("🏪 [9/27] Branch...");
  await prisma.branch.upsert({
    where: { id: BRANCH_ID },
    update: {},
    create: {
      id: BRANCH_ID,
      businessId: BUSINESS_ID,
      name: "Main Branch",
      address: "123 Gaming Street, Cairo, Egypt",
      isActive: true,
    },
  });
  console.log("  ✓ Branch");

  // ── 10. Spaces ────────────────────────────────────────────────────────────
  console.log("🎮 [10/27] Spaces...");
  const spaces = [
    { id: SPACE_GAMING_ID,  name: "Gaming Hall",   type: "PUBLIC",  capacity: 20, priceType: "PER_HOUR",    price: 80  },
    { id: SPACE_VIP_ID,     name: "VIP Room",      type: "VIP",     capacity: 6,  priceType: "PER_HOUR",    price: 120 },
    { id: SPACE_MEETING_ID, name: "Meeting Room",  type: "MEETING", capacity: 8,  priceType: "PER_SESSION", price: 200 },
  ];
  for (const s of spaces) {
    await prisma.space.upsert({
      where: { id: s.id },
      update: {},
      create: { ...s, branchId: BRANCH_ID, availableNumber: 1, isActive: true },
    });
  }
  console.log("  ✓ Spaces (3)");

  // ── 11. Devices ───────────────────────────────────────────────────────────
  console.log("🖥️  [11/27] Devices...");
  const deviceData = [
    { id: DEVICE_IDS[0], name: "PS5 Station 1",    type: "PS5_2",        spaceId: SPACE_GAMING_ID, price: 80  },
    { id: DEVICE_IDS[1], name: "PS5 Station 2",    type: "PS5_2",        spaceId: SPACE_GAMING_ID, price: 80  },
    { id: DEVICE_IDS[2], name: "PS5 Station 3",    type: "PS5_2",        spaceId: SPACE_GAMING_ID, price: 80  },
    { id: DEVICE_IDS[3], name: "PS5 Station 4",    type: "PS5_2",        spaceId: SPACE_GAMING_ID, price: 80  },
    { id: DEVICE_IDS[4], name: "Xbox Series X 1",  type: "XBOX_SERIES_X",spaceId: SPACE_GAMING_ID, price: 80  },
    { id: DEVICE_IDS[5], name: "Xbox Series X 2",  type: "XBOX_SERIES_X",spaceId: SPACE_GAMING_ID, price: 80  },
    { id: DEVICE_IDS[6], name: "Gaming PC 1",      type: "PC",           spaceId: SPACE_GAMING_ID, price: 80  },
    { id: DEVICE_IDS[7], name: "Gaming PC 2",      type: "PC",           spaceId: SPACE_GAMING_ID, price: 80  },
    { id: DEVICE_IDS[8], name: "PS5 VIP 1",        type: "PS5_4",        spaceId: SPACE_VIP_ID,    price: 120 },
    { id: DEVICE_IDS[9], name: "PS5 VIP 2",        type: "PS5_4",        spaceId: SPACE_VIP_ID,    price: 120 },
  ];
  for (const d of deviceData) {
    await prisma.device.upsert({
      where: { id: d.id },
      update: {},
      create: {
        id: d.id,
        branchId: BRANCH_ID,
        spaceId: d.spaceId,
        name: d.name,
        type: d.type,
        priceType: "PER_HOUR",
        price: d.price,
        isActive: true,
      },
    });
  }
  console.log("  ✓ Devices (10)");

  // ── 12. Units ─────────────────────────────────────────────────────────────
  console.log("🏓 [12/27] Units...");
  const unitData = [
    { id: UNIT_IDS[0], name: "Table Tennis 1",  type: "TABLE_TENNIS_TABLE" },
    { id: UNIT_IDS[1], name: "Table Tennis 2",  type: "TABLE_TENNIS_TABLE" },
    { id: UNIT_IDS[2], name: "Billiard Table 1",type: "BILLIARD_TABLE"     },
    { id: UNIT_IDS[3], name: "Billiard Table 2",type: "BILLIARD_TABLE"     },
    { id: UNIT_IDS[4], name: "Study Desk 1",    type: "DESK"               },
  ];
  for (const u of unitData) {
    await prisma.unit.upsert({
      where: { id: u.id },
      update: {},
      create: { id: u.id, branchId: BRANCH_ID, name: u.name, type: u.type, priceType: "PER_HOUR", price: 60, isActive: true },
    });
  }
  console.log("  ✓ Units (5)");

  // ── 13. Equipment ─────────────────────────────────────────────────────────
  console.log("🕹️  [13/27] Equipment...");
  const equipData = [
    { id: EQUIP_IDS[0], name: "DualSense Controller", type: "CONTROLLER", quantity: 10, price: 20 },
    { id: EQUIP_IDS[1], name: "Xbox Controller",       type: "CONTROLLER", quantity: 8,  price: 20 },
    { id: EQUIP_IDS[2], name: "Gaming Headset",         type: "HEADSET",    quantity: 5,  price: 15 },
    { id: EQUIP_IDS[3], name: "Mechanical Keyboard",    type: "KEYBOARD",   quantity: 4,  price: 10 },
  ];
  for (const e of equipData) {
    await prisma.equipment.upsert({
      where: { id: e.id },
      update: {},
      create: {
        id: e.id,
        branchId: BRANCH_ID,
        name: e.name,
        type: e.type,
        priceType: "PER_HOUR",
        price: e.price,
        quantity: e.quantity,
        isActive: true,
      },
    });
  }
  console.log("  ✓ Equipment (4)");

  // ── 14. PricingRules ──────────────────────────────────────────────────────
  console.log("💰 [14/27] PricingRules...");
  const pricingRules = [
    {
      id: PR_IDS[0], name: "Gaming Hall — Per Hour",
      branchId: BRANCH_ID, spaceId: SPACE_GAMING_ID,
      pricingType: "PER_HOUR", pricingMode: "PER_HOUR", price: 80, isActive: true,
    },
    {
      id: PR_IDS[1], name: "VIP Room — Per Hour",
      branchId: BRANCH_ID, spaceId: SPACE_VIP_ID,
      pricingType: "PER_HOUR", pricingMode: "PER_HOUR", price: 120, isActive: true,
    },
    {
      id: PR_IDS[2], name: "Table / Billiard — Per Hour",
      branchId: BRANCH_ID, unitId: UNIT_IDS[0],
      pricingType: "PER_HOUR", pricingMode: "PER_HOUR", price: 60, isActive: true,
    },
    {
      id: PR_IDS[3], name: "Equipment — Per Hour",
      branchId: BRANCH_ID, equipmentId: EQUIP_IDS[0],
      pricingType: "PER_HOUR", pricingMode: "PER_HOUR", price: 20, isActive: true,
    },
    {
      id: PR_IDS[4], name: "Meeting Room — Fixed",
      branchId: BRANCH_ID, spaceId: SPACE_MEETING_ID,
      pricingType: "PER_SESSION", pricingMode: "FIXED_PRICE", price: 200, isActive: true,
    },
  ];
  for (const pr of pricingRules) {
    await prisma.pricingRule.upsert({ where: { id: pr.id }, update: {}, create: pr });
  }
  console.log("  ✓ PricingRules (5)");

  // ── 15. StaffProfile ──────────────────────────────────────────────────────
  console.log("👔 [15/27] StaffProfile...");
  await prisma.staffProfile.upsert({
    where: { userId: STAFF_ID },
    update: {},
    create: {
      id: STAFF_PROFILE_ID,
      userId: STAFF_ID,
      branchId: BRANCH_ID,
      baseSalary: 3500,
      hireDate: new Date("2025-01-15"),
      position: "Gaming Staff",
      department: "Operations",
    },
  });
  console.log("  ✓ StaffProfile");

  // ── 16. NationalId ────────────────────────────────────────────────────────
  console.log("🪪 [16/27] NationalId...");
  const existingNid = await prisma.nationalId.findUnique({ where: { staffProfileId: STAFF_PROFILE_ID } });
  if (!existingNid) {
    await prisma.nationalId.create({
      data: {
        id: NATIONAL_ID_ID,
        staffProfileId: STAFF_PROFILE_ID,
        number: "29501151234567",
        frontImage: "https://placehold.co/600x400?text=National+ID+Front",
        backImage:  "https://placehold.co/600x400?text=National+ID+Back",
      },
    });
  }
  console.log("  ✓ NationalId");

  // ── 17. Payroll ───────────────────────────────────────────────────────────
  console.log("💳 [17/27] Payroll...");
  await prisma.payroll.upsert({
    where: { staffProfileId_month_year: { staffProfileId: STAFF_PROFILE_ID, month: 4, year: 2026 } },
    update: {},
    create: {
      id: PAYROLL_ID,
      staffProfileId: STAFF_PROFILE_ID,
      grossSalary: 3500,
      bonus: 500,
      overtime: 200,
      deductions: 100,
      netSalary: 4100,
      method: "BANK",
      status: "PAID",
      month: 4,
      year: 2026,
      approvedById: OWNER_ID,
      approvedAt: new Date("2026-04-30T12:00:00Z"),
      paidAt: new Date("2026-05-01T10:00:00Z"),
    },
  });
  console.log("  ✓ Payroll (April 2026)");

  // ── 18. Customers ─────────────────────────────────────────────────────────
  console.log("👥 [18/27] Customers...");
  const customers = [
    { id: CUSTOMER_IDS[0],  seq: 1,  name: "Ahmed Hassan",   phone: "01012345601", email: "ahmed.hassan@spacefyy.demo",   tags: ["VIP","Loyal"],       notes: "Prefers PS5 zone, usually books weekend evenings.", birthday: "1990-03-15", hasDiscount: true, discountType: "PERCENTAGE", discountAmount: 10 },
    { id: CUSTOMER_IDS[1],  seq: 2,  name: "Mohamed Ali",    phone: "01123456702", email: "mohamed.ali@spacefyy.demo",    tags: ["Regular"] },
    { id: CUSTOMER_IDS[2],  seq: 3,  name: "Sara Ibrahim",   phone: "01234567803", email: "sara.ibrahim@spacefyy.demo",   tags: ["New"],               notes: "Registered online, first visit pending." },
    { id: CUSTOMER_IDS[3],  seq: 4,  name: "Youssef Khaled", phone: "01012348904", email: "youssef.khaled@spacefyy.demo", tags: ["Loyal"],              notes: "Always comes in a group of 4, prefers FIFA tournaments." },
    { id: CUSTOMER_IDS[4],  seq: 5,  name: "Nour Mahmoud",   phone: "01123459005", email: "nour.mahmoud@spacefyy.demo",   tags: ["Regular"] },
    { id: CUSTOMER_IDS[5],  seq: 6,  name: "Amr Sayed",      phone: "01234560006", email: "amr.sayed@spacefyy.demo",      tags: ["VIP"],               notes: "Corporate account — billed monthly.", hasDiscount: true, discountType: "FLAT", discountAmount: 50 },
    { id: CUSTOMER_IDS[6],  seq: 7,  name: "Hana Mostafa",   phone: "01012341007", email: "hana.mostafa@spacefyy.demo",   tags: ["New"] },
    { id: CUSTOMER_IDS[7],  seq: 8,  name: "Karim Omar",     phone: "01123452008", email: "karim.omar@spacefyy.demo",     tags: ["Blacklisted"],       notes: "Caused damage to equipment on 2026-03-20.", isBlocked: true, blockedReason: "Equipment damage — do not serve without manager approval." },
    { id: CUSTOMER_IDS[8],  seq: 9,  name: "Mona Adel",      phone: "01234563009", email: "mona.adel@spacefyy.demo",      tags: ["Regular"] },
    { id: CUSTOMER_IDS[9],  seq: 10, name: "Omar Fares",     phone: "01012344010", email: "omar.fares@spacefyy.demo",     tags: ["VIP","Loyal"],       notes: "Top spender, monthly average 800 EGP." },
    { id: CUSTOMER_IDS[10], seq: 11, name: "Laila Hassan",   phone: "01123455011", email: "laila.hassan@spacefyy.demo",   tags: ["New"] },
    { id: CUSTOMER_IDS[11], seq: 12, name: "Tarek Nasser",   phone: "01234566012", email: "tarek.nasser@spacefyy.demo",   tags: ["Regular"],           notes: "Prefers weekday afternoons, PC zone only." },
    { id: CUSTOMER_IDS[12], seq: 13, name: "Dina Samir",     phone: "01012347013", email: "dina.samir@spacefyy.demo",     tags: ["VIP"],               notes: "Gift card holder, balance tracked separately." },
    { id: CUSTOMER_IDS[13], seq: 14, name: "Rania Fouad",    phone: "01123458014", email: "rania.fouad@spacefyy.demo",    tags: ["Loyal"] },
    { id: CUSTOMER_IDS[14], seq: 15, name: "Bassem Adly",    phone: "01234569015", email: "bassem.adly@spacefyy.demo",    tags: ["Regular"] },
  ];

  // seq → actual DB id (the upsert may hit an existing row with a different id)
  const cid = {};
  for (const c of customers) {
    const result = await prisma.customer.upsert({
      where: { businessId_seqNumber: { businessId: BUSINESS_ID, seqNumber: c.seq } },
      update: { name: c.name, tags: c.tags ?? [] },
      create: {
        id: c.id,
        businessId: BUSINESS_ID,
        seqNumber: c.seq,
        name: c.name,
        phone: c.phone,
        email: c.email ?? null,
        tags: c.tags ?? [],
        notes: c.notes ?? null,
        birthday: c.birthday ? new Date(c.birthday) : null,
        isBlocked: c.isBlocked ?? false,
        blockedReason: c.blockedReason ?? null,
        hasDiscount: c.hasDiscount ?? false,
        discountType: c.discountType ?? "FLAT",
        discountAmount: c.discountAmount ?? 0,
      },
    });
    cid[c.seq] = result.id;
  }
  console.log("  ✓ Customers (15)");

  // ── 19. CustomerBranch ────────────────────────────────────────────────────
  console.log("🔗 [19/27] CustomerBranch...");
  const cbData = [
    { id: CB_IDS[0],  seq: 1,  reg: "2026-04-01T09:00:00Z", first: "2026-04-08T10:00:00Z" },
    { id: CB_IDS[1],  seq: 2,  reg: "2026-04-01T09:10:00Z", first: "2026-04-10T14:30:00Z" },
    { id: CB_IDS[2],  seq: 3,  reg: "2026-04-02T10:00:00Z", first: "2026-04-12T16:00:00Z" },
    { id: CB_IDS[3],  seq: 4,  reg: "2026-04-02T11:00:00Z", first: "2026-04-15T11:00:00Z" },
    { id: CB_IDS[4],  seq: 5,  reg: "2026-04-03T09:00:00Z", first: "2026-04-18T13:00:00Z" },
    { id: CB_IDS[5],  seq: 6,  reg: "2026-04-03T10:00:00Z", first: "2026-04-20T15:00:00Z" },
    { id: CB_IDS[6],  seq: 7,  reg: "2026-04-05T14:00:00Z", first: "2026-04-23T09:00:00Z" },
    { id: CB_IDS[7],  seq: 8,  reg: "2026-04-07T15:00:00Z", first: "2026-04-26T12:00:00Z" },
    { id: CB_IDS[8],  seq: 9,  reg: "2026-04-10T11:00:00Z", first: "2026-04-29T17:00:00Z" },
    { id: CB_IDS[9],  seq: 10, reg: "2026-04-12T09:00:00Z", first: "2026-05-03T10:00:00Z" },
    { id: CB_IDS[10], seq: 11, reg: "2026-04-14T10:00:00Z", first: null },
    { id: CB_IDS[11], seq: 12, reg: "2026-04-16T12:00:00Z", first: null },
    { id: CB_IDS[12], seq: 13, reg: "2026-04-18T09:00:00Z", first: null },
    { id: CB_IDS[13], seq: 14, reg: "2026-04-20T11:00:00Z", first: null },
    { id: CB_IDS[14], seq: 15, reg: "2026-04-22T10:00:00Z", first: null },
  ];
  for (const cb of cbData) {
    const customerId = cid[cb.seq];
    await prisma.customerBranch.upsert({
      where: { customerId_branchId: { customerId, branchId: BRANCH_ID } },
      update: {},
      create: {
        id: cb.id,
        customerId,
        branchId: BRANCH_ID,
        registeredAt: new Date(cb.reg),
        firstVisitAt: cb.first ? new Date(cb.first) : null,
      },
    });
  }
  console.log("  ✓ CustomerBranch (15)");

  // ── 20. Visits ────────────────────────────────────────────────────────────
  console.log("📋 [20/27] Visits...");
  const visitData = [
    { id: VISIT_IDS[0], seq: 1,  start: "2026-04-08T10:00:00Z", end: "2026-04-08T11:00:00Z", dur: 60,  price: 80  },
    { id: VISIT_IDS[1], seq: 2,  start: "2026-04-10T14:30:00Z", end: "2026-04-10T16:00:00Z", dur: 90,  price: 120 },
    { id: VISIT_IDS[2], seq: 3,  start: "2026-04-12T16:00:00Z", end: "2026-04-12T18:00:00Z", dur: 120, price: 160 },
    { id: VISIT_IDS[3], seq: 4,  start: "2026-04-15T11:00:00Z", end: "2026-04-15T11:45:00Z", dur: 45,  price: 60  },
    { id: VISIT_IDS[4], seq: 5,  start: "2026-04-18T13:00:00Z", end: "2026-04-18T14:15:00Z", dur: 75,  price: 100 },
    { id: VISIT_IDS[5], seq: 6,  start: "2026-04-20T15:00:00Z", end: "2026-04-20T15:30:00Z", dur: 30,  price: 40  },
    { id: VISIT_IDS[6], seq: 7,  start: "2026-04-23T09:00:00Z", end: "2026-04-23T11:30:00Z", dur: 150, price: 200 },
    { id: VISIT_IDS[7], seq: 8,  start: "2026-04-26T12:00:00Z", end: "2026-04-26T13:00:00Z", dur: 60,  price: 80  },
    { id: VISIT_IDS[8], seq: 9,  start: "2026-04-29T17:00:00Z", end: "2026-04-29T19:00:00Z", dur: 120, price: 160 },
    { id: VISIT_IDS[9], seq: 10, start: "2026-05-03T10:00:00Z", end: "2026-05-03T11:30:00Z", dur: 90,  price: 120 },
  ];
  for (const v of visitData) {
    await prisma.visit.upsert({
      where: { id: v.id },
      update: {},
      create: {
        id: v.id,
        branchId: BRANCH_ID,
        customerId: cid[v.seq],
        status: "PAID",
        startedAt: new Date(v.start),
        endedAt: new Date(v.end),
        durationMinutes: v.dur,
        totalPrice: v.price,
      },
    });
  }
  console.log("  ✓ Visits (10)");

  // ── 21. Sessions ──────────────────────────────────────────────────────────
  console.log("🎯 [21/27] Sessions...");
  for (let i = 0; i < visitData.length; i++) {
    const v = visitData[i];
    await prisma.session.upsert({
      where: { id: SESSION_IDS[i] },
      update: {},
      create: {
        id: SESSION_IDS[i],
        branchId: BRANCH_ID,
        visitId: v.id,
        resourceType: "DEVICE",
        resourceId: DEVICE_IDS[i],
        priceType: "PER_HOUR",
        basePrice: 80,
        gamesCount: 1,
        unitPrice: 80,
        totalPrice: v.price,
        currency: "EGP",
        startedAt: new Date(v.start),
        endedAt: new Date(v.end),
        durationMinutes: v.dur,
        status: "ENDED",
        createdById: STAFF_ID,
        endedById: STAFF_ID,
      },
    });
  }
  console.log("  ✓ Sessions (10)");

  // ── 22. Invoices ──────────────────────────────────────────────────────────
  console.log("🧾 [22/27] Invoices...");
  for (let i = 0; i < visitData.length; i++) {
    const existing = await prisma.invoice.findUnique({ where: { visitId: visitData[i].id } });
    if (!existing) {
      await prisma.invoice.create({
        data: {
          id: INVOICE_IDS[i],
          visitId: visitData[i].id,
          totalAmount: visitData[i].price,
          status: "PAID",
          paidAt: new Date(visitData[i].end),
        },
      });
    }
  }
  console.log("  ✓ Invoices (10)");

  // ── 23. CategoryProduct ───────────────────────────────────────────────────
  console.log("🗂️  [23/27] CategoryProduct...");
  const categories = [
    { id: CAT_FOOD_ID,   name: "Food & Drinks"       },
    { id: CAT_GAMING_ID, name: "Gaming Accessories"   },
    { id: CAT_MERCH_ID,  name: "Merchandise"          },
  ];
  for (const cat of categories) {
    await prisma.categoryProduct.upsert({
      where: { name: cat.name },
      update: {},
      create: cat,
    });
  }
  console.log("  ✓ CategoryProduct (3)");

  // ── 24. Products ──────────────────────────────────────────────────────────
  console.log("🛍️  [24/27] Products...");
  const products = [
    { id: PROD_IDS[0], name: "Pepsi",               categoryId: CAT_FOOD_ID,   price: 25,  qty: 50  },
    { id: PROD_IDS[1], name: "Water",               categoryId: CAT_FOOD_ID,   price: 10,  qty: 100 },
    { id: PROD_IDS[2], name: "Chicken Sandwich",    categoryId: CAT_FOOD_ID,   price: 65,  qty: 30  },
    { id: PROD_IDS[3], name: "USB Controller",      categoryId: CAT_GAMING_ID, price: 350, qty: 15  },
    { id: PROD_IDS[4], name: "Gaming Headset",      categoryId: CAT_GAMING_ID, price: 450, qty: 10  },
    { id: PROD_IDS[5], name: "Spacefyy Mug",        categoryId: CAT_MERCH_ID,  price: 120, qty: 25  },
  ];
  for (const p of products) {
    await prisma.product.upsert({
      where: { name_branchId: { name: p.name, branchId: BRANCH_ID } },
      update: {},
      create: {
        id: p.id,
        branchId: BRANCH_ID,
        categoryId: p.categoryId,
        name: p.name,
        price: p.price,
        quantity: p.qty,
        isActive: true,
      },
    });
  }
  console.log("  ✓ Products (6)");

  // ── 25. Orders + OrderItems ───────────────────────────────────────────────
  console.log("🛒 [25/27] Orders + OrderItems...");
  const ordersData = [
    {
      id: ORDER_IDS[0], visitId: VISIT_IDS[0], seq: 1, number: 1,
      total: 60, final: 60,
      items: [
        { id: OI_IDS[0], pid: PROD_IDS[0], qty: 2, unit: 25, total: 50 },
        { id: OI_IDS[1], pid: PROD_IDS[1], qty: 1, unit: 10, total: 10 },
      ],
    },
    {
      id: ORDER_IDS[1], visitId: VISIT_IDS[1], seq: 2, number: 2,
      total: 90, final: 90,
      items: [
        { id: OI_IDS[2], pid: PROD_IDS[2], qty: 1, unit: 65, total: 65 },
        { id: OI_IDS[3], pid: PROD_IDS[0], qty: 1, unit: 25, total: 25 },
      ],
    },
    {
      id: ORDER_IDS[2], visitId: VISIT_IDS[2], seq: 3, number: 3,
      total: 30, final: 30,
      items: [
        { id: OI_IDS[4], pid: PROD_IDS[1], qty: 3, unit: 10, total: 30 },
      ],
    },
    {
      id: ORDER_IDS[3], visitId: VISIT_IDS[3], seq: 4, number: 4,
      total: 145, final: 145,
      items: [
        { id: OI_IDS[5], pid: PROD_IDS[5], qty: 1, unit: 120, total: 120 },
        { id: OI_IDS[6], pid: PROD_IDS[0], qty: 1, unit: 25,  total: 25  },
      ],
    },
    {
      id: ORDER_IDS[4], visitId: VISIT_IDS[4], seq: 5, number: 5,
      total: 130, final: 130,
      items: [
        { id: OI_IDS[7], pid: PROD_IDS[2], qty: 2, unit: 65, total: 130 },
      ],
    },
  ];
  for (const o of ordersData) {
    const existing = await prisma.order.findUnique({ where: { id: o.id } });
    if (!existing) {
      await prisma.order.create({
        data: {
          id: o.id,
          visitId: o.visitId,
          branchId: BRANCH_ID,
          customerId: cid[o.seq],
          number: o.number,
          totalPrice: o.total,
          finalPrice: o.final,
          orderItems: {
            create: o.items.map((item) => ({
              id: item.id,
              productId: item.pid,
              quantity: item.qty,
              unitPrice: item.unit,
              totalPrice: item.total,
            })),
          },
        },
      });
    }
  }
  console.log("  ✓ Orders (5) + OrderItems (8)");

  // ── 26. BranchMonthlyStats ────────────────────────────────────────────────
  console.log("📊 [26/27] BranchMonthlyStats...");
  await prisma.branchMonthlyStats.upsert({
    where: { branchId_month_year: { branchId: BRANCH_ID, month: 4, year: 2026 } },
    update: {},
    create: {
      branchId: BRANCH_ID, month: 4, year: 2026,
      newCustomers: 12, activeCustomers: 9,
      totalRevenue: 1000, avgSpendPerCustomer: 111.11,
    },
  });
  await prisma.branchMonthlyStats.upsert({
    where: { branchId_month_year: { branchId: BRANCH_ID, month: 5, year: 2026 } },
    update: {},
    create: {
      branchId: BRANCH_ID, month: 5, year: 2026,
      newCustomers: 3, activeCustomers: 1,
      totalRevenue: 120, avgSpendPerCustomer: 120,
    },
  });
  console.log("  ✓ BranchMonthlyStats (Apr + May 2026)");

  // ── 27. BranchUserPermissions ─────────────────────────────────────────────
  console.log("🛡️  [27/27] BranchUserPermissions...");
  const staffBranchPerms = allPerms.filter((p) =>
    STAFF_BRANCH_PERMISSIONS.includes(p.name)
  );
  await prisma.branchUserPermission.createMany({
    data: staffBranchPerms.map((p) => ({
      branchId: BRANCH_ID,
      userId: STAFF_ID,
      permissionId: p.id,
      isAllowed: true,
    })),
    skipDuplicates: true,
  });
  console.log(`  ✓ BranchUserPermissions (${staffBranchPerms.length} for staff)`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`
╔══════════════════════════════════════════════════════╗
║                  ✅ Full seed complete!              ║
╠══════════════════════════════════════════════════════╣
║  businessId : ${BUSINESS_ID}  ║
║  branchId   : ${BRANCH_ID}  ║
╠══════════════════════════════════════════════════════╣
║  Plan · Roles (5) · Permissions (${allPerms.length})              ║
║  Users (2) · Business · BusinessSettings             ║
║  StorageUsage · Branch · Spaces (3)                  ║
║  Devices (10) · Units (5) · Equipment (4)            ║
║  PricingRules (5) · StaffProfile · NationalId        ║
║  Payroll (Apr 2026) · Customers (15)                 ║
║  CustomerBranch (15) · Visits (10) · Sessions (10)   ║
║  Invoices (10) · Categories (3) · Products (6)       ║
║  Orders (5) · OrderItems (8) · MonthlyStats (2)      ║
║  BranchUserPermissions (staff)                       ║
╚══════════════════════════════════════════════════════╝
`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
