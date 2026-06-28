import { AppError } from "./appError.js";

export const ensureCanStartVisit = (visitStatus) => {
  if (!visitStatus) return;

  if (visitStatus === "ACTIVE") {
    throw new AppError("Customer already has an active visit", 409);
  }
  // CANCELLED and INVOICED both allow starting a new visit
};

// Backward-compatible alias for existing imports/usages.
export const ensureCanAddSession = ensureCanStartVisit;

export const ensureCanModifySession = (visitStatus) => {
  if (!visitStatus) return;

  if (visitStatus === "INVOICED") {
    throw new AppError("Cannot modify session when visit is INVOICED", 400);
  }
};

export const ensureCanModifyAnything = (_visitStatus) => {};
