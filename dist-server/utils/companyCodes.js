export function parseCompanyCodes(value) {
    const input = (value ?? '').trim();
    if (!input) {
        return [];
    }
    const seen = new Set();
    const codes = [];
    for (const part of input.split(/[;,\n|]+/g)) {
        const normalized = part.trim().replace(/\s+/g, ' ');
        if (!normalized) {
            continue;
        }
        const dedupeKey = normalized.toUpperCase();
        if (seen.has(dedupeKey)) {
            continue;
        }
        seen.add(dedupeKey);
        codes.push(normalized);
    }
    return codes;
}
export function normalizeCompanyCodes(value) {
    const codes = parseCompanyCodes(value);
    return codes.length > 0 ? codes.join('; ') : null;
}
export function getPrimaryCompanyCode(value) {
    return parseCompanyCodes(value)[0] ?? null;
}
