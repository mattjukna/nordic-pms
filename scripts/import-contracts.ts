#!/usr/bin/env tsx
/**
 * Historical buyer contracts importer.
 *
 * Reads CSV files (converted from the "Contracts list.xlsx" 2025 & 2026 sheets)
 * and upserts BuyerContract rows, matching buyers by fuzzy name and products by
 * a mapping table.
 *
 * Usage:
 *   npx tsx scripts/import-contracts.ts --dry-run
 *   npx tsx scripts/import-contracts.ts
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import prisma from '../services/prisma';
import { normalizeWhitespace } from './import-companies.utils';

// ─── paths & env ────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.resolve(projectRoot, '.env') });
dotenv.config({ path: path.resolve(projectRoot, 'nordic-backend', '.env'), override: true });

// CSV files produced by xlsx→csv export of sheets "2025" and "2026"
const DEFAULT_CSV_DIR = 'C:\\Users\\MatasJukna\\Downloads';

// ─── CLI parsing ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

// ─── Product name → DB Product.id mapping ───────────────────────────
// Products in the Excel use display names; these map to the id used in the DB.
const PRODUCT_MAP: Record<string, string> = {
  'CREAM':            'CREAM',
  'MPC 85':           'MPC85',
  'MPC85':            'MPC85',
  'MPC 80':           'MPC80',
  'MPC 83':           'MPC83',
  'MPC 88':           'MPC88',
  'MPI':              'MPI',
  'MPI90':            'MPI',         // MPI90 maps to MPI in DB
  'SMP':              'SMP',
  'SMP ORGANIC':      'SMP_ORG',
  'SMC':              'PERM_CONC',    // SMC = Skimmed Milk Concentrate = Permeate Concentrate
  'PM15':             'PERM015',       // PM15 = Permeate 015
  'LIQUID PERMEATE':  'PERM_CONC',   // Liquid permeate → permeate concentrate
  'LIQUID MPC':       'MPC80',       // Liquid MPC → MPC80
  'WMP':              'WMP26',       // WMP → WMP 26/26
};

// ─── Buyer name aliases (Excel name → canonical DB name key) ────────
// These handle common short names and spelling variations in the Excel.
const BUYER_ALIASES: Record<string, string> = {
  'auga trade':               'auga trade',
  'target polska':            'target polska',
  'feed and food':            'feed & food',     // DB: "Feed & Food GmbH"
  'oberland':                 'milchproduktenhandel oberland', // DB: "Milchproduktenhandel Oberland eG"
  'lauingen':                 'molkereigesellschaft lauingen', // DB: "Molkereigesellschaft Lauingen mbH"
  'amsterdam ingredians':     'amsterdam ingredients',
  'hoogwegt milk':            'hoogwegt milk',
  'lotenika':                 'lotenika',
  'havero':                   'havero hoogwegt',
  'calls':                    'kallas papadopoulos',
  'kallas':                   'kallas papadopoulos',
  'hansa':                    'hansa food commodities',
  'cefetra':                  'cefetra polska',
  'farmi':                    'farmi piimatoostus',
  'fresena':                  'fresena salland',
  'marijampoles pk':          'marijampoles pieno konservai',
  'genba taste':              'genba taste',
  'pieno zvaigzdes':          'pieno zvaigzdes',
  'rokiskio pieno gamyba':    'rokiskio pieno gamyba',
  'vilkyskiu pienine':        'vilkyskiu pienine',
  'kelmes pienine':           'kelmes pienine',       // Not in DB — will skip
  'dsp plius':                'dsp plius',
  'portfolio':                'portfolio meno galerija',
  'rigoni di asiago':         'rigoni di asiago',
  'nikolaevmolprom':          'mykolaivmolprom',
  'taureco':                  'taureco commodity house',
  'milkpol':                  'milkpol polska',
};

// ─── helpers ────────────────────────────────────────────────────────
/** Strip diacritics: ė→e, š→s, ž→z, ū→u, etc. */
function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function nameKey(name: string): string {
  return stripDiacritics(name.trim().replace(/\s+/g, ' ').toLowerCase());
}

