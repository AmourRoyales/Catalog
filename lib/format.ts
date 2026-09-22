export function formatPrice(
  value: number | null | undefined,
  currency: string = "USD"
): string {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value));
}