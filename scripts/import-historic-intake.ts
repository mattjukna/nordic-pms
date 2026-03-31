#!/usr/bin/env tsx
/**
 * Historical intake importer.
 *
 * Usage:
 *   npm run import:historic-intake -- --dry-run
 *   npm run import:historic-intake
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import prisma from '../services/prisma';
import { fileExists, normalizeWhitespace, parseCsv, parseNumberString } from './import-companies.utils';

// ─── paths & constants ──────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const DEFAULT_INTAKE_FILE = path.resolve(projectRoot, '../historic_intake_entries.csv');
const DEFAULT_SUPPLIERS_FILE = path.resolve(projectRoot, '../historic_supplier_candidates.csv');
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_SAMPLE_LIMIT = 20;

// Quality-metric placeholders — used only when the schema requires non-null values.
// These must NEVER affect cost calculations.
const PLACEHOLDER_PH = 6.7;
const PLACEHOLDER_FAT = 0;
const PLACEHOLDER_PROTEIN = 0;
const PLACEHOLDER_TEMP = 4;

// ─── types ──────────────────────────────────────────────────────────

type CliOptions = {
  intakeFile: string;
  suppliersFile: string;
  dryRun: boolean;
  batchSize: number;
  sampleLimit: number;
  help: boolean;
};

type SupplierCandidateCsv = {
  supplierMatchKey: string;
  preferredDisplayName: string;
  existingSupplierHint: string;
  primaryCompanyCode: string;
  vatCodesPipe: string[];
  country: string;
  routeGroup: string;
  defaultMilkType: string;
  isEcoDefault: boolean;
  basePricePerKg: number | undefined;
  earliestTransactionDate: string;
};

type IntakeCsvRow = {
  historicIntakeId: string;
  timestampIso: Date;
  supplierMatchKey: string;
  supplierCompanyCodeRaw: string;
  supplierNameClean: string;
  preferredSupplierDisplayName: string;
  existingSupplierHint: string;
  milkType: string;
  quantityKg: number;
  calculatedCostEur: number;
  unitPriceEurPerKg: number | undefined;
  isEcological: boolean;
  isTempAlertDismissed: boolean;
  isDiscarded: boolean;
  tagsPipe: string[];
  note: string;
  sourceDocumentNumber: string;
};

type ResolvedSupplier = {
  id: string;
  name: string;
  routeGroup: string;
  matchMethod: 'vat-code' | 'name-key' | 'hint' | 'created';
};

type SupplierPlan = {
  resolved: Map<string, ResolvedSupplier>; // keyed by supplier_match_key
  toCreate: SupplierCandidateCsv[];
  vatAliasAppends: Array<{ supplierId: string; supplierName: string; newCode: string }>;
  ambiguous: Array<{ matchKey: string; candidates: string[] }>;
};

type ImportPlan = {
  supplierPlan: SupplierPlan;
  intakeToInsert: IntakeCsvRow[];
  intakeSkipped: IntakeCsvRow[];
  summary: Map<string, { rows: number; totalKg: number; totalCostEur: number }>;
};

// ─── CLI parsing ────────────────────────────────────────────────────

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    intakeFile: DEFAULT_INTAKE_FILE,
    suppliersFile: DEFAULT_SUPPLIERS_FILE,
    dryRun: false,
    batchSize: DEFAULT_BATCH_SIZE,
    sampleLimit: DEFAULT_SAMPLE_LIMIT,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') { options.dryRun = true; continue; }
    if (arg === '--help' || arg === '-h') { options.help = true; continue; }
    if (arg === '--intake-file') { options.intakeFile = resolvePath(argv[++i]); continue; }
    if (arg === '--suppliers-file') { options.suppliersFile = resolvePath(argv[++i]); continue; }
    if (arg === '--batch-size') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n <= 0) throw new Error(`Invalid --batch-size: ${argv[i]}`);
      options.batchSize = n;
      continue;
    }
    if (arg === '--sample-limit') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 0) throw new Error(`Invalid --sample-limit: ${argv[i]}`);
      options.sampleLimit = n;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function resolvePath(value: string | undefined): string {
  if (!value) throw new Error('Missing value for CLI option');
  return path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
}

function printHelp() {
  console.log(`Historical intake importer

Usage:
  npm run import:historic-intake -- [options]

Options:
  --dry-run               Preview changes without writing
  --intake-file <path>    Path to historic_intake_entries.csv
  --suppliers-file <path> Path to historic_supplier_candidates.csv
  --batch-size <n>        Rows per write transaction (default: ${DEFAULT_BATCH_SIZE})
  --sample-limit <n>      Preview rows to print (default: ${DEFAULT_SAMPLE_LIMIT})
  --help                  Show this help text
`);
}

// ─── helpers ────────────────────────────────────────────────────────

async function readCsvRows(filePath: string): Promise<Record<string, string>[]> {
  const fs = await import('fs/promises');
  const content = await fs.readFile(filePath, 'utf8');
  return parseCsv(content);
}

function err(file: string, row: number, msg: string): Error {
  return new Error(`[${file} row ${row}] ${msg}`);
}

function reqStr(raw: string | undefined, label: string, file: string, row: number): string {
  const v = normalizeWhitespace(raw);
  if (!v) throw err(file, row, `${label} is required.`);
  return v;
}

function reqNum(raw: string | undefined, label: string, file: string, row: number): number {
  const v = parseNumberString(raw);
  if (v === undefined || Number.isNaN(v)) throw err(file, row, `${label} must be a valid number.`);
  return v;
}

function optNum(raw: string | undefined): number | undefined {
  return parseNumberString(raw);
}

function reqDate(raw: string | undefined, file: string, row: number): Date {
  const v = reqStr(raw, 'timestamp_iso', file, row);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw err(file, row, `Invalid timestamp: ${v}`);
  return d;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  const v = normalizeWhitespace(raw)?.toLowerCase();
  if (!v) return fallback;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return fallback;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ─── supplier-matching normalisation ────────────────────────────────

const LITHUANIAN_FOLD: Record<string, string> = {
  'Ą': 'A', 'ą': 'a', 'Č': 'C', 'č': 'c', 'Ę': 'E', 'ę': 'e',
  'Ė': 'E', 'ė': 'e', 'Į': 'I', 'į': 'i', 'Š': 'S', 'š': 's',
  'Ų': 'U', 'ų': 'u', 'Ū': 'U', 'ū': 'u', 'Ž': 'Z', 'ž': 'z',
};

function foldLithuanian(s: string): string {
  return s.replace(/[ĄąČčĘęĖėĮįŠšŲųŪūŽž]/g, (ch) => LITHUANIAN_FOLD[ch] ?? ch);
}

const LEGAL_TOKENS = /\b(UAB|AB|ZUB|ZUK|SIA|SP\s*Z\s*O\s*O|LTD|B\s*V|KOOP\s*BENDR|KOOPERATYVAS|I\s*I)\b/gi;

function buildMatchKey(name: string): string {
  let key = name.toUpperCase();
  key = foldLithuanian(key);
  key = key.replace(/["'""„«»]/g, '');        // strip quotes
  key = key.replace(/[.,;:()\-\/\\]/g, ' ');   // punctuation → space
  key = key.replace(LEGAL_TOKENS, ' ');         // remove legal form tokens
  key = key.replace(/\s+/g, ' ').trim();
  return key;
}

/**
 * Expand `companyCode` field (which may contain "; "-separated codes)
 * into a set of normalised code strings.
 */
