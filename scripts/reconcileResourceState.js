/**
 * reconcileResourceState.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time data fix so the live overview (isBusy-driven) matches reality:
 *
 *   1. Non-PUBLIC spaces become single-use  → bookingCapacity = 1.
 *   2. Every space/device/unit/equipment's `isBusy` (and each space's
 *      availableNumber) is recomputed from how many LIVE session components it
 *      currently holds (endedAt = null on an ACTIVE, non-deleted session).
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

/**
 * Builds the full change set from live session components.
 *
 * Takes a client so it can run against either the top-level prisma (dry run)
 * or a transaction (apply) — the plan is a set of absolute target values, so
 * computing it outside the transaction that writes it would clobber any
 * booking made in between.
 */
const buildPlan = async (client, branchFilter) => {
  const liveComponents = await client.sessionComponent.findMany({
    where: {
      ...branchFilter,
      endedAt: null,
      session: { status: "ACTIVE", deletedAt: null },
    },
    select: { resourceType: true, resourceId: true, quantity: true },
  });

  // Counts, not booleans: a PUBLIC space can legitimately hold several
  // concurrent sessions, and its availableNumber is capacity minus that count.
  const liveCounts = {
    SPACE: new Map(),
    DEVICE: new Map(),
    UNIT: new Map(),
    EQUIPMENT: new Map(),
  };
  for (const c of liveComponents) {
    const bucket = liveCounts[c.resourceType];
    if (!bucket) continue;
    const units = c.resourceType === "EQUIPMENT" ? (c.quantity ?? 1) : 1;
    bucket.set(c.resourceId, (bucket.get(c.resourceId) ?? 0) + units);
  }

  const plan = { spaces: [], devices: [], units: [], equipment: [] };

  // ── Spaces ─────────────────────────────────────────────────────────────────
  const spaces = await client.space.findMany({
    where: { ...branchFilter, deletedAt: null, isDeleted: false },
    select: {
      id: true,
      name: true,
      type: true,
      bookingCapacity: true,
      availableNumber: true,
      isBusy: true,
    },
  });

  for (const s of spaces) {
    const isPublic = s.type === "PUBLIC";
    const liveCount = liveCounts.SPACE.get(s.id) ?? 0;

    // PUBLIC spaces DO get a SPACE component — resolveComponentsFromDevice and
    // resolveComponentsFromUnit attach one regardless of type. Skipping them
    // here meant the only spaces that actually drift were never repaired.
    const nextBookingCapacity = isPublic ? s.bookingCapacity : 1;
    const nextAvailable = Math.max(0, nextBookingCapacity - liveCount);
    const nextIsBusy = nextAvailable <= 0;

    if (
      s.bookingCapacity !== nextBookingCapacity ||
      s.isBusy !== nextIsBusy ||
      s.availableNumber !== nextAvailable
    ) {
      plan.spaces.push({
        id: s.id,
        name: s.name,
        type: s.type,
        from: {
          bookingCapacity: s.bookingCapacity,
          availableNumber: s.availableNumber,
          isBusy: s.isBusy,
        },
        to: {
          bookingCapacity: nextBookingCapacity,
          availableNumber: nextAvailable,
          isBusy: nextIsBusy,
        },
      });
    }
  }

  // ── Devices ────────────────────────────────────────────────────────────────
  const devices = await client.device.findMany({
    where: { ...branchFilter, deletedAt: null, isDeleted: false },
    select: { id: true, name: true, isBusy: true },
  });
  for (const d of devices) {
    const next = (liveCounts.DEVICE.get(d.id) ?? 0) > 0;
    if (d.isBusy !== next)
      plan.devices.push({ id: d.id, name: d.name, from: d.isBusy, to: next });
  }

  // ── Units ──────────────────────────────────────────────────────────────────
  const units = await client.unit.findMany({
    where: { ...branchFilter, isDeleted: false },
    select: { id: true, name: true, isBusy: true },
  });
  for (const u of units) {
    const next = (liveCounts.UNIT.get(u.id) ?? 0) > 0;
    if (u.isBusy !== next)
      plan.units.push({ id: u.id, name: u.name, from: u.isBusy, to: next });
  }

  // ── Equipment ──────────────────────────────────────────────────────────────
  // Quantity-based: busy only once every unit is reserved.
  const equipment = await client.equipment.findMany({
    where: { ...branchFilter, isDeleted: false },
    select: { id: true, name: true, quantity: true, isBusy: true },
  });
  for (const e of equipment) {
    const inUse = liveCounts.EQUIPMENT.get(e.id) ?? 0;
    const next = inUse >= e.quantity;
    if (e.isBusy !== next)
      plan.equipment.push({ id: e.id, name: e.name, from: e.isBusy, to: next });
  }

  return plan;
};

const countChanges = (plan) =>
  plan.spaces.length +
  plan.devices.length +
  plan.units.length +
  plan.equipment.length;

const report = (plan) => {
  log(`\n── Changes ──`);
  log(`Spaces to update:    ${plan.spaces.length}`);
  for (const p of plan.spaces) {
    log(
      `  • ${p.name} [${p.type}]  bookingCapacity ${p.from.bookingCapacity}→${p.to.bookingCapacity}, ` +
        `available ${p.from.availableNumber}→${p.to.availableNumber}, ` +
        `isBusy ${p.from.isBusy}→${p.to.isBusy}`,
    );
  }
  log(`Devices to update:   ${plan.devices.length}`);
  for (const p of plan.devices) log(`  • ${p.name}  isBusy ${p.from}→${p.to}`);
  log(`Units to update:     ${plan.units.length}`);
  for (const p of plan.units) log(`  • ${p.name}  isBusy ${p.from}→${p.to}`);
  log(`Equipment to update: ${plan.equipment.length}`);
  for (const p of plan.equipment) log(`  • ${p.name}  isBusy ${p.from}→${p.to}`);
};

async function main() {
  log(
    `\n=== reconcileResourceState — ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"} ===`,
  );
  if (BRANCH_ID) log(`Scope: branch ${BRANCH_ID}`);
  else log(`Scope: ALL branches`);

  const branchFilter = BRANCH_ID ? { branchId: BRANCH_ID } : {};

  const previewPlan = await buildPlan(prisma, branchFilter);
  report(previewPlan);

  if (!APPLY) {
    log(
      `\nDRY RUN complete — ${countChanges(previewPlan)} row(s) would change. Re-run with --apply to write.\n`,
    );
    return;
  }

  // Recompute inside the transaction and write. The preview above is only for
  // the operator to read; sessions started while they were reading it would
  // otherwise be erased by writing the stale absolute values back.
  const applied = await prisma.$transaction(
    async (tx) => {
      const plan = await buildPlan(tx, branchFilter);

      for (const p of plan.spaces) {
        await tx.space.update({ where: { id: p.id }, data: p.to });
      }
      for (const p of plan.devices) {
        await tx.device.update({ where: { id: p.id }, data: { isBusy: p.to } });
      }
      for (const p of plan.units) {
        await tx.unit.update({ where: { id: p.id }, data: { isBusy: p.to } });
      }
      for (const p of plan.equipment) {
        await tx.equipment.update({
          where: { id: p.id },
          data: { isBusy: p.to },
        });
      }

      return countChanges(plan);
    },
    { isolationLevel: "Serializable", timeout: 60_000 },
  );

  log(`\nAPPLIED — ${applied} row(s) updated. Done.\n`);
}

main()
  .catch((e) => {
    console.error("reconcileResourceState failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
