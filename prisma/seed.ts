import prisma from '../services/prisma';
import { PRODUCTS, INITIAL_SUPPLIERS, INITIAL_BUYERS, INITIAL_INTAKE, INITIAL_OUTPUT } from '../constants';

async function main() {
  console.log('Seeding database...');

  // Seed milk types (from store defaults)
  const milkTypes = [
    'Skim milk concentrate',
    'Skim milk',
    'Milk protein concentrate',
    'Permeate concentrate',
    'Raw milk',
    'Cream'
  ];

  for (const name of milkTypes) {
    await prisma.milkType.upsert({
      where: { name },
      update: {},
      create: { name }
    });
  }

  // Seed products
  for (const p of PRODUCTS) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {
        name: p.name,
        details: p.details || null,
        defaultPalletWeight: p.defaultPalletWeight,
        defaultBagWeight: p.defaultBagWeight,
        proteinTargetPct: p.proteinTargetPct,
        yieldFactor: p.yieldFactor
      },
      create: {
        id: p.id,
        name: p.name,
        details: p.details || null,
        defaultPalletWeight: p.defaultPalletWeight,
        defaultBagWeight: p.defaultBagWeight,
        proteinTargetPct: p.proteinTargetPct,
        yieldFactor: p.yieldFactor
      }
    });
  }

  // Seed suppliers
  for (const s of INITIAL_SUPPLIERS) {
    await prisma.supplier.upsert({
      where: { id: s.id },
      update: {
        name: s.name,
        routeGroup: s.routeGroup,
        contractQuota: s.contractQuota,
        companyCode: s.companyCode || null,
        phoneNumber: s.phoneNumber || null,
        country: s.country || null,
        addressLine1: s.addressLine1 || null,
        addressLine2: s.addressLine2 || null,
        createdOn: s.createdOn ? new Date(s.createdOn) : null,
        basePricePerKg: s.basePricePerKg,
        fatBonusPerPct: s.fatBonusPerPct,
        proteinBonusPerPct: s.proteinBonusPerPct,
        isEco: s.isEco || false,
        defaultMilkType: s.defaultMilkType || null
      },
      create: {
        id: s.id,
        name: s.name,
        routeGroup: s.routeGroup,
        contractQuota: s.contractQuota,
        companyCode: s.companyCode || null,
        phoneNumber: s.phoneNumber || null,
        country: s.country || null,
        addressLine1: s.addressLine1 || null,
        addressLine2: s.addressLine2 || null,
        createdOn: s.createdOn ? new Date(s.createdOn) : null,
        basePricePerKg: s.basePricePerKg,
        fatBonusPerPct: s.fatBonusPerPct,
        proteinBonusPerPct: s.proteinBonusPerPct,
        isEco: s.isEco || false,
        defaultMilkType: s.defaultMilkType || null
      }
    });
  }

  // Seed buyers and contracts
  for (const b of INITIAL_BUYERS) {
    await prisma.buyer.upsert({
      where: { id: b.id },
      update: {
        name: b.name,
        companyCode: b.companyCode || null,
        phoneNumber: b.phoneNumber || null,
        country: b.country || null,
        addressLine1: b.addressLine1 || null,
        addressLine2: b.addressLine2 || null,
        createdOn: b.createdOn ? new Date(b.createdOn) : null
      },
      create: {
        id: b.id,
        name: b.name,
        companyCode: b.companyCode || null,
        phoneNumber: b.phoneNumber || null,
        country: b.country || null,
        addressLine1: b.addressLine1 || null,
        addressLine2: b.addressLine2 || null,
        createdOn: b.createdOn ? new Date(b.createdOn) : null
      }
    });

    // Upsert contracts
    if (Array.isArray(b.contracts)) {
      for (const c of b.contracts) {
        await prisma.buyerContract.upsert({
          where: { id: c.id },
          update: {
            contractNumber: c.contractNumber,
            pricePerKg: c.pricePerKg,
            agreedAmountKg: c.agreedAmountKg || null,
            startDate: new Date(c.startDate),
            endDate: new Date(c.endDate),
            buyerId: b.id,
            productId: c.productId
          },
          create: {
            id: c.id,
            contractNumber: c.contractNumber,
            pricePerKg: c.pricePerKg,
            agreedAmountKg: c.agreedAmountKg || null,
            startDate: new Date(c.startDate),
            endDate: new Date(c.endDate),
            buyerId: b.id,
            productId: c.productId
          }
        });
      }
    }
  }

  // Seed intake entries (with tags)
  for (const i of INITIAL_INTAKE) {
    await prisma.intakeEntry.upsert({
      where: { id: i.id },
      update: {
        supplierId: i.supplierId,
        supplierName: i.supplierName,
        routeGroup: i.routeGroup,
        milkType: i.milkType,
        quantityKg: i.quantityKg,
        ph: i.ph,
        fatPct: i.fatPct,
        proteinPct: i.proteinPct,
        tempCelsius: i.tempCelsius,
        isEcological: i.isEcological || false,
        note: i.note || null,
        timestamp: new Date(i.timestamp),
        calculatedCost: i.calculatedCost || 0,
        isTempAlertDismissed: i.isTempAlertDismissed || false,
        isDiscarded: i.isDiscarded || false
      },
      create: {
        id: i.id,
        supplierId: i.supplierId,
        supplierName: i.supplierName,
        routeGroup: i.routeGroup,
        milkType: i.milkType,
        quantityKg: i.quantityKg,
        ph: i.ph,
        fatPct: i.fatPct,
        proteinPct: i.proteinPct,
        tempCelsius: i.tempCelsius,
        isEcological: i.isEcological || false,
        note: i.note || null,
        timestamp: new Date(i.timestamp),
        calculatedCost: i.calculatedCost || 0,
        isTempAlertDismissed: i.isTempAlertDismissed || false,
        isDiscarded: i.isDiscarded || false
      }
    });

    // Upsert tags
    if (Array.isArray(i.tags)) {
      for (const tag of i.tags) {
        const tagId = `${i.id}-${tag}`;
        await prisma.intakeTag.upsert({
          where: { id: tagId },
          update: {
            intakeEntryId: i.id,
            tag
          },
          create: {
            id: tagId,
            intakeEntryId: i.id,
            tag
          }
        });
      }
    }
  }

  // Seed output entries
  for (const o of INITIAL_OUTPUT) {
    await prisma.outputEntry.upsert({
      where: { id: o.id },
      update: {
        productId: o.productId,
        batchId: o.batchId,
        packagingString: o.packagingString,
        destination: o.destination as any,
        timestamp: new Date(o.timestamp),
        pallets: o.parsed?.pallets || 0,
        bigBags: o.parsed?.bigBags || 0,
        tanks: o.parsed?.tanks || 0,
        totalWeight: o.parsed?.totalWeight || 0
      },
      create: {
        id: o.id,
        productId: o.productId,
        batchId: o.batchId,
        packagingString: o.packagingString,
        destination: o.destination as any,
        timestamp: new Date(o.timestamp),
        pallets: o.parsed?.pallets || 0,
        bigBags: o.parsed?.bigBags || 0,
        tanks: o.parsed?.tanks || 0,
        totalWeight: o.parsed?.totalWeight || 0
      }
    });
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