function expandCodes(companyCode: string | null | undefined): string[] {
  if (!companyCode) return [];
  return companyCode
    .split(/[;|]/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

// ─── CSV row parsers ────────────────────────────────────────────────

const INTAKE_FILE_LABEL = 'historic_intake_entries.csv';
const SUPPLIERS_FILE_LABEL = 'historic_supplier_candidates.csv';

function parseSupplierCandidateRow(row: Record<string, string>, n: number): SupplierCandidateCsv {
  return {
    supplierMatchKey: reqStr(row.supplier_match_key, 'supplier_match_key', SUPPLIERS_FILE_LABEL, n),
    preferredDisplayName: reqStr(row.preferred_display_name, 'preferred_display_name', SUPPLIERS_FILE_LABEL, n),
    existingSupplierHint: normalizeWhitespace(row.existing_supplier_hint) ?? '',
    primaryCompanyCode: reqStr(row.primary_company_code, 'primary_company_code', SUPPLIERS_FILE_LABEL, n),
    vatCodesPipe: (row.vat_codes_pipe ?? '')
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean),
    country: normalizeWhitespace(row.country_guess) ?? '',
    routeGroup: normalizeWhitespace(row.route_group_suggestion) ?? 'Historic import',
    defaultMilkType: normalizeWhitespace(row.default_milk_type_suggestion) ?? 'Skim milk',
    isEcoDefault: parseBool(row.is_ecological_default, false),
    basePricePerKg: optNum(row.base_price_per_kg_guess),
    earliestTransactionDate: normalizeWhitespace(row.earliest_transaction_date) ?? '',
  };
}

function parseIntakeCsvRow(row: Record<string, string>, n: number): IntakeCsvRow {
  return {
    historicIntakeId: reqStr(row.historic_intake_id, 'historic_intake_id', INTAKE_FILE_LABEL, n),
    timestampIso: reqDate(row.timestamp_iso, INTAKE_FILE_LABEL, n),
    supplierMatchKey: reqStr(row.supplier_match_key, 'supplier_match_key', INTAKE_FILE_LABEL, n),
    supplierCompanyCodeRaw: reqStr(row.supplier_company_code_raw, 'supplier_company_code_raw', INTAKE_FILE_LABEL, n),
    supplierNameClean: normalizeWhitespace(row.supplier_name_clean) ?? '',
    preferredSupplierDisplayName: normalizeWhitespace(row.preferred_supplier_display_name) ?? '',
    existingSupplierHint: normalizeWhitespace(row.existing_supplier_hint) ?? '',
    milkType: reqStr(row.milk_type, 'milk_type', INTAKE_FILE_LABEL, n),
    quantityKg: reqNum(row.quantity_kg, 'quantity_kg', INTAKE_FILE_LABEL, n),
    calculatedCostEur: reqNum(row.calculated_cost_eur, 'calculated_cost_eur', INTAKE_FILE_LABEL, n),
    unitPriceEurPerKg: optNum(row.unit_price_eur_per_kg),
    isEcological: parseBool(row.is_ecological, false),
    isTempAlertDismissed: parseBool(row.is_temp_alert_dismissed, true),
    isDiscarded: parseBool(row.is_discarded, false),
    tagsPipe: (row.tags_pipe ?? '').split('|').map((t) => t.trim()).filter(Boolean),
    note: normalizeWhitespace(row.note) ?? '',
    sourceDocumentNumber: reqStr(row.source_document_number, 'source_document_number', INTAKE_FILE_LABEL, n),
  };
}

// ─── supplier resolution ────────────────────────────────────────────

async function resolveSuppliers(
  intakeRows: IntakeCsvRow[],
  supplierCandidates: Map<string, SupplierCandidateCsv>,
): Promise<SupplierPlan> {
  // 1. Fetch ALL existing suppliers from DB
  const dbSuppliers = await prisma.supplier.findMany({
    select: { id: true, name: true, routeGroup: true, companyCode: true },
  });

  // Build lookup indices
  //   codeMap: normalised VAT/company code → supplier
  //   nameKeyMap: normalised name key → supplier
  type DbSup = (typeof dbSuppliers)[number];
  const codeMap = new Map<string, DbSup>();
  const nameKeyMap = new Map<string, DbSup>();
  const hintNameMap = new Map<string, DbSup>(); // exact name → supplier

  for (const s of dbSuppliers) {
    for (const code of expandCodes(s.companyCode)) {
      codeMap.set(code, s);
    }
    const nk = buildMatchKey(s.name);
    if (nk) nameKeyMap.set(nk, s);
    // also index exact name (trimmed, case-insensitive)
    hintNameMap.set(s.name.trim().toLowerCase(), s);
  }

  // Collect which match-keys appear in intake
  const neededKeys = new Set(intakeRows.map((r) => r.supplierMatchKey));

  const resolved = new Map<string, ResolvedSupplier>();
  const toCreate: SupplierCandidateCsv[] = [];
  const vatAliasAppends: SupplierPlan['vatAliasAppends'] = [];
  const ambiguous: SupplierPlan['ambiguous'] = [];

  for (const matchKey of neededKeys) {
    // Collect all company codes from intake rows for this match key
    const codesForKey = new Set<string>();
    for (const row of intakeRows) {
      if (row.supplierMatchKey === matchKey) {
        codesForKey.add(row.supplierCompanyCodeRaw.trim().toUpperCase());
      }
    }

    // Also get candidate codes from supplier candidates CSV
    const candidate = supplierCandidates.get(matchKey);
    if (candidate) {
      for (const c of candidate.vatCodesPipe) codesForKey.add(c.trim().toUpperCase());
    }

    // Step 1: match by VAT/company code
    let matched: DbSup | undefined;
    let method: ResolvedSupplier['matchMethod'] = 'vat-code';

    for (const code of codesForKey) {
      const found = codeMap.get(code);
      if (found) {
        matched = found;
        break;
      }
    }

    // Step 2: match by normalised name key
    if (!matched) {
      const nk = buildMatchKey(matchKey); // matchKey is already a normalised form from CSV
      const found = nameKeyMap.get(nk);
      if (found) {
        matched = found;
        method = 'name-key';
      }
    }

    // Step 3: match by existing_supplier_hint from intake rows or CSV
    if (!matched) {
      const hints = new Set<string>();
      for (const row of intakeRows) {
        if (row.supplierMatchKey === matchKey && row.existingSupplierHint) {
          hints.add(row.existingSupplierHint.trim().toLowerCase());
        }
      }
      if (candidate?.existingSupplierHint) {
        hints.add(candidate.existingSupplierHint.trim().toLowerCase());
      }
      for (const hint of hints) {
        const found = hintNameMap.get(hint);
        if (found) {
          matched = found;
          method = 'hint';
          break;
        }
      }
    }

    if (matched) {
      resolved.set(matchKey, {
        id: matched.id,
        name: matched.name,
        routeGroup: matched.routeGroup,
        matchMethod: method,
      });

      // Check if any codes from CSV are missing from the existing supplier's companyCode
      const existingCodes = new Set(expandCodes(matched.companyCode));
      for (const code of codesForKey) {
        if (code && !existingCodes.has(code)) {
          vatAliasAppends.push({ supplierId: matched.id, supplierName: matched.name, newCode: code });
        }
      }
    } else if (candidate) {
      // Create new supplier
      toCreate.push(candidate);
    } else {
      // No candidate CSV row for this match key — ambiguous/unresolved
      ambiguous.push({ matchKey, candidates: [] });
    }
  }

  return { resolved, toCreate, vatAliasAppends, ambiguous };
}

// ─── import plan ────────────────────────────────────────────────────

async function buildImportPlan(
  options: CliOptions,
  intakeRows: IntakeCsvRow[],
  supplierCandidates: Map<string, SupplierCandidateCsv>,
): Promise<ImportPlan> {
  const supplierPlan = await resolveSuppliers(intakeRows, supplierCandidates);

  if (supplierPlan.ambiguous.length > 0) {
    console.error('\nAmbiguous / unresolvable suppliers:');
    for (const a of supplierPlan.ambiguous) {
      console.error(`  match_key="${a.matchKey}" — no VAT match, name match, hint, or candidate CSV row`);
    }
    throw new Error(`${supplierPlan.ambiguous.length} supplier(s) could not be resolved. Fix CSV data or DB before retrying.`);
  }

  // Check for any intake rows whose match key is in toCreate — those will be resolved after creation
  const toCreateKeys = new Set(supplierPlan.toCreate.map((c) => c.supplierMatchKey));
  // All match keys must be either resolved or toCreate
  for (const row of intakeRows) {
    if (!supplierPlan.resolved.has(row.supplierMatchKey) && !toCreateKeys.has(row.supplierMatchKey)) {
      throw new Error(`Intake row ${row.historicIntakeId}: supplier match key "${row.supplierMatchKey}" unresolved and not in candidates.`);
    }
  }

  // Check existing intake rows for idempotency (by id)
  const allIds = intakeRows.map((r) => r.historicIntakeId);
  const existing = await prisma.intakeEntry.findMany({
    where: { id: { in: allIds } },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((e) => e.id));

  const intakeToInsert = intakeRows.filter((r) => !existingIds.has(r.historicIntakeId));
  const intakeSkipped = intakeRows.filter((r) => existingIds.has(r.historicIntakeId));

  // Summary by supplier + milkType
  const summary = new Map<string, { rows: number; totalKg: number; totalCostEur: number }>();
  for (const row of intakeToInsert) {
    const key = `${row.supplierMatchKey} | ${row.milkType}`;
    const cur = summary.get(key) ?? { rows: 0, totalKg: 0, totalCostEur: 0 };
    cur.rows += 1;
    cur.totalKg += row.quantityKg;
    cur.totalCostEur += row.calculatedCostEur;
    summary.set(key, cur);
  }

  return { supplierPlan, intakeToInsert, intakeSkipped, summary };
}

// ─── write logic ────────────────────────────────────────────────────

async function writeSuppliers(plan: SupplierPlan): Promise<Map<string, ResolvedSupplier>> {
  const resolved = new Map(plan.resolved);

  // Create new suppliers
  for (const candidate of plan.toCreate) {
    const createdOn = candidate.earliestTransactionDate
      ? new Date(candidate.earliestTransactionDate)
      : undefined;

    const allCodes = [...new Set(candidate.vatCodesPipe.map((c) => c.trim()).filter(Boolean))];
    const companyCodeStr = allCodes.join('; ');

    const created = await prisma.supplier.create({
      data: {
        name: candidate.preferredDisplayName,
        companyCode: companyCodeStr || candidate.primaryCompanyCode,
        routeGroup: candidate.routeGroup,
        country: candidate.country || undefined,
        defaultMilkType: candidate.defaultMilkType,
        isEco: candidate.isEcoDefault,
        basePricePerKg: candidate.basePricePerKg,
        createdOn: createdOn && !Number.isNaN(createdOn.getTime()) ? createdOn : undefined,
      },
    });

    resolved.set(candidate.supplierMatchKey, {
      id: created.id,
      name: created.name,
      routeGroup: created.routeGroup,
      matchMethod: 'created',
    });
  }

  // Append missing VAT alias codes to existing suppliers
  for (const append of plan.vatAliasAppends) {
    const current = await prisma.supplier.findUnique({
      where: { id: append.supplierId },
      select: { companyCode: true },
    });
    if (!current) continue;

    const existingCodes = expandCodes(current.companyCode);
    if (existingCodes.includes(append.newCode.toUpperCase())) continue;

    const updated = [...existingCodes, append.newCode.toUpperCase()].join('; ');
    await prisma.supplier.update({
      where: { id: append.supplierId },
      data: { companyCode: updated },
    });
  }

  return resolved;
}

async function writeIntakeRows(
  rows: IntakeCsvRow[],
  resolvedSuppliers: Map<string, ResolvedSupplier>,
  batchSize: number,
) {
  const batches = chunk(rows, batchSize);
  let written = 0;

  for (const batch of batches) {
    await prisma.$transaction(
      batch.flatMap((row) => {
        const supplier = resolvedSuppliers.get(row.supplierMatchKey);
        if (!supplier) throw new Error(`BUG: no resolved supplier for ${row.supplierMatchKey}`);

        const createIntake = prisma.intakeEntry.create({
          data: {
            id: row.historicIntakeId,
            supplierId: supplier.id,
            supplierName: supplier.name,
            routeGroup: supplier.routeGroup,
            milkType: row.milkType,
            quantityKg: row.quantityKg,
            calculatedCost: row.calculatedCostEur,
            unitPricePerKg: row.unitPriceEurPerKg ?? null,
            unitPriceBasis: row.unitPriceEurPerKg != null ? 'received_kg' : null,
            pricingMode: row.unitPriceEurPerKg != null ? 'unit_price' : null,
            timestamp: row.timestampIso,
            isEcological: row.isEcological,
            isDiscarded: row.isDiscarded,
            isTempAlertDismissed: row.isTempAlertDismissed,
            note: row.note || null,
            ph: PLACEHOLDER_PH,
            fatPct: PLACEHOLDER_FAT,
            proteinPct: PLACEHOLDER_PROTEIN,
            tempCelsius: PLACEHOLDER_TEMP,
          },
        });

        const tagInserts = row.tagsPipe.map((tag) =>
          prisma.intakeTag.create({
            data: { intakeEntryId: row.historicIntakeId, tag },
          })
        );

        return [createIntake, ...tagInserts];
      }),
    );
    written += batch.length;
    process.stdout.write(`  written ${written}/${rows.length}\r`);
  }
  console.log(); // newline after progress
}

// ─── printing ───────────────────────────────────────────────────────

function printPlanSummary(plan: ImportPlan, sampleLimit: number) {
  const sp = plan.supplierPlan;

  console.log('\n── Supplier resolution ────────────────');
  console.log(`  Matched existing suppliers: ${sp.resolved.size}`);
  for (const [key, s] of sp.resolved) {
    console.log(`    ${key} → "${s.name}" [${s.matchMethod}]`);
  }
  console.log(`  Suppliers to create: ${sp.toCreate.length}`);
  for (const c of sp.toCreate) {
    console.log(`    ${c.supplierMatchKey} → "${c.preferredDisplayName}" (code: ${c.primaryCompanyCode})`);
  }
  console.log(`  VAT alias appends: ${sp.vatAliasAppends.length}`);
  for (const a of sp.vatAliasAppends) {
    console.log(`    supplier "${a.supplierName}" ← add code ${a.newCode}`);
  }
  if (sp.ambiguous.length > 0) {
    console.log(`  Ambiguous (BLOCKING): ${sp.ambiguous.length}`);
    for (const a of sp.ambiguous) console.log(`    ${a.matchKey}`);
  }

  console.log('\n── Intake rows ────────────────────────');
  console.log(`  Rows to insert: ${plan.intakeToInsert.length}`);
  console.log(`  Rows skipped (id already exists): ${plan.intakeSkipped.length}`);

  if (plan.intakeSkipped.length > 0 && sampleLimit > 0) {
    console.log(`\n  Skipped samples (up to ${Math.min(sampleLimit, plan.intakeSkipped.length)}):`);
    for (const r of plan.intakeSkipped.slice(0, sampleLimit)) {
      console.log(`    ${r.historicIntakeId}`);
    }
  }

  console.log('\n── Summary by supplier + milkType ─────');
  const ordered = [...plan.summary.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [key, v] of ordered) {
    console.log(`  ${key}: rows=${v.rows}, qty=${v.totalKg.toFixed(2)} kg, cost=${v.totalCostEur.toFixed(2)} EUR`);
  }
}

// ─── main ───────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { printHelp(); return; }

  dotenv.config({ path: path.resolve(projectRoot, '.env') });
  dotenv.config({ path: path.resolve(projectRoot, 'nordic-backend/.env'), override: true });

  console.log('Historical intake importer');
  console.log(`Mode: ${options.dryRun ? 'DRY-RUN' : 'WRITE'}`);
  console.log(`Intake CSV: ${options.intakeFile}`);
  console.log(`Suppliers CSV: ${options.suppliersFile}`);

  if (!(await fileExists(options.intakeFile))) throw new Error(`Intake CSV not found: ${options.intakeFile}`);
  if (!(await fileExists(options.suppliersFile))) throw new Error(`Suppliers CSV not found: ${options.suppliersFile}`);

  // Parse CSVs
  const rawIntake = await readCsvRows(options.intakeFile);
  const rawSuppliers = await readCsvRows(options.suppliersFile);

  console.log(`Parsed ${rawIntake.length} intake rows, ${rawSuppliers.length} supplier candidate rows.`);

  const intakeRows = rawIntake.map((r, i) => parseIntakeCsvRow(r, i + 2));
  const supplierCandidates = new Map<string, SupplierCandidateCsv>();
  for (let i = 0; i < rawSuppliers.length; i++) {
    const c = parseSupplierCandidateRow(rawSuppliers[i], i + 2);
    supplierCandidates.set(c.supplierMatchKey, c);
  }

  // Check for duplicate intake IDs
  const seenIds = new Set<string>();
  const dupIds = new Set<string>();
  for (const r of intakeRows) {
    if (seenIds.has(r.historicIntakeId)) dupIds.add(r.historicIntakeId);
    seenIds.add(r.historicIntakeId);
  }
  if (dupIds.size > 0) {
    throw new Error(`Duplicate historic_intake_id values: ${[...dupIds].slice(0, 10).join(', ')}`);
  }

  // Build plan
  const plan = await buildImportPlan(options, intakeRows, supplierCandidates);
  printPlanSummary(plan, options.sampleLimit);

  if (options.dryRun) {
    console.log('\nDry-run complete. No changes written.');
    return;
  }

  // Write
  console.log('\nWriting suppliers…');
  const resolvedSuppliers = await writeSuppliers(plan.supplierPlan);

  console.log('Writing intake rows…');
  await writeIntakeRows(plan.intakeToInsert, resolvedSuppliers, options.batchSize);

  console.log('\n── Write complete ─────────────────────');
  console.log(`  Suppliers created: ${plan.supplierPlan.toCreate.length}`);
  console.log(`  VAT aliases appended: ${plan.supplierPlan.vatAliasAppends.length}`);
  console.log(`  Intake rows inserted: ${plan.intakeToInsert.length}`);
  console.log(`  Intake rows skipped (already existed): ${plan.intakeSkipped.length}`);
}

main()
  .catch((error) => {
    console.error('\nHistorical intake import failed.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
