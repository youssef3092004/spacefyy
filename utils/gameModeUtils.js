import { AppError } from "./appError.js";
import {
  SESSION_COMPONENT_SELECT,
  calculateComponentPrice,
  calculateDurationMinutes,
  roundMoney,
} from "./sessionUtils.js";
import {
  releaseResourceAvailability,
  reserveResourceAvailability,
} from "./resourceAvailability.js";

/**
 * Game-mode pricing.
 *
 * A mode does NOT change the device's rate — the device always bills at its own
 * base price. The extra cost of a bigger mode is entirely the controllers it
 * requires. So:
 *
 *   mode price = device base rate + controllersRequired x controller rate
 *
 * This module is the single place that formula lives. The pricing endpoint
 * quotes from it and the switch bills from it, so a quote and a bill can never
 * disagree.
 */

export const GAME_MODE_CODE_RE = /^[A-Z0-9_-]{1,16}$/;

export const MODE_UNAVAILABLE_REASON = {
  ALREADY_ACTIVE: "ALREADY_ACTIVE",
  NOT_ENOUGH_CONTROLLERS: "NOT_ENOUGH_CONTROLLERS",
  MODE_MISCONFIGURED: "MODE_MISCONFIGURED",
  DEVICE_TYPE_MISMATCH: "DEVICE_TYPE_MISMATCH",
};

/**
 * Build the priced breakdown for one mode.
 *
 * Totals are bucketed by priceType rather than summed together — a PER_SESSION
 * device and a PER_HOUR controller are not the same unit, and adding them would
 * produce a number that means nothing.
 *
 * @param {object} args
 * @param {{id: string, name: string, priceType: string, price: number}} args.resource
 *   The device/unit, already through resolveResourcePricing (price is a Number).
 * @param {{id: string, name: string, priceType: string, price: number}|null} args.controllerEquipment
 * @param {number} args.controllersRequired
 * @returns {{lines: Array, hourlyTotal: number, fixedTotal: number, perGameTotal: number, priceLabel: string}}
 */
export const buildModePricing = ({
  resource,
  controllerEquipment,
  controllersRequired = 0,
}) => {
  const lines = [
    {
      kind: resource.kind ?? "DEVICE",
      resourceId: resource.id,
      name: resource.name ?? null,
      priceType: resource.priceType,
      unitPrice: resource.price,
      quantity: 1,
      amount: roundMoney(resource.price),
    },
  ];

  if (controllersRequired > 0 && controllerEquipment) {
    lines.push({
      kind: "EQUIPMENT",
      resourceId: controllerEquipment.id,
      name: controllerEquipment.name ?? null,
      priceType: controllerEquipment.priceType,
      unitPrice: controllerEquipment.price,
      quantity: controllersRequired,
      amount: roundMoney(controllerEquipment.price * controllersRequired),
    });
  }

  const sumWhere = (priceType) =>
    roundMoney(
      lines
        .filter((l) => l.priceType === priceType)
        .reduce((sum, l) => sum + l.amount, 0),
    );

  const hourlyTotal = sumWhere("PER_HOUR");
  const fixedTotal = sumWhere("PER_SESSION");
  const perGameTotal = sumWhere("PER_GAME");

  const priceLabel =
    [
      hourlyTotal ? `${hourlyTotal}/hr` : null,
      fixedTotal ? `+${fixedTotal}` : null,
      perGameTotal ? `+${perGameTotal}/game` : null,
    ]
      .filter(Boolean)
      .join(" ") || "0";

  return { lines, hourlyTotal, fixedTotal, perGameTotal, priceLabel };
};

/**
 * Whether a mode can be switched to right now.
 *
 * `held` is what THIS session already holds of the same controller row — those
 * units are released back before the new ones are reserved, so only the delta
 * has to be free. Without that the common 1 -> 2 switch would look impossible
 * whenever stock is tight.
 */
