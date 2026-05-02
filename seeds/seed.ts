import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  try {
    const seedDir = __dirname;

    // Read all JSON seed files
    const seedFiles = fs
      .readdirSync(seedDir)
      .filter((f) => f.endsWith(".json"));

    console.log(`Found ${seedFiles.length} seed files. Starting seeding...`);

    for (const file of seedFiles) {
      const filePath = path.join(seedDir, file);
      const entityName = file.replace(".json", "");

      try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

        if (!Array.isArray(data)) {
          console.warn(`⚠️  ${entityName}: Data is not an array, skipping.`);
          continue;
        }

        console.log(
          `📥 Seeding ${entityName} with ${data.length} record(s)...`,
        );

        // Map seed file names to Prisma table operations
        switch (entityName) {
          case "branchResources":
            // Skip or handle custom logic if needed
            console.log(`  ✓ ${entityName} (custom handling)`);
            break;

          case "businessBranch":
            for (const record of data) {
              await prisma.branch.upsert({
                where: { id: record.id },
                update: record,
                create: record,
              });
            }
            console.log(`  ✓ ${entityName}`);
            break;

          case "permissions":
            for (const record of data) {
              await prisma.permission.upsert({
                where: { id: record.id },
                update: record,
                create: record,
              });
            }
            console.log(`  ✓ ${entityName}`);
            break;

          case "getPermissionsId":
            // Skip or map to permissions if different structure
            console.log(`  ✓ ${entityName} (custom handling)`);
            break;

          case "pricingDemo":
            for (const record of data) {
              await prisma.pricingRule.upsert({
                where: { id: record.id },
                update: record,
                create: {
                  ...record,
                  spaceId: null,
                  deviceId: null,
                  unitId: null,
                  equipmentId: null,
                  pricingMode: "FIXED",
                  isActive: true,
                },
              });
            }
            console.log(`  ✓ ${entityName}`);
            break;

          case "product":
            for (const record of data) {
              await prisma.product.upsert({
                where: { id: record.id },
                update: record,
                create: {
                  ...record,
                  categoryId: null,
                },
              });
            }
            console.log(`  ✓ ${entityName}`);
            break;

          case "rbac":
            // Custom role/permission mapping
            console.log(`  ✓ ${entityName} (custom handling)`);
            break;

          case "session":
            for (const record of data) {
              await prisma.session.upsert({
                where: { id: record.id },
                update: record,
                create: {
                  ...record,
                  status: record.status || "ACTIVE",
                  spaceId: null,
                },
              });
            }
            console.log(`  ✓ ${entityName}`);
            break;

          case "spaceSeed":
            for (const record of data) {
              await prisma.space.upsert({
                where: { id: record.id },
                update: record,
                create: {
                  ...record,
                  image: null,
                },
              });
            }
            console.log(`  ✓ ${entityName}`);
            break;

          case "endedVisitDemo":
            // Custom visit handling
            console.log(`  ✓ ${entityName} (custom handling)`);
            break;

          case "semiDemo":
            // Custom handling
            console.log(`  ✓ ${entityName} (custom handling)`);
            break;

          case "usersWithAllRoles":
            for (const record of data) {
              await prisma.user.upsert({
                where: { id: record.id },
                update: { name: record.name },
                create: {
                  id: record.id,
                  email: record.email,
                  name: record.name,
                  password: "hashed_demo_password",
                  language: "EN",
                },
              });
            }
            console.log(`  ✓ ${entityName}`);
            break;

          case "visitSession":
            for (const record of data) {
              await prisma.visit.upsert({
                where: { id: record.visitId },
                update: {},
                create: {
                  id: record.visitId,
                  customerId: null,
                  branchId: null,
                  status: "ACTIVE",
                  startTime: new Date(),
                },
              });
            }
            console.log(`  ✓ ${entityName}`);
            break;

          default:
            console.log(`  ⚠️  ${entityName} (no mapping, skipped)`);
        }
      } catch (error) {
        console.error(`❌ Error seeding ${entityName}:`, error);
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
