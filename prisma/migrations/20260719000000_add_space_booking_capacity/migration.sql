-- AlterTable: capacity becomes a display-only field, bookingCapacity takes over the logic role
ALTER TABLE "Space" ALTER COLUMN "capacity" SET DEFAULT 0;
ALTER TABLE "Space" ADD COLUMN "bookingCapacity" INTEGER NOT NULL DEFAULT 1;

-- Backfill: preserve existing availability behavior by seeding bookingCapacity from the old capacity
UPDATE "Space" SET "bookingCapacity" = "capacity";
