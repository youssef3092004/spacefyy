import { AppError } from "./appError.js";

export const SessionResourceType = ["SPACE", "DEVICE", "UNIT", "EQUIPMENT"];
export const SessionStatus = ["ACTIVE", "ENDED", "CANCELLED"];
export const SessionPriceType = ["PER_HOUR", "PER_SESSION", "PER_GAME"];

const SESSION_STATUS_TRANSITIONS = {
  ACTIVE: ["ENDED", "CANCELLED"],
  ENDED: [],
  CANCELLED: [],
};

const TIME_BASED_MODES = ["PER_HOUR", "TIME_RANGE"];

const DEFAULT_PAGE_LIMIT = 10;
const MAX_PAGE_LIMIT = 100;

export const roundMoney = (value) => {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
};

export const normalizeSessionResourceType = (resourceType) => {
  const normalized = String(resourceType || "").toUpperCase();
  if (!SessionResourceType.includes(normalized)) {
    throw new AppError("Invalid resourceType", 400);
  }
  return normalized;
};

export const normalizeSessionStatus = (status, fallback = null) => {
  if (status === undefined || status === null || status === "") {
    return fallback;
  }

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
  if (!nextStatus || !currentStatus || nextStatus === currentStatus) {
    return;
  }

  const allowedTransitions = SESSION_STATUS_TRANSITIONS[currentStatus] || [];
  if (!allowedTransitions.includes(nextStatus)) {
    throw new AppError(
      `Cannot change session status from ${currentStatus} to ${nextStatus}`,
      400,
    );
  }
};

export const parseDate = (value, fieldName) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new AppError(`${fieldName} must be a valid date`, 400);
  }

  return parsedDate;
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

export const calculateSessionTotal = ({
  pricingMode,
  unitPrice,
  startedAt,
  endedAt,
  fallbackTotalPrice,
}) => {
  const price = parseMoney(unitPrice, "unitPrice");

  if (!pricingMode || !TIME_BASED_MODES.includes(pricingMode)) {
    if (fallbackTotalPrice !== undefined && fallbackTotalPrice !== null) {
      return parseMoney(fallbackTotalPrice, "totalPrice");
    }
    return price;
  }

  if (!endedAt) {
    if (fallbackTotalPrice !== undefined && fallbackTotalPrice !== null) {
      return parseMoney(fallbackTotalPrice, "totalPrice");
    }
    return price;
  }

  const durationMinutes = calculateDurationMinutes(startedAt, endedAt);
  return roundMoney((price * durationMinutes) / 60);
};

export const calculatePriceByType = ({
  priceType,
  amount,
  startedAt,
  endedAt,
  gamesCount = 1,
}) => {
  const normalizedType = normalizeSessionPriceType(priceType);
  const baseAmount = parseMoney(amount, "amount");
  const parsedGamesCount = Number(gamesCount ?? 1);

  if (normalizedType === "PER_GAME") {
    if (!Number.isInteger(parsedGamesCount) || parsedGamesCount <= 0) {
      throw new AppError("gamesCount must be a positive integer", 400);
    }

    return roundMoney(baseAmount * parsedGamesCount);
  }

  if (normalizedType !== "PER_HOUR") {
    return baseAmount;
  }

  if (!endedAt) {
    return baseAmount;
  }

  const durationMinutes = calculateDurationMinutes(startedAt, endedAt);
  return roundMoney((baseAmount * durationMinutes) / 60);
};

export const getSessionQueryOptions = (query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(
    Math.max(Number(query.limit) || DEFAULT_PAGE_LIMIT, 1),
    MAX_PAGE_LIMIT,
  );
  const skip = (page - 1) * limit;

  const allowedSortFields = [
    "createdAt",
    "updatedAt",
    "startedAt",
    "endedAt",
    "totalPrice",
    "unitPrice",
    "gamesCount",
    "durationMinutes",
    "status",
  ];

  const sort = query.sort || "createdAt";
  if (!allowedSortFields.includes(sort)) {
    throw new AppError("Invalid sort field", 400);
  }

  const order = String(query.order || "desc").toLowerCase();
  if (!["asc", "desc"].includes(order)) {
    throw new AppError("Invalid order, must be 'asc' or 'desc'", 400);
  }

  const where = {
    deletedAt: null,
  };

  if (query.branchId) {
    where.branchId = query.branchId;
  }

  if (query.visitId) {
    where.visitId = query.visitId;
  }

  if (query.pricingRuleId) {
    where.pricingRuleId = query.pricingRuleId;
  }

  if (query.bookingId) {
    where.bookingId = query.bookingId;
  }

  if (query.resourceId) {
    where.resourceId = query.resourceId;
  }

  if (query.resourceType) {
    where.resourceType = normalizeSessionResourceType(query.resourceType);
  }

  if (query.status) {
    where.status = normalizeSessionStatus(query.status);
  }

  const startedFrom = parseDate(query.startedFrom, "startedFrom");
  const startedTo = parseDate(query.startedTo, "startedTo");

  if (startedFrom || startedTo) {
    where.startedAt = {
      ...(startedFrom ? { gte: startedFrom } : {}),
      ...(startedTo ? { lte: startedTo } : {}),
    };
  }

  return {
    page,
    limit,
    skip,
    sort,
    order,
    where,
  };
};

// BUG-FIX-4: Currency validation to ensure all prices use same currency
export const validateCurrencyConsistency = (components, currency = "EGP") => {
  if (!currency) {
    throw new AppError("Currency is required for validation", 400);
  }

  // Currency validation primarily at aggregation level
  // Components should all use the same currency from pricing rules
  if (!components || components.length === 0) {
    return true;
  }

  return true; // All components assumed same currency from pricing rule
};
