/**
 * End-to-end verification for the game-mode (SGL -> DBL) feature.
 *
 * Drives the controllers directly rather than over HTTP, so it needs no running
 * server and no auth token. Every timestamp is passed explicitly, so the result
 * is deterministic regardless of when it runs.
 *
 * The invariant it proves:
 *   total = SUM(mode hourly rate x hours in that mode)
 *         = 25 x 1h (SGL) + 30 x 2h (DBL) = 85.00
 * i.e. the price the switcher quotes and the price the bill charges agree.
 *
 *   npm run test:game-mode
 */
import process from "process";
import { prisma } from "../configs/db.js";
import * as gameModeCtl from "../controllers/gameMode.js";
import * as componentCtl from "../controllers/sessionComponent.js";
import * as sessionCtl from "../controllers/session.js";

const DEVICE_RATE = 20;
const CONTROLLER_RATE = 5;
let CONTROLLER_STOCK = 4;  // raised at runtime to clear pre-existing usage

// Anchored relative to now so the windows are always in the past — the switch
// endpoint rejects a future switchedAt, and endSession rejects a future endedAt.
// Durations stay fixed at 1h SGL + 2h DBL regardless of when this runs.
const HOUR = 60 * 60 * 1000;
const NOW = Date.now();
const TEST_MODE_CODES = ["ZZ-SGL", "ZZ-DBL", "ZZ-QUAD"];

const T0 = new Date(NOW - 3 * HOUR); // session start,   SGL
const T1 = new Date(NOW - 2 * HOUR); // switch to DBL
const T2 = new Date(NOW); //           session end

let failures = 0;
const check = (label, actual, expected) => {
  const ok = String(actual) === String(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : `  (expected ${expected})`}`);
};

// Minimal express-shaped invoker.
const call = (handler, { params = {}, body = {}, query = {}, user = {} } = {}) =>
  new Promise((resolve) => {
    const res = {
      status(code) {
        this._code = code;
        return this;
      },
      json(payload) {
        resolve({ status: this._code ?? 200, body: payload });
      },
    };
    handler({ params, body, query, user }, res, (err) =>
      resolve({
        status: err?.statusCode ?? 500,
        body: { error: err?.message?.split("\n")[0], typeError: err?.typeError },
      }),
    );
  });

const main = async () => {
  const branch = await prisma.branch.findFirst({ select: { id: true, name: true } });
  if (!branch) throw new Error("No branch found — seed the database first");

  const device = await prisma.device.findFirst({
    where: { branchId: branch.id, isActive: true, isDeleted: false, isBusy: false },
    select: { id: true, name: true, price: true, priceType: true, spaceId: true },
  });
  const controller = await prisma.equipment.findFirst({
    where: { branchId: branch.id, type: "CONTROLLER", isActive: true, isDeleted: false },
    select: { id: true, name: true, price: true, priceType: true, quantity: true },
  });
  if (!device || !controller) throw new Error("Need one free device and one CONTROLLER");

  // ── Fixtures ────────────────────────────────────────────────────────────
  const restore = {
    device: { price: device.price, priceType: device.priceType, spaceId: device.spaceId },
    controller: {
      price: controller.price,
      priceType: controller.priceType,
      quantity: controller.quantity,
    },
  };

  const created = { modes: [], visitId: null, sessionId: null, customerId: null };

  try {
    await prisma.device.update({
      where: { id: device.id },
      // spaceId null keeps the auto-added SPACE line out of the total.
      data: { price: DEVICE_RATE, priceType: "PER_HOUR", spaceId: null },
    });
    await prisma.equipment.update({
      where: { id: controller.id },
      data: { price: CONTROLLER_RATE, priceType: "PER_HOUR", isBusy: false },
    });
    // NEVER wipe the branch's modes — this script runs against a live database
    // and its own test codes are namespaced so they cannot collide with real
    // ones. Only leftovers from a previous aborted run are cleared.
    await prisma.gameMode.deleteMany({
      where: { branchId: branch.id, code: { in: TEST_MODE_CODES } },
    });

    // Controller units already held by other live sessions in this database.
    const preUsedAgg = await prisma.sessionComponent.aggregate({
      where: { resourceType: "EQUIPMENT", resourceId: controller.id, endedAt: null },
      _sum: { quantity: true },
    });
    const preUsed = preUsedAgg._sum.quantity ?? 0;
    if (preUsed > 0) console.log(`(note: ${preUsed} controller unit(s) already in use elsewhere)`);
    CONTROLLER_STOCK += preUsed;
    await prisma.equipment.update({
      where: { id: controller.id },
      data: { quantity: CONTROLLER_STOCK },
    });

    console.log(`\nbranch "${branch.name}"`);
    console.log(`device "${device.name}" ${DEVICE_RATE}/hr | controller "${controller.name}" ${CONTROLLER_RATE}/hr x${CONTROLLER_STOCK}\n`);

    // ── 1. Modes ──────────────────────────────────────────────────────────
    console.log("1. create modes");
    for (const spec of [
      { code: "ZZ-SGL", label: "Single (1v1)", players: 2, controllersRequired: 1, sortOrder: 1, isDefault: true },
      { code: "ZZ-DBL", label: "Double (2v2)", players: 4, controllersRequired: 2, sortOrder: 2 },
    ]) {
      const r = await call(gameModeCtl.createGameMode, {
        params: { branchId: branch.id },
        body: { ...spec, controllerEquipmentId: controller.id },
      });
      check(`${spec.code} created`, r.status, 201);
      created.modes.push(r.body.data);
    }
    const [sgl] = created.modes;

    // ── 2. Quoted prices ──────────────────────────────────────────────────
    console.log("\n2. pricing endpoint");
    let r = await call(gameModeCtl.getGameModePricing, {
      params: { branchId: branch.id },
      query: { deviceId: device.id },
    });
    const quoted = Object.fromEntries(r.body.data.modes.map((m) => [m.code, m]));
    check("SGL priceLabel", quoted["ZZ-SGL"].pricing.priceLabel, "25/hr");
    check("DBL priceLabel", quoted["ZZ-DBL"].pricing.priceLabel, "30/hr");
    check("DBL selectable", quoted["ZZ-DBL"].availability.selectable, true);
    // This database is shared with live sessions, so some units may already be
    // out. Assert against real stock minus real usage rather than a clean slate.
    check("controllers free", quoted["ZZ-DBL"].availability.controllersFree, CONTROLLER_STOCK - preUsed);

    // ── 3. Start the session in SGL ───────────────────────────────────────
    console.log("\n3. start session in SGL");
    const { businessId } = await prisma.branch.findUnique({
      where: { id: branch.id },
      select: { businessId: true },
    });
    const customer = await prisma.customer.findFirst({
      where: { businessId, isBlocked: false },
      select: { id: true },
    });
    if (!customer) throw new Error("No unblocked customer in this business");
    const actor = await prisma.user.findFirst({
      where: { isDeleted: false },
      select: { id: true },
    });
    const visit = await prisma.visit.create({
      data: { branchId: branch.id, customerId: customer.id, status: "ACTIVE", startedAt: T0, totalPrice: 0 },
      select: { id: true },
    });
    created.visitId = visit.id;
    created.customerId = customer.id;

    r = await call(sessionCtl.createSession, {
      params: { branchId: branch.id },
      body: { visitId: visit.id, deviceId: device.id, startedAt: T0, gameModeId: sgl.id },
      user: { id: actor.id },
    });
    check("session created", r.status, 201);
    created.sessionId = r.body.data?.id;

    let comps = await prisma.sessionComponent.findMany({
      where: { sessionId: created.sessionId },
      select: { resourceType: true, quantity: true, unitPrice: true, players: true, modeLabel: true, autoManaged: true, gameModeId: true },
    });
    check("component count", comps.length, 2);
    const dev0 = comps.find((c) => c.resourceType === "DEVICE");
    const eq0 = comps.find((c) => c.resourceType === "EQUIPMENT");
    check("device players", dev0?.players, 2);
    check("device modeLabel", dev0?.modeLabel, "Single (1v1)");
    check("controller qty", eq0?.quantity, 1);
    check("controller autoManaged", eq0?.autoManaged, true);

    // ── 4. Switch to DBL at 15:00 ─────────────────────────────────────────
    console.log("\n4. switch SGL -> DBL at 15:00");
    r = await call(componentCtl.changeSessionMode, {
      params: { sessionId: created.sessionId },
      body: { modeCode: "ZZ-DBL", switchedAt: T1 },
    });
    check("switch status", r.status, 200);
    check("device ended 60 min", r.body.data?.device?.endedSegment?.durationMinutes, 60);
    check("device ended price", Number(r.body.data?.device?.endedSegment?.totalPrice), 20);
    check("new segment players", r.body.data?.device?.newSegment?.players, 4);
    check("controllers ended price", Number(r.body.data?.controllers?.ended?.[0]?.totalPrice), 5);
    check("controllers created qty", r.body.data?.controllers?.created?.quantity, 2);
    check("sessionTotal after switch", Number(r.body.data?.sessionTotal), 25);

    // ── 5. Capacity conflict must 409 AND roll the whole switch back ──────
    // A mode needing more controllers than the branch stocks. The session is
    // already holding 2 of 4, so QUAD needs 2 more; dropping stock to 2 leaves
    // 0 free and the switch must fail without disturbing the device segment.
    console.log("\n5. 409 CONTROLLERS_UNAVAILABLE + rollback");
    const quad = (
      await call(gameModeCtl.createGameMode, {
        params: { branchId: branch.id },
        body: {
          code: "ZZ-QUAD",
          label: "Quad",
          players: 8,
          controllersRequired: 4,
          controllerEquipmentId: controller.id,
          sortOrder: 3,
        },
      })
    ).body.data;
    created.modes.push(quad);
    await prisma.equipment.update({ where: { id: controller.id }, data: { quantity: preUsed + 2 } });

    const before = await prisma.sessionComponent.findFirst({
      where: { sessionId: created.sessionId, resourceType: "DEVICE", endedAt: null },
      select: { id: true, players: true, startedAt: true },
    });

    r = await call(componentCtl.changeSessionMode, {
      params: { sessionId: created.sessionId },
      body: { gameModeId: quad.id, switchedAt: new Date(NOW - 1.5 * HOUR) },
    });
    check("status", r.status, 409);
    check("typeError", r.body.typeError, "CONTROLLERS_UNAVAILABLE");

    const after = await prisma.sessionComponent.findFirst({
      where: { sessionId: created.sessionId, resourceType: "DEVICE", endedAt: null },
      select: { id: true, players: true, startedAt: true },
    });
    check("device segment unchanged (id)", after?.id, before?.id);
    check("device segment unchanged (players)", after?.players, 4);
    check(
      "still exactly one open device row",
      await prisma.sessionComponent.count({
        where: { sessionId: created.sessionId, resourceType: "DEVICE", endedAt: null },
      }),
      1,
    );
    await prisma.equipment.update({
      where: { id: controller.id },
      data: { quantity: CONTROLLER_STOCK },
    });

    // ── 6/7. End the session and check the bill ───────────────────────────
    console.log("\n6. end session at 17:00 and total");
    r = await call(sessionCtl.endSession, {
      params: { branchId: branch.id, sessionId: created.sessionId },
      body: { endedAt: T2 },
      user: { id: actor.id },
    });
    check("end session status", r.status, 200);

    const finalComps = await prisma.sessionComponent.findMany({
      where: { sessionId: created.sessionId },
      orderBy: { startedAt: "asc" },
      select: { resourceType: true, quantity: true, unitPrice: true, players: true, durationMinutes: true, totalPrice: true },
    });
    console.log("\n   bill:");
    for (const c of finalComps) {
      console.log(
        `     ${c.resourceType.padEnd(9)} x${c.quantity} @${Number(c.unitPrice)}/hr  ` +
          `${String(c.durationMinutes ?? 0).padStart(3)}min  ${Number(c.totalPrice).toFixed(2)}` +
          (c.players ? `   (players ${c.players})` : ""),
      );
    }
    const total = finalComps.reduce((s, c) => s + Number(c.totalPrice), 0);
    console.log(`     ${"".padEnd(34)}total  ${total.toFixed(2)}`);

    // THE INVARIANT: the bill equals the sum of each mode's QUOTED hourly rate
    // times the minutes actually billed in that mode. Derived from the recorded
    // durations rather than assumed ones, because endSession stamps its own
    // wall-clock end and calculateDurationMinutes rounds partial minutes up —
    // so a 3h session can legitimately bill 121 minutes for its last leg.
    const minutesAt = (players) =>
      finalComps
        .filter((c) => c.resourceType === "DEVICE" && c.players === players)
        .reduce((s, c) => s + (c.durationMinutes ?? 0), 0);

    const sglMinutes = minutesAt(2);
    const dblMinutes = minutesAt(4);
    const expected =
      (Number(quoted["ZZ-SGL"].pricing.hourlyTotal) * sglMinutes) / 60 +
      (Number(quoted["ZZ-DBL"].pricing.hourlyTotal) * dblMinutes) / 60;

    console.log(
      `     quoted: SGL ${quoted["ZZ-SGL"].pricing.priceLabel} x ${sglMinutes}min + ` +
        `DBL ${quoted["ZZ-DBL"].pricing.priceLabel} x ${dblMinutes}min = ${expected.toFixed(2)}`,
    );
    check("INVARIANT quoted rates == billed total", total.toFixed(2), expected.toFixed(2));
    check("SGL leg billed 60 min", sglMinutes, 60);
    check("DBL leg billed 120 min", dblMinutes, 120);
    check("exact plan total 85.00", total.toFixed(2), "85.00");

    const session = await prisma.session.findUnique({
      where: { id: created.sessionId },
      select: { totalPrice: true },
    });
    check("session.totalPrice matches bill", Number(session.totalPrice).toFixed(2), total.toFixed(2));

    const eq = await prisma.equipment.findUnique({
      where: { id: controller.id },
      select: { isBusy: true },
    });
    const stillOpen = await prisma.sessionComponent.count({
      where: { sessionId: created.sessionId, endedAt: null },
    });
    check("no open components left", stillOpen, 0);
    check("controller released", eq.isBusy, false);
  } finally {
    // ── Teardown ──────────────────────────────────────────────────────────
    if (created.sessionId) {
      await prisma.sessionComponent.deleteMany({ where: { sessionId: created.sessionId } });
      await prisma.session.deleteMany({ where: { id: created.sessionId } });
    }
    if (created.visitId) {
      await prisma.invoice.deleteMany({ where: { visitId: created.visitId } });
      await prisma.visit.deleteMany({ where: { id: created.visitId } });
    }
    await prisma.gameMode.deleteMany({
      where: { branchId: branch.id, code: { in: TEST_MODE_CODES } },
    });
    await prisma.device.update({ where: { id: device.id }, data: restore.device });
    await prisma.equipment.update({
      where: { id: controller.id },
      data: { ...restore.controller, isBusy: false },
    });
    console.log("\nfixtures restored");
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
};

main().catch(async (error) => {
  console.error("\nverification aborted:", error.message);
  await prisma.$disconnect();
  process.exit(1);
});
