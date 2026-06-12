type PackageUnit = "pad" | "bb" | "tank";
type Unit = PackageUnit | "kg";
export type LooseTarget = "pad" | "bb" | "legacy";
export type Segment = { unit: Unit; count: number; unitWeight?: number; looseTarget?: LooseTarget };

const norm = (s: string) => s.toLowerCase().replace(/,/g, '.').trim();
export const isWhole = (x: number) => Math.abs(x - Math.round(x)) < 1e-6;

const overlaps = (start: number, end: number, spans: Array<{ start: number; end: number }>) => {
  return spans.some((span) => start < span.end && end > span.start);
};

const positiveWeight = (value: number, fallback: number) => {
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const targetFromRaw = (raw: string): Exclude<LooseTarget, "legacy"> => {
  return raw.startsWith('bb') || raw.includes('big') ? 'bb' : 'pad';
};

const targetDefaultWeight = (target: Exclude<LooseTarget, "legacy">, palletWeight: number, bagWeight: number) => {
  return target === 'bb' ? bagWeight : palletWeight;
};

export function parsePackagingSegments(rawInput: string, defaultPalletWeight: number, defaultBBWeight: number): Segment[] {
  const input = norm(rawInput || '');
  if (!input) return [];
  const segs: Segment[] = [];
  const unitSpans: Array<{ start: number; end: number }> = [];
  const looseSpans: Array<{ start: number; end: number }> = [];
  const segmentRegex = /(\d+(?:\.\d+)?)\s*(pad|pal|pl|bb|big\s*bag|tank|t)(?:\s*\*\s*(\d+(?:\.\d+)?)\s*(?:kg)?)?/g;
  const looseTargetRegex = /(\d+(?:\.\d+)?)\s*(?:kg|loose)\s*(?:loose\s*)?(pallet|pad|pal|pl|big\s*bag|bb)(?:\s*loose)?(?:\s*\*\s*(\d+(?:\.\d+)?)\s*(?:kg)?)?/g;
  const looseTargetBeforeRegex = /(\d+(?:\.\d+)?)\s*(pallet|pad|pal|pl|big\s*bag|bb)\s*loose(?:\s*kg)?(?:\s*\*\s*(\d+(?:\.\d+)?)\s*(?:kg)?)?/g;
  const looseRegex = /(\d+(?:\.\d+)?)\s*(kg|loose)\b/g;
  const palletWeight = positiveWeight(defaultPalletWeight, 900);
  const bagWeight = positiveWeight(defaultBBWeight, 850);

  let m: RegExpExecArray | null;
  while ((m = segmentRegex.exec(input)) !== null) {
    const count = Number(m[1]);
    const typeRaw = m[2];
    const override = m[3] ? Number(m[3]) : undefined;
    if (!Number.isFinite(count) || count <= 0) continue;

    if (typeRaw.startsWith('bb') || typeRaw.includes('big')) segs.push({ unit: 'bb', count, unitWeight: override ?? bagWeight });
    else if (typeRaw === 'tank' || typeRaw === 't') segs.push({ unit: 'tank', count, unitWeight: override ?? 25000 });
    else segs.push({ unit: 'pad', count, unitWeight: override ?? palletWeight });

    unitSpans.push({ start: m.index, end: m.index + m[0].length });
  }

  const addLooseTarget = (match: RegExpExecArray) => {
    if (overlaps(match.index, match.index + match[0].length, unitSpans) || overlaps(match.index, match.index + match[0].length, looseSpans)) return;
    const kg = Number(match[1]);
    if (!Number.isFinite(kg) || kg <= 0) return;
    const target = targetFromRaw(match[2]);
    const override = match[3] ? Number(match[3]) : undefined;
    segs.push({
      unit: 'kg',
      count: kg,
      looseTarget: target,
      unitWeight: override ?? targetDefaultWeight(target, palletWeight, bagWeight),
    });
    looseSpans.push({ start: match.index, end: match.index + match[0].length });
  };

  while ((m = looseTargetRegex.exec(input)) !== null) addLooseTarget(m);
  while ((m = looseTargetBeforeRegex.exec(input)) !== null) addLooseTarget(m);

  while ((m = looseRegex.exec(input)) !== null) {
    if (overlaps(m.index, m.index + m[0].length, unitSpans) || overlaps(m.index, m.index + m[0].length, looseSpans)) continue;
    const kg = Number(m[1]);
    if (Number.isFinite(kg) && kg > 0) segs.push({ unit: 'kg', count: kg, looseTarget: 'legacy' });
  }

  return segs;
}

export function normalizePackagingString(rawInput: string, defaultPalletWeight: number, defaultBBWeight: number, opts?: { roundLoose?: boolean }) {
  const palletWeight = positiveWeight(defaultPalletWeight, 900);
  const bagWeight = positiveWeight(defaultBBWeight, 850);
  const segs = parsePackagingSegments(rawInput, palletWeight, bagWeight);
  if (segs.length === 0) {
    return {
      normalized: rawInput.trim(),
      changed: false,
      looseKgAdded: 0,
      loosePalletKgAdded: 0,
      looseBigBagKgAdded: 0,
      notes: ['empty'],
    };
  }

  const fullGroups = new Map<string, { unit: PackageUnit; unitWeight?: number; count: number }>();
  const partialGroups = new Map<string, { unit: PackageUnit; unitWeight?: number; count: number }>();
  const looseGroups = new Map<string, { target: Exclude<LooseTarget, "legacy">; unitWeight: number; kg: number }>();
  let legacyLooseKg = 0;
  const notes: string[] = [];

  const addLoose = (kg: number, target: Exclude<LooseTarget, "legacy"> | "legacy", unitWeight?: number) => {
    if (!Number.isFinite(kg) || kg <= 0) return;
    if (target === 'legacy') {
      legacyLooseKg += kg;
      return;
    }
    const resolvedWeight = positiveWeight(unitWeight ?? 0, targetDefaultWeight(target, palletWeight, bagWeight));
    const key = `${target}:${resolvedWeight}`;
    const prev = looseGroups.get(key);
    looseGroups.set(key, { target, unitWeight: resolvedWeight, kg: (prev?.kg ?? 0) + kg });
  };

  for (const s of segs) {
    if (s.unit === 'kg') {
      addLoose(s.count, s.looseTarget ?? 'legacy', s.unitWeight);
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
      const partialKg = Math.round(frac * unitW);
      if (partialKg >= 1) {
        const key = `${s.unit}:${partialKg}`;
        const prev = partialGroups.get(key);
        partialGroups.set(key, { unit: s.unit, unitWeight: partialKg, count: (prev?.count ?? 0) + 1 });
        notes.push(`converted ${frac.toFixed(3)} ${s.unit} -> 1 ${s.unit}*${partialKg}`);
      } else {
        const target = s.unit === 'bb' ? 'bb' : 'pad';
        addLoose(frac * unitW, target, unitW);
        notes.push(`tiny partial ${frac.toFixed(3)} ${s.unit} merged to loose ${(frac * unitW).toFixed(1)} kg`);
      }
    }
  }

  const parts: string[] = [];
  const order: PackageUnit[] = ['pad', 'bb', 'tank'];
  for (const u of order) {
    for (const g of [...fullGroups.values()].filter(x => x.unit === u)) {
      parts.push(`${Math.round(g.count)} ${g.unit} *${g.unitWeight}`);
    }
  }
  for (const u of order) {
    for (const g of [...partialGroups.values()].filter(x => x.unit === u)) {
      parts.push(`${Math.round(g.count)} ${g.unit} *${g.unitWeight}`);
    }
  }

  let loosePalletKgAdded = 0;
  let looseBigBagKgAdded = 0;
  for (const target of ['pad', 'bb'] as const) {
    for (const g of [...looseGroups.values()].filter(x => x.target === target)) {
      const roundedKg = (opts && opts.roundLoose === false) ? g.kg : Math.round(g.kg);
      if (roundedKg < 1) continue;
      if (target === 'pad') loosePalletKgAdded += roundedKg;
      else looseBigBagKgAdded += roundedKg;
      parts.push(`${roundedKg} kg loose ${target} *${g.unitWeight}`);
    }
  }

  const legacyLooseRounded = (opts && opts.roundLoose === false) ? legacyLooseKg : Math.round(legacyLooseKg);
  if (legacyLooseRounded >= 1) parts.push(`${legacyLooseRounded} kg`);

  const normalized = parts.join('; ');
  const changed = norm(normalized) !== norm(rawInput || '');
  return {
    normalized,
    changed,
    looseKgAdded: loosePalletKgAdded + looseBigBagKgAdded + legacyLooseRounded,
    loosePalletKgAdded,
    looseBigBagKgAdded,
    notes,
  };
}

export function inferPackagingStringFromKg(kg: number, product: { defaultPalletWeight?: number; defaultBagWeight?: number; name?: string } | undefined) {
  const palletW = product?.defaultPalletWeight && product.defaultPalletWeight > 0 ? product.defaultPalletWeight : 1000;
  const bagW = product?.defaultBagWeight && product.defaultBagWeight > 0 ? product.defaultBagWeight : 850;

  const preferPallet = palletW >= bagW;
  let remaining = Math.max(0, kg || 0);
  let parts: string[] = [];

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
  } else {
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
  if (loose >= 1) {
    parts.push(preferPallet ? `${loose} kg loose pad *${palletW}` : `${loose} kg loose bb *${bagW}`);
  }

  const raw = parts.join('; ');
  const normalized = normalizePackagingString(raw, palletW, bagW).normalized;
  return normalized || raw;
}
