// Configs/db.js
import pkg from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import process from "process";

const { PrismaClient } = pkg;

const globalForDb = globalThis;

const connectionString =
process.env.SUPABASE_URL ||
  process.env.PRISMA_URL ||
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "Missing database connection string. Set PRISMA_URL, SUPABASE_URL, or DATABASE_URL.",
  );
}

const pool =
  globalForDb.pgPool ||
  new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT_MS || 10000),
    connectionTimeoutMillis: Number(
      process.env.DB_POOL_CONNECTION_TIMEOUT_MS || 5000,
    ),
  });

const adapter = globalForDb.prismaAdapter || new PrismaPg(pool);

const prisma =
  globalForDb.prisma ||
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgPool = pool;
  globalForDb.prismaAdapter = adapter;
  globalForDb.prisma = prisma;
}

export async function connectDB() {
  try {
    await prisma.$connect();
    console.log("Database connected successfully");
  } catch (err) {
    console.error("Database connection failed", err);
    process.exit(1);
  }
}

export { prisma };
