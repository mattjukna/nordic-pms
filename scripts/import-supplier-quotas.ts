#!/usr/bin/env tsx
/**
 * Import supplier monthly quotas from the Excel file "Pieno kvotos 2025-2026 m_.xlsx".
 *
 * Usage:
 *   npx tsx scripts/import-supplier-quotas.ts [path-to-xlsx]
 *
 * If no path is given, defaults to ../Pieno kvotos 2025-2026 m_.xlsx relative to project root.
 *
 * Column layout (Sheet "2025 m."):
 *   Col 0: Eil. Nr.
 *   Col 1: Supplier name
 *   Cols 2-25: paired (received_kg, quota_kg) for 2025-01 through 2025-12
 *   Cols 26-37: quota_kg only for 2026-01 through 2026-12
 *
 * Per user instruction: assume quota was fully reached for Jan–Mar 2026.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import prisma from '../services/prisma';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const DEFAULT_XLSX_PATH = path.resolve(projectRoot, '../Pieno kvotos 2025-2026 m_.xlsx');

// Normalize for fuzzy matching
const normalize = (s: string) => s.toLowerCase().replace(/["""'']/g, '').replace(/\s+/g, ' ').trim();

async function main() {
  const xlsxPath = process.argv[2] || DEFAULT_XLSX_PATH;
  console.log(`Reading Excel file: ${xlsxPath}`);

  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Fetch all suppliers from DB
  const dbSuppliers = await prisma.supplier.findMany({ select: { id: true, name: true } });
  console.log(`Found ${dbSuppliers.length} suppliers in database.`);

  const matchSupplier = (excelName: string) => {
    const norm = normalize(excelName);
    // Exact match first
    let match = dbSuppliers.find(s => normalize(s.name) === norm);
    if (match) return match;
    // Contains match
    match = dbSuppliers.find(s => normalize(s.name).includes(norm) || norm.includes(normalize(s.name)));
    if (match) return match;
    // Partial word match (at least 2 words)
    const words = norm.split(' ').filter(w => w.length > 2);
    match = dbSuppliers.find(s => {
      const sNorm = normalize(s.name);
      return words.filter(w => sNorm.includes(w)).length >= Math.min(2, words.length);
    });
    return match || null;
  };

  let totalUpserted = 0;
  let unmatched: string[] = [];

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row[1]) continue;

    const excelName = String(row[1]).trim();
    const supplier = matchSupplier(excelName);

    if (!supplier) {
      unmatched.push(excelName);
      continue;
    }

    console.log(`\n${excelName} → ${supplier.name} (${supplier.id})`);

    const quotas: { year: number; month: number; quotaKg: number; actualKg: number | null }[] = [];

    // 2025 months: cols 2-25, paired (received, quota) per month
    for (let m = 0; m < 12; m++) {
      const receivedCol = 2 + m * 2;      // even cols: received
      const quotaCol = 2 + m * 2 + 1;     // odd cols: quota
      const received = row[receivedCol];
      const quota = row[quotaCol];

      if (quota != null && Number.isFinite(Number(quota)) && Number(quota) > 0) {
        quotas.push({
          year: 2025,
          month: m + 1,
          quotaKg: Number(quota),
          actualKg: received != null && Number.isFinite(Number(received)) ? Number(received) : null,
        });
      }
    }

    // 2026 months: cols 26-37, quota only
    for (let m = 0; m < 12; m++) {
      const quotaCol = 26 + m;
      const quota = row[quotaCol];

      if (quota != null && Number.isFinite(Number(quota)) && Number(quota) > 0) {
        // User instruction: assume quota was reached for Jan-Mar 2026
        const actualKg = (m + 1) <= 3 ? Number(quota) : null;
        quotas.push({
          year: 2026,
          month: m + 1,
          quotaKg: Number(quota),
          actualKg,
        });
      }
    }

    // Upsert each quota
    for (const q of quotas) {
      await prisma.supplierQuota.upsert({
        where: {
          supplierId_year_month: {
            supplierId: supplier.id,
            year: q.year,
            month: q.month,
          },
        },
        create: {
          supplierId: supplier.id,
          year: q.year,
          month: q.month,
          quotaKg: q.quotaKg,
          actualKg: q.actualKg,
        },
        update: {
          quotaKg: q.quotaKg,
          actualKg: q.actualKg,
        },
      });
      totalUpserted++;
    }

    console.log(`  → ${quotas.length} quota records upserted`);
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total quota records upserted: ${totalUpserted}`);
  if (unmatched.length > 0) {
    console.log(`\nUnmatched suppliers (${unmatched.length}):`);
    unmatched.forEach(name => console.log(`  - ${name}`));
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
