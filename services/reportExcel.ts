import ExcelJS from 'exceljs';
import prisma from './prisma';

type ReportKind = 'full' | 'accounting' | 'intake' | 'production' | 'dispatch' | 'quality';
type SheetKey = 'intake' | 'production' | 'dispatch' | 'quality' | 'accounting' | 'suppliers' | 'buyers' | 'products' | 'stock' | 'quotas';

function addHeader(worksheet: any, headers: { header: string; key: string; width?: number }[]) {
  worksheet.columns = headers.map(h => ({ header: h.header, key: h.key, width: h.width || 15 }));
  // style header
  worksheet.getRow(1).font = { bold: true } as any;
  worksheet.getRow(1).alignment = { horizontal: 'center' } as any;
  worksheet.getRow(1).eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEFEFEF' }
    } as any;
    cell.border = {
      top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
    } as any;
  });
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length }
  } as any;

  // Print setup — prevents Excel crashes when printing
  worksheet.pageSetup = {
    paperSize: 9,              // A4
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 999,          // large number = effectively unlimited vertical pages
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  };
  worksheet.headerFooter = {
    oddFooter: '&C&P of &N',
  };
  // Repeat header row on every printed page
  worksheet.pageSetup.printTitlesRow = '1:1';
}

/* ── Legacy wrapper (keeps old /api/reports/monthly working) ── */
export async function buildMonthlyWorkbook({ report, startDate, endDateExclusive }: { report: ReportKind; startDate: Date; endDateExclusive: Date; }): Promise<Buffer> {
  const sheetMap: Record<ReportKind, SheetKey[]> = {
    full: ['intake', 'production', 'dispatch', 'quality', 'accounting'],
    accounting: ['accounting'],
    intake: ['intake'],
    production: ['production'],
    dispatch: ['dispatch'],
    quality: ['quality'],
  };
  return buildExportWorkbook({ sheets: sheetMap[report], startDate, endDateExclusive });
}