/**
 * Strip legal suffixes to get a naive "business key".
 */
function businessKey(name: string): string {
  return nameKey(name)
    .replace(/[.,]/g, '')
    .replace(/\b(uab|ab|sp\s*z\s*o\s*o|gmbh|bv|b\.?v\.?|as|s\.?a\.?|ae|ltd|llc|eg|srl|sp\s*j|vsi)\b/gi, '')
    .replace(/["""'']/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Extract the core contract number: first space-delimited token.
 * E.g. "P03/202501/001 P100148"  →  "P03/202501/001"
 */
function coreContractNumber(raw: string): string {
  return raw.trim().split(/\s+/)[0];
}

/**
 * Parse price string like "3000 EUR/MT" or "7.700 EUR/MT" → EUR per kg.
 * Prices are in EUR per metric ton (MT = 1000 kg).
 * Returns price per kg or null.
 */
function parsePricePerKg(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim();
  // Handle multi-price like "6600 EUR / MT +7150 EUR / MT" → take average
  if (s.includes('+')) {
    const parts = s.split('+').map(p => parsePricePerKg(p));
    const valid = parts.filter((p): p is number => p !== null);
    if (valid.length === 0) return null;
    return valid.reduce((a, b) => a + b, 0) / valid.length;
  }
  // Match number EUR/MT
  const m = s.match(/^([\d.,]+)\s*EUR\s*\/\s*MT$/i);
  if (!m) return null;
  // European decimal: "7.700" means 7700. But "3.25" could be ambiguous.
  // Convention: if 3 digits after the dot and no comma, likely thousands separator.
  let numStr = m[1].replace(/\s/g, '');
  // If has comma and dot: comma=thousands, dot=decimal (or vice versa)
  if (numStr.includes(',') && numStr.includes('.')) {
    // "1.234,56" → 1234.56
    numStr = numStr.replace(/\./g, '').replace(',', '.');
  } else if (numStr.includes(',')) {
    // "1,234" could be 1234 or 1.234.  But in EUR/MT context, prices are 100-10000.
    numStr = numStr.replace(',', '.');
  } else {
    // Only dot. "7.700" — if exactly 3 digits after dot and value > 1000 with dot, it's thousands separator
    const dotParts = numStr.split('.');
    if (dotParts.length === 2 && dotParts[1].length === 3 && Number(dotParts[0]) > 0) {
      // e.g. "7.700" → 7700, but "0.500" → 0.5
      // If first part > 0 and total would be > 100, treat dot as thousands separator
      const withDot = parseFloat(numStr);
      const withoutDot = parseFloat(numStr.replace('.', ''));
      // EUR/MT dairy prices are typically 100 - 15000, so withoutDot is likely correct
      if (withoutDot >= 100 && withoutDot <= 20000) {
        numStr = numStr.replace('.', '');
      }
    }
  }
  const eur = parseFloat(numStr);
  if (!Number.isFinite(eur) || eur <= 0) return null;
  // Convert EUR/MT to EUR/kg (÷ 1000)
  return eur / 1000;
}

/**
 * Parse quantity string like "45.000 KG" → kg.
 * European format: dots are thousands separators when 3 digits follow.
 */
function parseQuantityKg(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let s = raw.trim().replace(/\s*kg\s*$/i, '').trim();
  // Similar logic to price: handle European comma/dot
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes('.')) {
    const parts = s.split('.');
    if (parts.length === 2 && parts[1].length === 3) {
      // "45.000" → 45000, "7.995" → 7995 (probably)
      // All quantities in KG, so "45.000 KG" = 45000 kg makes sense
      s = s.replace('.', '');
    }
  }
  const kg = parseFloat(s);
  return Number.isFinite(kg) && kg > 0 ? kg : null;
}

/**
 * Convert ISO week number to a Date (Monday of that week).
 */
function weekToDate(year: number, week: number): Date {
  // Jan 4 is always in week 1 of ISO year
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7; // Mon=1..Sun=7
  const monday = new Date(jan4.getTime() + ((1 - dayOfWeek) + (week - 1) * 7) * 86400000);
  return monday;
}

/**
 * Parse date field to extract start & end DateTime.
 * Handles: "January of 2025", "06.01.2025", "January-February 2025",
 *          "week 23 of 2025", "week 27-31 of 2025",
 *          "19.05-31.05 and 01.06-13.06 of 2025", etc.
 */
function parseDateRange(raw: string | null | undefined, sheetYear: number): { start: Date; end: Date } | null {
  if (!raw) return null;
  const s = raw.trim();
  const lower = s.toLowerCase();

  let year = sheetYear;
  const yearMatch = lower.match(/\b(20\d{2})\b/);
  if (yearMatch) year = parseInt(yearMatch[1], 10);

  // ① DD.MM.YYYY specific date(s)
  const dateMatches = [...s.matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{4})/g)];
  if (dateMatches.length > 0) {
    const allDates = dateMatches.map(m => {
      const [, d, mo, y] = m;
      return new Date(Date.UTC(+y, +mo - 1, +d));
    }).filter(d => !isNaN(d.getTime()));
    if (allDates.length > 0) {
      allDates.sort((a, b) => a.getTime() - b.getTime());
      return { start: allDates[0], end: allDates[allDates.length - 1] };
    }
  }

  // ② DD.MM-DD.MM ranges like "19.05-31.05 and 01.06-13.06 of 2025"
  const rangeMatches = [...lower.matchAll(/(\d{1,2})\.(\d{1,2})\s*[-–]\s*(\d{1,2})\.(\d{1,2})/g)];
  if (rangeMatches.length > 0) {
    const allDates: Date[] = [];
    for (const m of rangeMatches) {
      allDates.push(new Date(Date.UTC(year, +m[2] - 1, +m[1])));
      allDates.push(new Date(Date.UTC(year, +m[4] - 1, +m[3])));
    }
    const valid = allDates.filter(d => !isNaN(d.getTime()));
    if (valid.length > 0) {
      valid.sort((a, b) => a.getTime() - b.getTime());
      return { start: valid[0], end: valid[valid.length - 1] };
    }
  }

  // ③ Week-based: "week 23 of 2025", "week 27-31 of 2025", "week 49 and week 02"
  const weekNums: number[] = [];
  // "week N" or "N week" or "week N-M"
  const weekPatterns = [
    /week\s+(\d{1,2})\s*[-–]\s*(\d{1,2})/gi,
    /week\s+(\d{1,2})/gi,
    /(\d{1,2})\s*(?:\/\d{1,2}\s*)?(?:and\s+\d{1,2}\s*(?:\/\d{1,2}\s*)?)?\s*week/gi,
  ];
  for (const pat of weekPatterns) {
    for (const m of lower.matchAll(pat)) {
      if (m[1]) weekNums.push(parseInt(m[1], 10));
      if (m[2]) weekNums.push(parseInt(m[2], 10));
    }
  }
  if (weekNums.length > 0) {
    const minWeek = Math.min(...weekNums);
    const maxWeek = Math.max(...weekNums);
    const start = weekToDate(year, minWeek);
    const endMonday = weekToDate(maxWeek < minWeek ? year + 1 : year, maxWeek);
    const end = new Date(endMonday.getTime() + 6 * 86400000); // Sunday of that week
    return { start, end };
  }

  // ④ Month names: "January of 2025", "March, April, May 2025", "January-February 2025"
  //    Also short forms: "Jan-Feb 2025"
  const MONTHS: Record<string, number> = {
    january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
    may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7,
    september: 8, sep: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
    feruary: 1, febraury: 1,
  };

  const foundMonths: number[] = [];
  for (const [name, idx] of Object.entries(MONTHS)) {
    // Use word boundary to avoid "mar" matching inside other words
    // Also handle missing-space typos like "ofAugust" or "Augustof"
    if (lower.includes(name)) foundMonths.push(idx);
  }

  if (foundMonths.length > 0) {
    const minMonth = Math.min(...foundMonths);
    const maxMonth = Math.max(...foundMonths);
    const start = new Date(Date.UTC(year, minMonth, 1));
    const end = new Date(Date.UTC(year, maxMonth + 1, 0)); // last day of max month
    return { start, end };
  }

  // ⑤ MM-MM.YYYY format like "09-11.2025" (month range)
  const monthRange = lower.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})\.(\d{4})$/);
  if (monthRange) {
    const m1 = parseInt(monthRange[1], 10);
    const m2 = parseInt(monthRange[2], 10);
    const y = parseInt(monthRange[3], 10);
    if (m1 >= 1 && m1 <= 12 && m2 >= 1 && m2 <= 12) {
      return { start: new Date(Date.UTC(y, m1 - 1, 1)), end: new Date(Date.UTC(y, m2, 0)) };
    }
  }

  // ⑥ (DD.MM) parenthesized date with year from context
  const parenDate = lower.match(/\((\d{1,2})\.(\d{1,2})\)/);
  if (parenDate) {
    const day = parseInt(parenDate[1], 10);
    const month = parseInt(parenDate[2], 10);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (!isNaN(d.getTime())) {
      const end = new Date(Date.UTC(year, month, 0));
      return { start: d, end };
    }
  }

  // ⑦ "Prompt" = immediate delivery, use sheet year Jan 1
  if (lower.includes('prompt')) {
    return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, 0, 31)) };
  }

  return null;
}

// ─── CSV parsing (simple, handles our converted format) ─────────────
function parseCsvLines(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let val = '';
  let inQ = false;
  const t = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    const nx = t[i + 1];
    if (ch === '"') {
      if (inQ && nx === '"') { val += '"'; i++; }
      else inQ = !inQ;
      continue;
    }
    if (!inQ && ch === ',') { cur.push(val); val = ''; continue; }
    if (!inQ && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && nx === '\n') i++;
      cur.push(val); val = '';
      if (cur.some(c => c.trim())) rows.push(cur);
      cur = [];
      continue;
    }
    val += ch;
  }
  cur.push(val);
  if (cur.some(c => c.trim())) rows.push(cur);
  return rows;
}

// ─── main ───────────────────────────────────────────────────────────
async function main() {
  console.log('Buyer contracts importer');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'WRITE'}`);

  // Read CSV files
  const fs = await import('fs/promises');
  const csvFiles = [
    { file: path.join(DEFAULT_CSV_DIR, 'contracts_2025.csv'), year: 2025 },
    { file: path.join(DEFAULT_CSV_DIR, 'contracts_2026.csv'), year: 2026 },
  ];

  type RawRow = {
    contractNo: string;
    product: string;
    quantity: string | null;
    buyer: string;
    loadingDate: string | null;
    price: string | null;
    year: number;
  };

  const rawRows: RawRow[] = [];
  for (const { file, year } of csvFiles) {
    const text = await fs.readFile(file, 'utf8');
    const lines = parseCsvLines(text);
    // Skip header
    for (let i = 1; i < lines.length; i++) {
      const r = lines[i];
      const contractNo = normalizeWhitespace(r[1]);
      const product = normalizeWhitespace(r[2]);
      const quantity = normalizeWhitespace(r[3]);
      const buyer = normalizeWhitespace(r[4]);
      const loadingDate = normalizeWhitespace(r[5]);
      const price = normalizeWhitespace(r[8]);
      if (!contractNo || !product || !buyer) continue;
      rawRows.push({ contractNo, product, quantity, buyer, loadingDate, price, year });
    }
  }
  console.log(`Parsed ${rawRows.length} contract rows from CSV.\n`);

  // ─── Load DB state ──────────────────────────────────────────────
  const dbBuyers = await prisma.buyer.findMany();
  const dbProducts = await prisma.product.findMany({ select: { id: true, name: true } });
  const dbContracts = await prisma.buyerContract.findMany({ select: { id: true, contractNumber: true, buyerId: true } });

  // Build buyer lookup maps
  const buyerByNameKey = new Map<string, typeof dbBuyers[0]>();
  const buyerByBizKey = new Map<string, typeof dbBuyers[0]>();
  for (const b of dbBuyers) {
    const nk = nameKey(b.name);
    buyerByNameKey.set(nk, b);
    const bk = businessKey(b.name);
    buyerByBizKey.set(bk, b);
  }

  // Build product lookup
  const productIds = new Set(dbProducts.map(p => p.id));

  // Build existing contract set for idempotency (buyerId + contractNumber)
  const existingContracts = new Set(
    dbContracts.map(c => `${c.buyerId}::${c.contractNumber}`)
  );

  // ─── Resolve rows ───────────────────────────────────────────────
  type ResolvedRow = {
    contractNumber: string;
    buyerId: string;
    buyerName: string;
    productId: string;
    pricePerKg: number;
    agreedAmountKg: number | null;
    startDate: Date;
    endDate: Date;
  };

  const resolved: ResolvedRow[] = [];
  const skippedBuyer: { buyer: string; contract: string }[] = [];
  const skippedProduct: { product: string; contract: string }[] = [];
  const skippedPrice: { price: string | null; contract: string }[] = [];
  const skippedDate: { date: string | null; contract: string }[] = [];
  const skippedDuplicate: string[] = [];
  const buyerMatches = new Map<string, { method: string; dbName: string }>();

  for (const row of rawRows) {
    const contractNumber = coreContractNumber(row.contractNo);

    // ── Resolve buyer ─────────────────────────────────────────
    const bKey = nameKey(row.buyer);
    let buyer: typeof dbBuyers[0] | undefined;
    let matchMethod = '';

    // 1. Direct name key match
    buyer = buyerByNameKey.get(bKey);
    if (buyer) matchMethod = 'name-key';

    // 2. Alias lookup
    if (!buyer) {
      const aliasTarget = BUYER_ALIASES[bKey];
      if (aliasTarget) {
        buyer = buyerByNameKey.get(aliasTarget) || buyerByBizKey.get(aliasTarget);
        if (buyer) matchMethod = 'alias';
      }
    }

    // 3. Business key match
    if (!buyer) {
      const biz = businessKey(row.buyer);
      buyer = buyerByBizKey.get(biz);
      if (buyer) matchMethod = 'biz-key';
    }

    // 4. Substring match (buyer name contains the search key or vice versa)
    if (!buyer) {
      for (const b of dbBuyers) {
        const dbNk = nameKey(b.name);
        const dbBk = businessKey(b.name);
        if (dbNk.includes(bKey) || bKey.includes(dbBk) || dbBk.includes(bKey)) {
          buyer = b;
          matchMethod = 'substring';
          break;
        }
      }
    }

    if (!buyer) {
      skippedBuyer.push({ buyer: row.buyer, contract: contractNumber });
      continue;
    }
    buyerMatches.set(bKey, { method: matchMethod, dbName: buyer.name });

    // ── Resolve product ───────────────────────────────────────
    const productKey = row.product.trim().toUpperCase();
    const productId = PRODUCT_MAP[productKey];
    if (!productId) {
      skippedProduct.push({ product: row.product, contract: contractNumber });
      continue;
    }
    // Ensure product exists in DB
    if (!productIds.has(productId)) {
      skippedProduct.push({ product: `${row.product} → ${productId} (not in DB)`, contract: contractNumber });
      continue;
    }

    // ── Parse price ───────────────────────────────────────────
    const pricePerKg = parsePricePerKg(row.price);
    if (pricePerKg === null) {
      skippedPrice.push({ price: row.price, contract: contractNumber });
      continue;
    }

    // ── Parse quantity ────────────────────────────────────────
    const agreedAmountKg = parseQuantityKg(row.quantity);

    // ── Parse dates ───────────────────────────────────────────
    const dateRange = parseDateRange(row.loadingDate, row.year);
    if (!dateRange) {
      skippedDate.push({ date: row.loadingDate, contract: contractNumber });
      continue;
    }

    // ── Check idempotency ─────────────────────────────────────
    const dedup = `${buyer.id}::${contractNumber}`;
    if (existingContracts.has(dedup)) {
      skippedDuplicate.push(contractNumber);
      continue;
    }

    // Prevent duplicates within this import batch
    if (resolved.some(r => r.buyerId === buyer!.id && r.contractNumber === contractNumber)) {
      skippedDuplicate.push(contractNumber);
      continue;
    }

    resolved.push({
      contractNumber,
      buyerId: buyer.id,
      buyerName: buyer.name,
      productId,
      pricePerKg,
      agreedAmountKg,
      startDate: dateRange.start,
      endDate: dateRange.end,
    });
  }

  // ─── Report ─────────────────────────────────────────────────────
  console.log('── Buyer resolution ───────────────────');
  const uniqueBuyers = [...buyerMatches.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  console.log(`  Matched buyers: ${uniqueBuyers.length}`);
  for (const [key, { method, dbName }] of uniqueBuyers) {
    console.log(`    ${key} → "${dbName}" [${method}]`);
  }

  if (skippedBuyer.length > 0) {
    const uniqueSkipped = [...new Set(skippedBuyer.map(s => s.buyer))];
    console.log(`  Unmatched buyers (${uniqueSkipped.length}):`);
    uniqueSkipped.forEach(b => console.log(`    ⚠ ${b}`));
  }

  console.log('\n── Product resolution ─────────────────');
  if (skippedProduct.length > 0) {
    const uniqueSkipped = [...new Set(skippedProduct.map(s => s.product))];
    console.log(`  Unmatched products (${uniqueSkipped.length}):`);
    uniqueSkipped.forEach(p => console.log(`    ⚠ ${p}`));
  } else {
    console.log('  All products resolved.');
  }

  if (skippedPrice.length > 0) {
    console.log(`\n── Skipped (unparseable price): ${skippedPrice.length}`);
    skippedPrice.slice(0, 10).forEach(s => console.log(`    ${s.contract}: "${s.price}"`));
  }

  if (skippedDate.length > 0) {
    console.log(`\n── Skipped (unparseable date): ${skippedDate.length}`);
    skippedDate.slice(0, 10).forEach(s => console.log(`    ${s.contract}: "${s.date}"`));
  }

  console.log(`\n── Contracts ──────────────────────────`);
  console.log(`  To insert:  ${resolved.length}`);
  console.log(`  Skipped (already exists): ${skippedDuplicate.length}`);
  console.log(`  Skipped (no buyer match): ${skippedBuyer.length}`);
  console.log(`  Skipped (no product):     ${skippedProduct.length}`);
  console.log(`  Skipped (no price):       ${skippedPrice.length}`);
  console.log(`  Skipped (no date):        ${skippedDate.length}`);

  // Summary by buyer
  const byBuyer = new Map<string, number>();
  for (const r of resolved) {
    byBuyer.set(r.buyerName, (byBuyer.get(r.buyerName) || 0) + 1);
  }
  console.log(`\n── Summary by buyer ───────────────────`);
  [...byBuyer.entries()].sort((a, b) => b[1] - a[1]).forEach(([name, count]) => {
    console.log(`  ${name}: ${count} contracts`);
  });

  if (dryRun) {
    console.log('\nDry-run complete. No changes written.');
    await prisma.$disconnect();
    return;
  }

  // ─── Write ──────────────────────────────────────────────────────
  console.log('\nWriting contracts…');
  let written = 0;
  for (const r of resolved) {
    await prisma.buyerContract.create({
      data: {
        contractNumber: r.contractNumber,
        pricePerKg: r.pricePerKg,
        agreedAmountKg: r.agreedAmountKg,
        startDate: r.startDate,
        endDate: r.endDate,
        buyerId: r.buyerId,
        productId: r.productId,
      },
    });
    written++;
    if (written % 50 === 0) console.log(`  written ${written}/${resolved.length}`);
  }
  console.log(`  written ${written}/${resolved.length}`);

  console.log(`\n── Write complete ─────────────────────`);
  console.log(`  Contracts inserted: ${written}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('FATAL:', err);
  await prisma.$disconnect();
  process.exit(1);
});
