const RAW_MILK_INCLUDE_PATTERNS = ['raw milk', 'whole milk', 'fresh milk'];
const RAW_MILK_EXCLUDE_PATTERNS = ['skim', 'concentrate', 'permeate', 'cream', 'whey'];
const normalizeMilkType = (milkType) => (milkType || '').trim().toLowerCase();
export function isRawMilkType(milkType) {
    const normalized = normalizeMilkType(milkType);
    if (!normalized)
        return false;
    if (RAW_MILK_EXCLUDE_PATTERNS.some((pattern) => normalized.includes(pattern)))
        return false;
    if (RAW_MILK_INCLUDE_PATTERNS.some((pattern) => normalized.includes(pattern)))
        return true;
    return normalized === 'milk' || normalized === 'raw' || normalized.endsWith(' milk');
}
export function calculateLabCoefficient(fatPct, proteinPct) {
    if (!Number.isFinite(fatPct) || !Number.isFinite(proteinPct))
        return 1;
    return 1 + (fatPct - 3.4) * 0.178 + (proteinPct - 3.0) * 0.267;
}
export function resolveEffectiveQuantityKg(input) {
    const quantityKg = Number.isFinite(input.quantityKg) && input.quantityKg > 0 ? input.quantityKg : 0;
    if (!input.applyCoefficient) {
        return { labCoefficient: 1, effectiveQuantityKg: quantityKg };
    }
    const derivedCoefficient = Number.isFinite(input.manualCoefficient) && (input.manualCoefficient ?? 0) > 0
        ? Number(input.manualCoefficient)
        : calculateLabCoefficient(input.fatPct, input.proteinPct);
    const labCoefficient = Number.isFinite(derivedCoefficient) && derivedCoefficient > 0 ? derivedCoefficient : 1;
    return {
        labCoefficient,
        effectiveQuantityKg: quantityKg * labCoefficient,
    };
}
export function getEffectiveIntakeQuantityKg(entry) {
    if (Number.isFinite(entry.effectiveQuantityKg) && (entry.effectiveQuantityKg ?? 0) > 0) {
        return Number(entry.effectiveQuantityKg);
    }
    return Number.isFinite(entry.quantityKg) ? Number(entry.quantityKg) : 0;
}
