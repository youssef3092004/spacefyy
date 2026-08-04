-- One order per visit, and unique receipt numbers per branch.
--
-- Both were previously enforced only in application code, outside the
-- transaction that created the row, so a double-submitted "add items" could
-- create two open orders on one visit (closeVisitCore sums every order on the
-- visit, so the customer was billed twice) or two orders sharing a number.
--
-- IMPORTANT: if the database already contains duplicates these statements
-- fail. Find them first:
--
--   SELECT "visitId", COUNT(*) FROM "Order"
--   WHERE "visitId" IS NOT NULL GROUP BY "visitId" HAVING COUNT(*) > 1;
--
--   SELECT "branchId", "number", COUNT(*) FROM "Order"
--   GROUP BY "branchId", "number" HAVING COUNT(*) > 1;
--
-- Merge or renumber those rows before applying.

-- NULL visitId (takeaway) is exempt: Postgres allows many NULLs in a unique index.
CREATE UNIQUE INDEX "Order_visitId_key" ON "Order"("visitId");

CREATE UNIQUE INDEX "Order_branchId_number_key" ON "Order"("branchId", "number");

-- Superseded by the unique index above.
DROP INDEX IF EXISTS "Order_visitId_idx";
