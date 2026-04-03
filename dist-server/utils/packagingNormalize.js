const norm = (s) => s.toLowerCase().replace(/,/g, '.').trim();
export const isWhole = (x) => Math.abs(x - Math.round(x)) < 1e-6;
export function parsePackagingSegments(rawInput, defaultPalletWeight, defaultBBWeight) {
    const input = norm(rawInput || '');
    if (!input)
        return [];
    const segs = [];
    const segmentRegex = /(\d+(?:\.\d+)?)\s*(pad|pal|pl|bb|big\s*bag|tank|t)(?:\s*\*\s*(\d+(?:\.\d+)?))?/g;
    const looseRegex = /(\d+(?:\.\d+)?)\s*(kg|loose)\b/g;
    let m;
    while ((m = segmentRegex.exec(input)) !== null) {
        const count = Number(m[1]);
        const typeRaw = m[2];
        const override = m[3] ? Number(m[3]) : undefined;
        if (!Number.isFinite(count) || count <= 0)
            continue;
        if (typeRaw.startsWith('bb') || typeRaw.includes('big'))
            segs.push({ unit: 'bb', count, unitWeight: override ?? defaultBBWeight });
        else if (typeRaw === 'tank' || typeRaw === 't')
            segs.push({ unit: 'tank', count, unitWeight: override ?? 25000 });
        else
            segs.push({ unit: 'pad', count, unitWeight: override ?? defaultPalletWeight });
    }
    while ((m = looseRegex.exec(input)) !== null) {
        const kg = Number(m[1]);
        if (Number.isFinite(kg) && kg > 0)
            segs.push({ unit: 'kg', count: kg });
    }
    return segs;
}
export function normalizePackagingString(rawInput, defaultPalletWeight, defaultBBWeight, opts) {
    const segs = parsePackagingSegments(rawInput, defaultPalletWeight, defaultBBWeight);
    if (segs.length === 0)
        return { normalized: rawInput.trim(), changed: false, looseKgAdded: 0, notes: ['empty'] };
    // We will emit full units first, then partial-unit segments (as count=1 with unitWeight=partialKg), then explicit kg lines
    const fullGroups = new Map();
    const partialGroups = new Map();
    let looseKg = 0;
    const notes = [];
    for (const s of segs) {
        if (s.unit === 'kg') {
            looseKg += s.count;
            continue;
        }
        const unitW = s.unitWeight ?? 0;
        const whole = Math.floor(s.count + 1e-9);
        const frac = s.count - whole;
        if (whole > 0) {
            const key = `${s.unit}:${unitW}`;
            const prev = fullGroups.get(key);
            fullGroups.set(key, { unit: s.unit, unitWeight: unitW, count: (prev?.count ?? 0) + whole });
        }
        if (frac > 1e-6) {
            // create a partial unit as a single unit with reduced unitWeight
            const partialKg = Math.round(frac * unitW);
            if (partialKg >= 1) {
                const key = `${s.unit}:${partialKg}`;
                const prev = partialGroups.get(key);
                partialGroups.set(key, { unit: s.unit, unitWeight: partialKg, count: (prev?.count ?? 0) + 1 });
                notes.push(`converted ${frac.toFixed(3)} ${s.unit} -> 1 ${s.unit}*${partialKg}`);
            }
            else {
                // too small partial -> treat as loose
                looseKg += frac * unitW;
                notes.push(`tiny partial ${frac.toFixed(3)} ${s.unit} merged to loose ${(frac * unitW).toFixed(1)} kg`);
            }
        }
    }
    const parts = [];
    const order = ['pad', 'bb', 'tank'];
    for (const u of order) {
        for (const g of [...fullGroups.values()].filter(x => x.unit === u)) {
            parts.push(`${Math.round(g.count)} ${g.unit} *${g.unitWeight}`);
        }
    }
    // partials after full units
    for (const u of order) {
        for (const g of [...partialGroups.values()].filter(x => x.unit === u)) {
            parts.push(`${Math.round(g.count)} ${g.unit} *${g.unitWeight}`);
        }
    }
    const looseRounded = (opts && opts.roundLoose === false) ? looseKg : Math.round(looseKg);
    if (looseRounded >= 1)
        parts.push(`${looseRounded} kg`);
    const normalized = parts.join('; ');
    const changed = norm(normalized) !== norm(rawInput || '');
    return { normalized, changed, looseKgAdded: looseRounded, notes };
}
export function inferPackagingStringFromKg(kg, product) {
    const palletW = product?.defaultPalletWeight && product.defaultPalletWeight > 0 ? product.defaultPalletWeight : 1000;
    const bagW = product?.defaultBagWeight && product.defaultBagWeight > 0 ? product.defaultBagWeight : 850;
    // Simple heuristic: prefer pallets if palletW >= bagW
    const preferPallet = palletW >= bagW;
    let remaining = Math.max(0, kg || 0);
    let parts = [];
    if (preferPallet) {
        const pads = Math.floor(remaining / palletW);
        if (pads > 0) {
            parts.push(`${pads} pad*${palletW}`);
            remaining -= pads * palletW;
        }
        const bags = Math.floor(remaining / bagW);
        if (bags > 0) {
            parts.push(`${bags} bb*${bagW}`);
            remaining -= bags * bagW;
        }
    }
    else {
        const bags = Math.floor(remaining / bagW);
        if (bags > 0) {
            parts.push(`${bags} bb*${bagW}`);
            remaining -= bags * bagW;
        }
        const pads = Math.floor(remaining / palletW);
        if (pads > 0) {
            parts.push(`${pads} pad*${palletW}`);
            remaining -= pads * palletW;
        }
    }
    const loose = Math.round(remaining);
    if (loose >= 1)
        parts.push(`${loose} kg`);
    const raw = parts.join('; ');
    // normalize to ensure consistent formatting
    const normalized = normalizePackagingString(raw, palletW, bagW).normalized;
    return normalized || raw;
}
