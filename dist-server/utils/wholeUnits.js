export const UNIT_TOLERANCE = 0.001;
export function isWhole(value) {
    if (value == null || Number.isNaN(value))
        return true;
    return Math.abs(value - Math.round(value)) <= UNIT_TOLERANCE;
}
export function anyFractional(parsed) {
    return !(isWhole(parsed.pallets || 0) && isWhole(parsed.bigBags || 0) && isWhole(parsed.tanks || 0));
}
export default { isWhole, anyFractional };
