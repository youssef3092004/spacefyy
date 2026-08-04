-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "alertIsActivated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "alertValue" INTEGER NOT NULL DEFAULT 0;
