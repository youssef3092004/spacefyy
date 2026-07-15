import { AppError } from "./appError.js";

export const SessionResourceType = ["SPACE", "DEVICE", "UNIT", "EQUIPMENT"];
export const SessionStatus = ["ACTIVE", "ENDED", "CANCELLED"];
export const SessionPriceType = ["PER_HOUR", "PER_SESSION", "PER_GAME"];

const SESSION_STATUS_TRANSITIONS = {
  ACTIVE: ["ENDED", "CANCELLED"],
  ENDED: [],
  CANCELLED: [],
};

const DEFAULT_PAGE_LIMIT = 10;
const MAX_PAGE_LIMIT = 100;

export const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const normalizeSessionResourceType = (resourceType) => {
  const normalized = String(resourceType || "").toUpperCase();
  if (!SessionResourceType.includes(normalized)) {
    throw new AppError("Invalid resourceType", 400);
  }
  return normalized;
};

export const normalizeSessionStatus = (status, fallback = null) => {
  if (status === undefined || status === null || status === "") return fallback;
  const normalized = String(status).toUpperCase();
  if (!SessionStatus.includes(normalized)) {
    throw new AppError("Invalid session status", 400);
  }
  return normalized;
};

export const normalizeSessionPriceType = (priceType, fallback = "PER_HOUR") => {
  const normalized = String(priceType || fallback).toUpperCase();
  if (!SessionPriceType.includes(normalized)) {
    throw new AppError("Invalid priceType", 400);
  }
  return normalized;
};

export const ensureSessionStatusTransition = (currentStatus, nextStatus) => {
  if (!nextStatus || !currentStatus || nextStatus === currentStatus) return;
  const allowed = SESSION_STATUS_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    throw new AppError(
      `Cannot change session status from ${currentStatus} to ${nextStatus}`,
      400,
    );
  }
};

export const parseDate = (value, fieldName) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(`${fieldName} must be a valid date`, 400);
  }
  return parsed;
};

export const parseMoney = (value, fieldName) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError(`${fieldName} must be a valid number`, 400);
  }
  if (parsed < 0) {
    throw new AppError(`${fieldName} must be >= 0`, 400);
  }
  return roundMoney(parsed);
};

export const calculateDurationMinutes = (startedAt, endedAt) => {
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new AppError("Invalid session timestamps", 400);
  }
  if (end < start) {
    throw new AppError("endedAt cannot be before startedAt", 400);
  }
  return Math.ceil((end.getTime() - start.getTime()) / 60000);
};

// Core pricing formula for a single session component.
// quantity handles multi-unit resources (e.g. 2 controllers).
export const calculateComponentPrice = ({
  priceType,
  unitPrice,
  quantity = 1,
  gamesCount = 0,
  startedAt,
  endedAt,
}) => {
  const type = normalizeSessionPriceType(priceType);
  const price = parseMoney(unitPrice, "unitPrice");
  const qty = Math.max(1, Number(quantity) || 1);

  if (type === "PER_GAME") {
    const games = Number(gamesCount);
    if (!Number.isInteger(games) || games < 1) {
      throw new AppError("gamesCount must be a positive integer for PER_GAME pricing", 400);
    }
    return roundMoney(price * qty * games);
  }

  if (type === "PER_SESSION") {
    return roundMoney(price * qty);
  }

  // PER_HOUR — return basePrice as placeholder when session is still active
  if (!endedAt) return roundMoney(price * qty);

  const durationMinutes = calculateDurationMinutes(startedAt, endedAt);
  return roundMoney((price * qty * durationMinutes) / 60);
};

export const getSessionQueryOptions = (query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT);
  const skip = (page - 1) * limit;

  const allowedSortFields = [
    "createdAt", "updatedAt", "startedAt", "endedAt",
    "totalPrice", "durationMinutes", "status",
  ];

  const sort = query.sort || "createdAt";
  if (!allowedSortFields.includes(sort)) {
    throw new AppError("Invalid sort field", 400);
  }

  const order = String(query.order || "desc").toLowerCase();
  if (!["asc", "desc"].includes(order)) {
    throw new AppError("Invalid order, must be 'asc' or 'desc'", 400);
  }

  const where = { deletedAt: null };

  if (query.branchId)      where.branchId      = query.branchId;
  if (query.visitId)       where.visitId        = query.visitId;
  if (query.bookingId)     where.bookingId      = query.bookingId;
  if (query.status)        where.status         = normalizeSessionStatus(query.status);

  const startedFrom = parseDate(query.startedFrom, "startedFrom");
  const startedTo   = parseDate(query.startedTo,   "startedTo");

  if (startedFrom || startedTo) {
    where.startedAt = {
      ...(startedFrom ? { gte: startedFrom } : {}),
      ...(startedTo   ? { lte: startedTo   } : {}),
    };
  }

  return { page, limit, skip, sort, order, where };
};

// Adds a display-friendly `modeLabel` to a session component: prefers the
// snapshotted rule name; falls back to "{n} players" when a player count was
// set without a named rule; null when players is irrelevant (SPACE/EQUIPMENT).
export const serializeComponent = (component) => {
  if (!component) return component;
  const modeLabel =
    component.modeLabel ??
    (component.players != null ? `${component.players} players` : null);
  return { ...component, modeLabel };
};
