import { promises as fs } from 'fs';

export type CsvRow = Record<string, string>;

export type PickedField = {
  present: boolean;
  raw: string | null;
  column: string | null;
};

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readCsvFile(filePath: string): Promise<CsvRow[]> {
  const content = await fs.readFile(filePath, 'utf8');
  return parseCsv(content);
}

export function parseCsv(content: string): CsvRow[] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  const text = content.replace(/^\uFEFF/, '');

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentValue += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ',') {
      currentRow.push(currentValue);
      currentValue = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      currentRow.push(currentValue);
      currentValue = '';
      if (currentRow.some((value) => value.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentValue += char;
  }

  currentRow.push(currentValue);
  if (currentRow.some((value) => value.length > 0)) {
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return [];
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((header) => header.trim());

  return dataRows.map((row) => {
    const record: CsvRow = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? '';
    });
    return record;
  });
}

export function normalizeName(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeWhitespace(value: string | null | undefined): string | null {
  const normalized = (value ?? '').trim().replace(/\s+/g, ' ');
  return normalized ? normalized : null;
}

export function normalizeCode(value: string | null | undefined): string | null {
  const normalized = normalizeWhitespace(value);
  return normalized ? normalized.toUpperCase() : null;
}

export function splitMultiValue(value: string | null | undefined): string[] {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return [];
  }

  return [...new Set(
    normalized
      .split(/[;|]/g)
      .flatMap((part) => part.split(/\s*,\s*/g))
      .map((part) => normalizeWhitespace(part))
      .filter((part): part is string => Boolean(part))
  )];
}

export function pickField(sources: Array<CsvRow | undefined>, columnNames: string[]): PickedField {
  let firstPresent: PickedField | null = null;

  for (const source of sources) {
    if (!source) {
      continue;
    }

    for (const columnName of columnNames) {
      if (!Object.prototype.hasOwnProperty.call(source, columnName)) {
        continue;
      }

      const raw = source[columnName] ?? '';
      if (!firstPresent) {
        firstPresent = { present: true, raw, column: columnName };
      }

      if (normalizeWhitespace(raw)) {
        return { present: true, raw, column: columnName };
      }
    }
  }

  return firstPresent ?? { present: false, raw: null, column: null };
}

export function parseBooleanString(value: string | null | undefined): boolean | undefined {
  const normalized = normalizeWhitespace(value)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }

  return undefined;
}

export function parseNumberString(value: string | null | undefined): number | undefined {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized.replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}
