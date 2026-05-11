import pkg from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
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

const BUSINESS_ID = "4f4f62c1-c3a6-4df1-83f0-20b03712995d";
const BRANCH_ID = "bce042f4-8f69-4468-bf1d-fb44b8f6b825";
const STAFF_USER_ID = "34455667-8899-4cc0-ddee-ff0011334422";

const customers = [
  { seqNumber: 1,  name: "Ahmed Hassan",   phone: "01012345601", email: "ahmed.hassan@spacefyy.demo"   },
  { seqNumber: 2,  name: "Mohamed Ali",    phone: "01123456702", email: "mohamed.ali@spacefyy.demo"    },
  { seqNumber: 3,  name: "Sara Ibrahim",   phone: "01234567803", email: "sara.ibrahim@spacefyy.demo"   },
  { seqNumber: 4,  name: "Youssef Khaled", phone: "01012348904", email: "youssef.khaled@spacefyy.demo" },
  { seqNumber: 5,  name: "Nour Mahmoud",   phone: "01123459005", email: "nour.mahmoud@spacefyy.demo"   },
  { seqNumber: 6,  name: "Amr Sayed",      phone: "01234560006", email: "amr.sayed@spacefyy.demo"      },
  { seqNumber: 7,  name: "Hana Mostafa",   phone: "01012341007", email: "hana.mostafa@spacefyy.demo"   },
  { seqNumber: 8,  name: "Karim Omar",     phone: "01123452008", email: "karim.omar@spacefyy.demo"     },
  { seqNumber: 9,  name: "Mona Adel",      phone: "01234563009", email: "mona.adel@spacefyy.demo"      },
  { seqNumber: 10, name: "Omar Fares",     phone: "01012344010", email: "omar.fares@spacefyy.demo"     },
  { seqNumber: 11, name: "Laila Hassan",   phone: "01123455011", email: "laila.hassan@spacefyy.demo"   },
  { seqNumber: 12, name: "Tarek Nasser",   phone: "01234566012", email: "tarek.nasser@spacefyy.demo"   },
  { seqNumber: 13, name: "Dina Samir",     phone: "01012347013", email: "dina.samir@spacefyy.demo"     },
  { seqNumber: 14, name: "Rania Fouad",    phone: "01123458014", email: "rania.fouad@spacefyy.demo"    },
  { seqNumber: 15, name: "Bassem Adly",    phone: "01234569015", email: "bassem.adly@spacefyy.demo"    },
];

// First 10 customers get a closed visit + session
const visitTemplates = [
  { customerSeq: 1,  startedAt: "2026-04-08T10:00:00.000Z", endedAt: "2026-04-08T11:00:00.000Z", durationMinutes: 60,  totalPrice: 80  },
  { customerSeq: 2,  startedAt: "2026-04-10T14:30:00.000Z", endedAt: "2026-04-10T16:00:00.000Z", durationMinutes: 90,  totalPrice: 120 },
  { customerSeq: 3,  startedAt: "2026-04-12T16:00:00.000Z", endedAt: "2026-04-12T18:00:00.000Z", durationMinutes: 120, totalPrice: 160 },
  { customerSeq: 4,  startedAt: "2026-04-15T11:00:00.000Z", endedAt: "2026-04-15T11:45:00.000Z", durationMinutes: 45,  totalPrice: 60  },
  { customerSeq: 5,  startedAt: "2026-04-18T13:00:00.000Z", endedAt: "2026-04-18T14:15:00.000Z", durationMinutes: 75,  totalPrice: 100 },
  { customerSeq: 6,  startedAt: "2026-04-20T15:00:00.000Z", endedAt: "2026-04-20T15:30:00.000Z", durationMinutes: 30,  totalPrice: 40  },
  { customerSeq: 7,  startedAt: "2026-04-23T09:00:00.000Z", endedAt: "2026-04-23T11:30:00.000Z", durationMinutes: 150, totalPrice: 200 },
  { customerSeq: 8,  startedAt: "2026-04-26T12:00:00.000Z", endedAt: "2026-04-26T13:00:00.000Z", durationMinutes: 60,  totalPrice: 80  },
  { customerSeq: 9,  startedAt: "2026-04-29T17:00:00.000Z", endedAt: "2026-04-29T19:00:00.000Z", durationMinutes: 120, totalPrice: 160 },
  { customerSeq: 10, startedAt: "2026-05-03T10:00:00.000Z", endedAt: "2026-05-03T11:30:00.000Z", durationMinutes: 90,  totalPrice: 120 },
];

async function main() {
  console.log("🌱 Starting demo seed...\n");

  // Guard: staff user must exist for session.createdById FK
  const staffUser = await prisma.user.findUnique({ where: { id: STAFF_USER_ID } });
  if (!staffUser) {
    throw new Error(
      `Staff user ${STAFF_USER_ID} not found. Run 'npm run seed' first to seed users.`
    );
  }

  // ── 1. Customers ────────────────────────────────────────────────────────────
  console.log("👥 Seeding 15 customers...");
  const customerIdMap = {}; // seqNumber → actual DB id

  for (const c of customers) {
    const customer = await prisma.customer.upsert({
      where: {
        businessId_seqNumber: { businessId: BUSINESS_ID, seqNumber: c.seqNumber },
      },
      update: { name: c.name },
      create: {
        businessId: BUSINESS_ID,
        seqNumber: c.seqNumber,
        name: c.name,
        phone: c.phone,
        email: c.email,
        tags: [],
      },
    });
    customerIdMap[c.seqNumber] = customer.id;
    console.log(`  ✓ #${String(c.seqNumber).padStart(2)} ${c.name.padEnd(16)} → ${customer.id}`);
  }

  // ── 2. Visits + Sessions (first 10 customers) ────────────────────────────────
  console.log("\n📋 Seeding 10 closed visits + sessions...");

  for (const t of visitTemplates) {
    const customerId = customerIdMap[t.customerSeq];

    // Idempotency: skip if a visit already exists for this customer/branch/startTime
    const existingVisit = await prisma.visit.findFirst({
      where: {
        customerId,
        branchId: BRANCH_ID,
        startedAt: new Date(t.startedAt),
      },
      select: { id: true },
    });

    if (existingVisit) {
      console.log(`  ⚠️  #${t.customerSeq} visit at ${t.startedAt} already exists, skipping`);
      continue;
    }

    const visit = await prisma.visit.create({
      data: {
        branchId: BRANCH_ID,
        customerId,
        status: "PAID",
        startedAt: new Date(t.startedAt),
        endedAt: new Date(t.endedAt),
        durationMinutes: t.durationMinutes,
        totalPrice: t.totalPrice,
      },
    });

    await prisma.session.create({
      data: {
        branchId: BRANCH_ID,
        visitId: visit.id,
        resourceType: "DEVICE",
        resourceId: "de000000-0000-4000-8000-000000000000",
        priceType: "PER_HOUR",
        basePrice: 80,
        gamesCount: 1,
        unitPrice: 80,
        totalPrice: t.totalPrice,
        currency: "EGP",
        startedAt: new Date(t.startedAt),
        endedAt: new Date(t.endedAt),
        durationMinutes: t.durationMinutes,
        status: "ENDED",
        createdById: STAFF_USER_ID,
        endedById: STAFF_USER_ID,
      },
    });

    console.log(
      `  ✓ #${t.customerSeq.toString().padStart(2)} → visit ${visit.id} | ${t.durationMinutes} min | ${t.totalPrice} EGP`
    );
  }

  console.log("\n✅ Demo seed complete!");
}

main()
  .catch((e) => {
    console.error("❌", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
