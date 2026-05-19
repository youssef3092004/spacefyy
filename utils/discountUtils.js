const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isValidTimeFormat = (t) => TIME_RE.test(t);

export const isDiscountActiveNow = (customer) => {
  if (!customer?.hasDiscount) return false;
  if (Number(customer.discountAmount) <= 0) return false;

  const now = new Date();

  if (customer.discountStartsAt && now < new Date(customer.discountStartsAt))
    return false;
  if (customer.discountEndsAt && now > new Date(customer.discountEndsAt))
    return false;

  if (customer.discountStartTime || customer.discountEndTime) {
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (customer.discountStartTime && hhmm < customer.discountStartTime)
      return false;
    if (customer.discountEndTime && hhmm > customer.discountEndTime)
      return false;
  }

  return true;
};
