import ExcelJS from 'exceljs';
import prisma from './prisma';

type ReportKind = 'full' | 'accounting' | 'intake' | 'production' | 'dispatch' | 'quality';

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
}

export async function buildMonthlyWorkbook({ report, startDate, endDateExclusive }: { report: ReportKind; startDate: Date; endDateExclusive: Date; }): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Nordic PMS';
  workbook.created = new Date();

  // Helper: format date to YYYY-MM-DD
  const fmtDate = (d?: Date | number) => d ? new Date(d).toISOString().split('T')[0] : '';

  // Query datasets as needed
  const intakeEntries = await prisma.intakeEntry.findMany({ where: { timestamp: { gte: startDate, lt: endDateExclusive } }, include: { tags: true, supplier: true } });
  const outputEntries = await prisma.outputEntry.findMany({ where: { timestamp: { gte: startDate, lt: endDateExclusive } } });
  const dispatchEntries = await prisma.dispatchEntry.findMany({ where: { date: { gte: startDate, lt: endDateExclusive } }, include: { shipments: true } });

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
  if (report === 'full' || report === 'intake') {
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

  if (report === 'full' || report === 'production') {
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

  if (report === 'full' || report === 'dispatch') {
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

  if (report === 'full' || report === 'quality') {
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
  if (report === 'full' || report === 'accounting') {
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

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export default buildMonthlyWorkbook;
