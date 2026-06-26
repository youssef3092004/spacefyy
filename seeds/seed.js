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
      where: {
        businessId_phone: {
          businessId: record.businessId,
          phone: record.phone,
        },
      },
      update: {
        name: record.name,
        email: record.email || null,
        tags: record.tags || [],
        notes: record.notes || null,
        birthday: record.birthday ? new Date(record.birthday) : null,
      },
      create: {
        id: record.id,
        businessId: record.businessId,
        seqNumber: record.seqNumber,
        name: record.name,
        phone: record.phone,
        email: record.email || null,
        tags: record.tags || [],
        notes: record.notes || null,
        birthday: record.birthday ? new Date(record.birthday) : null,
      },
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

async function seedCategoryProduct(data) {
  for (const record of data) {
    await prisma.categoryProduct.upsert({
      where: { id: record.id },
      update: {
        name: record.name,
      },
      create: record,
    });
  }
}

async function seedPricingRule(data) {
  // Skip pricing rules for now - requires complex resource relationships
  console.log(`  ⚠️  Skipping pricing rules (complex relationships required)`);
}

async function seedProduct(data) {
  for (const record of data) {
    await prisma.product.upsert({
      where: { id: record.id },
      update: {
        categoryId: record.categoryId,
        branchId: record.branchId,
        name: record.name,
        description: record.description ?? null,
        sku: record.sku ?? null,
        price: parseFloat(record.price),
        stock: Number.isFinite(Number(record.quantity))
          ? Number(record.quantity)
          : 0,
        image: record.image ?? null,
        isActive: record.isActive ?? true,
      },
      create: {
        id: record.id,
        categoryId: record.categoryId,
        branchId: record.branchId,
        name: record.name,
        description: record.description ?? null,
        sku: record.sku ?? null,
        price: parseFloat(record.price),
        stock: Number.isFinite(Number(record.quantity))
          ? Number(record.quantity)
          : 0,
        image: record.image ?? null,
        isActive: record.isActive ?? true,
      },
    });
  }
}

async function seedCustomerBranch(data) {
  for (const record of data) {
    await prisma.customerBranch.upsert({
      where: {
        customerId_branchId: {
          customerId: record.customerId,
          branchId: record.branchId,
        },
      },
      update: {
        firstVisitAt: record.firstVisitAt
          ? new Date(record.firstVisitAt)
          : null,
      },
      create: {
        id: record.id,
        customerId: record.customerId,
        branchId: record.branchId,
        registeredAt: new Date(record.registeredAt),
        firstVisitAt: record.firstVisitAt
          ? new Date(record.firstVisitAt)
          : null,
      },
    });
  }
}

