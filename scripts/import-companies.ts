#!/usr/bin/env tsx
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Prisma, type Buyer as BuyerRecord, type Supplier as SupplierRecord } from '@prisma/client';
import prisma from '../services/prisma';
import { normalizeCompanyCodes, parseCompanyCodes } from '../utils/companyCodes';
import {
  fileExists,
  normalizeName,
  normalizeWhitespace,
  parseBooleanString,
  parseNumberString,
  pickField,
  readCsvFile,
  splitMultiValue,
  type CsvRow,
} from './import-companies.utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const DEFAULT_MASTER_FILE = path.resolve(projectRoot, '../entities_master.csv');
const DEFAULT_BUYERS_FILE = path.resolve(projectRoot, '../buyers_clean.csv');
const DEFAULT_SUPPLIERS_FILE = path.resolve(projectRoot, '../suppliers_clean.csv');
const DEFAULT_ROUTE_GROUP = 'Unassigned';
const DEFAULT_WARNING_PRINT_LIMIT = 15;

type Role = 'buyer' | 'supplier';

type CliOptions = {
  masterFile: string;
  buyersFile: string;
  suppliersFile: string;
  dryRun: boolean;
  allowEmptyOverwrite: boolean;
  warningPrintLimit: number;
  help: boolean;
};

type SummaryEntry = {
  rowNumber: number;
  entityUid: string;
  role?: Role;
  message: string;
};

type ImportReport = {
  totalRowsProcessed: number;
  buyersCreated: number;
  buyersUpdated: number;
  suppliersCreated: number;
  suppliersUpdated: number;
  skippedRows: SummaryEntry[];
  ambiguousMatches: SummaryEntry[];
  validationWarnings: SummaryEntry[];
};

type FieldValue<T> = {
  present: boolean;
  empty: boolean;
  value: T | null;
};

type EntityState<T extends { id: string; name: string; companyCode: string | null }> = {
  records: T[];
  byCompanyCode: Map<string, T[]>;
  byNormalizedName: Map<string, T[]>;
};

type MatchOutcome<T> =
  | { status: 'matched'; record: T }
  | { status: 'not-found' }
  | { status: 'ambiguous'; message: string };

type OverlayMaps = {
  buyer: Map<string, CsvRow>;
  supplier: Map<string, CsvRow>;
};

type MutationPlan<T> = {
  role: Role;
  action: 'create' | 'update' | 'noop';
  execute: (tx: Prisma.TransactionClient) => Promise<T>;
  simulatedRecord: T | null;
};

type PlannedRow = {
  plans: Array<MutationPlan<BuyerRecord | SupplierRecord>>;
  rowSkipped: boolean;
};

