#!/usr/bin/env tsx
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import prisma from '../services/prisma';
import { fileExists, normalizeWhitespace, parseCsv, parseNumberString } from './import-companies.utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const DEFAULT_PRODUCTS_FILE = path.resolve(projectRoot, '../historic_products_missing.csv');
const DEFAULT_OUTPUTS_FILE = path.resolve(projectRoot, '../historic_output_entries.csv');
const DEFAULT_EXCLUDED_FILE = path.resolve(projectRoot, '../historic_excluded_rows.csv');
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_SAMPLE_LIMIT = 20;

type CliOptions = {
  productsFile: string;
  outputsFile: string;
  excludedFile: string;
  dryRun: boolean;
  batchSize: number;
  sampleLimit: number;
  help: boolean;
};

type ProductCsvRow = {
  id: string;
  name: string;
  details: string;
  defaultPalletWeight: number;
  defaultBagWeight: number;
  proteinTargetPct: number;
  yieldFactor: number;
  sourceProductCodes: string;
  sourceProductNames: string;
  rowsInWorkbook: number;
  totalWeightKg: number;
  notes: string;
};

type OutputCsvRow = {
  productId: string;
  targetProductName: string;
  requiresProductCreate: boolean;
  batchId: string;
  packagingString: string;
  destination: string;
  timestamp: Date;
  pallets: number;
  bigBags: number;
  tanks: number;
  totalWeight: number;
  sourceProductCode: string;
  sourceProductName: string;
  sourceDocumentNo: string;
  sourceOperationId: string;
  sourceWorkbookRow: number;
};

type SummaryByProduct = Map<string, { rows: number; totalWeight: number }>;