async function seedSession(data) {
  for (const record of data) {
    // Upsert the session itself (Session model doesn't store resourceType/resourceId)
    await prisma.session.upsert({
      where: { id: record.id },
      update: {
        status: record.status,
        endedAt: record.endedAt ? new Date(record.endedAt) : null,
        endedById: record.endedById ?? null,
        durationMinutes: record.durationMinutes ?? null,
        totalPrice: parseFloat(record.totalPrice || 0),
      },
      create: {
        id: record.id,
        branchId: record.branchId,
        visitId: record.visitId,
        startedAt: new Date(record.startedAt),
        endedAt: record.endedAt ? new Date(record.endedAt) : null,
        durationMinutes: record.durationMinutes ?? null,
        totalPrice: parseFloat(record.totalPrice || 0),
        currency: record.currency || "EGP",
        status: record.status,
        createdById: record.createdById,
        endedById: record.endedById ?? null,
        canceledById: record.canceledById ?? null,
      },
    });

    // If the seed record includes resource-specific fields, create a SessionComponent
    if (record.resourceType && record.resourceId) {
      const compId = record.componentId || `${record.id}-component`;
      await prisma.sessionComponent.upsert({
        where: { id: compId },
        update: {
          branchId: record.branchId,
          resourceType: record.resourceType,
          resourceId: record.resourceId,
          pricingRuleId: record.pricingRuleId ?? null,
          priceType: record.priceType || "PER_HOUR",
          unitPrice: parseFloat(record.unitPrice ?? record.basePrice ?? 0),
          gamesCount: record.gamesCount ?? 1,
          startedAt: new Date(record.startedAt),
          endedAt: record.endedAt ? new Date(record.endedAt) : null,
          durationMinutes: record.durationMinutes ?? null,
          totalPrice: parseFloat(record.totalPrice ?? 0),
        },
        create: {
          id: compId,
          sessionId: record.id,
          branchId: record.branchId,
          resourceType: record.resourceType,
          resourceId: record.resourceId,
          pricingRuleId: record.pricingRuleId ?? null,
          priceType: record.priceType || "PER_HOUR",
          unitPrice: parseFloat(record.unitPrice ?? record.basePrice ?? 0),
          quantity: 1,
          gamesCount: record.gamesCount ?? 1,
          startedAt: new Date(record.startedAt),
          endedAt: record.endedAt ? new Date(record.endedAt) : null,
          durationMinutes: record.durationMinutes ?? null,
          totalPrice: parseFloat(record.totalPrice ?? 0),
        },
      });
    }
  }
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
  for (const record of data) {
    // Map legacy/status variations to Prisma VisitStatus enum values
    const mapStatus = (s) => {
      if (!s) return s;
      if (s === "PAID") return "INVOICED"; // legacy value -> INVOICED
      return s;
    };

    const mappedStatus = mapStatus(record.status);

    await prisma.visit.upsert({
      where: { id: record.id },
      update: {
        status: mappedStatus,
        endedAt: record.endedAt ? new Date(record.endedAt) : null,
        durationMinutes: record.durationMinutes ?? null,
        totalPrice:
          record.totalPrice != null ? parseFloat(record.totalPrice) : null,
      },
      create: {
        id: record.id,
        branchId: record.branchId,
        customerId: record.customerId,
        status: mappedStatus,
        startedAt: new Date(record.startedAt),
        endedAt: record.endedAt ? new Date(record.endedAt) : null,
        durationMinutes: record.durationMinutes ?? null,
        totalPrice:
          record.totalPrice != null ? parseFloat(record.totalPrice) : null,
        pricingRuleId: record.pricingRuleId ?? null,
        pricingMode: record.pricingMode ?? null,
      },
    });
  }
}

async function seedOrder(data) {
  for (const record of data) {
    await prisma.order.upsert({
      where: { id: record.id },
      update: {
        visitId: record.visitId ?? null,
        branchId: record.branchId ?? null,
        customerId: record.customerId ?? null,
        number: record.number ?? 1,
        discountType: record.discountType ?? "FLAT",
        discountAmount: parseFloat(record.discountAmount ?? 0),
        customerDiscountType: record.customerDiscountType ?? "FLAT",
        customerDiscountAmount: parseFloat(record.customerDiscountAmount ?? 0),
        totalPrice: parseFloat(record.totalPrice ?? 0),
        finalPrice: parseFloat(record.finalPrice ?? 0),
      },
      create: {
        id: record.id,
        visitId: record.visitId ?? null,
        branchId: record.branchId ?? null,
        customerId: record.customerId ?? null,
        number: record.number ?? 1,
        discountType: record.discountType ?? "FLAT",
        discountAmount: parseFloat(record.discountAmount ?? 0),
        customerDiscountType: record.customerDiscountType ?? "FLAT",
        customerDiscountAmount: parseFloat(record.customerDiscountAmount ?? 0),
        totalPrice: parseFloat(record.totalPrice ?? 0),
        finalPrice: parseFloat(record.finalPrice ?? 0),
      },
    });
  }
}

const seeders = {
  plan: seedPlan,
  business: seedBusiness,
  branch: seedBranch,
  customer: seedCustomer,
  customerBranch: seedCustomerBranch,
  businessBranch: () => {}, // Skip - duplicate of branch
  categoryProduct: seedCategoryProduct,
  permission: seedPermission,
  permissions: seedPermission,
  pricingDemo: seedPricingRule,
  product: seedProduct,
  order: seedOrder,
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
      "customerBranch",
      "permission",
      "permissions",
      "categoryProduct",
      "spaceSeed",
      "visitSession",
      "order",
      "session",
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
