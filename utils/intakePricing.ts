import type { IntakePricingMode, IntakeUnitPriceBasis } from '../types';

const toNonNegativeNumber = (value: number | null | undefined) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Number(value));
};

export function resolveIntakeCost(input: {
  pricingMode: IntakePricingMode | '' | null;
  invoiceTotalEur?: number | null;
  unitPricePerKg?: number | null;
  unitPriceBasis?: IntakeUnitPriceBasis | null;
  quantityKg: number;
  effectiveQuantityKg: number;
}) {
  const quantityKg = toNonNegativeNumber(input.quantityKg);
  const effectiveQuantityKg = toNonNegativeNumber(input.effectiveQuantityKg || input.quantityKg);

  let calculatedCost = 0;
  if (input.pricingMode === 'unit_price') {
    const unitPricePerKg = toNonNegativeNumber(input.unitPricePerKg);
    const basisQty = input.unitPriceBasis === 'effective_kg' ? effectiveQuantityKg : quantityKg;
    calculatedCost = unitPricePerKg * basisQty;
  } else {
    calculatedCost = toNonNegativeNumber(input.invoiceTotalEur);
  }

  return {
    calculatedCost,
    derivedUnitPricePerReceivedKg: quantityKg > 0 ? calculatedCost / quantityKg : 0,
    derivedUnitPricePerEffectiveKg: effectiveQuantityKg > 0 ? calculatedCost / effectiveQuantityKg : 0,
  };
}