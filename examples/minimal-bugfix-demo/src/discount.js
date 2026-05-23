export function calculateDiscountedTotal(quantity, unitPrice, discountPercent) {
  if (quantity <= 0) {
    return unitPrice;
  }

  const subtotal = quantity * unitPrice;
  const discount = subtotal * (discountPercent / 100);
  return subtotal - discount;
}
