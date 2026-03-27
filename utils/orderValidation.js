/**
 * Order Module - Validation & Utility Helpers
 *
 * Purpose: Centralized validation functions for order operations
 * These can be reused across controllers to maintain consistency
 */

import { AppError } from "./appError.js";

// ============================================================================
// ORDER VALIDATION UTILITIES
// ============================================================================

/**
 * Validates order item structure
 * @param {object} item - The item to validate
 * @param {string} item.productId - Product ID
 * @param {number} item.quantity - Quantity
 * @throws {AppError} If validation fails
 * @returns {object} Validated item
 */
export const validateOrderItem = (item) => {
  if (!item || typeof item !== "object") {
    throw new AppError("Each order item must be an object", 400);
  }

  const { productId, quantity } = item;

  if (!productId || typeof productId !== "string") {
    throw new AppError("productId is required and must be a string", 400);
  }

  if (quantity === undefined || quantity === null) {
    throw new AppError("quantity is required", 400);
  }

  const parsedQuantity = Number(quantity);

  if (!Number.isInteger(parsedQuantity)) {
    throw new AppError("Quantity must be an integer", 400);
  }

  if (parsedQuantity <= 0) {
    throw new AppError("Quantity must be greater than 0", 400);
  }

  if (parsedQuantity > 10000) {
    throw new AppError("Quantity cannot exceed 10000", 400);
  }

  return { productId, quantity: parsedQuantity };
};

/**
 * Validates an array of order items
 * @param {array} items - Array of order items
 * @throws {AppError} If validation fails
 * @returns {array} Validated items
 */
export const validateOrderItems = (items) => {
  if (!Array.isArray(items)) {
    throw new AppError("Items must be an array", 400);
  }

  if (items.length === 0) {
    throw new AppError("Order must contain at least one item", 400);
  }

  if (items.length > 100) {
    throw new AppError("Order cannot contain more than 100 items", 400);
  }

  return items.map((item) => validateOrderItem(item));
};

/**
 * Validates visit ID format
 * @param {string} visitId - Visit ID to validate
 * @throws {AppError} If validation fails
 * @returns {string} Validated visit ID
 */
export const validateVisitId = (visitId) => {
  if (!visitId || typeof visitId !== "string") {
    throw new AppError("visitId is required and must be a string", 400);
  }

  if (visitId.trim().length === 0) {
    throw new AppError("visitId cannot be empty", 400);
  }

  return visitId.trim();
};

/**
 * Validates order ID format
 * @param {string} orderId - Order ID to validate
 * @throws {AppError} If validation fails
 * @returns {string} Validated order ID
 */
export const validateOrderId = (orderId) => {
  if (!orderId || typeof orderId !== "string") {
    throw new AppError("orderId is required and must be a string", 400);
  }

  if (orderId.trim().length === 0) {
    throw new AppError("orderId cannot be empty", 400);
  }

  return orderId.trim();
};

/**
 * Validates order item ID format
 * @param {string} itemId - Item ID to validate
 * @throws {AppError} If validation fails
 * @returns {string} Validated item ID
 */
export const validateOrderItemId = (itemId) => {
  if (!itemId || typeof itemId !== "string") {
    throw new AppError("itemId is required and must be a string", 400);
  }

  if (itemId.trim().length === 0) {
    throw new AppError("itemId cannot be empty", 400);
  }

  return itemId.trim();
};

/**
 * Validates product ID format
 * @param {string} productId - Product ID to validate
 * @throws {AppError} If validation fails
 * @returns {string} Validated product ID
 */
export const validateProductId = (productId) => {
  if (!productId || typeof productId !== "string") {
    throw new AppError("productId is required and must be a string", 400);
  }

  if (productId.trim().length === 0) {
    throw new AppError("productId cannot be empty", 400);
  }

  return productId.trim();
};

/**
 * Validates branch ID format
 * @param {string} branchId - Branch ID to validate
 * @throws {AppError} If validation fails
 * @returns {string} Validated branch ID
 */
export const validateBranchId = (branchId) => {
  if (!branchId || typeof branchId !== "string") {
    throw new AppError("branchId is required and must be a string", 400);
  }

  if (branchId.trim().length === 0) {
    throw new AppError("branchId cannot be empty", 400);
  }

  return branchId.trim();
};

/**
 * Validates currency code (3-letter ISO code)
 * @param {string} currency - Currency code
 * @throws {AppError} If validation fails
 * @returns {string} Validated currency
 */
export const validateCurrency = (currency = "EGP") => {
  const validCurrencies = ["EGP", "USD", "EUR", "GBP", "SAR", "AED"];

  if (!validCurrencies.includes(currency)) {
    throw new AppError(
      `Invalid currency. Allowed: ${validCurrencies.join(", ")}`,
      400,
    );
  }

  return currency;
};

/**
 * Validates date range for analytics queries
 * @param {string} startDate - Start date (ISO format)
 * @param {string} endDate - End date (ISO format)
 * @throws {AppError} If validation fails
 * @returns {object} { startDate, endDate }
 */
export const validateDateRange = (startDate, endDate) => {
  const errors = [];

  let start, end;

  if (startDate) {
    start = new Date(startDate);
    if (isNaN(start)) {
      errors.push("startDate must be a valid ISO date");
    }
  }

  if (endDate) {
    end = new Date(endDate);
    if (isNaN(end)) {
      errors.push("endDate must be a valid ISO date");
    }
  }

  if (start && end && start > end) {
    errors.push("startDate must be before endDate");
  }

  if (errors.length > 0) {
    throw new AppError(errors.join("; "), 400);
  }

  return { startDate: start, endDate: end };
};

