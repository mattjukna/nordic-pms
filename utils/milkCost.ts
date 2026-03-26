import type { GlobalConfig, Supplier } from '../types';

export function calculateMilkCost(
  quantityKg: number,
  fatPct: number,
  proteinPct: number,
  supplier: Supplier | undefined,
  defaultConfig: GlobalConfig,
): number {
  if (!supplier) {
    return quantityKg * defaultConfig.defaultMilkBasePrice;
  }

  const fatDiff = fatPct - 4.0;
  const proteinDiff = proteinPct - 3.2;

  let unitPrice = supplier.basePricePerKg ?? defaultConfig.defaultMilkBasePrice;
  unitPrice += fatDiff * 10 * (supplier.fatBonusPerPct ?? 0);
  unitPrice += proteinDiff * 10 * (supplier.proteinBonusPerPct ?? 0);
  unitPrice = Math.max(0, unitPrice);

  return quantityKg * unitPrice;
}
