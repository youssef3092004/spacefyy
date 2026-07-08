/**
 * reconcileResourceState.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time data fix so the live overview (isBusy-driven) matches reality:
 *
 *   1. Non-PUBLIC spaces become single-use  → capacity = 1.
 *   2. Every space/device/unit's `isBusy` (and each space's availableNumber)
 *      is recomputed from whether it currently has a LIVE session component
 *      (endedAt = null on an ACTIVE, non-deleted session).
 *
 * This clears both directions of drift:
 *   - busy=true but nothing running (orphaned/ended sessions), and
 *   - busy=false but actually in use (legacy multi-capacity spaces).
 *
 * SAFE BY DEFAULT: runs as a DRY RUN and only prints the diff.
 * Pass --apply to actually write the changes.
 *
 * Usage:
 *   node --env-file=.env scripts/reconcileResourceState.js            # preview
 *   node --env-file=.env scripts/reconcileResourceState.js --apply    # write
 *   node --env-file=.env scripts/reconcileResourceState.js --branch=<branchId>
 */

import process from "process";
import { prisma } from "../configs/db.js";

const APPLY = process.argv.includes("--apply");
const branchArg = process.argv.find((a) => a.startsWith("--branch="));
const BRANCH_ID = branchArg ? branchArg.split("=")[1] : null;

const log = (...a) => console.log(...a);

async function main() {
  log(
    `\n=== reconcileResourceState — ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"} ===`,
  );
  if (BRANCH_ID) log(`Scope: branch ${BRANCH_ID}`);
  else log(`Scope: ALL branches`);

  const branchFilter = BRANCH_ID ? { branchId: BRANCH_ID } : {};

  // 1. Which resources are LIVE right now (open component on an active session).
  const liveComponents = await prisma.sessionComponent.findMany({
    where: {
      ...branchFilter,
      endedAt: null,
      session: { status: "ACTIVE", deletedAt: null },
    },
    select: { resourceType: true, resourceId: true },
  });

  const liveByType = { SPACE: new Set(), DEVICE: new Set(), UNIT: new Set() };
  for (const c of liveComponents) {
    if (liveByType[c.resourceType]) liveByType[c.resourceType].add(c.resourceId);
  }
  log(
    `\nLive resources → SPACE:${liveByType.SPACE.size} DEVICE:${liveByType.DEVICE.size} UNIT:${liveByType.UNIT.size}`,
  );

  const plan = { spaces: [], devices: [], units: [] };

  // 2. Spaces
  const spaces = await prisma.space.findMany({
    where: { ...branchFilter, deletedAt: null, isDeleted: false },
    select: {
      id: true,
      name: true,
      type: true,
      capacity: true,
      availableNumber: true,
      isBusy: true,
    },
  });

  for (const s of spaces) {
    const isPublic = s.type === "PUBLIC";
    // PUBLIC spaces are occupied via their devices/units, not a SPACE component.
    const live = isPublic ? false : liveByType.SPACE.has(s.id);

    const nextCapacity = isPublic ? s.capacity : 1;
    const nextIsBusy = isPublic ? s.isBusy : live;
    const nextAvailable = isPublic
      ? s.availableNumber
      : live
        ? 0
        : nextCapacity;

    if (
      s.capacity !== nextCapacity ||
      s.isBusy !== nextIsBusy ||
      s.availableNumber !== nextAvailable
    ) {
      plan.spaces.push({
        id: s.id,
        name: s.name,
        type: s.type,
        from: {
          capacity: s.capacity,
          availableNumber: s.availableNumber,
          isBusy: s.isBusy,
        },
        to: {
          capacity: nextCapacity,
          availableNumber: nextAvailable,
          isBusy: nextIsBusy,
        },
      });
    }
  }

  // 3. Devices
  const devices = await prisma.device.findMany({
    where: { ...branchFilter, deletedAt: null, isDeleted: false },
    select: { id: true, name: true, isBusy: true },
  });
  for (const d of devices) {
    const next = liveByType.DEVICE.has(d.id);
    if (d.isBusy !== next)
      plan.devices.push({ id: d.id, name: d.name, from: d.isBusy, to: next });
  }

  // 4. Units
  const units = await prisma.unit.findMany({
    where: { ...branchFilter, isDeleted: false },
    select: { id: true, name: true, isBusy: true },
  });
  for (const u of units) {
    const next = liveByType.UNIT.has(u.id);
    if (u.isBusy !== next)
      plan.units.push({ id: u.id, name: u.name, from: u.isBusy, to: next });
  }

  // ── Report ────────────────────────────────────────────────────────────────
  log(`\n── Changes ──`);
  log(`Spaces to update:  ${plan.spaces.length}`);
  for (const p of plan.spaces) {
    log(
      `  • ${p.name} [${p.type}]  capacity ${p.from.capacity}→${p.to.capacity}, ` +
        `available ${p.from.availableNumber}→${p.to.availableNumber}, ` +
        `isBusy ${p.from.isBusy}→${p.to.isBusy}`,
    );
  }
  log(`Devices to update: ${plan.devices.length}`);
  for (const p of plan.devices) log(`  • ${p.name}  isBusy ${p.from}→${p.to}`);
  log(`Units to update:   ${plan.units.length}`);
  for (const p of plan.units) log(`  • ${p.name}  isBusy ${p.from}→${p.to}`);

  const totalChanges =
    plan.spaces.length + plan.devices.length + plan.units.length;

  if (!APPLY) {
    log(
      `\nDRY RUN complete — ${totalChanges} row(s) would change. Re-run with --apply to write.\n`,
    );
    return;
  }

  if (totalChanges === 0) {
    log(`\nNothing to change. Done.\n`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const p of plan.spaces) {
      await tx.space.update({ where: { id: p.id }, data: p.to });
    }
    for (const p of plan.devices) {
      await tx.device.update({ where: { id: p.id }, data: { isBusy: p.to } });
    }
    for (const p of plan.units) {
      await tx.unit.update({ where: { id: p.id }, data: { isBusy: p.to } });
    }
  });

  log(`\nAPPLIED — ${totalChanges} row(s) updated. Done.\n`);
}

main()
  .catch((e) => {
    console.error("reconcileResourceState failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
