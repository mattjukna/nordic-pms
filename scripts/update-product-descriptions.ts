import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DESCRIPTIONS: Record<string, string> = {
  MPC85: 'Milk protein concentrate with 85% protein on dry basis. Primary high-value product for sports nutrition and clinical applications.',
  MPC88: 'Premium milk protein concentrate at 88% protein. Used in high-protein bars, RTD beverages, and infant formula fortification.',
  MPC83: 'Milk protein concentrate with 83% protein. Cost-effective alternative to MPC 85 for processed cheese and bakery enrichment.',
  MPC70: 'Mid-range milk protein concentrate at 70% protein. Versatile ingredient for yoghurt, ice cream, and nutritional supplements.',
  MPC70W: 'Wet-process milk protein concentrate at 70% protein. Liquid format for direct use in fresh dairy blends and UHT beverages.',
  MPI: 'Milk protein isolate with ≥90% protein purity. Ultra-filtered for premium sports nutrition, medical foods, and clear protein drinks.',
  MCC: 'Micellar casein concentrate derived from cold microfiltration. Slow-release protein used in meal replacements and overnight recovery products.',
  SMP: 'Skim milk powder produced by spray drying pasteurised skim milk. Staple ingredient for recombined dairy, confectionery, and baked goods.',
  WMP26: 'Whole milk powder with 26% protein and 26% fat. Used in chocolate manufacturing, infant formula, and reconstituted milk products.',
  PERM015: 'Dairy permeate powder from UF processing with ~0.15% protein. Lactose-rich ingredient for animal feed, fermentation substrates, and cost-effective fillers.',
  PM12: 'Protein mix standardised to 12% protein. Economical blend of MPC and permeate for mass-market dairy beverages and commodity powders.',
  CREAM: 'Fresh cream at 40% milkfat content, separated during intake processing. Sold as bulk liquid for butter production, confectionery, and food service.',
};

async function main() {
  const products = await prisma.product.findMany();
  console.log(`Found ${products.length} products in database.\n`);

  for (const product of products) {
    const newDetails = DESCRIPTIONS[product.id];
    if (!newDetails) {
      console.log(`  SKIP  ${product.id} — no new description defined`);
      continue;
    }
    if (product.details === newDetails) {
      console.log(`  OK    ${product.id} — already up to date`);
      continue;
    }
    await prisma.product.update({
      where: { id: product.id },
      data: { details: newDetails },
    });
    console.log(`  DONE  ${product.id} — "${product.details}" → updated`);
  }

  console.log('\nAll product descriptions updated.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
