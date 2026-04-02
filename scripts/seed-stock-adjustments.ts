#!/usr/bin/env tsx
/**
 * Seed initial stock adjustments to set the baseline stock levels.
 *
 * This script creates "initial_balance" type StockAdjustment records that act as
 * RESET POINTS in the stock calculation.  All production/shipments before the
 * reset timestamp are ignored; the initial_balance values become the starting inventory.
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
 * Real warehouse stock as provided by the user (2026-04-02).
 * These are ABSOLUTE stock levels — the initial_balance acts as a reset point
 * in the stock calculation (all production/shipments before it are ignored).
 */
const REAL_STOCK: Record<string, {
  pallets: number;
  bigBags: number;
  tanks: number;
  looseKg: number;
  palletWeight: number;
  bagWeight: number;
}> = {
  MPC85: { pallets: 35, bigBags: 12, tanks: 0, looseKg: 0, palletWeight: 900, bagWeight: 850 },
  MPC83: { pallets: 0, bigBags: 30, tanks: 0, looseKg: 248, palletWeight: 900, bagWeight: 850 },
  MPC85_ORG: { pallets: 4, bigBags: 0, tanks: 0, looseKg: 480, palletWeight: 900, bagWeight: 850 },
  MPI:   { pallets: 16, bigBags: 0, tanks: 0, looseKg: 765, palletWeight: 900, bagWeight: 850 },
  SMP:   { pallets: 63, bigBags: 3, tanks: 0, looseKg: 650, palletWeight: 1000, bagWeight: 1000 },
  WMP26: { pallets: 2, bigBags: 0, tanks: 0, looseKg: 950, palletWeight: 1000, bagWeight: 1000 },
  PERM015: { pallets: 19, bigBags: 0, tanks: 0, looseKg: 350, palletWeight: 1000, bagWeight: 1000 },
};;

async function main() {
  console.log(`\n=== Stock Adjustment Seeder ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

  // Fetch all products
  const products = await prisma.product.findMany();
  const productMap = new Map(products.map(p => [p.id, p]));

  // Fetch existing initial_balance adjustments to clean up
  const existingIBs = await prisma.stockAdjustment.findMany({ where: { type: 'initial_balance' } });

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

  // For each product with real stock data, create an initial_balance reset entry
  for (const [productId, real] of Object.entries(REAL_STOCK)) {
    const product = productMap.get(productId);
    if (!product) {
      console.warn(`⚠  Product ${productId} not found in database, skipping.`);
      continue;
    }

    const totalKg = (real.pallets * real.palletWeight) + (real.bigBags * real.bagWeight) + (real.tanks * 25000) + real.looseKg;

    console.log(`${product.name} (${productId}):`);
    console.log(`  Stock: ${totalKg.toLocaleString()} kg (${real.pallets} pad×${real.palletWeight} + ${real.bigBags} bb×${real.bagWeight} + ${real.looseKg} loose)`);

    adjustmentsToCreate.push({
      productId,
      adjustmentKg: totalKg,
      pallets: real.pallets,
      bigBags: real.bigBags,
      tanks: real.tanks,
      looseKg: real.looseKg,
      reason: `Initial balance: ${real.pallets} pad + ${real.bigBags} bb + ${real.looseKg} loose kg = ${totalKg.toLocaleString()} kg`,
      type: 'initial_balance',
      note: `Physical stock count 2026-04-02`,
    });
  }

  console.log(`\n${adjustmentsToCreate.length} initial balance(s) to create.`);

  if (existingIBs.length > 0) {
    console.log(`${existingIBs.length} existing initial_balance record(s) to delete first.`);
  }

  if (DRY_RUN) {
    console.log('\n🏁 Dry run complete. No changes made.\n');
    await prisma.$disconnect();
    return;
  }

  // Delete old initial_balance adjustments
  if (existingIBs.length > 0) {
    const deleted = await prisma.stockAdjustment.deleteMany({ where: { type: 'initial_balance' } });
    console.log(`  🗑  Deleted ${deleted.count} old initial_balance record(s).`);
  }

  // Create new initial_balance adjustments
  for (const adj of adjustmentsToCreate) {
    const created = await prisma.stockAdjustment.create({ data: adj });
    console.log(`  ✓ Created ${created.id} for ${adj.productId}: ${adj.adjustmentKg.toLocaleString()} kg`);
  }

  console.log('\n✅ Done.\n');
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
