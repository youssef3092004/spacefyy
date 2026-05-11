import validator from "validator";
import { AppError } from "./appError.js";

export function isValidName(name) {
  return (
    typeof name === "string" && validator.isLength(name, { min: 3, max: 30 })
  );
}

export function isValidEmail(email) {
  return typeof email === "string" && validator.isEmail(email);
}

export function isValidPassword(password) {
  return (
    typeof password === "string" &&
    validator.isStrongPassword(password, {
      minLength: 8,
      minLowercase: 0,
      minUppercase: 0,
      minNumbers: 0,
      minSymbols: 0,
    })
  );
}

export function isValidPhone(phone) {
  return typeof phone === "string" && validator.isMobilePhone(phone, "any");
}

export const validatePrice = (price) => {
  if (price === undefined || price === null) {
    throw new AppError("Price is required", 400);
  }
  const numericPrice = Number(price);
  if (Number.isNaN(numericPrice) || !Number.isFinite(numericPrice)) {
    throw new AppError("Price must be a valid number", 400);
  }
  if (numericPrice < 0) {
    throw new AppError("Price must be >= 0", 400);
  }
  return numericPrice;
};

export const validateIdNumber = (idNumber) => {
  let idNumberr = String(idNumber).trim();
  if (idNumberr.length !== 14) {
    throw new AppError("ID number must be exactly 14 digits", 400);
  }
  return idNumberr;
};