/**
 * Final field mapping used by this importer.
 *
 * Preferred input is `entities_master.csv`, with optional role-specific overlays from
 * `buyers_clean.csv` and `suppliers_clean.csv` when those files exist.
 *
 * Actual columns inferred from the available CSV files:
 * - Name: `canonical_name` or overlay `name_clean` (fallbacks: `name`)
 * - Company code: overlay `source_code`, direct `company_code` / `companyCode`, otherwise
 *   role-specific `buyer_source_codes` / `supplier_source_codes`, then `all_source_codes`
 * - Phone: `phone`, `phoneNumber`, `phones`
 * - Country: `country`
 * - Address line 1: `address_line_1`, `addressLine1`, `canonical_address`, overlay `address_clean`
 * - Address line 2: `address_line_2`, `addressLine2`
 * - Created on: `created_on`, `createdOn`
 * - Supplier route group: `route_group`, `routeGroup` (defaults to `Unassigned` when missing)
 * - Supplier financial/milk fields:
 *   `contract_quota` / `contractQuota`,
 *   `base_price_per_kg` / `basePricePerKg`,
 *   `normal_milk_price_per_kg` / `normalMilkPricePerKg`,
 *   `fat_bonus_per_pct` / `fatBonusPerPct`,
 *   `protein_bonus_per_pct` / `proteinBonusPerPct`,
 *   `is_eco` / `isEco`,
 *   `default_milk_type` / `defaultMilkType`
 *
 * Duplicate detection:
 * - Prefer exact `companyCode` matches when a single non-ambiguous code is available.
 * - If no usable company code is available, fall back to normalized name.
 * - Normalized names trim whitespace, collapse repeated spaces, and compare case-insensitively.
 * - Ambiguous matches are logged and skipped instead of guessed.
 */

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    masterFile: DEFAULT_MASTER_FILE,
    buyersFile: DEFAULT_BUYERS_FILE,
    suppliersFile: DEFAULT_SUPPLIERS_FILE,
    dryRun: false,
    allowEmptyOverwrite: false,
    warningPrintLimit: DEFAULT_WARNING_PRINT_LIMIT,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--allow-empty-overwrite') {
      options.allowEmptyOverwrite = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--file' || arg === '--master-file') {
      options.masterFile = resolveCliPath(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--buyers-file') {
      options.buyersFile = resolveCliPath(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--suppliers-file') {
      options.suppliersFile = resolveCliPath(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--warning-print-limit') {
      const parsed = Number(argv[index + 1]);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`Invalid value for --warning-print-limit: ${argv[index + 1] ?? '(missing)'}`);
      }
      options.warningPrintLimit = parsed;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function resolveCliPath(value: string | undefined): string {
  if (!value) {
    throw new Error('Missing value for CLI option');
  }

  return path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
}

function printHelp() {
  console.log(`Company importer

Usage:
  npm run import:companies -- [options]

Options:
  --dry-run                   Preview changes without writing to the database
  --allow-empty-overwrite     Allow empty CSV values to clear non-empty DB values
  --file <path>               Path to entities_master.csv
  --buyers-file <path>        Optional path to buyers_clean.csv
  --suppliers-file <path>     Optional path to suppliers_clean.csv
  --warning-print-limit <n>   Limit printed warning/skip samples (default: ${DEFAULT_WARNING_PRINT_LIMIT})
  --help                      Show this help text
`);
}

function createFieldValue<T>(present: boolean, empty: boolean, value: T | null): FieldValue<T> {
  return { present, empty, value };
}

function parseStringField(sources: Array<CsvRow | undefined>, columns: string[]): FieldValue<string> {
  const picked = pickField(sources, columns);
  if (!picked.present) {
    return createFieldValue(false, false, null);
  }

  const normalized = normalizeWhitespace(picked.raw);
  if (!normalized) {
    return createFieldValue(true, true, null);
  }

  return createFieldValue(true, false, normalized);
}

function parseNumberField(
  sources: Array<CsvRow | undefined>,
  columns: string[],
  report: ImportReport,
  rowNumber: number,
  entityUid: string,
  role: Role,
): FieldValue<number> {
  const picked = pickField(sources, columns);
  if (!picked.present) {
    return createFieldValue(false, false, null);
  }

  const normalized = normalizeWhitespace(picked.raw);
  if (!normalized) {
    return createFieldValue(true, true, null);
  }

  const parsed = parseNumberString(normalized);
  if (typeof parsed === 'undefined') {
    addWarning(report, { rowNumber, entityUid, role, message: `Invalid number in ${picked.column}: ${picked.raw}` });
    return createFieldValue(false, false, null);
  }

  return createFieldValue(true, false, parsed);
}

function parseBooleanField(
  sources: Array<CsvRow | undefined>,
  columns: string[],
  report: ImportReport,
  rowNumber: number,
  entityUid: string,
  role: Role,
): FieldValue<boolean> {
  const picked = pickField(sources, columns);
  if (!picked.present) {
    return createFieldValue(false, false, null);
  }

  const normalized = normalizeWhitespace(picked.raw);
  if (!normalized) {
    return createFieldValue(true, true, null);
  }

  const parsed = parseBooleanString(normalized);
  if (typeof parsed === 'undefined') {
    addWarning(report, { rowNumber, entityUid, role, message: `Invalid boolean in ${picked.column}: ${picked.raw}` });
    return createFieldValue(false, false, null);
  }

  return createFieldValue(true, false, parsed);
}

function parseDateField(
  sources: Array<CsvRow | undefined>,
  columns: string[],
  report: ImportReport,
  rowNumber: number,
  entityUid: string,
  role: Role,
): FieldValue<Date> {
  const picked = pickField(sources, columns);
  if (!picked.present) {
    return createFieldValue(false, false, null);
  }

  const normalized = normalizeWhitespace(picked.raw);
  if (!normalized) {
    return createFieldValue(true, true, null);
  }

  const parsed = parseFlexibleDate(normalized);
  if (!parsed) {
    addWarning(report, { rowNumber, entityUid, role, message: `Invalid date in ${picked.column}: ${picked.raw}` });
    return createFieldValue(false, false, null);
  }

  return createFieldValue(true, false, parsed);
}

function parseFlexibleDate(raw: string): Date | null {
  if (/^\d{13}$/.test(raw)) {
    const date = new Date(Number(raw));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (/^\d{10}$/.test(raw)) {
    const date = new Date(Number(raw) * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addWarning(report: ImportReport, entry: SummaryEntry) {
  report.validationWarnings.push(entry);
}

function addSkip(report: ImportReport, entry: SummaryEntry) {
  report.skippedRows.push(entry);
}

function addAmbiguity(report: ImportReport, entry: SummaryEntry) {
  report.ambiguousMatches.push(entry);
}

function buildEntityState<T extends { id: string; name: string; companyCode: string | null }>(records: T[]): EntityState<T> {
  const byCompanyCode = new Map<string, T[]>();
  const byNormalizedName = new Map<string, T[]>();

  for (const record of records) {
    for (const companyCode of parseCompanyCodes(record.companyCode)) {
      const key = companyCode.toUpperCase();
      const current = byCompanyCode.get(key) ?? [];
      current.push(record);
      byCompanyCode.set(key, current);
    }

    const normalizedName = normalizeName(record.name);
    if (normalizedName) {
      const current = byNormalizedName.get(normalizedName) ?? [];
      current.push(record);
      byNormalizedName.set(normalizedName, current);
    }
  }

  return { records: [...records], byCompanyCode, byNormalizedName };
}

function replaceStateRecord<T extends { id: string; name: string; companyCode: string | null }>(state: EntityState<T>, record: T) {
  const nextRecords = state.records.filter((item) => item.id !== record.id);
  nextRecords.push(record);
  const rebuilt = buildEntityState(nextRecords);
  state.records = rebuilt.records;
  state.byCompanyCode = rebuilt.byCompanyCode;
  state.byNormalizedName = rebuilt.byNormalizedName;
}

function matchRecord<T extends { id: string; name: string; companyCode: string | null }>(
  state: EntityState<T>,
  companyCodes: string[],
  normalizedName: string,
): MatchOutcome<T> {
  const codeMatchCandidates = [...new Map(
    companyCodes.flatMap((companyCode) => (state.byCompanyCode.get(companyCode.toUpperCase()) ?? []).map((record) => [record.id, record]))
  ).values()];

  if (companyCodes.length > 0 && codeMatchCandidates.length > 1) {
    return { status: 'ambiguous', message: `Multiple existing records match companyCode values ${companyCodes.join(', ')}` };
  }

  if (companyCodes.length > 0 && codeMatchCandidates.length === 1) {
    return { status: 'matched', record: codeMatchCandidates[0] };
  }

  const nameCandidates = normalizedName ? state.byNormalizedName.get(normalizedName) ?? [] : [];

  if (companyCodes.length === 0) {
    if (nameCandidates.length > 1) {
      return { status: 'ambiguous', message: `Multiple existing records share normalized name ${normalizedName}` };
    }

    if (nameCandidates.length === 1) {
      return { status: 'matched', record: nameCandidates[0] };
    }

    return { status: 'not-found' };
  }

  if (nameCandidates.length > 1) {
    return { status: 'ambiguous', message: `No companyCode match, and multiple normalized-name matches found for ${normalizedName}` };
  }

  if (nameCandidates.length === 1) {
    const existing = nameCandidates[0];
    const existingCodes = parseCompanyCodes(existing.companyCode);

    if (existingCodes.length === 0) {
      return { status: 'matched', record: existing };
    }

    return {
      status: 'ambiguous',
      message: `Normalized-name match exists with different companyCode (${existing.companyCode})`,
    };
  }

  return { status: 'not-found' };
}

function loadRoleFlags(row: CsvRow): { isBuyer: boolean; isSupplier: boolean } {
  const sourceRoles = splitMultiValue(row.source_roles)
    .map((value) => value.toLowerCase())
    .flatMap((value) => value.split(/\s+/g))
    .filter(Boolean);

  const buyerFlag = parseBooleanString(row.is_buyer) ?? false;
  const supplierFlag = parseBooleanString(row.is_supplier) ?? false;

  return {
    isBuyer: buyerFlag || sourceRoles.includes('buyer'),
    isSupplier: supplierFlag || sourceRoles.includes('supplier'),
  };
}

function resolveCompanyCode(
  role: Role,
  masterRow: CsvRow,
  overlayRow: CsvRow | undefined,
  report: ImportReport,
  rowNumber: number,
  entityUid: string,
): FieldValue<string> {
  const direct = parseStringField([overlayRow, masterRow], ['company_code', 'companyCode', 'source_code']);
  if (direct.present) {
    const normalized = normalizeCompanyCodes(direct.value);
    return createFieldValue(direct.present, direct.empty, normalized);
  }

  const roleCodeColumns = role === 'buyer'
    ? ['buyer_source_codes', 'all_source_codes']
    : ['supplier_source_codes', 'all_source_codes'];

  const picked = pickField([masterRow], roleCodeColumns);
  if (!picked.present) {
    return createFieldValue(false, false, null);
  }

  const codes = splitMultiValue(picked.raw);
  if (codes.length === 0) {
    return createFieldValue(true, true, null);
  }

  return createFieldValue(true, false, normalizeCompanyCodes(codes.join('; ')));
}

function mergeString(existing: string | null, incoming: FieldValue<string>, allowEmptyOverwrite: boolean): string | null {
  if (!incoming.present) {
    return existing;
  }

  if (incoming.empty) {
    return allowEmptyOverwrite ? null : existing;
  }

  return incoming.value;
}

function mergeNumber(existing: number | null, incoming: FieldValue<number>, allowEmptyOverwrite: boolean): number | null {
  if (!incoming.present) {
    return existing;
  }

  if (incoming.empty) {
    return allowEmptyOverwrite ? null : existing;
  }

  return incoming.value;
}

function mergeDate(existing: Date | null, incoming: FieldValue<Date>, allowEmptyOverwrite: boolean): Date | null {
  if (!incoming.present) {
    return existing;
  }

  if (incoming.empty) {
    return allowEmptyOverwrite ? null : existing;
  }

  return incoming.value;
}

function mergeBoolean(existing: boolean, incoming: FieldValue<boolean>, allowEmptyOverwrite: boolean, emptyFallback: boolean): boolean {
  if (!incoming.present) {
    return existing;
  }

  if (incoming.empty) {
    return allowEmptyOverwrite ? emptyFallback : existing;
  }

  return incoming.value ?? existing;
}

function sameDate(left: Date | null, right: Date | null): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.getTime() === right.getTime();
}

function hasBuyerChanged(existing: BuyerRecord, next: BuyerRecord): boolean {
  return existing.name !== next.name
    || existing.companyCode !== next.companyCode
    || existing.phoneNumber !== next.phoneNumber
    || existing.country !== next.country
    || existing.addressLine1 !== next.addressLine1
    || existing.addressLine2 !== next.addressLine2
    || !sameDate(existing.createdOn, next.createdOn);
}

function hasSupplierChanged(existing: SupplierRecord, next: SupplierRecord): boolean {
  return existing.name !== next.name
    || existing.routeGroup !== next.routeGroup
    || existing.contractQuota !== next.contractQuota
    || existing.companyCode !== next.companyCode
    || existing.phoneNumber !== next.phoneNumber
    || existing.country !== next.country
    || existing.addressLine1 !== next.addressLine1
    || existing.addressLine2 !== next.addressLine2
    || !sameDate(existing.createdOn, next.createdOn)
    || existing.basePricePerKg !== next.basePricePerKg
    || existing.normalMilkPricePerKg !== next.normalMilkPricePerKg
    || existing.fatBonusPerPct !== next.fatBonusPerPct
    || existing.proteinBonusPerPct !== next.proteinBonusPerPct
    || existing.isEco !== next.isEco
    || existing.defaultMilkType !== next.defaultMilkType;
}

function buildBuyerRecord(
  existing: BuyerRecord | null,
  masterRow: CsvRow,
  overlayRow: CsvRow | undefined,
  report: ImportReport,
  rowNumber: number,
  entityUid: string,
  allowEmptyOverwrite: boolean,
): BuyerRecord | null {
  const sources = [overlayRow, masterRow];
  const nameField = parseStringField(sources, ['name', 'canonical_name', 'name_clean']);
  const normalizedName = normalizeName(nameField.value ?? existing?.name ?? '');
  if (!normalizedName) {
    addSkip(report, { rowNumber, entityUid, role: 'buyer', message: 'Missing buyer name' });
    return null;
  }

  const name = nameField.present && !nameField.empty && nameField.value
    ? nameField.value
    : existing?.name ?? null;

  if (!name) {
    addSkip(report, { rowNumber, entityUid, role: 'buyer', message: 'Missing buyer name' });
    return null;
  }

  const companyCodeField = resolveCompanyCode('buyer', masterRow, overlayRow, report, rowNumber, entityUid);
  const phoneField = parseStringField(sources, ['phone', 'phoneNumber', 'phones']);
  const countryField = parseStringField(sources, ['country']);
  const addressLine1Field = parseStringField(sources, ['address_line_1', 'addressLine1', 'canonical_address', 'address_clean']);
  const addressLine2Field = parseStringField(sources, ['address_line_2', 'addressLine2']);
  const createdOnField = parseDateField(sources, ['created_on', 'createdOn'], report, rowNumber, entityUid, 'buyer');

  return {
    id: existing?.id ?? `dry-run-buyer-${entityUid}`,
    name,
    companyCode: mergeString(existing?.companyCode ?? null, companyCodeField, allowEmptyOverwrite),
    phoneNumber: mergeString(existing?.phoneNumber ?? null, phoneField, allowEmptyOverwrite),
    country: mergeString(existing?.country ?? null, countryField, allowEmptyOverwrite),
    addressLine1: mergeString(existing?.addressLine1 ?? null, addressLine1Field, allowEmptyOverwrite),
    addressLine2: mergeString(existing?.addressLine2 ?? null, addressLine2Field, allowEmptyOverwrite),
    createdOn: mergeDate(existing?.createdOn ?? null, createdOnField, allowEmptyOverwrite),
  };
}

function buildSupplierRecord(
  existing: SupplierRecord | null,
  masterRow: CsvRow,
  overlayRow: CsvRow | undefined,
  report: ImportReport,
  rowNumber: number,
  entityUid: string,
  allowEmptyOverwrite: boolean,
): SupplierRecord | null {
  const sources = [overlayRow, masterRow];
  const nameField = parseStringField(sources, ['name', 'canonical_name', 'name_clean']);
  const normalizedName = normalizeName(nameField.value ?? existing?.name ?? '');
  if (!normalizedName) {
    addSkip(report, { rowNumber, entityUid, role: 'supplier', message: 'Missing supplier name' });
    return null;
  }

  const name = nameField.present && !nameField.empty && nameField.value
    ? nameField.value
    : existing?.name ?? null;

  if (!name) {
    addSkip(report, { rowNumber, entityUid, role: 'supplier', message: 'Missing supplier name' });
    return null;
  }

  const companyCodeField = resolveCompanyCode('supplier', masterRow, overlayRow, report, rowNumber, entityUid);
  const phoneField = parseStringField(sources, ['phone', 'phoneNumber', 'phones']);
  const countryField = parseStringField(sources, ['country']);
  const addressLine1Field = parseStringField(sources, ['address_line_1', 'addressLine1', 'canonical_address', 'address_clean']);
  const addressLine2Field = parseStringField(sources, ['address_line_2', 'addressLine2']);
  const createdOnField = parseDateField(sources, ['created_on', 'createdOn'], report, rowNumber, entityUid, 'supplier');
  const routeGroupField = parseStringField(sources, ['route_group', 'routeGroup']);
  const contractQuotaField = parseNumberField(sources, ['contract_quota', 'contractQuota'], report, rowNumber, entityUid, 'supplier');
  const basePriceField = parseNumberField(sources, ['base_price_per_kg', 'basePricePerKg'], report, rowNumber, entityUid, 'supplier');
  const normalMilkPriceField = parseNumberField(sources, ['normal_milk_price_per_kg', 'normalMilkPricePerKg'], report, rowNumber, entityUid, 'supplier');
  const fatBonusField = parseNumberField(sources, ['fat_bonus_per_pct', 'fatBonusPerPct'], report, rowNumber, entityUid, 'supplier');
  const proteinBonusField = parseNumberField(sources, ['protein_bonus_per_pct', 'proteinBonusPerPct'], report, rowNumber, entityUid, 'supplier');
  const isEcoField = parseBooleanField(sources, ['is_eco', 'isEco'], report, rowNumber, entityUid, 'supplier');
  const defaultMilkTypeField = parseStringField(sources, ['default_milk_type', 'defaultMilkType']);

  let routeGroup = mergeString(existing?.routeGroup ?? null, routeGroupField, allowEmptyOverwrite);
  if (!routeGroup) {
    routeGroup = existing?.routeGroup || DEFAULT_ROUTE_GROUP;
    addWarning(report, {
      rowNumber,
      entityUid,
      role: 'supplier',
      message: `Missing routeGroup; using ${DEFAULT_ROUTE_GROUP}`,
    });
  }

  return {
    id: existing?.id ?? `dry-run-supplier-${entityUid}`,
    name,
    routeGroup,
    contractQuota: mergeNumber(existing?.contractQuota ?? null, contractQuotaField, allowEmptyOverwrite),
    companyCode: mergeString(existing?.companyCode ?? null, companyCodeField, allowEmptyOverwrite),
    phoneNumber: mergeString(existing?.phoneNumber ?? null, phoneField, allowEmptyOverwrite),
    country: mergeString(existing?.country ?? null, countryField, allowEmptyOverwrite),
    addressLine1: mergeString(existing?.addressLine1 ?? null, addressLine1Field, allowEmptyOverwrite),
    addressLine2: mergeString(existing?.addressLine2 ?? null, addressLine2Field, allowEmptyOverwrite),
    createdOn: mergeDate(existing?.createdOn ?? null, createdOnField, allowEmptyOverwrite),
    basePricePerKg: mergeNumber(existing?.basePricePerKg ?? null, basePriceField, allowEmptyOverwrite),
    normalMilkPricePerKg: mergeNumber(existing?.normalMilkPricePerKg ?? null, normalMilkPriceField, allowEmptyOverwrite),
    fatBonusPerPct: mergeNumber(existing?.fatBonusPerPct ?? null, fatBonusField, allowEmptyOverwrite),
    proteinBonusPerPct: mergeNumber(existing?.proteinBonusPerPct ?? null, proteinBonusField, allowEmptyOverwrite),
    isEco: mergeBoolean(existing?.isEco ?? false, isEcoField, allowEmptyOverwrite, false),
    defaultMilkType: mergeString(existing?.defaultMilkType ?? null, defaultMilkTypeField, allowEmptyOverwrite),
  };
}

function planBuyerMutation(
  state: EntityState<BuyerRecord>,
  masterRow: CsvRow,
  overlayRow: CsvRow | undefined,
  report: ImportReport,
  rowNumber: number,
  entityUid: string,
  options: CliOptions,
): MutationPlan<BuyerRecord> | null {
  const nameField = parseStringField([overlayRow, masterRow], ['name', 'canonical_name', 'name_clean']);
  const normalizedName = normalizeName(nameField.value ?? '');
  if (!normalizedName) {
    addSkip(report, { rowNumber, entityUid, role: 'buyer', message: 'Missing buyer name' });
    return null;
  }

  const companyCodeField = resolveCompanyCode('buyer', masterRow, overlayRow, report, rowNumber, entityUid);
  const match = matchRecord(state, parseCompanyCodes(companyCodeField.value), normalizedName);

  if (match.status === 'ambiguous') {
    addAmbiguity(report, { rowNumber, entityUid, role: 'buyer', message: match.message });
    return null;
  }

  const existing = match.status === 'matched' ? match.record : null;
  const next = buildBuyerRecord(existing, masterRow, overlayRow, report, rowNumber, entityUid, options.allowEmptyOverwrite);
  if (!next) {
    return null;
  }

  if (!existing) {
    const createData: Prisma.BuyerCreateInput = {
      name: next.name,
      companyCode: next.companyCode,
      phoneNumber: next.phoneNumber,
      country: next.country,
      addressLine1: next.addressLine1,
      addressLine2: next.addressLine2,
      createdOn: next.createdOn,
    };

    return {
      role: 'buyer',
      action: 'create',
      execute: (tx) => tx.buyer.create({ data: createData }),
      simulatedRecord: next,
    };
  }

  if (!hasBuyerChanged(existing, next)) {
    return {
      role: 'buyer',
      action: 'noop',
      execute: async () => existing,
      simulatedRecord: existing,
    };
  }

  const updateData: Prisma.BuyerUpdateInput = {
    name: next.name,
    companyCode: next.companyCode,
    phoneNumber: next.phoneNumber,
    country: next.country,
    addressLine1: next.addressLine1,
    addressLine2: next.addressLine2,
    createdOn: next.createdOn,
  };

  return {
    role: 'buyer',
    action: 'update',
    execute: (tx) => tx.buyer.update({ where: { id: existing.id }, data: updateData }),
    simulatedRecord: next,
  };
}

function planSupplierMutation(
  state: EntityState<SupplierRecord>,
  masterRow: CsvRow,
  overlayRow: CsvRow | undefined,
  report: ImportReport,
  rowNumber: number,
  entityUid: string,
  options: CliOptions,
): MutationPlan<SupplierRecord> | null {
  const nameField = parseStringField([overlayRow, masterRow], ['name', 'canonical_name', 'name_clean']);
  const normalizedName = normalizeName(nameField.value ?? '');
  if (!normalizedName) {
    addSkip(report, { rowNumber, entityUid, role: 'supplier', message: 'Missing supplier name' });
    return null;
  }

  const companyCodeField = resolveCompanyCode('supplier', masterRow, overlayRow, report, rowNumber, entityUid);
  const match = matchRecord(state, parseCompanyCodes(companyCodeField.value), normalizedName);

  if (match.status === 'ambiguous') {
    addAmbiguity(report, { rowNumber, entityUid, role: 'supplier', message: match.message });
    return null;
  }

  const existing = match.status === 'matched' ? match.record : null;
  const next = buildSupplierRecord(existing, masterRow, overlayRow, report, rowNumber, entityUid, options.allowEmptyOverwrite);
  if (!next) {
    return null;
  }

  if (!existing) {
    const createData: Prisma.SupplierCreateInput = {
      name: next.name,
      routeGroup: next.routeGroup,
      contractQuota: next.contractQuota,
      companyCode: next.companyCode,
      phoneNumber: next.phoneNumber,
      country: next.country,
      addressLine1: next.addressLine1,
      addressLine2: next.addressLine2,
      createdOn: next.createdOn,
      basePricePerKg: next.basePricePerKg,
      normalMilkPricePerKg: next.normalMilkPricePerKg,
      fatBonusPerPct: next.fatBonusPerPct,
      proteinBonusPerPct: next.proteinBonusPerPct,
      isEco: next.isEco,
      defaultMilkType: next.defaultMilkType,
    };

    return {
      role: 'supplier',
      action: 'create',
      execute: (tx) => tx.supplier.create({ data: createData }),
      simulatedRecord: next,
    };
  }

  if (!hasSupplierChanged(existing, next)) {
    return {
      role: 'supplier',
      action: 'noop',
      execute: async () => existing,
      simulatedRecord: existing,
    };
  }

  const updateData: Prisma.SupplierUpdateInput = {
    name: next.name,
    routeGroup: next.routeGroup,
    contractQuota: next.contractQuota,
    companyCode: next.companyCode,
    phoneNumber: next.phoneNumber,
    country: next.country,
    addressLine1: next.addressLine1,
    addressLine2: next.addressLine2,
    createdOn: next.createdOn,
    basePricePerKg: next.basePricePerKg,
    normalMilkPricePerKg: next.normalMilkPricePerKg,
    fatBonusPerPct: next.fatBonusPerPct,
    proteinBonusPerPct: next.proteinBonusPerPct,
    isEco: next.isEco,
    defaultMilkType: next.defaultMilkType,
  };

  return {
    role: 'supplier',
    action: 'update',
    execute: (tx) => tx.supplier.update({ where: { id: existing.id }, data: updateData }),
    simulatedRecord: next,
  };
}

async function loadOverlayFile(filePath: string, role: Role, report: ImportReport): Promise<Map<string, CsvRow>> {
  const exists = await fileExists(filePath);
  if (!exists) {
    return new Map();
  }

  const rows = await readCsvFile(filePath);
  const grouped = new Map<string, CsvRow[]>();

  for (const row of rows) {
    const entityUid = normalizeWhitespace(row.entity_uid);
    if (!entityUid) {
      continue;
    }
    const current = grouped.get(entityUid) ?? [];
    current.push(row);
    grouped.set(entityUid, current);
  }

  const overlay = new Map<string, CsvRow>();
  for (const [entityUid, matches] of grouped.entries()) {
    if (matches.length > 1) {
      addWarning(report, {
        rowNumber: 0,
        entityUid,
        role,
        message: `Optional ${role} overlay has ${matches.length} rows for the same entity_uid; using the first row only`,
      });
    }
    overlay.set(entityUid, matches[0]);
  }

  return overlay;
}

function printEntries(title: string, entries: SummaryEntry[], limit: number) {
  if (entries.length === 0) {
    return;
  }

  console.log(`\n${title} (${entries.length})`);
  for (const entry of entries.slice(0, limit)) {
    const rolePart = entry.role ? ` [${entry.role}]` : '';
    const rowPart = entry.rowNumber > 0 ? `row ${entry.rowNumber}` : 'setup';
    console.log(`- ${rowPart}${rolePart} ${entry.entityUid}: ${entry.message}`);
  }

  if (entries.length > limit) {
    console.log(`- ... ${entries.length - limit} more`);
  }
}

async function runRowPlans(
  plans: Array<MutationPlan<BuyerRecord | SupplierRecord>>,
  options: CliOptions,
): Promise<Array<BuyerRecord | SupplierRecord>> {
  if (plans.length === 0) {
    return [];
  }

  if (options.dryRun) {
    return plans
      .filter((plan) => Boolean(plan.simulatedRecord))
      .map((plan) => plan.simulatedRecord as BuyerRecord | SupplierRecord);
  }

  return prisma.$transaction(async (tx) => {
    const results: Array<BuyerRecord | SupplierRecord> = [];
    for (const plan of plans) {
      if (plan.action === 'noop') {
        continue;
      }
      results.push(await plan.execute(tx));
    }
    return results;
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  dotenv.config({ path: path.resolve(projectRoot, '.env') });
  dotenv.config({ path: path.resolve(projectRoot, '.env.local') });

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Add it to .env or your environment before running the importer.');
  }

  if (!(await fileExists(options.masterFile))) {
    throw new Error(`Master CSV not found: ${options.masterFile}`);
  }

  const report: ImportReport = {
    totalRowsProcessed: 0,
    buyersCreated: 0,
    buyersUpdated: 0,
    suppliersCreated: 0,
    suppliersUpdated: 0,
    skippedRows: [],
    ambiguousMatches: [],
    validationWarnings: [],
  };

  const [masterRows, existingBuyers, existingSuppliers, buyerOverlay, supplierOverlay] = await Promise.all([
    readCsvFile(options.masterFile),
    prisma.buyer.findMany(),
    prisma.supplier.findMany(),
    loadOverlayFile(options.buyersFile, 'buyer', report),
    loadOverlayFile(options.suppliersFile, 'supplier', report),
  ]);

  const overlays: OverlayMaps = {
    buyer: buyerOverlay,
    supplier: supplierOverlay,
  };

  const buyerState = buildEntityState(existingBuyers);
  const supplierState = buildEntityState(existingSuppliers);

  console.log(`Starting company import (${options.dryRun ? 'dry-run' : 'write mode'})`);
  console.log(`Master CSV: ${options.masterFile}`);
  if (buyerOverlay.size > 0) {
    console.log(`Buyer overlay: ${options.buyersFile}`);
  }
  if (supplierOverlay.size > 0) {
    console.log(`Supplier overlay: ${options.suppliersFile}`);
  }

  for (const [index, masterRow] of masterRows.entries()) {
    const rowNumber = index + 2;
    const entityUid = normalizeWhitespace(masterRow.entity_uid) ?? `row-${rowNumber}`;
    report.totalRowsProcessed += 1;

    const nameForValidation = normalizeWhitespace(masterRow.canonical_name) ?? normalizeWhitespace(masterRow.name);
    const roles = loadRoleFlags(masterRow);

    if (!nameForValidation) {
      addSkip(report, { rowNumber, entityUid, message: 'Missing canonical_name/name in master CSV' });
      continue;
    }

    if (!roles.isBuyer && !roles.isSupplier) {
      addSkip(report, { rowNumber, entityUid, message: 'Row is not marked as buyer or supplier' });
      continue;
    }

    const rowPlans: Array<MutationPlan<BuyerRecord | SupplierRecord>> = [];

    if (roles.isBuyer) {
      const plan = planBuyerMutation(
        buyerState,
        masterRow,
        overlays.buyer.get(entityUid),
        report,
        rowNumber,
        entityUid,
        options,
      );
      if (plan) {
        rowPlans.push(plan as MutationPlan<BuyerRecord | SupplierRecord>);
      }
    }

    if (roles.isSupplier) {
      const plan = planSupplierMutation(
        supplierState,
        masterRow,
        overlays.supplier.get(entityUid),
        report,
        rowNumber,
        entityUid,
        options,
      );
      if (plan) {
        rowPlans.push(plan as MutationPlan<BuyerRecord | SupplierRecord>);
      }
    }

    const writePlans = rowPlans.filter((plan) => plan.action !== 'noop');
    const results = await runRowPlans(writePlans, options);

    if (options.dryRun) {
      for (const plan of writePlans) {
        if (plan.role === 'buyer' && plan.simulatedRecord) {
          replaceStateRecord(buyerState, plan.simulatedRecord as BuyerRecord);
          report[plan.action === 'create' ? 'buyersCreated' : 'buyersUpdated'] += 1;
        }
        if (plan.role === 'supplier' && plan.simulatedRecord) {
          replaceStateRecord(supplierState, plan.simulatedRecord as SupplierRecord);
          report[plan.action === 'create' ? 'suppliersCreated' : 'suppliersUpdated'] += 1;
        }
      }
      continue;
    }

    for (let resultIndex = 0; resultIndex < results.length; resultIndex += 1) {
      const plan = writePlans[resultIndex];
      const result = results[resultIndex];

      if (plan.role === 'buyer') {
        replaceStateRecord(buyerState, result as BuyerRecord);
        report[plan.action === 'create' ? 'buyersCreated' : 'buyersUpdated'] += 1;
      } else {
        replaceStateRecord(supplierState, result as SupplierRecord);
        report[plan.action === 'create' ? 'suppliersCreated' : 'suppliersUpdated'] += 1;
      }
    }
  }

  console.log('\nImport summary');
  console.log(`- Total rows processed: ${report.totalRowsProcessed}`);
  console.log(`- Buyers created: ${report.buyersCreated}`);
  console.log(`- Buyers updated: ${report.buyersUpdated}`);
  console.log(`- Suppliers created: ${report.suppliersCreated}`);
  console.log(`- Suppliers updated: ${report.suppliersUpdated}`);
  console.log(`- Skipped rows: ${report.skippedRows.length}`);
  console.log(`- Ambiguous matches: ${report.ambiguousMatches.length}`);
  console.log(`- Validation warnings: ${report.validationWarnings.length}`);

  printEntries('Skipped rows', report.skippedRows, options.warningPrintLimit);
  printEntries('Ambiguous matches', report.ambiguousMatches, options.warningPrintLimit);
  printEntries('Validation warnings', report.validationWarnings, options.warningPrintLimit);
}

main()
  .catch((error) => {
    console.error('\nCompany import failed.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
