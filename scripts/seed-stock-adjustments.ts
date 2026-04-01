#!/usr/bin/env tsx
/**
 * Seed initial stock adjustments to align calculated stock with real warehouse values.
 *
 * This script creates "initial_balance" type StockAdjustment records that correct
 * the ledger so that:   Stock = Produced - Shipped + Adjustments = Real Stock
 *
 * Usage:
 *   npx tsx scripts/seed-stock-adjustments.ts --dry-run
 *   npx tsx scripts/seed-stock-adjustments.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

import prisma from '../services/prisma';

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Real warehouse stock as provided by the user.
 * Format: { productId: { pallets, bigBags, tanks, looseKg, palletWeight, bagWeight } }
 * 
 * These are the ABSOLUTE target stock levels.  The script computes the current
 * ledger-derived stock and creates an adjustment = target − current.
 */
const REAL_STOCK: Record<string, {
  pallets: number;
  bigBags: number;
  tanks: number;
  looseKg: number;
  palletWeight: number;
  bagWeight: number;
}> = {
  MPC85: { pallets: 28, bigBags: 12, tanks: 0, looseKg: 570, palletWeight: 900, bagWeight: 850 },
  MPC83: { pallets: 0, bigBags: 30, tanks: 0, looseKg: 248, palletWeight: 900, bagWeight: 850 },
  MPC85_ORG: { pallets: 4, bigBags: 0, tanks: 0, looseKg: 480, palletWeight: 900, bagWeight: 850 },
  MPI:   { pallets: 16, bigBags: 0, tanks: 0, looseKg: 765, palletWeight: 900, bagWeight: 850 },
  SMP:   { pallets: 63, bigBags: 3, tanks: 0, looseKg: 650, palletWeight: 1000, bagWeight: 1000 },
  WMP26: { pallets: 2, bigBags: 0, tanks: 0, looseKg: 950, palletWeight: 1000, bagWeight: 1000 },
  PERM015: { pallets: 19, bigBags: 0, tanks: 0, looseKg: 350, palletWeight: 1000, bagWeight: 1000 },
};

async function main() {
  console.log(`\n=== Stock Adjustment Seeder ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

  // Fetch all products
  const products = await prisma.product.findMany();
  const productMap = new Map(products.map(p => [p.id, p]));

  // Fetch all output entries & dispatch entries to compute current ledger stock
  const outputEntries = await prisma.outputEntry.findMany();
  const dispatchEntries = await prisma.dispatchEntry.findMany({
    where: { status: { not: 'planned' } },
    include: { shipments: true },
  });

  // Fetch existing adjustments
  const existingAdjustments = await prisma.stockAdjustment.findMany();

  // Compute current ledger stock per product
  const ledger: Record<string, { producedKg: number; shippedKg: number; adjustedKg: number }> = {};
  for (const p of products) {
    ledger[p.id] = { producedKg: 0, shippedKg: 0, adjustedKg: 0 };
  }

  for (const o of outputEntries) {
    if (ledger[o.productId]) {
      ledger[o.productId].producedKg += o.totalWeight || 0;
    }
  }

  for (const d of dispatchEntries) {
    if (!ledger[d.productId]) continue;
    for (const s of (d.shipments || [])) {
      ledger[d.productId].shippedKg += s.quantityKg || 0;
    }
  }

  for (const a of existingAdjustments) {
    if (ledger[a.productId]) {
      ledger[a.productId].adjustedKg += a.adjustmentKg || 0;
    }
  }

  const adjustmentsToCreate: Array<{
    productId: string;
    adjustmentKg: number;
    pallets: number;
    bigBags: number;
    tanks: number;
    looseKg: number;
    reason: string;
    type: string;
    note: string;
  }> = [];

  // For each product with real stock data, compute the correction needed
  for (const [productId, real] of Object.entries(REAL_STOCK)) {
    const product = productMap.get(productId);
    if (!product) {
      console.warn(`⚠  Product ${productId} not found in database, skipping.`);
      continue;
    }

    const targetKg = (real.pallets * real.palletWeight) + (real.bigBags * real.bagWeight) + (real.tanks * 25000) + real.looseKg;
    const currentLedger = ledger[productId] || { producedKg: 0, shippedKg: 0, adjustedKg: 0 };
    const currentStockKg = currentLedger.producedKg - currentLedger.shippedKg + currentLedger.adjustedKg;
    const diffKg = targetKg - currentStockKg;

    console.log(`${product.name} (${productId}):`);
    console.log(`  Target: ${targetKg.toLocaleString()} kg (${real.pallets} pad + ${real.bigBags} bb + ${real.tanks} tank + ${real.looseKg} loose)`);
    console.log(`  Current ledger: ${currentStockKg.toLocaleString()} kg (produced ${currentLedger.producedKg.toLocaleString()} - shipped ${currentLedger.shippedKg.toLocaleString()} + adj ${currentLedger.adjustedKg.toLocaleString()})`);
    console.log(`  Correction needed: ${diffKg >= 0 ? '+' : ''}${diffKg.toLocaleString()} kg`);

    if (Math.abs(diffKg) < 1) {
      console.log(`  ✓ Already aligned, skipping.\n`);
      continue;
    }

    adjustmentsToCreate.push({
      productId,
      adjustmentKg: diffKg,
      pallets: real.pallets,
      bigBags: real.bigBags,
      tanks: real.tanks,
      looseKg: real.looseKg,
      reason: `Initial stock alignment: set warehouse to ${targetKg.toLocaleString()} kg (${real.pallets} pad + ${real.bigBags} bb + ${real.looseKg} loose kg)`,
      type: 'initial_balance',
      note: `Auto-seeded from real warehouse count`,
    });
    console.log('');
  }

  // For products NOT in REAL_STOCK that have negative or positive stock, optionally zero them out
  for (const product of products) {
    if (REAL_STOCK[product.id]) continue;
    const l = ledger[product.id];
    if (!l) continue;
    const currentStockKg = l.producedKg - l.shippedKg + l.adjustedKg;
    if (Math.abs(currentStockKg) > 1) {
      console.log(`${product.name} (${product.id}): current ledger ${currentStockKg.toLocaleString()} kg — no real stock data provided, leaving as-is.`);
    }
  }

  console.log(`\n${adjustmentsToCreate.length} adjustment(s) to create.`);

  if (DRY_RUN) {
    console.log('\n🏁 Dry run complete. No changes made.\n');
    await prisma.$disconnect();
    return;
  }

  // Create adjustments
  for (const adj of adjustmentsToCreate) {
    const created = await prisma.stockAdjustment.create({ data: adj });
    console.log(`  ✓ Created adjustment ${created.id} for ${adj.productId}: ${adj.adjustmentKg >= 0 ? '+' : ''}${adj.adjustmentKg.toLocaleString()} kg`);
  }

  console.log('\n✅ Done.\n');
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
