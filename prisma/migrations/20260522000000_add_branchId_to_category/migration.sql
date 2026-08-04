-- CategoryProduct is being made branch-scoped.
-- Existing global categories are no longer valid; clear them so the NOT NULL
-- branchId column can be added without a default value.
DELETE FROM "CategoryProduct";

-- Drop the old global unique constraint on name
ALTER TABLE "CategoryProduct" DROP CONSTRAINT IF EXISTS "CategoryProduct_name_key";

-- Add branchId (safe now that the table is empty)
ALTER TABLE "CategoryProduct" ADD COLUMN "branchId" TEXT NOT NULL;

-- Foreign key to Branch
ALTER TABLE "CategoryProduct" ADD CONSTRAINT "CategoryProduct_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Compound unique: same name allowed across different branches
ALTER TABLE "CategoryProduct" ADD CONSTRAINT "CategoryProduct_name_branchId_key"
  UNIQUE ("name", "branchId");

-- Indexes
CREATE INDEX "CategoryProduct_branchId_idx" ON "CategoryProduct"("branchId");
CREATE INDEX "CategoryProduct_branchId_createdAt_idx" ON "CategoryProduct"("branchId", "createdAt");

-- Drop the old single-column createdAt index (replaced above)
DROP INDEX IF EXISTS "CategoryProduct_createdAt_idx";
