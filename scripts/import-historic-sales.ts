#!/usr/bin/env tsx
/**
 * Historical sales / dispatch importer.
 *
 * Usage:
 *   npm run import:historic-sales -- --dry-run
 *   npm run import:historic-sales
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

const DEFAULT_SALES_FILE = path.resolve(projectRoot, '../historic_sales_entries.csv');
const DEFAULT_BUYERS_FILE = path.resolve(projectRoot, '../historic_buyer_candidates.csv');
const DEFAULT_PRODUCTS_FILE = path.resolve(projectRoot, '../historic_sales_product_candidates.csv');
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_SAMPLE_LIMIT = 20;

// ─── types ──────────────────────────────────────────────────────────

type CliOptions = {
  salesFile: string;
  buyersFile: string;
  productsFile: string;
  dryRun: boolean;
  batchSize: number;
  sampleLimit: number;
  help: boolean;
};

type BuyerCandidateCsv = {
  buyerNameCanonical: string;
  buyerNameStrictKey: string;
  buyerBusinessKey: string;
  buyerCompanyCodes: string[];  // all codes merged
  buyerSeedHintName: string;
  buyerSeedHintCompanyCode: string;
};

type ProductCandidateCsv = {
  id: string;
  name: string;
  details: string;
  defaultPalletWeight: number;
  defaultBagWeight: number;
  proteinTargetPct: number;
  yieldFactor: number;
};

type SalesCsvRow = {
  dispatchDate: Date;
  documentNumber: string;
  buyerCompanyCodeRaw: string;
  buyerNameCanonical: string;
  buyerNameStrictKey: string;
  buyerBusinessKey: string;
  resolvedProductId: string;
  resolvedProductName: string;
  productCreateOnlyIfMissing: boolean;
  quantityKg: number;
  salesPricePerKg: number;
  totalRevenueEur: number;
  status: string;
  packagingString: string;
  legacyBatchRefId: string;
  importNote: string;
};

type ResolvedBuyer = {
  id: string;
  name: string;
  matchMethod: 'vat-code' | 'strict-name' | 'business-key' | 'created';
};

type BuyerPlan = {
  resolved: Map<string, ResolvedBuyer>;      // keyed by buyerBusinessKey
  toCreate: BuyerCandidateCsv[];
  codeAppends: Array<{ buyerId: string; buyerName: string; newCode: string }>;
  ambiguous: Array<{ key: string; reason: string }>;
};

type ProductPlan = {
  existingIds: Set<string>;
  toCreate: ProductCandidateCsv[];
};

type ImportPlan = {
  buyerPlan: BuyerPlan;
  productPlan: ProductPlan;
  dispatchToInsert: SalesCsvRow[];
  dispatchSkipped: SalesCsvRow[];
  skippedAmbiguousBuyer: SalesCsvRow[];
  skippedMissingProduct: SalesCsvRow[];
};

// ─── CLI ────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    salesFile: DEFAULT_SALES_FILE,
    buyersFile: DEFAULT_BUYERS_FILE,
    productsFile: DEFAULT_PRODUCTS_FILE,
    dryRun: false,
    batchSize: DEFAULT_BATCH_SIZE,
    sampleLimit: DEFAULT_SAMPLE_LIMIT,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') { options.dryRun = true; continue; }
    if (arg === '--help' || arg === '-h') { options.help = true; continue; }
    if (arg === '--sales-file') { options.salesFile = resolvePath(argv[++i]); continue; }
    if (arg === '--buyers-file') { options.buyersFile = resolvePath(argv[++i]); continue; }
    if (arg === '--products-file') { options.productsFile = resolvePath(argv[++i]); continue; }
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
  console.log(`Historical sales / dispatch importer

Usage:
  npm run import:historic-sales -- [options]

Options:
  --dry-run                Preview changes without writing
  --sales-file <path>      Path to historic_sales_entries.csv
  --buyers-file <path>     Path to historic_buyer_candidates.csv
  --products-file <path>   Path to historic_sales_product_candidates.csv
  --batch-size <n>         Rows per write transaction (default: ${DEFAULT_BATCH_SIZE})
  --sample-limit <n>       Preview rows to print (default: ${DEFAULT_SAMPLE_LIMIT})
  --help                   Show this help text
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

function reqDate(raw: string | undefined, label: string, file: string, row: number): Date {
  const v = reqStr(raw, label, file, row);
  const d = new Date(v + 'T12:00:00.000Z');
  if (Number.isNaN(d.getTime())) throw err(file, row, `Invalid date for ${label}: ${v}`);
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

// ─── buyer normalisation ────────────────────────────────────────────

/**
 * Expand the semicolon-separated companyCode field into uppercase trimmed codes.
 */