/* ── Main export builder ── */
export async function buildExportWorkbook({ sheets, startDate, endDateExclusive }: { sheets: SheetKey[]; startDate: Date; endDateExclusive: Date; }): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Nordic PMS';
  workbook.created = new Date();

  const fmtDate = (d?: Date | number) => d ? new Date(d).toISOString().split('T')[0] : '';
  const sheetSet = new Set(sheets);

  // Query datasets only if needed
  const needsIntake = sheetSet.has('intake') || sheetSet.has('quality') || sheetSet.has('accounting');
  const needsOutput = sheetSet.has('production') || sheetSet.has('accounting');
  const needsDispatch = sheetSet.has('dispatch');

  const intakeEntries = needsIntake ? await prisma.intakeEntry.findMany({ where: { timestamp: { gte: startDate, lt: endDateExclusive } }, include: { tags: true, supplier: true } }) : [];
  const outputEntries = needsOutput ? await prisma.outputEntry.findMany({ where: { timestamp: { gte: startDate, lt: endDateExclusive } } }) : [];
  const dispatchEntries = needsDispatch ? await prisma.dispatchEntry.findMany({ where: { date: { gte: startDate, lt: endDateExclusive } }, include: { shipments: true } }) : [];

  // Quality: aggregate daily averages from intakeEntries
  const byDay: Record<string, { kg: number; fatSum: number; proteinSum: number; phSum: number; count: number }> = {};
  for (const e of intakeEntries) {
    const day = fmtDate(e.timestamp);
    if (!byDay[day]) byDay[day] = { kg: 0, fatSum: 0, proteinSum: 0, phSum: 0, count: 0 };
    byDay[day].kg += e.quantityKg || 0;
    byDay[day].fatSum += (e.fatPct || 0);
    byDay[day].proteinSum += (e.proteinPct || 0);
    byDay[day].phSum += (e.ph || 0);
    byDay[day].count += 1;
  }

  // Accounting Overview: daily rows for product outputs + intake totals
  const dailyMap: Record<string, { date: string; outputs: Record<string, number>; intakeKg: number }> = {};
  for (const o of outputEntries) {
    const day = fmtDate(o.timestamp);
    if (!dailyMap[day]) dailyMap[day] = { date: day, outputs: {}, intakeKg: 0 };
    const pname = (o.productId || 'Unknown');
    dailyMap[day].outputs[pname] = (dailyMap[day].outputs[pname] || 0) + (o.totalWeight || 0);
  }
  for (const i of intakeEntries) {
    const day = fmtDate(i.timestamp);
    if (!dailyMap[day]) dailyMap[day] = { date: day, outputs: {}, intakeKg: 0 };
    dailyMap[day].intakeKg += i.quantityKg || 0;
  }

  // Build sheets
  if (sheetSet.has('intake')) {
    const sheet = workbook.addWorksheet('Intake');
    addHeader(sheet, [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Supplier', key: 'supplier', width: 30 },
      { header: 'Milk Type', key: 'milkType', width: 16 },
      { header: 'Received Kg', key: 'kg', width: 12 },
      { header: 'Lab Coefficient', key: 'labCoefficient', width: 14 },
      { header: 'Effective Kg', key: 'effectiveKg', width: 12 },
      { header: 'Fat %', key: 'fat', width: 10 },
      { header: 'Protein %', key: 'protein', width: 10 },
      { header: 'pH', key: 'ph', width: 8 },
      { header: 'Temp °C', key: 'temp', width: 10 },
      { header: 'Invoice #', key: 'invoiceNumber', width: 18 },
      { header: 'Total Cost €', key: 'totalCost', width: 14 },
      { header: 'Eco', key: 'eco', width: 8 },
      { header: 'Tags', key: 'tags', width: 30 },
      { header: 'Note', key: 'note', width: 40 },
    ]);

    for (const r of intakeEntries) {
      sheet.addRow({
        date: fmtDate(r.timestamp),
        supplier: r.supplierName || (r.supplier?.name || ''),
        milkType: r.milkType,
        kg: r.quantityKg,
        labCoefficient: r.labCoefficient ?? 1,
        effectiveKg: r.effectiveQuantityKg ?? r.quantityKg,
        fat: r.fatPct,
        protein: r.proteinPct,
        ph: r.ph,
        temp: r.tempCelsius,
        invoiceNumber: r.invoiceNumber || '',
        totalCost: r.calculatedCost ?? 0,
        eco: r.isEcological ? 'Yes' : 'No',
        tags: Array.isArray(r.tags) ? r.tags.map((t:any)=>t.tag).join(', ') : '',
        note: r.note || ''
      });
    }
    // number formats
    sheet.getColumn('kg').numFmt = '#,##0';
    sheet.getColumn('labCoefficient').numFmt = '0.000';
    sheet.getColumn('effectiveKg').numFmt = '#,##0.00';
    sheet.getColumn('fat').numFmt = '0.00';
    sheet.getColumn('protein').numFmt = '0.00';
    sheet.getColumn('totalCost').numFmt = '€#,##0.00';
  }

  if (sheetSet.has('production')) {
    const sheet = workbook.addWorksheet('Production');
    addHeader(sheet, [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Product', key: 'product', width: 24 },
      { header: 'Batch', key: 'batch', width: 18 },
      { header: 'Net Kg', key: 'kg', width: 12 },
      { header: 'Packaging', key: 'packaging', width: 30 },
      { header: 'Note', key: 'note', width: 40 },
    ]);
    for (const o of outputEntries) {
      sheet.addRow({ date: fmtDate(o.timestamp), product: o.productId, batch: o.batchId || '', kg: o.totalWeight, packaging: o.packagingString || '', note: '' });
    }
    sheet.getColumn('kg').numFmt = '#,##0';
  }

  if (sheetSet.has('dispatch')) {
    const sheet = workbook.addWorksheet('Dispatch');
    addHeader(sheet, [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Buyer', key: 'buyer', width: 24 },
      { header: 'Contract', key: 'contract', width: 18 },
      { header: 'Product', key: 'product', width: 18 },
      { header: 'Ordered Kg', key: 'ordered', width: 12 },
      { header: 'Shipped Kg', key: 'shipped', width: 12 },
      { header: 'Remaining Kg', key: 'remaining', width: 12 },
      { header: 'Price €/kg', key: 'price', width: 12 },
      { header: 'Revenue €', key: 'revenue', width: 14 },
      { header: 'Status', key: 'status', width: 12 },
    ]);
    for (const d of dispatchEntries) {
      const shipped = (d.shipments || []).reduce((s:any, sh:any) => s + (sh.quantityKg || 0), 0);
      const remaining = (d.orderedQuantityKg ?? d.quantityKg ?? 0) - shipped;
      sheet.addRow({ date: fmtDate(d.date), buyer: d.buyerName || '', contract: d.contractNumber || '', product: d.productId, ordered: d.orderedQuantityKg ?? d.quantityKg ?? 0, shipped, remaining, price: d.salesPricePerKg ?? 0, revenue: d.totalRevenue ?? 0, status: d.status });
    }
    sheet.getColumn('ordered').numFmt = '#,##0';
    sheet.getColumn('shipped').numFmt = '#,##0';
    sheet.getColumn('remaining').numFmt = '#,##0';
    sheet.getColumn('price').numFmt = '€#,##0.00';
    sheet.getColumn('revenue').numFmt = '€#,##0.00';
  }

  if (sheetSet.has('quality')) {
    const sheet = workbook.addWorksheet('Quality');
    addHeader(sheet, [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Avg Kg', key: 'kg', width: 12 },
      { header: 'Avg Fat', key: 'fat', width: 12 },
      { header: 'Avg Protein', key: 'protein', width: 12 },
      { header: 'Avg pH', key: 'ph', width: 10 },
    ]);
    const days = Object.keys(byDay).sort();
    for (const day of days) {
      const d = byDay[day];
      sheet.addRow({ date: day, kg: d.kg, fat: d.fatSum / Math.max(1, d.count), protein: d.proteinSum / Math.max(1, d.count), ph: d.phSum / Math.max(1, d.count) });
    }
    sheet.getColumn('kg').numFmt = '#,##0';
    sheet.getColumn('fat').numFmt = '0.00';
    sheet.getColumn('protein').numFmt = '0.00';
    sheet.getColumn('ph').numFmt = '0.00';
  }

  // Accounting Overview (daily rows) - simple implementation
  if (sheetSet.has('accounting')) {
    const sheet = workbook.addWorksheet('Accounting Overview');
    // total monthly quota across all suppliers
    const suppliers = await prisma.supplier.findMany();
    const totalMonthlyQuota = suppliers.reduce((s: number, sup: any) => s + (sup.contractQuota || 0), 0);
    // build product columns
    const productNames = Array.from(new Set(outputEntries.map(o => o.productId || 'Unknown'))).slice(0, 20);
    const headers: { header: string; key: string; width?: number }[] = [ { header: 'Date', key: 'date', width: 14 } ];
    for (const p of productNames) headers.push({ header: String(p), key: `prod_${p}`, width: 12 });
    headers.push({ header: 'Total Intake Kg', key: 'intake', width: 14 });
    // Add monthly quota and quota reached columns
    headers.push({ header: 'Monthly Quota (kg)', key: 'monthlyQuota', width: 16 });
    headers.push({ header: 'Quota Reached (%)', key: 'quotaReached', width: 14 });
    addHeader(sheet, headers);

    const days = Object.keys(dailyMap).sort();
    let cumulativeIntake = 0;
    for (const day of days) {
      const row: any = { date: day };
      const outputs = dailyMap[day].outputs;
      for (const p of productNames) row[`prod_${p}`] = outputs[String(p)] || 0;
      row.intake = dailyMap[day].intakeKg || 0;
      cumulativeIntake += row.intake || 0;
      // monthlyQuota repeated per row (overall total for the month)
      row.monthlyQuota = totalMonthlyQuota || 0;
      // quotaReached as fraction (0..1) so Excel percent format displays correctly
      row.quotaReached = totalMonthlyQuota > 0 ? (cumulativeIntake / totalMonthlyQuota) : 0;
      sheet.addRow(row);
    }
    // totals row with formulas
    const lastRow = sheet.rowCount + 1;
    const totalRow = sheet.addRow([]);
    totalRow.getCell(1).value = 'TOTAL';
    for (let c = 2; c <= headers.length; c++) {
      const colLetter = sheet.getColumn(c).letter;
      totalRow.getCell(c).value = { formula: `SUM(${colLetter}2:${colLetter}${sheet.rowCount - 1})` } as any;
    }
    // number formats for new columns
    sheet.getColumn('intake').numFmt = '#,##0';
    sheet.getColumn('monthlyQuota').numFmt = '#,##0';
    sheet.getColumn('quotaReached').numFmt = '0.00%';
  }

  /* ── Master data sheets (not date-filtered) ── */

  if (sheetSet.has('suppliers')) {
    const suppliers = await prisma.supplier.findMany({ include: { pricingPeriods: { orderBy: { periodStart: 'desc' }, take: 1 } } });
    const sheet = workbook.addWorksheet('Suppliers');
    addHeader(sheet, [
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Route Group', key: 'routeGroup', width: 16 },
      { header: 'Company Code', key: 'companyCode', width: 16 },
      { header: 'Country', key: 'country', width: 14 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Address', key: 'address', width: 30 },
      { header: 'Contract Quota (kg)', key: 'contractQuota', width: 18 },
      { header: 'Base Price €/kg', key: 'basePrice', width: 14 },
      { header: 'Normal Price €/kg', key: 'normalPrice', width: 16 },
      { header: 'Fat Bonus €/%', key: 'fatBonus', width: 14 },
      { header: 'Protein Bonus €/%', key: 'proteinBonus', width: 16 },
      { header: 'Eco', key: 'eco', width: 8 },
      { header: 'Default Milk Type', key: 'milkType', width: 16 },
    ]);
    for (const s of suppliers) {
      const pp = s.pricingPeriods?.[0];
      sheet.addRow({
        name: s.name, routeGroup: s.routeGroup, companyCode: s.companyCode || '',
        country: s.country || '', phone: s.phoneNumber || '',
        address: [s.addressLine1, s.addressLine2].filter(Boolean).join(', '),
        contractQuota: s.contractQuota ?? 0,
        basePrice: pp?.basePricePerKg ?? s.basePricePerKg ?? 0,
        normalPrice: pp?.normalMilkPricePerKg ?? s.normalMilkPricePerKg ?? 0,
        fatBonus: pp?.fatBonusPerPct ?? s.fatBonusPerPct ?? 0,
        proteinBonus: pp?.proteinBonusPerPct ?? s.proteinBonusPerPct ?? 0,
        eco: s.isEco ? 'Yes' : 'No',
        milkType: s.defaultMilkType || '',
      });
    }
    sheet.getColumn('contractQuota').numFmt = '#,##0';
    sheet.getColumn('basePrice').numFmt = '€#,##0.000';
    sheet.getColumn('normalPrice').numFmt = '€#,##0.000';
    sheet.getColumn('fatBonus').numFmt = '€#,##0.000';
    sheet.getColumn('proteinBonus').numFmt = '€#,##0.000';
  }

  if (sheetSet.has('buyers')) {
    const buyers = await prisma.buyer.findMany({ include: { contracts: { include: { product: true } } } });
    const sheet = workbook.addWorksheet('Buyers');
    addHeader(sheet, [
      { header: 'Name', key: 'name', width: 26 },
      { header: 'Company Code', key: 'companyCode', width: 16 },
      { header: 'Country', key: 'country', width: 14 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Address', key: 'address', width: 30 },
    ]);
    for (const b of buyers) {
      sheet.addRow({
        name: b.name, companyCode: b.companyCode || '',
        country: b.country || '', phone: b.phoneNumber || '',
        address: [b.addressLine1, b.addressLine2].filter(Boolean).join(', '),
      });
    }

    // Contracts sub-sheet
    const cSheet = workbook.addWorksheet('Buyer Contracts');
    addHeader(cSheet, [
      { header: 'Buyer', key: 'buyer', width: 26 },
      { header: 'Contract #', key: 'contract', width: 18 },
      { header: 'Product', key: 'product', width: 22 },
      { header: 'Price €/kg', key: 'price', width: 12 },
      { header: 'Agreed Kg', key: 'agreedKg', width: 14 },
      { header: 'Start', key: 'start', width: 14 },
      { header: 'End', key: 'end', width: 14 },
    ]);
    for (const b of buyers) {
      for (const c of b.contracts) {
        cSheet.addRow({
          buyer: b.name, contract: c.contractNumber, product: c.product?.name || c.productId,
          price: c.pricePerKg, agreedKg: c.agreedAmountKg ?? 0,
          start: fmtDate(c.startDate), end: fmtDate(c.endDate),
        });
      }
    }
    cSheet.getColumn('price').numFmt = '€#,##0.00';
    cSheet.getColumn('agreedKg').numFmt = '#,##0';
  }

  if (sheetSet.has('products')) {
    const products = await prisma.product.findMany({ orderBy: { sortOrder: 'asc' } });
    const sheet = workbook.addWorksheet('Products');
    addHeader(sheet, [
      { header: 'ID', key: 'id', width: 20 },
      { header: 'Name', key: 'name', width: 26 },
      { header: 'Details', key: 'details', width: 36 },
      { header: 'Default Pallet Wt (kg)', key: 'palletWt', width: 20 },
      { header: 'Default Bag Wt (kg)', key: 'bagWt', width: 18 },
      { header: 'Protein Target %', key: 'proteinTarget', width: 16 },
      { header: 'Yield Factor', key: 'yieldFactor', width: 14 },
    ]);
    for (const p of products) {
      sheet.addRow({
        id: p.id, name: p.name, details: p.details || '',
        palletWt: p.defaultPalletWeight, bagWt: p.defaultBagWeight,
        proteinTarget: p.proteinTargetPct, yieldFactor: p.yieldFactor,
      });
    }
    sheet.getColumn('palletWt').numFmt = '#,##0';
    sheet.getColumn('bagWt').numFmt = '#,##0';
    sheet.getColumn('proteinTarget').numFmt = '0.0';
    sheet.getColumn('yieldFactor').numFmt = '0.000';
  }

  if (sheetSet.has('stock')) {
    const adjustments = await prisma.stockAdjustment.findMany({ include: { product: true }, orderBy: { timestamp: 'desc' } });
    const sheet = workbook.addWorksheet('Stock Adjustments');
    addHeader(sheet, [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Product', key: 'product', width: 24 },
      { header: 'Adjustment (kg)', key: 'adjustmentKg', width: 16 },
      { header: 'Pallets', key: 'pallets', width: 10 },
      { header: 'Big Bags', key: 'bigBags', width: 10 },
      { header: 'Tanks', key: 'tanks', width: 10 },
      { header: 'Loose Kg', key: 'looseKg', width: 12 },
      { header: 'Type', key: 'type', width: 16 },
      { header: 'Reason', key: 'reason', width: 30 },
      { header: 'Performed By', key: 'performedBy', width: 22 },
      { header: 'Note', key: 'note', width: 30 },
    ]);
    for (const a of adjustments) {
      sheet.addRow({
        date: fmtDate(a.timestamp), product: a.product?.name || a.productId,
        adjustmentKg: a.adjustmentKg, pallets: a.pallets, bigBags: a.bigBags,
        tanks: a.tanks, looseKg: a.looseKg,
        type: a.type, reason: a.reason,
        performedBy: a.performedBy || '', note: a.note || '',
      });
    }
    sheet.getColumn('adjustmentKg').numFmt = '#,##0';
  }

  if (sheetSet.has('quotas')) {
    const quotas = await prisma.supplierQuota.findMany({ include: { supplier: true }, orderBy: [{ year: 'desc' }, { month: 'desc' }] });
    const sheet = workbook.addWorksheet('Supplier Quotas');
    addHeader(sheet, [
      { header: 'Supplier', key: 'supplier', width: 30 },
      { header: 'Year', key: 'year', width: 10 },
      { header: 'Month', key: 'month', width: 10 },
      { header: 'Quota (kg)', key: 'quotaKg', width: 14 },
      { header: 'Actual (kg)', key: 'actualKg', width: 14 },
      { header: 'Fulfillment %', key: 'fulfillment', width: 14 },
    ]);
    for (const q of quotas) {
      const fulfillment = (q.quotaKg > 0 && q.actualKg != null) ? q.actualKg / q.quotaKg : null;
      sheet.addRow({
        supplier: q.supplier?.name || q.supplierId,
        year: q.year, month: q.month,
        quotaKg: q.quotaKg, actualKg: q.actualKg ?? '',
        fulfillment: fulfillment ?? '',
      });
    }
    sheet.getColumn('quotaKg').numFmt = '#,##0';
    sheet.getColumn('actualKg').numFmt = '#,##0';
    sheet.getColumn('fulfillment').numFmt = '0.0%';
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export default buildMonthlyWorkbook;