export const buildModeAvailability = ({
  mode,
  controllerEquipment,
  freeControllers,
  heldControllers = 0,
  isCurrent = false,
  deviceTypeMatches = true,
}) => {
  const required = mode.controllersRequired ?? 0;
  const needed = Math.max(0, required - heldControllers);

  const base = {
    controllerEquipmentId: mode.controllerEquipmentId ?? null,
    controllersRequired: required,
    controllersHeld: heldControllers,
    controllersNeeded: needed,
    controllersFree: freeControllers ?? 0,
  };

  if (required > 0 && !controllerEquipment) {
    return {
      ...base,
      selectable: false,
      reason: MODE_UNAVAILABLE_REASON.MODE_MISCONFIGURED,
    };
  }
  if (!deviceTypeMatches) {
    return {
      ...base,
      selectable: false,
      reason: MODE_UNAVAILABLE_REASON.DEVICE_TYPE_MISMATCH,
    };
  }
  if (isCurrent) {
    return {
      ...base,
      selectable: false,
      reason: MODE_UNAVAILABLE_REASON.ALREADY_ACTIVE,
    };
  }
  if (needed > (freeControllers ?? 0)) {
    return {
      ...base,
      selectable: false,
      reason: MODE_UNAVAILABLE_REASON.NOT_ENOUGH_CONTROLLERS,
    };
  }

  return { ...base, selectable: true, reason: null };
};

/**
 * A mode with no deviceTypes restriction applies everywhere. Otherwise the
 * device's own type must be listed.
 */
export const modeAppliesToDeviceType = (mode, deviceType) => {
  if (!mode.deviceTypes || mode.deviceTypes.length === 0) return true;
  if (!deviceType) return true;
  return mode.deviceTypes.includes(deviceType);
};

/**
 * Close one equipment component, price it over its own window, and give its
 * units back to the pool. `endedAt` is clamped forward to the component's own
 * start so a component added after the switch instant can never end before it
 * began — same clamp the auto-end loop in endComponent uses.
 */
const endEquipmentComponent = async (tx, component, at) => {
  const startedAt = new Date(component.startedAt);
  const endedAt = at < startedAt ? startedAt : at;

  const ended = await tx.sessionComponent.update({
    where: { id: component.id },
    data: {
      endedAt,
      durationMinutes: calculateDurationMinutes(startedAt, endedAt),
      totalPrice: calculateComponentPrice({
        priceType: component.priceType,
        unitPrice: component.unitPrice,
        quantity: component.quantity,
        gamesCount: component.gamesCount,
        startedAt,
        endedAt,
      }),
    },
    select: SESSION_COMPONENT_SELECT,
  });

  // Release AFTER endedAt is written: the equipment release recomputes usage
  // from the still-open rows, so this row must already be closed to be excluded.
  await releaseResourceAvailability(tx, {
    resourceType: "EQUIPMENT",
    resourceId: component.resourceId,
    branchId: component.branchId,
  });

  return ended;
};

const reserveOrConflict = async (tx, { equipment, branchId, quantity, allowOverbook }) => {
  // Deliberate escape hatch for untracked spare stock. The component is still
  // created and billed — only the capacity cap is skipped.
  if (allowOverbook) return;

  try {
    await reserveResourceAvailability(tx, {
      resourceType: "EQUIPMENT",
      resourceId: equipment.id,
      branchId,
      quantity,
    });
  } catch (error) {
    if (error?.statusCode === 400) {
      throw new AppError(error.message, 409, {
        typeError: "CONTROLLERS_UNAVAILABLE",
      });
    }
    throw error;
  }
};

/**
 * Bring this session's auto-managed controllers in line with the target mode.
 *
 * ORDERING IS LOAD-BEARING. reserveResourceAvailability derives "in use" by
 * summing the quantity of still-open EQUIPMENT components, so this session's
 * own controllers must be closed BEFORE the new ones are reserved. Reserve
 * first and a routine 1 -> 2 switch on a two-unit stock competes with itself
 * and falsely reports the equipment unavailable.
 *
 * Only rows flagged autoManaged are touched — staff-added equipment (a headset,
 * an ad-hoc third controller the customer is paying for) is left alone.
 *
 * @returns {Promise<{ended: Array, created: object|null}>}
 */