function expandCodes(companyCode: string | null | undefined): string[] {
  if (!companyCode) return [];
  return companyCode.split(/[;|]/).map((c) => c.trim().toUpperCase()).filter(Boolean);
}

/**
 * Build a strict name key: lowercase, collapse whitespace, strip quotes/punctuation.
 */
function strictNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/["'""„«»]/g, '')
    .replace(/[.,;:()\-\/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const LEGAL_TOKENS_BUYER = /\b(UAB|AB|ZUB|ZUK|SIA|SP\s*Z\s*O\s*O|SP\s*J|LTD|B\s*V|GMBH|AS|S\s*A|SRL|S\.?R\.?L|EG|MBH|LCC|VSI|I\s*I|KOOP\s*BENDR|KOOPERATYVAS)\b/gi;

/**
 * Build a "business key" — normalised name with legal form tokens removed (fallback matching).
 */
function businessKey(name: string): string {
  let key = strictNameKey(name);
  key = key.replace(LEGAL_TOKENS_BUYER, ' ');
  key = key.replace(/\s+/g, ' ').trim();
  return key;
}

// ─── CSV row parsers ────────────────────────────────────────────────

const SALES_LABEL = 'historic_sales_entries.csv';
const BUYERS_LABEL = 'historic_buyer_candidates.csv';
const PRODUCTS_LABEL = 'historic_sales_product_candidates.csv';

function parseBuyerCandidateRow(row: Record<string, string>, n: number): BuyerCandidateCsv {
  return {
    buyerNameCanonical: reqStr(row.buyer_name_canonical, 'buyer_name_canonical', BUYERS_LABEL, n),
    buyerNameStrictKey: reqStr(row.buyer_name_strict_key, 'buyer_name_strict_key', BUYERS_LABEL, n),
    buyerBusinessKey: reqStr(row.buyer_business_key, 'buyer_business_key', BUYERS_LABEL, n),
    buyerCompanyCodes: (row.buyer_company_codes ?? '')
      .split(/[;|]/)
      .map((c) => c.trim())
      .filter(Boolean),
    buyerSeedHintName: normalizeWhitespace(row.buyer_seed_hint_name) ?? '',
    buyerSeedHintCompanyCode: normalizeWhitespace(row.buyer_seed_hint_company_code) ?? '',
  };
}

function parseProductCandidateRow(row: Record<string, string>, n: number): ProductCandidateCsv {
  return {
    id: reqStr(row.id, 'id', PRODUCTS_LABEL, n),
    name: reqStr(row.name, 'name', PRODUCTS_LABEL, n),
    details: normalizeWhitespace(row.details) ?? '',
    defaultPalletWeight: reqNum(row.defaultPalletWeight, 'defaultPalletWeight', PRODUCTS_LABEL, n),
    defaultBagWeight: reqNum(row.defaultBagWeight, 'defaultBagWeight', PRODUCTS_LABEL, n),
    proteinTargetPct: reqNum(row.proteinTargetPct, 'proteinTargetPct', PRODUCTS_LABEL, n),
    yieldFactor: reqNum(row.yieldFactor, 'yieldFactor', PRODUCTS_LABEL, n),
  };
}

function parseSalesCsvRow(row: Record<string, string>, n: number): SalesCsvRow {
  return {
    dispatchDate: reqDate(row.dispatch_date, 'dispatch_date', SALES_LABEL, n),
    documentNumber: reqStr(row.document_number, 'document_number', SALES_LABEL, n),
    buyerCompanyCodeRaw: reqStr(row.buyer_company_code_raw, 'buyer_company_code_raw', SALES_LABEL, n),
    buyerNameCanonical: reqStr(row.buyer_name_canonical, 'buyer_name_canonical', SALES_LABEL, n),
    buyerNameStrictKey: reqStr(row.buyer_name_strict_key, 'buyer_name_strict_key', SALES_LABEL, n),
    buyerBusinessKey: reqStr(row.buyer_business_key, 'buyer_business_key', SALES_LABEL, n),
    resolvedProductId: reqStr(row.resolved_product_id, 'resolved_product_id', SALES_LABEL, n),
    resolvedProductName: reqStr(row.resolved_product_name, 'resolved_product_name', SALES_LABEL, n),
    productCreateOnlyIfMissing: parseBool(row.product_create_only_if_missing, false),
    quantityKg: reqNum(row.quantity_kg, 'quantity_kg', SALES_LABEL, n),
    salesPricePerKg: reqNum(row.sales_price_per_kg, 'sales_price_per_kg', SALES_LABEL, n),
    totalRevenueEur: reqNum(row.total_revenue_eur, 'total_revenue_eur', SALES_LABEL, n),
    status: normalizeWhitespace(row.status) ?? 'completed',
    packagingString: normalizeWhitespace(row.packaging_string) ?? '',
    legacyBatchRefId: reqStr(row.legacy_batch_ref_id, 'legacy_batch_ref_id', SALES_LABEL, n),
    importNote: normalizeWhitespace(row.import_note) ?? '',
  };
}

// ─── buyer resolution ───────────────────────────────────────────────

async function resolveBuyers(
  salesRows: SalesCsvRow[],
  buyerCandidates: Map<string, BuyerCandidateCsv>,
): Promise<BuyerPlan> {
  const dbBuyers = await prisma.buyer.findMany({
    select: { id: true, name: true, companyCode: true },
  });

  type DbBuyer = (typeof dbBuyers)[number];
  const codeMap = new Map<string, DbBuyer>();
  const strictNameMap = new Map<string, DbBuyer>();
  const bizKeyMap = new Map<string, DbBuyer[]>(); // may have collisions

  for (const b of dbBuyers) {
    for (const code of expandCodes(b.companyCode)) {
      codeMap.set(code, b);
    }
    const snk = strictNameKey(b.name);
    if (snk) strictNameMap.set(snk, b);
    const bk = businessKey(b.name);
    if (bk) {
      const existing = bizKeyMap.get(bk) ?? [];
      existing.push(b);
      bizKeyMap.set(bk, existing);
    }
  }

  // Collect unique buyer business keys needed
  const neededBizKeys = new Set(salesRows.map((r) => r.buyerBusinessKey));

  const resolved = new Map<string, ResolvedBuyer>();
  const toCreate: BuyerCandidateCsv[] = [];
  const codeAppends: BuyerPlan['codeAppends'] = [];
  const ambiguous: BuyerPlan['ambiguous'] = [];

  // Track which DB buyer IDs have been resolved to avoid double-creating
  const resolvedDbIds = new Set<string>();

  for (const bizKey of neededBizKeys) {
    // Collect all company codes from sales rows for this business key
    const codesForKey = new Set<string>();
    const strictKeys = new Set<string>();
    for (const row of salesRows) {
      if (row.buyerBusinessKey === bizKey) {
        codesForKey.add(row.buyerCompanyCodeRaw.trim().toUpperCase());
        strictKeys.add(row.buyerNameStrictKey);
      }
    }

    // Also add codes from buyer candidates CSV
    const candidate = buyerCandidates.get(bizKey);
    if (candidate) {
      for (const c of candidate.buyerCompanyCodes) codesForKey.add(c.trim().toUpperCase());
    }

    let matched: DbBuyer | undefined;
    let method: ResolvedBuyer['matchMethod'] = 'vat-code';

    // Step 1: match by company/VAT code
    for (const code of codesForKey) {
      const found = codeMap.get(code);
      if (found) { matched = found; break; }
    }

    // Step 2: match by strict name key
    if (!matched) {
      for (const snk of strictKeys) {
        const found = strictNameMap.get(snk);
        if (found) { matched = found; method = 'strict-name'; break; }
      }
    }

    // Step 3: match by business key (only if single unambiguous hit)
    if (!matched) {
      const hits = bizKeyMap.get(bizKey);
      if (hits && hits.length === 1) {
        matched = hits[0];
        method = 'business-key';
      } else if (hits && hits.length > 1) {
        ambiguous.push({ key: bizKey, reason: `Multiple DB buyers match business key: ${hits.map((h) => h.name).join(', ')}` });
        continue;
      }
    }

    if (matched) {
      resolved.set(bizKey, {
        id: matched.id,
        name: matched.name,
        matchMethod: method,
      });
      resolvedDbIds.add(matched.id);

      // Check if any codes need appending
      const existingCodes = new Set(expandCodes(matched.companyCode));
      for (const code of codesForKey) {
        if (code && !existingCodes.has(code)) {
          codeAppends.push({ buyerId: matched.id, buyerName: matched.name, newCode: code });
        }
      }
    } else if (candidate) {
      toCreate.push(candidate);
    } else {
      ambiguous.push({ key: bizKey, reason: 'No VAT/name match and no candidate CSV row' });
    }
  }

  return { resolved, toCreate, codeAppends, ambiguous };
}

// ─── product resolution ─────────────────────────────────────────────

async function resolveProducts(
  salesRows: SalesCsvRow[],
  productCandidates: Map<string, ProductCandidateCsv>,
): Promise<ProductPlan> {
  const neededIds = new Set(salesRows.map((r) => r.resolvedProductId));
  const dbProducts = await prisma.product.findMany({
    where: { id: { in: [...neededIds] } },
    select: { id: true },
  });
  const existingIds = new Set(dbProducts.map((p) => p.id));

  const toCreate: ProductCandidateCsv[] = [];
  const seen = new Set<string>();
  for (const pid of neededIds) {
    if (existingIds.has(pid) || seen.has(pid)) continue;
    const candidate = productCandidates.get(pid);
    if (candidate) {
      toCreate.push(candidate);
      seen.add(pid);
    }
  }

  return { existingIds, toCreate };
}

// ─── import plan ────────────────────────────────────────────────────

async function buildImportPlan(
  salesRows: SalesCsvRow[],
  buyerCandidates: Map<string, BuyerCandidateCsv>,
  productCandidates: Map<string, ProductCandidateCsv>,
): Promise<ImportPlan> {
  const buyerPlan = await resolveBuyers(salesRows, buyerCandidates);
  const productPlan = await resolveProducts(salesRows, productCandidates);

  // Ambiguous buyer business keys
  const ambiguousBuyerKeys = new Set(buyerPlan.ambiguous.map((a) => a.key));
  // Future product IDs (existing + to-create)
  const futureProductIds = new Set([
    ...productPlan.existingIds,
    ...productPlan.toCreate.map((p) => p.id),
  ]);
  // Buyer keys that will be resolved (existing + to-create)
  const toCreateBuyerKeys = new Set(buyerPlan.toCreate.map((c) => c.buyerBusinessKey));

  // Idempotency: check existing batchRefIds
  const allBatchRefs = salesRows.map((r) => r.legacyBatchRefId);
  const existingDispatches = await prisma.dispatchEntry.findMany({
    where: { batchRefId: { in: allBatchRefs } },
    select: { batchRefId: true },
  });
  const existingBatchRefs = new Set(existingDispatches.map((d) => d.batchRefId));

  const dispatchToInsert: SalesCsvRow[] = [];
  const dispatchSkipped: SalesCsvRow[] = [];
  const skippedAmbiguousBuyer: SalesCsvRow[] = [];
  const skippedMissingProduct: SalesCsvRow[] = [];

  for (const row of salesRows) {
    // Already imported?
    if (existingBatchRefs.has(row.legacyBatchRefId)) {
      dispatchSkipped.push(row);
      continue;
    }
    // Buyer ambiguous?
    if (ambiguousBuyerKeys.has(row.buyerBusinessKey)) {
      skippedAmbiguousBuyer.push(row);
      continue;
    }
    // Buyer resolvable?
    if (!buyerPlan.resolved.has(row.buyerBusinessKey) && !toCreateBuyerKeys.has(row.buyerBusinessKey)) {
      skippedAmbiguousBuyer.push(row);
      continue;
    }
    // Product resolvable?
    if (!futureProductIds.has(row.resolvedProductId)) {
      skippedMissingProduct.push(row);
      continue;
    }
    dispatchToInsert.push(row);
  }

  return {
    buyerPlan,
    productPlan,
    dispatchToInsert,
    dispatchSkipped,
    skippedAmbiguousBuyer,
    skippedMissingProduct,
  };
}

// ─── write logic ────────────────────────────────────────────────────

async function writeBuyers(plan: BuyerPlan): Promise<Map<string, ResolvedBuyer>> {
  const resolved = new Map(plan.resolved);

  for (const candidate of plan.toCreate) {
    const allCodes = [...new Set(candidate.buyerCompanyCodes.map((c) => c.trim()).filter(Boolean))];
    const companyCodeStr = allCodes.join('; ');

    const created = await prisma.buyer.create({
      data: {
        name: candidate.buyerNameCanonical,
        companyCode: companyCodeStr || null,
      },
    });

    resolved.set(candidate.buyerBusinessKey, {
      id: created.id,
      name: created.name,
      matchMethod: 'created',
    });
  }

  // Append missing codes to existing buyers
  for (const append of plan.codeAppends) {
    const current = await prisma.buyer.findUnique({
      where: { id: append.buyerId },
      select: { companyCode: true },
    });
    if (!current) continue;
    const existingCodes = expandCodes(current.companyCode);
    if (existingCodes.includes(append.newCode.toUpperCase())) continue;
    const updated = [...existingCodes, append.newCode.toUpperCase()].join('; ');
    await prisma.buyer.update({
      where: { id: append.buyerId },
      data: { companyCode: updated },
    });
  }

  return resolved;
}

async function writeProducts(plan: ProductPlan): Promise<void> {
  if (plan.toCreate.length === 0) return;

  const maxSort = await prisma.product.aggregate({ _max: { sortOrder: true } });
  const nextSort = (maxSort._max.sortOrder ?? -1) + 1;

  await prisma.$transaction(
    plan.toCreate.map((p, i) =>
      prisma.product.create({
        data: {
          id: p.id,
          name: p.name,
          details: p.details || undefined,
          defaultPalletWeight: p.defaultPalletWeight,
          defaultBagWeight: p.defaultBagWeight,
          proteinTargetPct: p.proteinTargetPct,
          yieldFactor: p.yieldFactor,
          sortOrder: nextSort + i,
        },
      })
    ),
  );
}

async function writeDispatches(
  rows: SalesCsvRow[],
  resolvedBuyers: Map<string, ResolvedBuyer>,
  batchSize: number,
) {
  const batches = chunk(rows, batchSize);
  let written = 0;

  for (const batch of batches) {
    await prisma.$transaction(
      batch.map((row) => {
        const buyer = resolvedBuyers.get(row.buyerBusinessKey);
        if (!buyer) throw new Error(`BUG: no resolved buyer for ${row.buyerBusinessKey}`);

        return prisma.dispatchEntry.create({
          data: {
            date: row.dispatchDate,
            buyerId: buyer.id,
            buyerName: buyer.name,
            buyerCompanyCode: row.buyerCompanyCodeRaw,
            contractNumber: null,
            productId: row.resolvedProductId,
            quantityKg: row.quantityKg,
            orderedQuantityKg: row.quantityKg,
            batchRefId: row.legacyBatchRefId,
            packagingString: row.packagingString || null,
            pallets: 0,
            bigBags: 0,
            tanks: 0,
            totalWeight: row.quantityKg,
            salesPricePerKg: row.salesPricePerKg,
            totalRevenue: row.totalRevenueEur,
            status: 'completed',
          },
        });
      }),
    );
    written += batch.length;
    process.stdout.write(`  written ${written}/${rows.length}\r`);
  }
  console.log();
}

// ─── printing ───────────────────────────────────────────────────────

function printPlanSummary(plan: ImportPlan, sampleLimit: number) {
  const bp = plan.buyerPlan;
  const pp = plan.productPlan;

  console.log('\n── Buyer resolution ───────────────────');
  console.log(`  Matched existing buyers: ${bp.resolved.size}`);
  for (const [key, b] of bp.resolved) {
    console.log(`    ${key} → "${b.name}" [${b.matchMethod}]`);
  }
  console.log(`  Buyers to create: ${bp.toCreate.length}`);
  for (const c of bp.toCreate) {
    console.log(`    ${c.buyerBusinessKey} → "${c.buyerNameCanonical}" (codes: ${c.buyerCompanyCodes.join(', ')})`);
  }
  console.log(`  Company code appends: ${bp.codeAppends.length}`);
  for (const a of bp.codeAppends) {
    console.log(`    buyer "${a.buyerName}" ← add code ${a.newCode}`);
  }
  if (bp.ambiguous.length > 0) {
    console.log(`  Ambiguous (BLOCKING): ${bp.ambiguous.length}`);
    for (const a of bp.ambiguous) console.log(`    ${a.key}: ${a.reason}`);
  }

  console.log('\n── Product resolution ─────────────────');
  console.log(`  Existing products used: ${pp.existingIds.size}`);
  console.log(`  Products to create: ${pp.toCreate.length}`);
  for (const p of pp.toCreate) {
    console.log(`    ${p.id} → "${p.name}"`);
  }

  console.log('\n── Dispatch rows ──────────────────────');
  console.log(`  Rows to insert: ${plan.dispatchToInsert.length}`);
  console.log(`  Rows skipped (batchRefId exists): ${plan.dispatchSkipped.length}`);
  console.log(`  Rows skipped (ambiguous buyer): ${plan.skippedAmbiguousBuyer.length}`);
  console.log(`  Rows skipped (missing product): ${plan.skippedMissingProduct.length}`);

  if (plan.dispatchSkipped.length > 0 && sampleLimit > 0) {
    console.log(`\n  Skipped samples (up to ${Math.min(sampleLimit, plan.dispatchSkipped.length)}):`);
    for (const r of plan.dispatchSkipped.slice(0, sampleLimit)) {
      console.log(`    ${r.legacyBatchRefId}`);
    }
  }

  // Totals
  const totalQty = plan.dispatchToInsert.reduce((s, r) => s + r.quantityKg, 0);
  const totalRev = plan.dispatchToInsert.reduce((s, r) => s + r.totalRevenueEur, 0);
  console.log('\n── Totals for rows to insert ──────────');
  console.log(`  Total quantity: ${totalQty.toFixed(2)} kg`);
  console.log(`  Total revenue:  ${totalRev.toFixed(2)} EUR`);

  // Summary by buyer
  console.log('\n── Summary by buyer ───────────────────');
  const byBuyer = new Map<string, { rows: number; qty: number; rev: number }>();
  for (const row of plan.dispatchToInsert) {
    const cur = byBuyer.get(row.buyerBusinessKey) ?? { rows: 0, qty: 0, rev: 0 };
    cur.rows += 1;
    cur.qty += row.quantityKg;
    cur.rev += row.totalRevenueEur;
    byBuyer.set(row.buyerBusinessKey, cur);
  }
  for (const [key, v] of [...byBuyer.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${key}: rows=${v.rows}, qty=${v.qty.toFixed(2)} kg, rev=${v.rev.toFixed(2)} EUR`);
  }
}

// ─── main ───────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { printHelp(); return; }

  dotenv.config({ path: path.resolve(projectRoot, '.env') });
  dotenv.config({ path: path.resolve(projectRoot, 'nordic-backend/.env'), override: true });

  console.log('Historical sales / dispatch importer');
  console.log(`Mode: ${options.dryRun ? 'DRY-RUN' : 'WRITE'}`);
  console.log(`Sales CSV:    ${options.salesFile}`);
  console.log(`Buyers CSV:   ${options.buyersFile}`);
  console.log(`Products CSV: ${options.productsFile}`);

  if (!(await fileExists(options.salesFile))) throw new Error(`Sales CSV not found: ${options.salesFile}`);
  if (!(await fileExists(options.buyersFile))) throw new Error(`Buyers CSV not found: ${options.buyersFile}`);
  if (!(await fileExists(options.productsFile))) throw new Error(`Products CSV not found: ${options.productsFile}`);

  // Parse CSVs
  const rawSales = await readCsvRows(options.salesFile);
  const rawBuyers = await readCsvRows(options.buyersFile);
  const rawProducts = await readCsvRows(options.productsFile);

  console.log(`Parsed ${rawSales.length} sales rows, ${rawBuyers.length} buyer candidates, ${rawProducts.length} product candidates.`);

  const salesRows = rawSales.map((r, i) => parseSalesCsvRow(r, i + 2));

  const buyerCandidates = new Map<string, BuyerCandidateCsv>();
  for (let i = 0; i < rawBuyers.length; i++) {
    const c = parseBuyerCandidateRow(rawBuyers[i], i + 2);
    buyerCandidates.set(c.buyerBusinessKey, c);
  }

  const productCandidates = new Map<string, ProductCandidateCsv>();
  for (let i = 0; i < rawProducts.length; i++) {
    const c = parseProductCandidateRow(rawProducts[i], i + 2);
    productCandidates.set(c.id, c);
  }

  // Check for duplicate batch ref IDs
  const seenRefs = new Set<string>();
  const dupRefs = new Set<string>();
  for (const r of salesRows) {
    if (seenRefs.has(r.legacyBatchRefId)) dupRefs.add(r.legacyBatchRefId);
    seenRefs.add(r.legacyBatchRefId);
  }
  if (dupRefs.size > 0) {
    throw new Error(`Duplicate legacy_batch_ref_id values: ${[...dupRefs].slice(0, 10).join(', ')}`);
  }

  // Build plan
  const plan = await buildImportPlan(salesRows, buyerCandidates, productCandidates);
  printPlanSummary(plan, options.sampleLimit);

  if (options.dryRun) {
    console.log('\nDry-run complete. No changes written.');
    return;
  }

  // Write
  console.log('\nWriting products…');
  await writeProducts(plan.productPlan);

  console.log('Writing buyers…');
  const resolvedBuyers = await writeBuyers(plan.buyerPlan);

  console.log('Writing dispatch rows…');
  await writeDispatches(plan.dispatchToInsert, resolvedBuyers, options.batchSize);

  const totalQty = plan.dispatchToInsert.reduce((s, r) => s + r.quantityKg, 0);
  const totalRev = plan.dispatchToInsert.reduce((s, r) => s + r.totalRevenueEur, 0);

  console.log('\n── Write complete ─────────────────────');
  console.log(`  Products created:  ${plan.productPlan.toCreate.length}`);
  console.log(`  Buyers created:    ${plan.buyerPlan.toCreate.length}`);
  console.log(`  Code appends:      ${plan.buyerPlan.codeAppends.length}`);
  console.log(`  Dispatches inserted: ${plan.dispatchToInsert.length}`);
  console.log(`  Dispatches skipped:  ${plan.dispatchSkipped.length}`);
  console.log(`  Total quantity: ${totalQty.toFixed(2)} kg`);
  console.log(`  Total revenue:  ${totalRev.toFixed(2)} EUR`);
}

main()
  .catch((error) => {
    console.error('\nHistorical sales import failed.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
