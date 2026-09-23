import { Prisma } from "@prisma/client";

/** Invoice arithmetic in decimals (never floats). Server-side only (uses Prisma.Decimal). */
export const D = (v: Prisma.Decimal | number | string | null | undefined) => new Prisma.Decimal(v ?? 0);
export const round2 = (d: Prisma.Decimal) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export function computeTotals(items: { quantity: number; unitPrice: number }[], discount: number, vatRate: number) {
  const subtotal = round2(items.reduce((s, i) => s.plus(D(i.quantity).times(D(i.unitPrice))), D(0)));
  const disc = Prisma.Decimal.min(D(discount), subtotal);
  const taxable = subtotal.minus(disc);
  const vat = round2(taxable.times(D(vatRate)).dividedBy(100));
  return { subtotal, discount: round2(disc), vatAmount: vat, total: round2(taxable.plus(vat)) };
}