export const syncAutoManagedControllers = async (
  tx,
  { session, mode, equipment, at, gamesCount = 0, allowOverbook = false },
) => {
  const ended = [];
  const required = mode.controllersRequired ?? 0;

  const open = await tx.sessionComponent.findMany({
    where: {
      sessionId: session.id,
      resourceType: "EQUIPMENT",
      endedAt: null,
      autoManaged: true,
    },
    select: SESSION_COMPONENT_SELECT,
    orderBy: { startedAt: "asc" },
  });

  const targetId = required > 0 && equipment ? equipment.id : null;
  const sameRow = open.filter((c) => c.resourceId === targetId);
  const otherRows = open.filter((c) => c.resourceId !== targetId);

  // 1. Controllers belonging to a different equipment row always go back —
  //    the new mode draws from its own row.
  for (const component of otherRows) {
    ended.push(await endEquipmentComponent(tx, component, at));
  }

  if (required === 0 || !equipment) {
    for (const component of sameRow) {
      ended.push(await endEquipmentComponent(tx, component, at));
    }
    return { ended, created: null };
  }

  const held = sameRow.reduce((sum, c) => sum + c.quantity, 0);

  const createControllers = async (quantity) => {
    await reserveOrConflict(tx, {
      equipment,
      branchId: session.branchId,
      quantity,
      allowOverbook,
    });

    return tx.sessionComponent.create({
      data: {
        sessionId: session.id,
        branchId: session.branchId,
        resourceType: "EQUIPMENT",
        resourceId: equipment.id,
        pricingRuleId: null,
        priceType: equipment.priceType,
        unitPrice: equipment.price,
        quantity,
        gamesCount: equipment.priceType === "PER_GAME" ? gamesCount : 0,
        players: null,
        modeLabel: null,
        gameModeId: mode.id,
        autoManaged: true,
        startedAt: at,
        totalPrice: 0,
      },
      select: SESSION_COMPONENT_SELECT,
    });
  };

  // 2. Hourly controllers are segmented like the device: close the old window,
  //    open a new one. Each window bills for exactly the time it was held.
  if (equipment.priceType === "PER_HOUR") {
    for (const component of sameRow) {
      ended.push(await endEquipmentComponent(tx, component, at));
    }
    return { ended, created: await createControllers(required) };
  }

  // 3. Flat-fee controllers (PER_SESSION / PER_GAME) move by delta instead —
  //    closing and recreating would charge the same flat fee twice.
  //
  //    Rows that survive the delta must still be re-stamped with the new mode,
  //    or a component the session is holding under DBL would keep claiming it
  //    belongs to SGL and skew any revenue grouped by gameModeId.
  const restampSurvivors = async () => {
    const survivors = sameRow.filter(
      (c) => c.gameModeId !== mode.id && !ended.some((e) => e.id === c.id),
    );
    if (survivors.length > 0) {
      await tx.sessionComponent.updateMany({
        where: { id: { in: survivors.map((c) => c.id) } },
        data: { gameModeId: mode.id },
      });
    }
  };

  if (required > held) {
    const created = await createControllers(required - held);
    await restampSurvivors();
    return { ended, created };
  }

  if (required === held) {
    await restampSurvivors();
    return { ended, created: null };
  }

  let toDrop = held - required;
  for (const component of [...sameRow].reverse()) {
    if (toDrop <= 0) break;
    if (component.quantity <= toDrop) {
      ended.push(await endEquipmentComponent(tx, component, at));
      toDrop -= component.quantity;
    } else {
      await tx.sessionComponent.update({
        where: { id: component.id },
        data: { quantity: component.quantity - toDrop },
      });
      toDrop = 0;
      // Quantity shrank without a row closing, so recompute the pool by hand.
      await releaseResourceAvailability(tx, {
        resourceType: "EQUIPMENT",
        resourceId: equipment.id,
        branchId: session.branchId,
      });
    }
  }

  await restampSurvivors();
  return { ended, created: null };
};

export const normalizeGameModeCode = (code) => {
  const normalized = String(code ?? "").trim().toUpperCase();
  if (!GAME_MODE_CODE_RE.test(normalized)) {
    throw new AppError(
      "code must be 1-16 characters using A-Z, 0-9, underscore or hyphen",
      400,
    );
  }
  return normalized;
};
