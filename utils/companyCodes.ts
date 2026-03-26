export function parseCompanyCodes(value: string | null | undefined): string[] {
  const input = (value ?? '').trim();
  if (!input) {
    return [];
  }

  const seen = new Set<string>();
  const codes: string[] = [];

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

export function normalizeCompanyCodes(value: string | null | undefined): string | null {
  const codes = parseCompanyCodes(value);
  return codes.length > 0 ? codes.join('; ') : null;
}

export function getPrimaryCompanyCode(value: string | null | undefined): string | null {
  return parseCompanyCodes(value)[0] ?? null;
}
