-- CreateTable
CREATE TABLE "GameMode" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelAr" TEXT,
    "players" INTEGER NOT NULL,
    "controllersRequired" INTEGER NOT NULL DEFAULT 0,
    "controllerEquipmentId" TEXT,
    "deviceTypes" "DeviceType"[] DEFAULT ARRAY[]::"DeviceType"[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameMode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameMode_branchId_code_key" ON "GameMode"("branchId", "code");

-- CreateIndex
CREATE INDEX "GameMode_branchId_isActive_sortOrder_idx" ON "GameMode"("branchId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "GameMode_controllerEquipmentId_idx" ON "GameMode"("controllerEquipmentId");

-- AddForeignKey
ALTER TABLE "GameMode" ADD CONSTRAINT "GameMode_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMode" ADD CONSTRAINT "GameMode_controllerEquipmentId_fkey"
    FOREIGN KEY ("controllerEquipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariant Prisma cannot express: a mode that requires controllers must name
-- the equipment row to draw them from.
ALTER TABLE "GameMode" ADD CONSTRAINT "GameMode_controllers_require_equipment_chk"
    CHECK ("controllersRequired" = 0 OR "controllerEquipmentId" IS NOT NULL);

-- AlterTable
ALTER TABLE "SessionComponent"
    ADD COLUMN "gameModeId" TEXT,
    ADD COLUMN "autoManaged" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "SessionComponent_gameModeId_idx" ON "SessionComponent"("gameModeId");

-- CreateIndex
CREATE INDEX "SessionComponent_sessionId_resourceType_endedAt_idx"
    ON "SessionComponent"("sessionId", "resourceType", "endedAt");

-- AddForeignKey
ALTER TABLE "SessionComponent" ADD CONSTRAINT "SessionComponent_gameModeId_fkey"
    FOREIGN KEY ("gameModeId") REFERENCES "GameMode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- BACKFILL — run this only if sessions are live at deploy time.
--
-- Controllers added by staff before this migration have autoManaged = false, so
-- the first mode switch on such a session would add a SECOND set on top of them
-- and double-charge the customer. Adopting the open ones into the engine makes
-- that switch replace them instead.
--
-- Check first:
--   SELECT count(*) FROM "SessionComponent" sc
--   JOIN "Session" s ON s.id = sc."sessionId"
--   WHERE sc."resourceType" = 'EQUIPMENT' AND sc."endedAt" IS NULL
--     AND s.status = 'ACTIVE';
--
-- If that returns 0, skip this. Otherwise uncomment:
--
-- UPDATE "SessionComponent" sc SET "autoManaged" = true
-- FROM "Equipment" e
-- WHERE e.id = sc."resourceId"
--   AND e.type = 'CONTROLLER'
--   AND sc."resourceType" = 'EQUIPMENT'
--   AND sc."endedAt" IS NULL;
-- ---------------------------------------------------------------------------
