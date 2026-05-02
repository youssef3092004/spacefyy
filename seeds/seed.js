import pkg from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import process from "process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

console.log("✨ Starting seed process...");

const { PrismaClient } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const connectionString =
  process.env.SUPABASE_URL ||
  process.env.PRISMA_URL ||
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "Missing database connection string. Set PRISMA_URL, SUPABASE_URL, or DATABASE_URL.",
  );
}

console.log("🗄️  Connecting to database...");

const pool = new Pool({
  connectionString,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(
    process.env.DB_POOL_CONNECTION_TIMEOUT_MS || 5000,
  ),
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

async function seedPlan(data) {
  for (const record of data) {
    await prisma.plan.upsert({
      where: { id: record.id },
      update: record,
      create: {
        ...record,
        price: parseFloat(record.price),
      },
    });
  }
}

async function seedBusiness(data) {
  for (const record of data) {
    await prisma.business.upsert({
      where: { id: record.id },
      update: record,
      create: record,
    });
  }
}

async function seedBranch(data) {
  for (const record of data) {
    await prisma.branch.upsert({
      where: { id: record.id },
      update: record,
      create: record,
    });
  }
}

async function seedCustomer(data) {
  for (const record of data) {
    await prisma.customer.upsert({
      where: { id: record.id },
      update: record,
      create: record,
    });
  }
}

async function seedPermission(data) {
  for (const record of data) {
    await prisma.permission.upsert({
      where: { id: record.id },
      update: record,
      create: record,
    });
  }
}

async function seedPricingRule(data) {
  // Skip pricing rules for now - requires complex resource relationships
  console.log(`  ⚠️  Skipping pricing rules (complex relationships required)`);
}

async function seedProduct(data) {
  // Skip products for now - requires category relationships
  console.log(`  ⚠️  Skipping products (requires category setup)`);
}

async function seedSession(data) {
  // Skip session seeding for now - sessions require complex relationships
  console.log(`  ⚠️  Skipping sessions (complex relationships required)`);
}

async function seedSpace(data) {
  // Skip space seeding for now - requires relationship handling
  console.log(`  ⚠️  Skipping spaces (relationship handling required)`);
}

async function seedUser(data) {
  for (const record of data) {
    await prisma.user.upsert({
      where: { id: record.id },
      update: { name: record.name },
      create: {
        id: record.id,
        email: record.email,
        name: record.name,
        phone: record.phone,
        password: record.password || "hashed_demo_password",
      },
    });
  }
}

async function seedVisit(data) {
  // Skip visit seeding for now - requires valid status values
  console.log(`  ⚠️  Skipping visits (status validation required)`);
}

const seeders = {
  plan: seedPlan,
  business: seedBusiness,
  branch: seedBranch,
  customer: seedCustomer,
  businessBranch: () => {}, // Skip - duplicate of branch
  permission: seedPermission,
  permissions: seedPermission,
  pricingDemo: seedPricingRule,
  product: seedProduct,
  session: seedSession,
  spaceSeed: seedSpace,
  usersWithAllRoles: seedUser,
  visitSession: seedVisit,
};

async function main() {
  console.log("📂 Reading seed files from:", __dirname);
  try {
    const seedDir = __dirname;

    // Define seeding order to handle foreign key dependencies
    const seedOrder = [
      "plan",
      "usersWithAllRoles",
      "business",
      "branch",
      "customer",
      "permission",
      "permissions",
      "spaceSeed",
      "session",
      "visitSession",
      "pricingDemo",
      "product",
      "branchResources",
      "businessBranch",
      "endedVisitDemo",
      "getPermissionsId",
      "rbac",
      "semiDemo",
    ];

    console.log(`Found ${seedOrder.length} seed file(s). Starting seeding...`);

    for (const entityName of seedOrder) {
      const file = `${entityName}.json`;
      const filePath = path.join(seedDir, file);

      // Skip if file doesn't exist
      if (!fs.existsSync(filePath)) {
        continue;
      }

      try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

        if (!Array.isArray(data)) {
          console.warn(`⚠️  ${entityName}: Data is not an array, skipping.`);
          continue;
        }

        console.log(
          `📥 Seeding ${entityName} with ${data.length} record(s)...`,
        );

        if (seeders[entityName]) {
          await seeders[entityName](data);
          console.log(`  ✓ ${entityName}`);
        } else {
          console.log(`  ⚠️  ${entityName} (no seeder, skipped)`);
        }
      } catch (error) {
        console.error(`❌ Error seeding ${entityName}:`, error.message);
      }
    }

    console.log("\n✅ Seeding complete!");
  } catch (error) {
    console.error("Fatal seeding error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
