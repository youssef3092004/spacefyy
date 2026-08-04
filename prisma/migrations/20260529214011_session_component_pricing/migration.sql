/*
  Warnings:

  - The values [CLOSED,PAID] on the enum `VisitStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `basePrice` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `gamesCount` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `priceType` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `pricingRuleId` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `resourceId` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `resourceType` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `unitPrice` on the `Session` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "VisitStatus_new" AS ENUM ('ACTIVE', 'INVOICED');
ALTER TABLE "Visit" ALTER COLUMN "status" TYPE "VisitStatus_new" USING ("status"::text::"VisitStatus_new");
ALTER TYPE "VisitStatus" RENAME TO "VisitStatus_old";
ALTER TYPE "VisitStatus_new" RENAME TO "VisitStatus";
DROP TYPE "public"."VisitStatus_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_pricingRuleId_fkey";

-- DropIndex
DROP INDEX "CategoryProduct_name_key";

-- DropIndex
DROP INDEX "Session_pricingRuleId_idx";

-- DropIndex
DROP INDEX "Session_resourceId_idx";

-- DropIndex
DROP INDEX "Session_resourceType_resourceId_idx";

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "customerDiscountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "customerDiscountType" TEXT NOT NULL DEFAULT 'FLAT',
ADD COLUMN     "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discountType" TEXT NOT NULL DEFAULT 'FLAT',
ADD COLUMN     "finalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "basePrice",
DROP COLUMN "gamesCount",
DROP COLUMN "priceType",
DROP COLUMN "pricingRuleId",
DROP COLUMN "resourceId",
DROP COLUMN "resourceType",
DROP COLUMN "unitPrice",
ALTER COLUMN "totalPrice" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "SessionComponent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "resourceType" "SessionResourceType" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "pricingRuleId" TEXT,
    "priceType" "PricingType" NOT NULL DEFAULT 'PER_HOUR',
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "gamesCount" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "totalPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionComponent_sessionId_idx" ON "SessionComponent"("sessionId");

-- CreateIndex
CREATE INDEX "SessionComponent_branchId_idx" ON "SessionComponent"("branchId");

-- CreateIndex
CREATE INDEX "SessionComponent_resourceType_resourceId_idx" ON "SessionComponent"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "SessionComponent_pricingRuleId_idx" ON "SessionComponent"("pricingRuleId");

-- CreateIndex
CREATE INDEX "SessionComponent_sessionId_resourceType_idx" ON "SessionComponent"("sessionId", "resourceType");

-- CreateIndex
CREATE INDEX "SessionComponent_branchId_resourceType_resourceId_idx" ON "SessionComponent"("branchId", "resourceType", "resourceId");

-- AddForeignKey
ALTER TABLE "SessionComponent" ADD CONSTRAINT "SessionComponent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionComponent" ADD CONSTRAINT "SessionComponent_pricingRuleId_fkey" FOREIGN KEY ("pricingRuleId") REFERENCES "PricingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