/**
 * Validates quantity updates structure
 * @param {array} updates - Array of quantity update objects
 * @throws {AppError} If validation fails
 * @returns {array} Validated updates
 */
export const validateQuantityUpdates = (updates) => {
  if (!Array.isArray(updates)) {
    throw new AppError("quantityUpdates must be an array", 400);
  }

  return updates.map((update) => {
    const { itemId, newQuantity } = update;

    if (!itemId || typeof itemId !== "string") {
      throw new AppError("Each update must have a valid itemId", 400);
    }

    const quantity = Number(newQuantity);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new AppError("Each update must have a valid newQuantity > 0", 400);
    }

    return { itemId: itemId.trim(), newQuantity: quantity };
  });
};

/**
 * Validates item IDs for removal
 * @param {array} itemIds - Array of item IDs to remove
 * @throws {AppError} If validation fails
 * @returns {array} Validated item IDs
 */
export const validateItemIdsForRemoval = (itemIds) => {
  if (!Array.isArray(itemIds)) {
    throw new AppError("itemsToRemove must be an array", 400);
  }

  return itemIds.map((id) => {
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new AppError("Each item ID must be a non-empty string", 400);
    }
    return id.trim();
  });
};

// ============================================================================
// CALCULATION UTILITIES
// ============================================================================

/**
 * Calculates line total for an order item
 * @param {number} unitPrice - Unit price
 * @param {number} quantity - Quantity
 * @returns {number} Line total
 */
export const calculateLineTotal = (unitPrice, quantity) => {
  const price = Number(unitPrice);
  const qty = Number(quantity);

  if (isNaN(price) || isNaN(qty)) {
    throw new AppError("Invalid price or quantity", 400);
  }

  return price * qty;
};

/**
 * Calculates order total from items
 * @param {array} items - Order items with totalPrice or unitPrice & quantity
 * @returns {number} Order total
 */
export const calculateOrderTotal = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return 0;
  }

  return items.reduce((total, item) => {
    if (item.totalPrice) {
      return total + Number(item.totalPrice);
    }
    if (item.unitPrice && item.quantity) {
      return total + Number(item.unitPrice) * Number(item.quantity);
    }
    return total;
  }, 0);
};

/**
 * Calculates average order value
 * @param {number} totalRevenue - Total revenue
 * @param {number} orderCount - Number of orders
 * @returns {number} Average order value
 */
export const calculateAverageOrderValue = (totalRevenue, orderCount) => {
  if (orderCount === 0) return 0;
  return totalRevenue / orderCount;
};

/**
 * Rounds price to 2 decimal places
 * @param {number} price - Price to round
 * @returns {number} Rounded price
 */
export const roundPrice = (price) => {
  return Math.round(Number(price) * 100) / 100;
};

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Formats price as currency string
 * @param {number} price - Price to format
 * @param {string} currency - Currency code
 * @returns {string} Formatted price
 */
export const formatPrice = (price, currency = "EGP") => {
  const rounded = roundPrice(price);
  return `${currency} ${rounded.toFixed(2)}`;
};

/**
 * Formats order summary for API response
 * @param {object} order - Order object
 * @param {array} items - Order items
 * @returns {object} Formatted order
 */
export const formatOrderForResponse = (order, items) => {
  return {
    ...order,
    orderItems: items,
    totalPrice: roundPrice(calculateOrderTotal(items)),
    totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
  };
};

// ============================================================================
// BUSINESS LOGIC UTILITIES
// ============================================================================

/**
 * Checks if product has sufficient stock
 * @param {number} availableQuantity - Available stock
 * @param {number} requestedQuantity - Requested quantity
 * @returns {boolean} True if sufficient stock
 */
export const hasSufficientStock = (availableQuantity, requestedQuantity) => {
  return Number(availableQuantity) >= Number(requestedQuantity);
};

/**
 * Gets stock status message
 * @param {number} quantity - Available quantity
 * @param {number} lowStockThreshold - Threshold (default: 5)
 * @returns {string} Status message
 */
export const getStockStatusMessage = (quantity, lowStockThreshold = 5) => {
  const qty = Number(quantity);

  if (qty === 0) return "OUT_OF_STOCK";
  if (qty <= lowStockThreshold) return "LOW_STOCK";
  return "IN_STOCK";
};

/**
 * Validates that requested quantity doesn't exceed inventory
 * @param {number} currentStock - Current stock level
 * @param {number} requestedQty - Requested quantity
 * @param {number} currentOrderQty - Current quantity in order (for updates)
 * @returns {object} { isValid, message }
 */
export const validateStockAvailability = (
  currentStock,
  requestedQty,
  currentOrderQty = 0,
) => {
  const stock = Number(currentStock);
  const requested = Number(requestedQty);
  const current = Number(currentOrderQty);

  const availableForUpdate = stock + current;

  if (availableForUpdate < requested) {
    return {
      isValid: false,
      message: `Only ${availableForUpdate} units available`,
    };
  }

  return { isValid: true };
};

// ============================================================================
// EXPORT ALL VALIDATORS & UTILITIES
// ============================================================================

export const OrderValidation = {
  // Validators
  validateOrderItem,
  validateOrderItems,
  validateVisitId,
  validateOrderId,
  validateOrderItemId,
  validateProductId,
  validateBranchId,
  validateCurrency,
  validateDateRange,
  validateQuantityUpdates,
  validateItemIdsForRemoval,

  // Calculations
  calculateLineTotal,
  calculateOrderTotal,
  calculateAverageOrderValue,
  roundPrice,

  // Formatting
  formatPrice,
  formatOrderForResponse,

  // Business Logic
  hasSufficientStock,
  getStockStatusMessage,
  validateStockAvailability,
};
