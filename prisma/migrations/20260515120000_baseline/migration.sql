-- Rename quantity -> stock (preserves existing data and NOT NULL constraint)
ALTER TABLE "Product" RENAME COLUMN "quantity" TO "stock";

-- Give stock a default of 0 so new rows don't require it explicitly
ALTER TABLE "Product" ALTER COLUMN "stock" SET DEFAULT 0;

-- Add the new nullable columns
ALTER TABLE "Product" ADD COLUMN "description" TEXT;
ALTER TABLE "Product" ADD COLUMN "sku" TEXT;
ALTER TABLE "Product" ADD COLUMN "image" TEXT;

-- The old unique constraint was on (name, branchId); current schema dropped it
DROP INDEX IF EXISTS "Product_name_branchId_key";

-- New unique constraint: (sku, branchId) — NULL skus are still allowed for multiple products
CREATE UNIQUE INDEX "Product_sku_branchId_key" ON "Product"("sku", "branchId");
