/**
 * PENDING ISSUES — found via code review
 * ─────────────────────────────────────────────────────────────────────────────
 * Priority: CRITICAL > HIGH > MEDIUM > LOW
 */

const TASKS = [
  // ─── CRITICAL ──────────────────────────────────────────────────────────────

  {
    id: 1,
    priority: "CRITICAL",
    title: "Device availability crashes when device has no space",
    file: "controllers/spaceAvailability.js",
    description:
      "device.space.branchId throws TypeError when device.spaceId is null. " +
      "A device not assigned to any space can never be availability-checked.",
    fix: "Guard with: if (!device.space || device.space.branchId !== branchId). " +
      "Or filter branchId directly in the query instead of traversing the relation.",
  },

  {
    id: 2,
    priority: "CRITICAL",
    title: "Unit availability endpoint completely broken — wrong schema relation",
    file: "controllers/spaceAvailability.js",
    description:
      "Query navigates unit.device.space but Unit has no 'device' relation in the schema. " +
      "Always throws a Prisma validation error — endpoint is 100% broken.",
    fix: "Navigate via unit.space instead: select: { space: { select: { branchId: true } } }.",
  },

  {
    id: 3,
    priority: "CRITICAL",
    title: "Soft-deleting an ACTIVE session leaves resources permanently busy",
    file: "controllers/session.js — deleteSessionById",
    description:
      "Sets deletedAt but never calls releaseResourceAvailability on components. " +
      "Device/unit/space stays isBusy:true with no way to recover.",
    fix: "Before soft-delete, check if session.status === 'ACTIVE'. " +
      "If so, iterate all components and call releaseResourceAvailability for each " +
      "(same pattern as cancelSession).",
  },

  {
    id: 4,
    priority: "CRITICAL",
    title: "endSession releases equipment availability before setting endedAt",
    file: "controllers/session.js — endSession + utils/resourceAvailability.js",
    description:
      "releaseResourceAvailability is called before tx.sessionComponent.update sets endedAt. " +
      "The aggregate query inside release still counts the component as active (endedAt: null), " +
      "so equipment isBusy never clears correctly when a full session ends.",
    fix: "In endSession loop: call tx.sessionComponent.update (set endedAt) FIRST, " +
      "then call releaseResourceAvailability after.",
  },

  {
    id: 5,
    priority: "CRITICAL",
    title: "Equipment types PING_PONG, BILLIARDO, BOARD_GAME permanently rejected",
    file: "controllers/equipment.js",
    description:
      "Local EQUIPMENT_TYPES array is missing PING_PONG, BILLIARDO, and BOARD_GAME " +
      "which exist in the Prisma EquipmentType enum. Creating equipment with these types " +
      "returns 'Invalid equipment type' even though the DB allows them.",
    fix: "Add 'PING_PONG', 'BILLIARDO', 'BOARD_GAME' to the EQUIPMENT_TYPES array.",
  },

  {
    id: 6,
    priority: "CRITICAL",
    title: "closeVisit does not block when sessions are still ACTIVE",
    file: "controllers/visit.js — closeVisit",
    description:
      "Visit is closed even if sessions have status ACTIVE and totalPrice 0. " +
      "Those sessions' revenue is excluded from the invoice, resources stay busy forever, " +
      "and the visit is permanently INVOICED with no way to end the remaining sessions.",
    fix: "Before closing, query for any session where { visitId, status: 'ACTIVE', deletedAt: null }. " +
      "If any exist, return 400: 'End all active sessions before closing the visit'.",
  },

  // ─── HIGH ───────────────────────────────────────────────────────────────────

  {
    id: 7,
    priority: "HIGH",
    title: "Soft-deleted device can still start a session",
    file: "controllers/session.js — resolveComponentsFromDevice",
    description:
      "findFirst checks isActive:true but not isDeleted:false. " +
      "A soft-deleted device can still be passed as deviceId to createSession.",
    fix: "Add isDeleted: false to the device findFirst query.",
  },

  {
    id: 8,
    priority: "HIGH",
    title: "updateDeviceById writes arbitrary request body fields to the database",
    file: "controllers/device.js — updateDeviceById",
    description:
      "Builds updates = { ...req.body } without stripping non-allowed keys. " +
      "Any extra field matching a Prisma model field is silently written to the DB.",
    fix: "After defining allowedUpdates, reduce updates to only those keys " +
      "(same pattern as unit.js and equipment.js).",
  },

  {
    id: 9,
    priority: "HIGH",
    title: "Equipment auto-ends when ANY device ends, even if other devices still active",
    file: "controllers/sessionComponent.js — endComponent",
    description:
      "If a session has 2 devices and 1 ends early, ALL equipment auto-ends " +
      "even though device #2 is still running.",
    fix: "Only auto-end equipment if no more DEVICE or UNIT components remain active " +
      "in the session after this one ends. " +
      "Query: { sessionId, resourceType: { in: ['DEVICE','UNIT'] }, endedAt: null } " +
      "and skip auto-end if count > 0.",
  },

  {
    id: 10,
    priority: "HIGH",
    title: "branchId missing from end/cancel/delete session routes — branch check silently skipped",
    file: "routes/session.js",
    description:
      "Routes /end/:sessionId, /cancel/:sessionId, /delete/:sessionId have no :branchId param. " +
      "req.params.branchId is undefined so ensureBranchMatch silently skips the check. " +
      "Any authenticated staff can end any branch's session.",
    fix: "Add /:branchId to those route URLs (e.g. /end/:branchId/:sessionId) " +
      "to match the createSession pattern.",
  },

  // ─── MEDIUM ─────────────────────────────────────────────────────────────────

  {
    id: 11,
    priority: "MEDIUM",
    title: "createSession checkOwnership reads visitId from body — missing visitId gives wrong error",
    file: "routes/session.js — POST /create/:branchId",
    description:
      "checkOwnership falls back to req.body for visitId which works, but a missing visitId " +
      "returns a generic 400 from checkOwnership before the controller's own validation runs.",
    fix: "Validate visitId presence before the checkOwnership middleware, " +
      "or move the checkOwnership to rely only on branchId from params.",
  },

  {
    id: 12,
    priority: "MEDIUM",
    title: "Empty customer list returns 404 instead of 200 + empty array",
    file: "controllers/customer.js — getAllCustomersBybusinessId (line ~585), getAllCustomers (line ~624)",
    description:
      "if (!customers.length) returns a 404 AppError. " +
      "A valid business with zero customers should return 200 with an empty array, not 404.",
    fix: "Remove the !customers.length 404 check and always return the (possibly empty) array.",
  },

  {
    id: 13,
    priority: "MEDIUM",
    title: "priceType filter in space history is accepted but silently ignored",
    file: "controllers/space.js — getSpaceHistoryFromSession",
    description:
      "priceType is destructured from req.query but never applied to the where clause. " +
      "Clients passing ?priceType=PER_HOUR get unfiltered results with no error.",
    fix: "Either apply the filter to the query or remove it from the accepted params.",
  },

  // ─── LOW ────────────────────────────────────────────────────────────────────

  {
    id: 14,
    priority: "LOW",
    title: "Mixed response format across controllers — status:'success' vs success:true",
    file: "controllers/visit.js, space.js, device.js, unit.js, equipment.js vs session.js, order.js, invoice.js",
    description:
      "Older controllers return { status: 'success', ... }. " +
      "Newer controllers return { success: true, ... }. " +
      "API consumers cannot reliably check either field across all endpoints.",
    fix: "Standardize all controllers to return { success: true, ... }.",
  },
];

export default TASKS;