type ImportPlan = {
  productsToCreate: ProductCsvRow[];
  productsSkippedExisting: ProductCsvRow[];
  outputsToInsert: OutputCsvRow[];
  outputsSkippedExisting: OutputCsvRow[];
  finalSummary: SummaryByProduct;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    productsFile: DEFAULT_PRODUCTS_FILE,
    outputsFile: DEFAULT_OUTPUTS_FILE,
    excludedFile: DEFAULT_EXCLUDED_FILE,
    dryRun: false,
    batchSize: DEFAULT_BATCH_SIZE,
    sampleLimit: DEFAULT_SAMPLE_LIMIT,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--products-file') {
      options.productsFile = resolveCliPath(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--outputs-file') {
      options.outputsFile = resolveCliPath(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--excluded-file') {
      options.excludedFile = resolveCliPath(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--batch-size') {
      const parsed = Number(argv[index + 1]);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid value for --batch-size: ${argv[index + 1] ?? '(missing)'}`);
      }
      options.batchSize = parsed;
      index += 1;
      continue;
    }

    if (arg === '--sample-limit') {
      const parsed = Number(argv[index + 1]);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`Invalid value for --sample-limit: ${argv[index + 1] ?? '(missing)'}`);
      }
      options.sampleLimit = parsed;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function resolveCliPath(value: string | undefined): string {
  if (!value) throw new Error('Missing value for CLI option');
  return path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
}

function printHelp() {
  console.log(`Historic output importer

Usage:
  npm run import:historic-output -- [options]

Options:
  --dry-run              Preview changes without writing to the database
  --products-file <path> Path to historic_products_missing.csv
  --outputs-file <path>  Path to historic_output_entries.csv
  --excluded-file <path> Optional audit-only path to historic_excluded_rows.csv
  --batch-size <n>       Number of output rows per write transaction (default: ${DEFAULT_BATCH_SIZE})
  --sample-limit <n>     Number of preview rows to print (default: ${DEFAULT_SAMPLE_LIMIT})
  --help                 Show this help text
`);
}

async function readCsvRows(filePath: string): Promise<Record<string, string>[]> {
  const fs = await import('fs/promises');
  const content = await fs.readFile(filePath, 'utf8');
  return parseCsv(content);
}

function requireString(raw: string | undefined, label: string, fileLabel: string, rowNumber: number): string {
  const value = normalizeWhitespace(raw);
  if (!value) {
    throw validationError(fileLabel, rowNumber, `${label} is required.`);
  }
  return value;
}

function requirePositiveNumber(raw: string | undefined, label: string, fileLabel: string, rowNumber: number): number {
  const value = parseNumberString(raw);
  if (value === undefined || Number.isNaN(value)) {
    throw validationError(fileLabel, rowNumber, `${label} must be a valid number.`);
  }
  if (value <= 0) {
    throw validationError(fileLabel, rowNumber, `${label} must be greater than 0.`);
  }
  return value;
}

function requireNumber(raw: string | undefined, label: string, fileLabel: string, rowNumber: number): number {
  const value = parseNumberString(raw);
  if (value === undefined || Number.isNaN(value)) {
    throw validationError(fileLabel, rowNumber, `${label} must be a valid number.`);
  }
  return value;
}

function requireTimestamp(raw: string | undefined, fileLabel: string, rowNumber: number): Date {
  const value = requireString(raw, 'timestamp_iso', fileLabel, rowNumber);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw validationError(fileLabel, rowNumber, `timestamp_iso is invalid: ${value}`);
  }
  return parsed;
}

function requireBoolean(raw: string | undefined, label: string, fileLabel: string, rowNumber: number): boolean {
  const normalized = requireString(raw, label, fileLabel, rowNumber).toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw validationError(fileLabel, rowNumber, `${label} must be True or False.`);
}

function validationError(fileLabel: string, rowNumber: number, message: string) {
  return new Error(`[${fileLabel} row ${rowNumber}] ${message}`);
}

function parseProductCsvRow(row: Record<string, string>, rowNumber: number): ProductCsvRow {
  return {
    id: requireString(row.id, 'id', 'historic_products_missing.csv', rowNumber),
    name: requireString(row.name, 'name', 'historic_products_missing.csv', rowNumber),
    details: requireString(row.details, 'details', 'historic_products_missing.csv', rowNumber),
    defaultPalletWeight: requirePositiveNumber(row.defaultPalletWeight, 'defaultPalletWeight', 'historic_products_missing.csv', rowNumber),
    defaultBagWeight: requirePositiveNumber(row.defaultBagWeight, 'defaultBagWeight', 'historic_products_missing.csv', rowNumber),
    proteinTargetPct: requireNumber(row.proteinTargetPct, 'proteinTargetPct', 'historic_products_missing.csv', rowNumber),
    yieldFactor: requireNumber(row.yieldFactor, 'yieldFactor', 'historic_products_missing.csv', rowNumber),
    sourceProductCodes: requireString(row.sourceProductCodes, 'sourceProductCodes', 'historic_products_missing.csv', rowNumber),
    sourceProductNames: requireString(row.sourceProductNames, 'sourceProductNames', 'historic_products_missing.csv', rowNumber),
    rowsInWorkbook: requirePositiveNumber(row.rowsInWorkbook, 'rowsInWorkbook', 'historic_products_missing.csv', rowNumber),
    totalWeightKg: requirePositiveNumber(row.totalWeightKg, 'totalWeightKg', 'historic_products_missing.csv', rowNumber),
    notes: requireString(row.notes, 'notes', 'historic_products_missing.csv', rowNumber),
  };
}

function parseOutputCsvRow(row: Record<string, string>, rowNumber: number): OutputCsvRow {
  return {
    productId: requireString(row.productId, 'productId', 'historic_output_entries.csv', rowNumber),
    targetProductName: requireString(row.targetProductName, 'targetProductName', 'historic_output_entries.csv', rowNumber),
    requiresProductCreate: requireBoolean(row.requiresProductCreate, 'requiresProductCreate', 'historic_output_entries.csv', rowNumber),
    batchId: requireString(row.batchId, 'batchId', 'historic_output_entries.csv', rowNumber),
    packagingString: requireString(row.packagingString, 'packagingString', 'historic_output_entries.csv', rowNumber),
    destination: requireString(row.destination, 'destination', 'historic_output_entries.csv', rowNumber),
    timestamp: requireTimestamp(row.timestamp_iso, 'historic_output_entries.csv', rowNumber),
    pallets: requireNumber(row.pallets, 'pallets', 'historic_output_entries.csv', rowNumber),
    bigBags: requireNumber(row.bigBags, 'bigBags', 'historic_output_entries.csv', rowNumber),
    tanks: requireNumber(row.tanks, 'tanks', 'historic_output_entries.csv', rowNumber),
    totalWeight: requirePositiveNumber(row.totalWeight, 'totalWeight', 'historic_output_entries.csv', rowNumber),
    sourceProductCode: requireString(row.sourceProductCode, 'sourceProductCode', 'historic_output_entries.csv', rowNumber),
    sourceProductName: requireString(row.sourceProductName, 'sourceProductName', 'historic_output_entries.csv', rowNumber),
    sourceDocumentNo: requireString(row.sourceDocumentNo, 'sourceDocumentNo', 'historic_output_entries.csv', rowNumber),
    sourceOperationId: requireString(row.sourceOperationId, 'sourceOperationId', 'historic_output_entries.csv', rowNumber),
    sourceWorkbookRow: requirePositiveNumber(row.sourceWorkbookRow, 'sourceWorkbookRow', 'historic_output_entries.csv', rowNumber),
  };
}

function summarizeByProduct(rows: OutputCsvRow[]): SummaryByProduct {
  const summary: SummaryByProduct = new Map();
  for (const row of rows) {
    const current = summary.get(row.productId) ?? { rows: 0, totalWeight: 0 };
    current.rows += 1;
    current.totalWeight += row.totalWeight;
    summary.set(row.productId, current);
  }
  return summary;
}

function printSummaryByProduct(summary: SummaryByProduct) {
  console.log('\nFinal summary by productId:');
  const ordered = [...summary.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  for (const [productId, value] of ordered) {
    console.log(`  ${productId}: rows=${value.rows}, totalWeightKg=${value.totalWeight.toFixed(3)}`);
  }
}

function printSample<T>(title: string, rows: T[], limit: number, formatter: (row: T) => string) {
  if (rows.length === 0 || limit === 0) return;
  console.log(`\n${title} (showing up to ${Math.min(limit, rows.length)}):`);
  for (const row of rows.slice(0, limit)) {
    console.log(`  ${formatter(row)}`);
  }
}

function printList<T>(title: string, rows: T[], formatter: (row: T) => string) {
  if (rows.length === 0) return;
  console.log(`\n${title}:`);
  for (const row of rows) {
    console.log(`  ${formatter(row)}`);
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function buildImportPlan(options: CliOptions): Promise<ImportPlan> {
  if (!(await fileExists(options.productsFile))) {
    throw new Error(`Products CSV not found: ${options.productsFile}`);
  }
  if (!(await fileExists(options.outputsFile))) {
    throw new Error(`Outputs CSV not found: ${options.outputsFile}`);
  }

  const rawProductRows = await readCsvRows(options.productsFile);
  const rawOutputRows = await readCsvRows(options.outputsFile);

  const productRows = rawProductRows.map((row, index) => parseProductCsvRow(row, index + 2));
  const outputRows = rawOutputRows.map((row, index) => parseOutputCsvRow(row, index + 2));

  const duplicateProductIds = new Set<string>();
  const seenProductIds = new Set<string>();
  for (const row of productRows) {
    if (seenProductIds.has(row.id)) duplicateProductIds.add(row.id);
    seenProductIds.add(row.id);
  }
  if (duplicateProductIds.size > 0) {
    throw new Error(`Duplicate product IDs in historic_products_missing.csv: ${[...duplicateProductIds].sort().join(', ')}`);
  }

  const duplicateBatchIds = new Set<string>();
  const seenBatchIds = new Set<string>();
  for (const row of outputRows) {
    if (seenBatchIds.has(row.batchId)) duplicateBatchIds.add(row.batchId);
    seenBatchIds.add(row.batchId);
  }
  if (duplicateBatchIds.size > 0) {
    throw new Error(`Duplicate batch IDs in historic_output_entries.csv: ${[...duplicateBatchIds].sort().join(', ')}`);
  }

  const requiredProductIds = new Set(outputRows.map((row) => row.productId));
  const productSeedIds = new Set(productRows.map((row) => row.id));

  for (const row of outputRows) {
    if (row.requiresProductCreate && !productSeedIds.has(row.productId)) {
      throw new Error(`Output row batchId=${row.batchId} requires product creation but ${row.productId} is not present in historic_products_missing.csv`);
    }
  }

  const productLookupIds = [...new Set([...requiredProductIds, ...productRows.map((row) => row.id)])];

  const [existingProducts, existingOutputs] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: productLookupIds } }, select: { id: true } }),
    prisma.outputEntry.findMany({ where: { batchId: { in: outputRows.map((row) => row.batchId) } }, select: { batchId: true } }),
  ]);

  const existingProductIds = new Set(existingProducts.map((row) => row.id));
  const existingBatchIds = new Set(existingOutputs.map((row) => row.batchId));

  const productsToCreate = productRows.filter((row) => !existingProductIds.has(row.id));
  const productsSkippedExisting = productRows.filter((row) => existingProductIds.has(row.id));

  const finalProductIds = new Set([...existingProductIds, ...productsToCreate.map((row) => row.id)]);
  const unresolvedProductIds = [...requiredProductIds].filter((productId) => !finalProductIds.has(productId));
  if (unresolvedProductIds.length > 0) {
    throw new Error(`Output rows reference product IDs that do not exist after setup: ${unresolvedProductIds.sort().join(', ')}`);
  }

  const outputsToInsert = outputRows.filter((row) => !existingBatchIds.has(row.batchId));
  const outputsSkippedExisting = outputRows.filter((row) => existingBatchIds.has(row.batchId));

  return {
    productsToCreate,
    productsSkippedExisting,
    outputsToInsert,
    outputsSkippedExisting,
    finalSummary: summarizeByProduct(outputsToInsert),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  dotenv.config({ path: path.resolve(projectRoot, '.env') });
  dotenv.config({ path: path.resolve(projectRoot, 'nordic-backend/.env'), override: true });

  console.log('Historical output importer');
  console.log(`Mode: ${options.dryRun ? 'dry-run' : 'write'}`);
  console.log(`Products CSV: ${options.productsFile}`);
  console.log(`Outputs CSV: ${options.outputsFile}`);
  if (await fileExists(options.excludedFile)) {
    console.log(`Excluded audit CSV detected and intentionally ignored: ${options.excludedFile}`);
  }
  console.log('Warning: importing historical production without matching historical dispatch rows will increase on-screen stock.');

  const plan = await buildImportPlan(options);

  console.log('\nPlan summary:');
  console.log(`  Products to create: ${plan.productsToCreate.length}`);
  console.log(`  Products skipped (already exist): ${plan.productsSkippedExisting.length}`);
  console.log(`  Output rows to insert: ${plan.outputsToInsert.length}`);
  console.log(`  Output rows skipped (batchId already exists): ${plan.outputsSkippedExisting.length}`);
  console.log('  Rows failed validation: 0');

  printList('Products to create', plan.productsToCreate, (row) => `${row.id} -> ${row.name}`);
  printSample('Output rows skipped by existing batchId', plan.outputsSkippedExisting, options.sampleLimit, (row) => `${row.batchId} (${row.productId})`);

  if (options.dryRun) {
    printSummaryByProduct(plan.finalSummary);
    return;
  }

  const currentMaxSortOrder = await prisma.product.aggregate({ _max: { sortOrder: true } });
  const nextSortOrderStart = (currentMaxSortOrder._max.sortOrder ?? -1) + 1;

  if (plan.productsToCreate.length > 0) {
    await prisma.$transaction(
      plan.productsToCreate.map((product, index) => prisma.product.create({
        data: {
          id: product.id,
          name: product.name,
          details: product.details,
          defaultPalletWeight: product.defaultPalletWeight,
          defaultBagWeight: product.defaultBagWeight,
          proteinTargetPct: product.proteinTargetPct,
          yieldFactor: product.yieldFactor,
          sortOrder: nextSortOrderStart + index,
        },
      }))
    );
  }

  for (const batch of chunk(plan.outputsToInsert, options.batchSize)) {
    await prisma.$transaction(
      batch.map((row) => prisma.outputEntry.create({
        data: {
          productId: row.productId,
          batchId: row.batchId,
          packagingString: row.packagingString,
          destination: row.destination,
          timestamp: row.timestamp,
          pallets: row.pallets,
          bigBags: row.bigBags,
          tanks: row.tanks,
          totalWeight: row.totalWeight,
        },
      }))
    );
  }

  console.log('\nWrite complete.');
  console.log(`  Products created: ${plan.productsToCreate.length}`);
  console.log(`  Products skipped (already exist): ${plan.productsSkippedExisting.length}`);
  console.log(`  Output rows inserted: ${plan.outputsToInsert.length}`);
  console.log(`  Output rows skipped (batchId already exists): ${plan.outputsSkippedExisting.length}`);
  console.log('  Rows failed validation: 0');
  printSummaryByProduct(plan.finalSummary);
}

main()
  .catch((error) => {
    console.error('\nHistoric output import failed.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });