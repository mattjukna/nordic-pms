var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// utils/packagingNormalize.ts
var packagingNormalize_exports = {};
__export(packagingNormalize_exports, {
  inferPackagingStringFromKg: () => inferPackagingStringFromKg,
  isWhole: () => isWhole,
  normalizePackagingString: () => normalizePackagingString,
  parsePackagingSegments: () => parsePackagingSegments
});
function parsePackagingSegments(rawInput, defaultPalletWeight, defaultBBWeight) {
  const input = norm(rawInput || "");
  if (!input) return [];
  const segs = [];
  const segmentRegex = /(\d+(?:\.\d+)?)\s*(pad|pal|pl|bb|big\s*bag|tank|t)(?:\s*\*\s*(\d+(?:\.\d+)?))?/g;
  const looseRegex = /(\d+(?:\.\d+)?)\s*(kg|loose)\b/g;
  let m;
  while ((m = segmentRegex.exec(input)) !== null) {
    const count = Number(m[1]);
    const typeRaw = m[2];
    const override = m[3] ? Number(m[3]) : void 0;
    if (!Number.isFinite(count) || count <= 0) continue;
    if (typeRaw.startsWith("bb") || typeRaw.includes("big")) segs.push({ unit: "bb", count, unitWeight: override ?? defaultBBWeight });
    else if (typeRaw === "tank" || typeRaw === "t") segs.push({ unit: "tank", count, unitWeight: override ?? 25e3 });
    else segs.push({ unit: "pad", count, unitWeight: override ?? defaultPalletWeight });
  }
  while ((m = looseRegex.exec(input)) !== null) {
    const kg = Number(m[1]);
    if (Number.isFinite(kg) && kg > 0) segs.push({ unit: "kg", count: kg });
  }
  return segs;
}
function normalizePackagingString(rawInput, defaultPalletWeight, defaultBBWeight, opts) {
  const segs = parsePackagingSegments(rawInput, defaultPalletWeight, defaultBBWeight);
  if (segs.length === 0) return { normalized: rawInput.trim(), changed: false, looseKgAdded: 0, notes: ["empty"] };
  const fullGroups = /* @__PURE__ */ new Map();
  const partialGroups = /* @__PURE__ */ new Map();
  let looseKg = 0;
  const notes = [];
  for (const s of segs) {
    if (s.unit === "kg") {
      looseKg += s.count;
      continue;
    }
    const unitW = s.unitWeight ?? 0;
    const whole = Math.floor(s.count + 1e-9);
    const frac = s.count - whole;
    if (whole > 0) {
      const key = `${s.unit}:${unitW}`;
      const prev = fullGroups.get(key);
      fullGroups.set(key, { unit: s.unit, unitWeight: unitW, count: (prev?.count ?? 0) + whole });
    }
    if (frac > 1e-6) {
      const partialKg = Math.round(frac * unitW);
      if (partialKg >= 1) {
        const key = `${s.unit}:${partialKg}`;
        const prev = partialGroups.get(key);
        partialGroups.set(key, { unit: s.unit, unitWeight: partialKg, count: (prev?.count ?? 0) + 1 });
        notes.push(`converted ${frac.toFixed(3)} ${s.unit} -> 1 ${s.unit}*${partialKg}`);
      } else {
        looseKg += frac * unitW;
        notes.push(`tiny partial ${frac.toFixed(3)} ${s.unit} merged to loose ${(frac * unitW).toFixed(1)} kg`);
      }
    }
  }
  const parts = [];
  const order = ["pad", "bb", "tank"];
  for (const u of order) {
    for (const g of [...fullGroups.values()].filter((x) => x.unit === u)) {
      parts.push(`${Math.round(g.count)} ${g.unit} *${g.unitWeight}`);
    }
  }
  for (const u of order) {
    for (const g of [...partialGroups.values()].filter((x) => x.unit === u)) {
      parts.push(`${Math.round(g.count)} ${g.unit} *${g.unitWeight}`);
    }
  }
  const looseRounded = opts && opts.roundLoose === false ? looseKg : Math.round(looseKg);
  if (looseRounded >= 1) parts.push(`${looseRounded} kg`);
  const normalized = parts.join("; ");
  const changed = norm(normalized) !== norm(rawInput || "");
  return { normalized, changed, looseKgAdded: looseRounded, notes };
}
function inferPackagingStringFromKg(kg, product) {
  const palletW = product?.defaultPalletWeight && product.defaultPalletWeight > 0 ? product.defaultPalletWeight : 1e3;
  const bagW = product?.defaultBagWeight && product.defaultBagWeight > 0 ? product.defaultBagWeight : 850;
  const preferPallet = palletW >= bagW;
  let remaining = Math.max(0, kg || 0);
  let parts = [];
  if (preferPallet) {
    const pads = Math.floor(remaining / palletW);
    if (pads > 0) {
      parts.push(`${pads} pad*${palletW}`);
      remaining -= pads * palletW;
    }
    const bags = Math.floor(remaining / bagW);
    if (bags > 0) {
      parts.push(`${bags} bb*${bagW}`);
      remaining -= bags * bagW;
    }
  } else {
    const bags = Math.floor(remaining / bagW);
    if (bags > 0) {
      parts.push(`${bags} bb*${bagW}`);
      remaining -= bags * bagW;
    }
    const pads = Math.floor(remaining / palletW);
    if (pads > 0) {
      parts.push(`${pads} pad*${palletW}`);
      remaining -= pads * palletW;
    }
  }
  const loose = Math.round(remaining);
  if (loose >= 1) parts.push(`${loose} kg`);
  const raw = parts.join("; ");
  const normalized = normalizePackagingString(raw, palletW, bagW).normalized;
  return normalized || raw;
}
var norm, isWhole;
var init_packagingNormalize = __esm({
  "utils/packagingNormalize.ts"() {
    norm = (s) => s.toLowerCase().replace(/,/g, ".").trim();
    isWhole = (x) => Math.abs(x - Math.round(x)) < 1e-6;
  }
});

// utils/parser.ts
var parser_exports = {};
__export(parser_exports, {
  isWhole: () => isWhole,
  normalizePackagingString: () => normalizePackagingString,
  parsePackagingSegments: () => parsePackagingSegments,
  parsePackagingString: () => parsePackagingString
});
function parsePackagingString(rawInput, defaultPalletWeight, defaultBBWeight) {
  if (!rawInput || rawInput.trim() === "") {
    return { pallets: 0, bigBags: 0, tanks: 0, totalWeight: 0, isValid: false };
  }
  const normalized = rawInput.toLowerCase().replace(/,/g, ".");
  let totalPallets = 0;
  let totalBigBags = 0;
  let totalTanks = 0;
  let totalWeight = 0;
  const segmentRegex = /(\d+(?:\.\d+)?)\s*(pad|pal|pl|bb|big\s*bag|tank|t)(?:\s*\*\s*(\d+))?/g;
  const looseRegex = /(\d+(?:\.\d+)?)\s*(kg|loose)/g;
  let match;
  while ((match = segmentRegex.exec(normalized)) !== null) {
    const quantity = parseFloat(match[1]);
    const type = match[2];
    const override = match[3] ? parseFloat(match[3]) : null;
    if (type.startsWith("bb") || type.includes("big")) {
      totalBigBags += quantity;
      totalWeight += quantity * (override || defaultBBWeight);
    } else if (type === "tank" || type === "t") {
      totalTanks += quantity;
      totalWeight += quantity * (override || 25e3);
    } else {
      totalPallets += quantity;
      totalWeight += quantity * (override || defaultPalletWeight);
    }
  }
  while ((match = looseRegex.exec(normalized)) !== null) {
    totalWeight += parseFloat(match[1]);
  }
  return {
    pallets: parseFloat(totalPallets.toFixed(2)),
    bigBags: parseFloat(totalBigBags.toFixed(2)),
    tanks: parseFloat(totalTanks.toFixed(2)),
    totalWeight: parseFloat(totalWeight.toFixed(2)),
    // parser does not itself enforce whole-unit policy — callers may validate
    isValid: totalWeight > 0
  };
}
var init_parser = __esm({
  "utils/parser.ts"() {
    init_packagingNormalize();
  }
});

// server.ts
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";

// services/prisma.ts
import { PrismaClient } from "@prisma/client";
var prisma = new PrismaClient();
var prisma_default = prisma;

// services/audit.ts
async function logAudit(req, params) {
  try {
    const { action, tableName, recordId } = params;
    const details = params.details ?? null;
    const userEmail = req && req.user && req.user.email ? req.user.email : process.env.AUTH_DISABLED ? "AUTH_DISABLED" : "unknown";
    const detailsString = typeof details === "string" ? details : JSON.stringify(details ?? {});
    await prisma_default.auditLog.create({ data: {
      userEmail,
      action,
      tableName,
      recordId: recordId ?? null,
      details: detailsString,
      timestamp: BigInt(Date.now())
    } });
  } catch (err) {
    console.error("[AUDIT] failed to write audit log:", err?.message ?? err);
  }
}

// server.ts
init_parser();
import { createRemoteJWKSet, jwtVerify } from "jose";

// utils/wholeUnits.ts
var UNIT_TOLERANCE = 1e-3;
function isWhole2(value) {
  if (value == null || Number.isNaN(value)) return true;
  return Math.abs(value - Math.round(value)) <= UNIT_TOLERANCE;
}
function anyFractional(parsed) {
  return !(isWhole2(parsed.pallets || 0) && isWhole2(parsed.bigBags || 0) && isWhole2(parsed.tanks || 0));
}

// services/reportExcel.ts
import ExcelJS from "exceljs";
function addHeader(worksheet, headers) {
  worksheet.columns = headers.map((h) => ({ header: h.header, key: h.key, width: h.width || 15 }));
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).alignment = { horizontal: "center" };
  worksheet.getRow(1).eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEFEFEF" }
    };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" }
    };
  });
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length }
  };
}
async function buildMonthlyWorkbook({ report, startDate, endDateExclusive }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nordic PMS";
  workbook.created = /* @__PURE__ */ new Date();
  const fmtDate = (d) => d ? new Date(d).toISOString().split("T")[0] : "";
  const intakeEntries = await prisma_default.intakeEntry.findMany({ where: { timestamp: { gte: startDate, lt: endDateExclusive } }, include: { tags: true, supplier: true } });
  const outputEntries = await prisma_default.outputEntry.findMany({ where: { timestamp: { gte: startDate, lt: endDateExclusive } } });
  const dispatchEntries = await prisma_default.dispatchEntry.findMany({ where: { date: { gte: startDate, lt: endDateExclusive } }, include: { shipments: true } });
  const byDay = {};
  for (const e of intakeEntries) {
    const day = fmtDate(e.timestamp);
    if (!byDay[day]) byDay[day] = { kg: 0, fatSum: 0, proteinSum: 0, phSum: 0, count: 0 };
    byDay[day].kg += e.quantityKg || 0;
    byDay[day].fatSum += e.fatPct || 0;
    byDay[day].proteinSum += e.proteinPct || 0;
    byDay[day].phSum += e.ph || 0;
    byDay[day].count += 1;
  }
  const dailyMap = {};
  for (const o of outputEntries) {
    const day = fmtDate(o.timestamp);
    if (!dailyMap[day]) dailyMap[day] = { date: day, outputs: {}, intakeKg: 0 };
    const pname = o.productId || "Unknown";
    dailyMap[day].outputs[pname] = (dailyMap[day].outputs[pname] || 0) + (o.totalWeight || 0);
  }
  for (const i of intakeEntries) {
    const day = fmtDate(i.timestamp);
    if (!dailyMap[day]) dailyMap[day] = { date: day, outputs: {}, intakeKg: 0 };
    dailyMap[day].intakeKg += i.quantityKg || 0;
  }
  if (report === "full" || report === "intake") {
    const sheet = workbook.addWorksheet("Intake");
    addHeader(sheet, [
      { header: "Date", key: "date", width: 14 },
      { header: "Supplier", key: "supplier", width: 30 },
      { header: "Milk Type", key: "milkType", width: 16 },
      { header: "Received Kg", key: "kg", width: 12 },
      { header: "Lab Coefficient", key: "labCoefficient", width: 14 },
      { header: "Effective Kg", key: "effectiveKg", width: 12 },
      { header: "Fat %", key: "fat", width: 10 },
      { header: "Protein %", key: "protein", width: 10 },
      { header: "pH", key: "ph", width: 8 },
      { header: "Temp \xB0C", key: "temp", width: 10 },
      { header: "Invoice #", key: "invoiceNumber", width: 18 },
      { header: "Total Cost \u20AC", key: "totalCost", width: 14 },
      { header: "Eco", key: "eco", width: 8 },
      { header: "Tags", key: "tags", width: 30 },
      { header: "Note", key: "note", width: 40 }
    ]);
    for (const r of intakeEntries) {
      sheet.addRow({
        date: fmtDate(r.timestamp),
        supplier: r.supplierName || (r.supplier?.name || ""),
        milkType: r.milkType,
        kg: r.quantityKg,
        labCoefficient: r.labCoefficient ?? 1,
        effectiveKg: r.effectiveQuantityKg ?? r.quantityKg,
        fat: r.fatPct,
        protein: r.proteinPct,
        ph: r.ph,
        temp: r.tempCelsius,
        invoiceNumber: r.invoiceNumber || "",
        totalCost: r.calculatedCost ?? 0,
        eco: r.isEcological ? "Yes" : "No",
        tags: Array.isArray(r.tags) ? r.tags.map((t) => t.tag).join(", ") : "",
        note: r.note || ""
      });
    }
    sheet.getColumn("kg").numFmt = "#,##0";
    sheet.getColumn("labCoefficient").numFmt = "0.000";
    sheet.getColumn("effectiveKg").numFmt = "#,##0.00";
    sheet.getColumn("fat").numFmt = "0.00";
    sheet.getColumn("protein").numFmt = "0.00";
    sheet.getColumn("totalCost").numFmt = "\u20AC#,##0.00";
  }
  if (report === "full" || report === "production") {
    const sheet = workbook.addWorksheet("Production");
    addHeader(sheet, [
      { header: "Date", key: "date", width: 14 },
      { header: "Product", key: "product", width: 24 },
      { header: "Batch", key: "batch", width: 18 },
      { header: "Net Kg", key: "kg", width: 12 },
      { header: "Packaging", key: "packaging", width: 30 },
      { header: "Note", key: "note", width: 40 }
    ]);
    for (const o of outputEntries) {
      sheet.addRow({ date: fmtDate(o.timestamp), product: o.productId, batch: o.batchId || "", kg: o.totalWeight, packaging: o.packagingString || "", note: "" });
    }
    sheet.getColumn("kg").numFmt = "#,##0";
  }
  if (report === "full" || report === "dispatch") {
    const sheet = workbook.addWorksheet("Dispatch");
    addHeader(sheet, [
      { header: "Date", key: "date", width: 14 },
      { header: "Buyer", key: "buyer", width: 24 },
      { header: "Contract", key: "contract", width: 18 },
      { header: "Product", key: "product", width: 18 },
      { header: "Ordered Kg", key: "ordered", width: 12 },
      { header: "Shipped Kg", key: "shipped", width: 12 },
      { header: "Remaining Kg", key: "remaining", width: 12 },
      { header: "Price \u20AC/kg", key: "price", width: 12 },
      { header: "Revenue \u20AC", key: "revenue", width: 14 },
      { header: "Status", key: "status", width: 12 }
    ]);
    for (const d of dispatchEntries) {
      const shipped = (d.shipments || []).reduce((s, sh) => s + (sh.quantityKg || 0), 0);
      const remaining = (d.orderedQuantityKg ?? d.quantityKg ?? 0) - shipped;
      sheet.addRow({ date: fmtDate(d.date), buyer: d.buyerName || "", contract: d.contractNumber || "", product: d.productId, ordered: d.orderedQuantityKg ?? d.quantityKg ?? 0, shipped, remaining, price: d.salesPricePerKg ?? 0, revenue: d.totalRevenue ?? 0, status: d.status });
    }
    sheet.getColumn("ordered").numFmt = "#,##0";
    sheet.getColumn("shipped").numFmt = "#,##0";
    sheet.getColumn("remaining").numFmt = "#,##0";
    sheet.getColumn("price").numFmt = "\u20AC#,##0.00";
    sheet.getColumn("revenue").numFmt = "\u20AC#,##0.00";
  }
  if (report === "full" || report === "quality") {
    const sheet = workbook.addWorksheet("Quality");
    addHeader(sheet, [
      { header: "Date", key: "date", width: 14 },
      { header: "Avg Kg", key: "kg", width: 12 },
      { header: "Avg Fat", key: "fat", width: 12 },
      { header: "Avg Protein", key: "protein", width: 12 },
      { header: "Avg pH", key: "ph", width: 10 }
    ]);
    const days = Object.keys(byDay).sort();
    for (const day of days) {
      const d = byDay[day];
      sheet.addRow({ date: day, kg: d.kg, fat: d.fatSum / Math.max(1, d.count), protein: d.proteinSum / Math.max(1, d.count), ph: d.phSum / Math.max(1, d.count) });
    }
    sheet.getColumn("kg").numFmt = "#,##0";
    sheet.getColumn("fat").numFmt = "0.00";
    sheet.getColumn("protein").numFmt = "0.00";
    sheet.getColumn("ph").numFmt = "0.00";
  }
  if (report === "full" || report === "accounting") {
    const sheet = workbook.addWorksheet("Accounting Overview");
    const suppliers = await prisma_default.supplier.findMany();
    const totalMonthlyQuota = suppliers.reduce((s, sup) => s + (sup.contractQuota || 0), 0);
    const productNames = Array.from(new Set(outputEntries.map((o) => o.productId || "Unknown"))).slice(0, 20);
    const headers = [{ header: "Date", key: "date", width: 14 }];
    for (const p of productNames) headers.push({ header: String(p), key: `prod_${p}`, width: 12 });
    headers.push({ header: "Total Intake Kg", key: "intake", width: 14 });
    headers.push({ header: "Monthly Quota (kg)", key: "monthlyQuota", width: 16 });
    headers.push({ header: "Quota Reached (%)", key: "quotaReached", width: 14 });
    addHeader(sheet, headers);
    const days = Object.keys(dailyMap).sort();
    let cumulativeIntake = 0;
    for (const day of days) {
      const row = { date: day };
      const outputs = dailyMap[day].outputs;
      for (const p of productNames) row[`prod_${p}`] = outputs[String(p)] || 0;
      row.intake = dailyMap[day].intakeKg || 0;
      cumulativeIntake += row.intake || 0;
      row.monthlyQuota = totalMonthlyQuota || 0;
      row.quotaReached = totalMonthlyQuota > 0 ? cumulativeIntake / totalMonthlyQuota : 0;
      sheet.addRow(row);
    }
    const lastRow = sheet.rowCount + 1;
    const totalRow = sheet.addRow([]);
    totalRow.getCell(1).value = "TOTAL";
    for (let c = 2; c <= headers.length; c++) {
      const colLetter = sheet.getColumn(c).letter;
      totalRow.getCell(c).value = { formula: `SUM(${colLetter}2:${colLetter}${sheet.rowCount - 1})` };
    }
    sheet.getColumn("intake").numFmt = "#,##0";
    sheet.getColumn("monthlyQuota").numFmt = "#,##0";
    sheet.getColumn("quotaReached").numFmt = "0.00%";
  }
  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// utils/companyCodes.ts
function parseCompanyCodes(value) {
  const input = (value ?? "").trim();
  if (!input) {
    return [];
  }
  const seen = /* @__PURE__ */ new Set();
  const codes = [];
  for (const part of input.split(/[;,\n|]+/g)) {
    const normalized = part.trim().replace(/\s+/g, " ");
    if (!normalized) {
      continue;
    }
    const dedupeKey = normalized.toUpperCase();
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    codes.push(normalized);
  }
  return codes;
}
function normalizeCompanyCodes(value) {
  const codes = parseCompanyCodes(value);
  return codes.length > 0 ? codes.join("; ") : null;
}
function getPrimaryCompanyCode(value) {
  return parseCompanyCodes(value)[0] ?? null;
}

// utils/intakeCoefficient.ts
function calculateLabCoefficient(fatPct, proteinPct) {
  if (!Number.isFinite(fatPct) || !Number.isFinite(proteinPct)) return 1;
  return 1 + (fatPct - 3.4) * 0.178 + (proteinPct - 3) * 0.267;
}
function resolveEffectiveQuantityKg(input) {
  const quantityKg = Number.isFinite(input.quantityKg) && input.quantityKg > 0 ? input.quantityKg : 0;
  if (!input.applyCoefficient) {
    return { labCoefficient: 1, effectiveQuantityKg: quantityKg };
  }
  const derivedCoefficient = Number.isFinite(input.manualCoefficient) && (input.manualCoefficient ?? 0) > 0 ? Number(input.manualCoefficient) : calculateLabCoefficient(input.fatPct, input.proteinPct);
  const labCoefficient = Number.isFinite(derivedCoefficient) && derivedCoefficient > 0 ? derivedCoefficient : 1;
  return {
    labCoefficient,
    effectiveQuantityKg: quantityKg * labCoefficient
  };
}

// utils/intakePricing.ts
var toNonNegativeNumber = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Number(value));
};
function resolveIntakeCost(input) {
  const quantityKg = toNonNegativeNumber(input.quantityKg);
  const effectiveQuantityKg = toNonNegativeNumber(input.effectiveQuantityKg || input.quantityKg);
  let calculatedCost = 0;
  if (input.pricingMode === "unit_price") {
    const unitPricePerKg = toNonNegativeNumber(input.unitPricePerKg);
    const basisQty = input.unitPriceBasis === "effective_kg" ? effectiveQuantityKg : quantityKg;
    calculatedCost = unitPricePerKg * basisQty;
  } else {
    calculatedCost = toNonNegativeNumber(input.invoiceTotalEur);
  }
  return {
    calculatedCost,
    derivedUnitPricePerReceivedKg: quantityKg > 0 ? calculatedCost / quantityKg : 0,
    derivedUnitPricePerEffectiveKg: effectiveQuantityKg > 0 ? calculatedCost / effectiveQuantityKg : 0
  };
}

// utils/serverValidation.ts
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
var isNullableFiniteNumber = (value) => value == null || isFiniteNumber(value);
function fail(...errors) {
  return { ok: false, errors };
}
function succeed(value) {
  return { ok: true, value };
}
function validateIntakePayload(body) {
  const errors = [];
  if (!isNonEmptyString(body?.supplierId)) errors.push("supplierId is required.");
  if (!isNonEmptyString(body?.supplierName)) errors.push("supplierName is required.");
  if (!isNonEmptyString(body?.routeGroup)) errors.push("routeGroup is required.");
  if (!isNonEmptyString(body?.milkType)) errors.push("milkType is required.");
  if (!isFiniteNumber(body?.quantityKg) || body.quantityKg <= 0) errors.push("quantityKg must be greater than zero.");
  if (!isFiniteNumber(body?.fatPct) || body.fatPct < 0 || body.fatPct > 100) errors.push("fatPct must be between 0 and 100.");
  if (!isFiniteNumber(body?.proteinPct) || body.proteinPct < 0 || body.proteinPct > 100) errors.push("proteinPct must be between 0 and 100.");
  if (!isFiniteNumber(body?.ph) || body.ph < 0 || body.ph > 14) errors.push("ph must be between 0 and 14.");
  if (!isFiniteNumber(body?.tempCelsius) || body.tempCelsius < -10 || body.tempCelsius > 60) errors.push("tempCelsius must be between -10 and 60.");
  if (!isFiniteNumber(body?.timestamp)) errors.push("timestamp must be a valid epoch millisecond value.");
  if (body?.pricingMode != null && body.pricingMode !== "invoice_total" && body.pricingMode !== "unit_price") {
    errors.push("pricingMode must be invoice_total or unit_price.");
  }
  if (body?.unitPriceBasis != null && body.unitPriceBasis !== "received_kg" && body.unitPriceBasis !== "effective_kg") {
    errors.push("unitPriceBasis must be received_kg or effective_kg.");
  }
  if (body?.pricingMode === "invoice_total") {
    if (!isFiniteNumber(body?.invoiceTotalEur) || body.invoiceTotalEur <= 0) errors.push("invoiceTotalEur must be greater than zero for invoice_total pricing.");
  }
  if (body?.pricingMode === "unit_price") {
    if (!isFiniteNumber(body?.unitPricePerKg) || body.unitPricePerKg < 0) errors.push("unitPricePerKg must be zero or higher for unit_price pricing.");
    if (body?.unitPriceBasis !== "received_kg" && body?.unitPriceBasis !== "effective_kg") errors.push("unitPriceBasis is required for unit_price pricing.");
  }
  if (body?.applyLabCoefficient != null && typeof body.applyLabCoefficient !== "boolean") {
    errors.push("applyLabCoefficient must be boolean when provided.");
  }
  if (!isNullableFiniteNumber(body?.manualLabCoefficient) || isFiniteNumber(body?.manualLabCoefficient) && body.manualLabCoefficient <= 0) {
    errors.push("manualLabCoefficient must be greater than zero when provided.");
  }
  return errors.length > 0 ? fail(...errors) : succeed(body);
}
function validateOutputPayload(body) {
  const errors = [];
  if (!isNonEmptyString(body?.productId)) errors.push("productId is required.");
  if (!isNonEmptyString(body?.batchId)) errors.push("batchId is required.");
  if (!isNonEmptyString(body?.packagingString)) errors.push("packagingString is required.");
  if (!isFiniteNumber(body?.timestamp)) errors.push("timestamp must be a valid epoch millisecond value.");
  return errors.length > 0 ? fail(...errors) : succeed(body);
}
function validateDispatchPayload(body) {
  const errors = [];
  if (!isNonEmptyString(body?.productId)) errors.push("productId is required.");
  if (!isNonEmptyString(body?.buyerName ?? body?.buyer)) errors.push("buyerName is required.");
  if (!isFiniteNumber(body?.orderedQuantityKg) || body.orderedQuantityKg <= 0) errors.push("orderedQuantityKg must be greater than zero.");
  if (!isFiniteNumber(body?.salesPricePerKg) || body.salesPricePerKg < 0) errors.push("salesPricePerKg must be zero or higher.");
  if (!isFiniteNumber(body?.date)) errors.push("date must be a valid epoch millisecond value.");
  return errors.length > 0 ? fail(...errors) : succeed(body);
}
function validateShipmentPayload(body) {
  const errors = [];
  if (!isFiniteNumber(body?.quantityKg) || body.quantityKg <= 0) errors.push("quantityKg must be greater than zero.");
  if (!isFiniteNumber(body?.date)) errors.push("date must be a valid epoch millisecond value.");
  return errors.length > 0 ? fail(...errors) : succeed(body);
}

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var mapDate = (d) => {
  if (!d && d !== 0) return null;
  const date = new Date(d);
  return isNaN(date.getTime()) ? null : date.getTime();
};
var toParsed = (row) => ({
  pallets: typeof row?.pallets === "number" ? row.pallets : 0,
  bigBags: typeof row?.bigBags === "number" ? row.bigBags : 0,
  tanks: typeof row?.tanks === "number" ? row.tanks : 0,
  totalWeight: typeof row?.totalWeight === "number" ? row.totalWeight : 0
});
var toClientDestination = (d) => {
  if (!d) return "Warehouse";
  if (d === "PienoZvaigzde") return "Pieno \u017Dvaig\u017Ed\u0117";
  return d;
};
var toClientOutput = (o) => ({
  id: o.id,
  productId: o.productId,
  batchId: o.batchId,
  packagingString: o.packagingString,
  parsed: toParsed(o),
  destination: toClientDestination(o.destination),
  timestamp: mapDate(o.timestamp)
});
var toClientIntake = (i) => ({
  id: i.id,
  supplierId: i.supplierId,
  supplierName: i.supplierName,
  routeGroup: i.routeGroup,
  milkType: i.milkType,
  quantityKg: i.quantityKg,
  effectiveQuantityKg: typeof i.effectiveQuantityKg === "number" ? i.effectiveQuantityKg : i.quantityKg,
  labCoefficient: typeof i.labCoefficient === "number" ? i.labCoefficient : 1,
  ph: i.ph,
  fatPct: i.fatPct,
  proteinPct: i.proteinPct,
  tempCelsius: i.tempCelsius,
  isEcological: Boolean(i.isEcological),
  pricingMode: i.pricingMode ?? null,
  unitPricePerKg: typeof i.unitPricePerKg === "number" ? i.unitPricePerKg : null,
  unitPriceBasis: i.unitPriceBasis ?? null,
  invoiceNumber: i.invoiceNumber ?? null,
  note: i.note ?? "",
  timestamp: mapDate(i.timestamp),
  calculatedCost: typeof i.calculatedCost === "number" ? i.calculatedCost : 0,
  isTempAlertDismissed: Boolean(i.isTempAlertDismissed),
  isDiscarded: Boolean(i.isDiscarded),
  tags: Array.isArray(i.tags) ? i.tags.map((t) => t.tag) : []
});
var toClientShipment = (s) => {
  const base = {
    id: s.id,
    date: mapDate(s.date),
    quantityKg: s.quantityKg
  };
  if (s.batchId) base.batchId = s.batchId;
  if (s.note) base.note = s.note;
  if (s.packagingString) {
    base.packagingString = s.packagingString;
    base.parsed = toParsed(s);
  }
  return base;
};
var toClientDispatch = (d) => ({
  id: d.id,
  date: mapDate(d.date),
  buyer: d.buyerName || "",
  buyerId: d.buyerId ?? void 0,
  buyerCompanyCode: d.buyerCompanyCode ?? void 0,
  contractNumber: d.contractNumber ?? void 0,
  productId: d.productId,
  quantityKg: d.quantityKg,
  orderedQuantityKg: d.orderedQuantityKg ?? void 0,
  batchRefId: d.batchRefId ?? "MIXED",
  packagingString: d.packagingString ?? void 0,
  parsed: d.packagingString ? toParsed(d) : void 0,
  salesPricePerKg: d.salesPricePerKg ?? 0,
  totalRevenue: d.totalRevenue ?? 0,
  status: d.status,
  shipments: Array.isArray(d.shipments) ? d.shipments.map((s) => toClientShipment(s)) : []
});
var toClientSupplier = (s) => ({
  ...s,
  contractQuota: typeof s.contractQuota === "number" ? s.contractQuota : 0,
  createdOn: mapDate(s.createdOn),
  basePricePerKg: typeof s.basePricePerKg === "number" ? s.basePricePerKg : 0,
  normalMilkPricePerKg: typeof s.normalMilkPricePerKg === "number" ? s.normalMilkPricePerKg : null,
  fatBonusPerPct: typeof s.fatBonusPerPct === "number" ? s.fatBonusPerPct : 0,
  proteinBonusPerPct: typeof s.proteinBonusPerPct === "number" ? s.proteinBonusPerPct : 0
});
var classifyBootstrapError = (err) => {
  const message = String(err?.message || "Unknown database error");
  const code = typeof err?.code === "string" ? err.code : null;
  const lowerMessage = message.toLowerCase();
  if (code === "P2022" || lowerMessage.includes("the column") || lowerMessage.includes("does not exist in the current database")) {
    return {
      category: "schema-mismatch",
      error: "Database schema mismatch",
      hint: "Apply the pending IntakeEntry migration before starting this build."
    };
  }
  if (code === "P1001" || lowerMessage.includes("can't reach database server") || lowerMessage.includes("cannot reach database server") || lowerMessage.includes("timed out") || lowerMessage.includes("econnrefused") || lowerMessage.includes("etimedout") || lowerMessage.includes("server was not found")) {
    return {
      category: "database-unreachable",
      error: "Database unreachable",
      hint: "Check Azure SQL availability, firewall rules, and transient connectivity."
    };
  }
  if (code === "P1000" || code === "P1010" || lowerMessage.includes("authentication failed") || lowerMessage.includes("login failed") || lowerMessage.includes("permission was denied")) {
    return {
      category: "database-auth-config",
      error: "Database auth/config issue",
      hint: "Check database credentials, permissions, and runtime configuration."
    };
  }
  return {
    category: "database-error",
    error: message,
    hint: "Check DATABASE_URL, firewall access, and database migration state."
  };
};
var DEFAULT_PRODUCT_PALLET_WEIGHT = 1e3;
var DEFAULT_PRODUCT_BAG_WEIGHT = 850;
var DEFAULT_PRODUCT_PROTEIN_TARGET = 0;
var DEFAULT_PRODUCT_YIELD_FACTOR = 0;
var toOptionalFiniteNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
var normalizeProductPayload = (body, existing) => ({
  id: typeof body?.id === "string" && body.id.trim().length > 0 ? body.id.trim() : existing?.id ?? "",
  name: typeof body?.name === "string" && body.name.trim().length > 0 ? body.name.trim() : existing?.name ?? "",
  details: typeof body?.details === "string" ? body.details.trim() : existing?.details ?? "",
  defaultPalletWeight: toOptionalFiniteNumber(body?.defaultPalletWeight) ?? existing?.defaultPalletWeight ?? DEFAULT_PRODUCT_PALLET_WEIGHT,
  defaultBagWeight: toOptionalFiniteNumber(body?.defaultBagWeight) ?? existing?.defaultBagWeight ?? DEFAULT_PRODUCT_BAG_WEIGHT,
  proteinTargetPct: toOptionalFiniteNumber(body?.proteinTargetPct) ?? existing?.proteinTargetPct ?? DEFAULT_PRODUCT_PROTEIN_TARGET,
  yieldFactor: toOptionalFiniteNumber(body?.yieldFactor) ?? existing?.yieldFactor ?? DEFAULT_PRODUCT_YIELD_FACTOR,
  sortOrder: toOptionalFiniteNumber(body?.sortOrder) ?? existing?.sortOrder ?? 0
});
var toNullableString = (value) => typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
var resolveLegacySupplierIntakeCost = async (input) => {
  const year = input.timestamp.getFullYear();
  const month = input.timestamp.getMonth();
  const periodStart = new Date(year, month, 1);
  const supplier = await prisma_default.supplier.findUnique({ where: { id: input.supplierId } });
  const pricing = await prisma_default.supplierPricingPeriod.findFirst({ where: { supplierId: input.supplierId, periodStart } });
  const basePrice = pricing?.normalMilkPricePerKg ?? pricing?.basePricePerKg ?? supplier?.normalMilkPricePerKg ?? supplier?.basePricePerKg ?? 0;
  const fatBonus = pricing?.fatBonusPerPct ?? supplier?.fatBonusPerPct ?? 0;
  const proteinBonus = pricing?.proteinBonusPerPct ?? supplier?.proteinBonusPerPct ?? 0;
  const unitAdjust = (input.fatPct - 4) * 10 * fatBonus + (input.proteinPct - 3.2) * 10 * proteinBonus;
  const unitPrice = basePrice + unitAdjust;
  return Math.max(0, (input.quantityKg || 0) * unitPrice);
};
var resolvePersistedIntakeValues = async (input) => {
  const body = input.body || {};
  const existing = input.existing || null;
  const quantityKg = Number(body.quantityKg ?? existing?.quantityKg ?? 0);
  const fatPct = Number(body.fatPct ?? existing?.fatPct ?? 0);
  const proteinPct = Number(body.proteinPct ?? existing?.proteinPct ?? 0);
  const ph = Number(body.ph ?? existing?.ph ?? 0);
  const tempCelsius = Number(body.tempCelsius ?? existing?.tempCelsius ?? 0);
  const timestamp = body.timestamp ? new Date(body.timestamp) : new Date(existing?.timestamp);
  const pricingMode = body.pricingMode ?? existing?.pricingMode ?? null;
  const shouldApplyCoefficient = typeof body.applyLabCoefficient === "boolean" ? body.applyLabCoefficient : existing?.labCoefficient != null ? Number(existing.labCoefficient) !== 1 || Number(existing?.effectiveQuantityKg ?? existing?.quantityKg ?? 0) !== Number(existing?.quantityKg ?? 0) : false;
  const effective = resolveEffectiveQuantityKg({
    quantityKg,
    applyCoefficient: shouldApplyCoefficient,
    fatPct,
    proteinPct,
    manualCoefficient: body.manualLabCoefficient ?? null
  });
  if (!(effective.labCoefficient > 0) || !(effective.effectiveQuantityKg > 0)) {
    throw new Error("Resolved intake coefficient or effective quantity is invalid.");
  }
  let calculatedCost;
  let unitPricePerKg = null;
  let unitPriceBasis = null;
  if (pricingMode === "invoice_total" || pricingMode === "unit_price") {
    unitPricePerKg = pricingMode === "unit_price" ? Number(body.unitPricePerKg ?? existing?.unitPricePerKg ?? 0) : null;
    unitPriceBasis = pricingMode === "unit_price" ? body.unitPriceBasis ?? existing?.unitPriceBasis ?? null : null;
    const pricing = resolveIntakeCost({
      pricingMode,
      invoiceTotalEur: pricingMode === "invoice_total" ? Number(body.invoiceTotalEur ?? existing?.calculatedCost ?? 0) : null,
      unitPricePerKg,
      unitPriceBasis,
      quantityKg,
      effectiveQuantityKg: effective.effectiveQuantityKg
    });
    calculatedCost = pricing.calculatedCost;
  } else {
    calculatedCost = await resolveLegacySupplierIntakeCost({
      supplierId: body.supplierId ?? existing?.supplierId,
      timestamp,
      quantityKg,
      fatPct,
      proteinPct
    });
  }
  return {
    supplierId: body.supplierId ?? existing?.supplierId,
    supplierName: body.supplierName ?? existing?.supplierName,
    routeGroup: body.routeGroup ?? existing?.routeGroup,
    milkType: body.milkType ?? existing?.milkType,
    quantityKg,
    effectiveQuantityKg: effective.effectiveQuantityKg,
    labCoefficient: effective.labCoefficient,
    ph,
    fatPct,
    proteinPct,
    tempCelsius,
    isEcological: body.isEcological ?? existing?.isEcological ?? false,
    pricingMode,
    unitPricePerKg: pricingMode === "unit_price" ? unitPricePerKg : null,
    unitPriceBasis: pricingMode === "unit_price" ? unitPriceBasis : null,
    invoiceNumber: toNullableString(body.invoiceNumber ?? existing?.invoiceNumber ?? null),
    note: body.note ?? existing?.note ?? null,
    timestamp,
    calculatedCost,
    isTempAlertDismissed: body.isTempAlertDismissed ?? existing?.isTempAlertDismissed ?? false,
    isDiscarded: body.isDiscarded ?? existing?.isDiscarded ?? false
  };
};
var DEFAULT_AZURE_FRONTEND_ORIGIN = "https://nordic-pms-prod-2026-bxh5f7bcc6ccfgfg.polandcentral-01.azurewebsites.net";
var normalizeOrigin = (value) => {
  if (!value) return null;
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return value.trim().replace(/\/+$/, "").toLowerCase() || null;
  }
};
var getRequestOrigin = (req) => {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const hostHeader = String(req.headers.host || "").trim();
  const protocol = forwardedProto || req.protocol || "http";
  const host = forwardedHost || hostHeader;
  if (!host) return null;
  return normalizeOrigin(`${protocol}://${host}`);
};
var parseCorsOrigins = () => {
  const raw = process.env.CORS_ALLOWED_ORIGINS || process.env.APP_ALLOWED_ORIGINS || "http://localhost:3000;http://127.0.0.1:3000";
  const configuredOrigins = raw.split(/[;,]/).map((value) => normalizeOrigin(value)).filter(Boolean);
  const azureWebsiteOrigin = process.env.WEBSITE_HOSTNAME ? normalizeOrigin(`https://${process.env.WEBSITE_HOSTNAME}`) : null;
  return Array.from(new Set([
    ...configuredOrigins,
    DEFAULT_AZURE_FRONTEND_ORIGIN,
    azureWebsiteOrigin
  ].filter((value) => Boolean(value))));
};
async function startServer() {
  if (typeof process.env.WEBSITE_INSTANCE_ID === "undefined" || process.env.NODE_ENV !== "production") {
    try {
      const dotenv = await import("dotenv");
      dotenv.config({ path: ".env" });
      dotenv.config({ path: ".env.local" });
    } catch (err) {
      console.warn("[BOOT] dotenv not available or failed to load:", err?.message ?? err);
    }
  }
  const app = express();
  const port = Number(process.env.PORT || 3e3);
  const host = "0.0.0.0";
  let prismaAvailable = true;
  const allowedOrigins = parseCorsOrigins();
  app.use(cors((req, callback) => {
    const incomingOrigin = typeof req.headers.origin === "string" ? req.headers.origin : void 0;
    const requestOrigin = normalizeOrigin(incomingOrigin);
    const serverOrigin = getRequestOrigin(req);
    const sameOrigin = requestOrigin ? requestOrigin === serverOrigin : false;
    const configuredOrigin = requestOrigin ? allowedOrigins.includes(requestOrigin) : false;
    const branch = !requestOrigin ? "allow-no-origin" : sameOrigin ? "allow-same-origin" : configuredOrigin ? "allow-configured-origin" : "reject-unauthorized-origin";
    console.log("[CORS]", {
      incomingOrigin: incomingOrigin || null,
      normalizedOrigin: requestOrigin,
      allowedOrigins,
      requestOriginHost: serverOrigin,
      branch
    });
    if (!requestOrigin || sameOrigin || configuredOrigin) {
      callback(null, { origin: true, credentials: true });
      return;
    }
    callback(new Error("Origin not allowed by CORS"));
  }));
  app.use((err, req, res, next) => {
    if (err?.message === "Origin not allowed by CORS") {
      return res.status(403).json({ error: "Origin not allowed by CORS" });
    }
    return next(err);
  });
  app.use(express.json());
  const AUTH_DISABLED = (process.env.AUTH_DISABLED || "").toLowerCase() === "true";
  const AAD_TENANT = process.env.AAD_TENANT_ID || process.env.AAD_TENANT || process.env.AAD_TENANTID || "";
  const AAD_CLIENT = process.env.AAD_CLIENT_ID || process.env.AAD_CLIENT || "";
  const AAD_ALLOWED = process.env.AAD_ALLOWED_DOMAIN || process.env.AAD_ALLOWED || "";
  const jwksUri = AAD_TENANT ? `https://login.microsoftonline.com/${AAD_TENANT}/discovery/v2.0/keys` : null;
  const JWKS = jwksUri ? createRemoteJWKSet(new URL(jwksUri)) : null;
  app.get("/config", (req, res) => {
    const clientId = process.env.MSAL_CLIENT_ID || process.env.AAD_CLIENT_ID || "";
    const tenantId = process.env.MSAL_TENANT_ID || process.env.AAD_TENANT_ID || "";
    const allowedDomain = process.env.MSAL_ALLOWED_DOMAIN || process.env.AAD_ALLOWED_DOMAIN || "";
    const apiScope = process.env.MSAL_API_SCOPE || process.env.VITE_AAD_API_SCOPE || "";
    res.json({ clientId, tenantId, allowedDomain, apiScope });
  });
  app.use("/api", async (req, res, next) => {
    if (AUTH_DISABLED) return next();
    if (req.path === "/health") return next();
    const auth = req.headers?.authorization || "";
    if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "Missing Authorization Bearer token" });
    const token = auth.split(" ")[1];
    if (!JWKS) return res.status(500).json({ error: "JWKS not configured on server" });
    try {
      const tid = process.env.AAD_TENANT_ID || process.env.AAD_TENANT || "";
      const allowedIssuers = tid ? [
        `https://login.microsoftonline.com/${tid}/v2.0`,
        `https://login.microsoftonline.com/${tid}/v2.0/`,
        `https://sts.windows.net/${tid}/`
      ] : [];
      const apiScope = process.env.MSAL_API_SCOPE || process.env.AAD_API_SCOPE || process.env.VITE_AAD_API_SCOPE || "";
      let apiAudience = (process.env.MSAL_API_AUDIENCE || process.env.AAD_API_AUDIENCE || "").trim();
      if (!apiAudience && apiScope) {
        const s = apiScope.trim();
        if (s.startsWith("api://")) {
          const parts = s.split("/").slice(0, 3);
          apiAudience = parts.join("/");
        } else {
          apiAudience = s.split("/")[0] || "";
        }
      }
      const audienceOptions = [];
      if (apiAudience) {
        audienceOptions.push(apiAudience);
        if (apiAudience.startsWith("api://")) {
          const raw = apiAudience.replace(/^api:\/\//, "").split("/")[0];
          if (raw) audienceOptions.push(raw);
        }
      }
      console.log("[BOOT] audienceOptions =", audienceOptions);
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: allowedIssuers.length ? allowedIssuers : void 0,
        audience: audienceOptions.length ? audienceOptions : void 0
      });
      const payloadAny = payload;
      if (payloadAny.tid && tid && payloadAny.tid !== tid) {
        return res.status(401).json({ error: "Invalid token", detail: "tid mismatch" });
      }
      const email = payloadAny.preferred_username || payloadAny.upn || payloadAny.email || "";
      if (AAD_ALLOWED && email && !email.toLowerCase().endsWith(`@${AAD_ALLOWED}`)) {
        return res.status(403).json({ error: "Email domain not allowed" });
      }
      req.user = { email, name: payloadAny.name || "", oid: payloadAny.oid, tid: payloadAny.tid };
      return next();
    } catch (err) {
      return res.status(401).json({ error: "Invalid token", detail: err?.message, hint: "Check token aud/scp/iss. Paste token into jwt.ms" });
    }
  });
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });
  app.get("/api/reports/monthly", async (req, res) => {
    try {
      const month = String(req.query.month || "");
      const report = String(req.query.report || "full");
      if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "Invalid month. Expected YYYY-MM" });
      const [y, m] = month.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
      const nextMonth = new Date(Date.UTC(y, m, 1, 0, 0, 0));
      const now = /* @__PURE__ */ new Date();
      const todayUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
      const endExclusive = y === now.getUTCFullYear() && m - 1 === now.getUTCMonth() ? new Date(todayUtcMidnight.getTime() + 24 * 60 * 60 * 1e3) : nextMonth;
      const buf = await buildMonthlyWorkbook({ report, startDate: start, endDateExclusive: endExclusive });
      const filename = `NordicPMS_${report}_${month}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(buf);
    } catch (err) {
      console.error("report export failed", err);
      return res.status(500).json({ error: "Failed to generate report", detail: err?.message });
    }
  });
  app.get("/api/whoami", (req, res) => {
    if (AUTH_DISABLED) return res.json({ email: "AUTH_DISABLED" });
    return res.json({ email: req.user?.email ?? null, name: req.user?.name ?? null, oid: req.user?.oid ?? null, tid: req.user?.tid ?? null });
  });
  app.get("/api/bootstrap", async (req, res) => {
    try {
      const [suppliers, buyers, products, milkTypes, intakeEntries, outputEntries, dispatchEntries] = await Promise.all([
        prisma_default.supplier.findMany(),
        prisma_default.buyer.findMany({ include: { contracts: true } }),
        prisma_default.product.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
        prisma_default.milkType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
        prisma_default.intakeEntry.findMany({ include: { tags: true }, orderBy: { timestamp: "desc" } }),
        prisma_default.outputEntry.findMany({ orderBy: { timestamp: "desc" } }),
        prisma_default.dispatchEntry.findMany({ include: { shipments: true }, orderBy: { date: "desc" } })
      ]);
      const mapSuppliers = suppliers.map((s) => toClientSupplier(s));
      const mapBuyers = buyers.map((b) => ({
        ...b,
        createdOn: mapDate(b.createdOn),
        contracts: Array.isArray(b.contracts) ? b.contracts.map((c) => ({ ...c, startDate: mapDate(c.startDate), endDate: mapDate(c.endDate) })) : []
      }));
      const mapProducts = products;
      const mapMilkTypes = milkTypes.map((m) => m.name);
      const mapIntakes = intakeEntries.map((i) => toClientIntake(i));
      const mapOutputs = outputEntries.map((o) => toClientOutput(o));
      const mapDispatches = dispatchEntries.map((d) => toClientDispatch(d));
      res.json({ suppliers: mapSuppliers, buyers: mapBuyers, products: mapProducts, milkTypes: mapMilkTypes, intakeEntries: mapIntakes, outputEntries: mapOutputs, dispatchEntries: mapDispatches });
    } catch (err) {
      const diagnostic = classifyBootstrapError(err);
      console.error("[BOOTSTRAP] database failure", {
        category: diagnostic.category,
        code: err?.code ?? null,
        message: err?.message ?? String(err),
        meta: err?.meta ?? null
      });
      res.status(500).json({ error: diagnostic.error, hint: diagnostic.hint });
    }
  });
  app.post("/api/suppliers", async (req, res) => {
    const body = req.body;
    if (!body.name || !body.routeGroup) return res.status(400).json({ error: "Missing name or routeGroup" });
    try {
      const created = await prisma_default.supplier.create({ data: {
        name: body.name,
        routeGroup: body.routeGroup,
        contractQuota: body.contractQuota ?? null,
        companyCode: normalizeCompanyCodes(body.companyCode),
        phoneNumber: body.phoneNumber ?? null,
        country: body.country ?? null,
        addressLine1: body.addressLine1 ?? null,
        addressLine2: body.addressLine2 ?? null,
        createdOn: body.createdOn ? new Date(body.createdOn) : null,
        basePricePerKg: body.basePricePerKg ?? null,
        normalMilkPricePerKg: body.normalMilkPricePerKg ?? null,
        fatBonusPerPct: body.fatBonusPerPct ?? null,
        proteinBonusPerPct: body.proteinBonusPerPct ?? null,
        isEco: body.isEco ?? false,
        defaultMilkType: body.defaultMilkType ?? null
      } });
      void logAudit(req, { action: "CREATE", tableName: "Supplier", recordId: created.id, details: JSON.stringify(toClientSupplier(created)) });
      res.json(toClientSupplier(created));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/suppliers/:id", async (req, res) => {
    const id = req.params.id;
    try {
      const data = { ...req.body };
      if (data.createdOn) data.createdOn = new Date(data.createdOn);
      if (Object.prototype.hasOwnProperty.call(data, "companyCode")) data.companyCode = normalizeCompanyCodes(data.companyCode);
      const updated = await prisma_default.supplier.update({ where: { id }, data });
      void logAudit(req, { action: "UPDATE", tableName: "Supplier", recordId: updated.id, details: JSON.stringify(toClientSupplier(updated)) });
      res.json(toClientSupplier(updated));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.delete("/api/suppliers/:id", async (req, res) => {
    const id = req.params.id;
    try {
      await prisma_default.supplier.delete({ where: { id } });
      void logAudit(req, { action: "DELETE", tableName: "Supplier", recordId: id, details: JSON.stringify({ id }) });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.post("/api/buyers", async (req, res) => {
    const b = req.body;
    if (!b.name) return res.status(400).json({ error: "Missing buyer name" });
    try {
      const created = await prisma_default.buyer.create({ data: {
        name: b.name,
        companyCode: normalizeCompanyCodes(b.companyCode),
        phoneNumber: b.phoneNumber ?? null,
        country: b.country ?? null,
        addressLine1: b.addressLine1 ?? null,
        addressLine2: b.addressLine2 ?? null,
        createdOn: b.createdOn ? new Date(b.createdOn) : null
      } });
      const fetched = await prisma_default.buyer.findUnique({ where: { id: created.id }, include: { contracts: true } });
      res.json({ ...fetched, createdOn: mapDate(fetched?.createdOn) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/buyers/:id", async (req, res) => {
    try {
      const data = { ...req.body };
      if (Object.prototype.hasOwnProperty.call(data, "companyCode")) data.companyCode = normalizeCompanyCodes(data.companyCode);
      await prisma_default.buyer.update({ where: { id: req.params.id }, data });
      const fetched = await prisma_default.buyer.findUnique({ where: { id: req.params.id }, include: { contracts: true } });
      res.json({ ...fetched, createdOn: mapDate(fetched?.createdOn), contracts: fetched?.contracts?.map((c) => ({ ...c, startDate: mapDate(c.startDate), endDate: mapDate(c.endDate) })) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.delete("/api/buyers/:id", async (req, res) => {
    try {
      await prisma_default.buyer.delete({ where: { id: req.params.id } });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.post("/api/buyers/:id/contracts", async (req, res) => {
    const buyerId = req.params.id;
    const c = req.body;
    if (!c.contractNumber || !c.productId || c.pricePerKg == null || !c.startDate || !c.endDate) return res.status(400).json({ error: "Invalid contract body" });
    try {
      const created = await prisma_default.buyerContract.create({ data: {
        contractNumber: c.contractNumber,
        pricePerKg: c.pricePerKg,
        agreedAmountKg: c.agreedAmountKg ?? null,
        startDate: new Date(c.startDate),
        endDate: new Date(c.endDate),
        buyerId,
        productId: c.productId
      } });
      res.json({ ...created, startDate: mapDate(created.startDate), endDate: mapDate(created.endDate) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/contracts/:id", async (req, res) => {
    try {
      const data = { ...req.body };
      if (data.startDate) data.startDate = new Date(data.startDate);
      if (data.endDate) data.endDate = new Date(data.endDate);
      const updated = await prisma_default.buyerContract.update({ where: { id: req.params.id }, data });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.delete("/api/contracts/:id", async (req, res) => {
    try {
      await prisma_default.buyerContract.delete({ where: { id: req.params.id } });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.post("/api/products", async (req, res) => {
    const product = normalizeProductPayload(req.body);
    if (!product.id || !product.name) return res.status(400).json({ error: "Missing product id or name" });
    try {
      const maxSortOrder = await prisma_default.product.aggregate({ _max: { sortOrder: true } });
      const created = await prisma_default.product.create({ data: { ...product, sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1 } });
      res.json(created);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/products/:id", async (req, res) => {
    try {
      const currentId = req.params.id;
      const existing = await prisma_default.product.findUnique({ where: { id: currentId } });
      if (!existing) return res.status(404).json({ error: "Not found" });
      const normalized = normalizeProductPayload(req.body, existing);
      if (!normalized.id || !normalized.name) return res.status(400).json({ error: "Missing product id or name" });
      const { id: nextId, ...productData } = normalized;
      let updated;
      if (nextId === currentId) {
        updated = await prisma_default.product.update({ where: { id: currentId }, data: productData });
      } else {
        const conflict = await prisma_default.product.findUnique({ where: { id: nextId } });
        if (conflict) return res.status(409).json({ error: "Product ID already exists" });
        updated = await prisma_default.$transaction(async (tx) => {
          const created = await tx.product.create({ data: { id: nextId, ...productData } });
          await tx.outputEntry.updateMany({ where: { productId: currentId }, data: { productId: nextId } });
          await tx.dispatchEntry.updateMany({ where: { productId: currentId }, data: { productId: nextId } });
          await tx.buyerContract.updateMany({ where: { productId: currentId }, data: { productId: nextId } });
          await tx.product.delete({ where: { id: currentId } });
          return created;
        });
      }
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.delete("/api/products/:id", async (req, res) => {
    try {
      await prisma_default.product.delete({ where: { id: req.params.id } });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.post("/api/products/reorder", async (req, res) => {
    const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.filter((id) => typeof id === "string" && id.trim().length > 0) : [];
    if (orderedIds.length === 0) return res.status(400).json({ error: "Missing orderedIds" });
    try {
      await prisma_default.$transaction(orderedIds.map((id, index) => prisma_default.product.update({ where: { id }, data: { sortOrder: index } })));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.post("/api/milk-types", async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Missing milk type name" });
    try {
      const existing = await prisma_default.milkType.findUnique({ where: { name } });
      if (existing) return res.json(existing);
      const maxSortOrder = await prisma_default.milkType.aggregate({ _max: { sortOrder: true } });
      const created = await prisma_default.milkType.create({ data: { name, sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1 } });
      res.json(created);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/milk-types/:name", async (req, res) => {
    try {
      await prisma_default.milkType.delete({ where: { name: req.params.name } });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.post("/api/milk-types/reorder", async (req, res) => {
    const orderedNames = Array.isArray(req.body?.orderedNames) ? req.body.orderedNames.filter((name) => typeof name === "string" && name.trim().length > 0) : [];
    if (orderedNames.length === 0) return res.status(400).json({ error: "Missing orderedNames" });
    try {
      await prisma_default.$transaction(orderedNames.map((name, index) => prisma_default.milkType.update({ where: { name }, data: { sortOrder: index } })));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.get("/api/supplier-pricing", async (req, res) => {
    try {
      const month = req.query.month;
      const now = /* @__PURE__ */ new Date();
      let periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      if (month) {
        const [y, m] = month.split("-").map(Number);
        if (!isNaN(y) && !isNaN(m)) periodStart = new Date(y, m - 1, 1);
      }
      const periods = await prisma_default.supplierPricingPeriod.findMany({ where: { periodStart }, include: { supplier: true } });
      res.json(periods.map((p) => ({ id: p.id, supplierId: p.supplierId, supplierName: p.supplier?.name ?? "", periodStart: mapDate(p.periodStart), basePricePerKg: p.basePricePerKg ?? null, normalMilkPricePerKg: p.normalMilkPricePerKg ?? null, fatBonusPerPct: p.fatBonusPerPct ?? null, proteinBonusPerPct: p.proteinBonusPerPct ?? null })));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/supplier-pricing", async (req, res) => {
    const body = req.body;
    if (!body.supplierId || !body.periodStart) return res.status(400).json({ error: "Missing supplierId or periodStart" });
    try {
      const periodStart = typeof body.periodStart === "string" && body.periodStart.match(/^\d{4}-\d{2}$/) ? (() => {
        const [y, m] = body.periodStart.split("-").map(Number);
        return new Date(y, m - 1, 1);
      })() : new Date(body.periodStart);
      const existing = await prisma_default.supplierPricingPeriod.findFirst({ where: { supplierId: body.supplierId, periodStart } });
      if (existing) {
        const updated = await prisma_default.supplierPricingPeriod.update({ where: { id: existing.id }, data: {
          basePricePerKg: body.basePricePerKg ?? null,
          normalMilkPricePerKg: body.normalMilkPricePerKg ?? null,
          fatBonusPerPct: body.fatBonusPerPct ?? null,
          proteinBonusPerPct: body.proteinBonusPerPct ?? null
        } });
        res.json(updated);
      } else {
        const created = await prisma_default.supplierPricingPeriod.create({ data: {
          supplierId: body.supplierId,
          periodStart,
          basePricePerKg: body.basePricePerKg ?? null,
          normalMilkPricePerKg: body.normalMilkPricePerKg ?? null,
          fatBonusPerPct: body.fatBonusPerPct ?? null,
          proteinBonusPerPct: body.proteinBonusPerPct ?? null
        } });
        res.json(created);
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/milk-spend", async (req, res) => {
    try {
      const month = req.query.month;
      const now = /* @__PURE__ */ new Date();
      let start = new Date(now.getFullYear(), now.getMonth(), 1);
      if (month) {
        const [y, m] = month.split("-").map(Number);
        if (!isNaN(y) && !isNaN(m)) start = new Date(y, m - 1, 1);
      }
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      const entries = await prisma_default.intakeEntry.findMany({ where: { timestamp: { gte: start, lt: end }, isDiscarded: false } });
      const totalCost = entries.reduce((s, e) => s + (e.calculatedCost ?? 0), 0);
      const totalKg = entries.reduce((s, e) => s + (e.quantityKg ?? 0), 0);
      const bySupplierMap = {};
      for (const e of entries) {
        const key = e.supplierId;
        if (!bySupplierMap[key]) bySupplierMap[key] = { supplierId: e.supplierId, supplierName: e.supplierName, cost: 0, kg: 0 };
        bySupplierMap[key].cost += e.calculatedCost ?? 0;
        bySupplierMap[key].kg += e.quantityKg ?? 0;
      }
      const bySupplier = Object.values(bySupplierMap).sort((a, b) => b.cost - a.cost);
      res.json({ periodStart: mapDate(start), periodEnd: mapDate(end), totalCost, totalKg, bySupplier });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/milk-spend-range", async (req, res) => {
    try {
      const from = req.query.from;
      const to = req.query.to;
      if (!from || !to) return res.status(400).json({ error: "Missing from or to query parameters (ISO strings expected)" });
      const start = new Date(from);
      const end = new Date(to);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return res.status(400).json({ error: "Invalid date format for from/to" });
      const entries = await prisma_default.intakeEntry.findMany({ where: { timestamp: { gte: start, lt: end }, isDiscarded: false } });
      const totalCost = entries.reduce((s, e) => s + (e.calculatedCost ?? 0), 0);
      const totalKg = entries.reduce((s, e) => s + (e.quantityKg ?? 0), 0);
      const avgPricePerKg = totalKg > 0 ? totalCost / totalKg : 0;
      const bySupplierMap = {};
      for (const e of entries) {
        const key = e.supplierId;
        if (!bySupplierMap[key]) bySupplierMap[key] = { supplierId: e.supplierId, supplierName: e.supplierName, totalCost: 0, totalKg: 0 };
        bySupplierMap[key].totalCost += e.calculatedCost ?? 0;
        bySupplierMap[key].totalKg += e.quantityKg ?? 0;
      }
      const bySupplier = Object.values(bySupplierMap).map((s) => ({ ...s, avgPricePerKg: s.totalKg > 0 ? s.totalCost / s.totalKg : 0 })).sort((a, b) => b.totalCost - a.totalCost);
      res.json({ from: mapDate(start), to: mapDate(end), totalCost, totalKg, avgPricePerKg, bySupplier });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/intake-entries", async (req, res) => {
    const body = req.body;
    const validation = validateIntakePayload(body);
    if (!validation.ok) return res.status(400).json({ error: "Invalid intake payload", details: validation.errors });
    try {
      const intakeData = await resolvePersistedIntakeValues({ body });
      const created = await prisma_default.intakeEntry.create({ data: intakeData });
      if (Array.isArray(body.tags)) {
        for (const t of body.tags) {
          await prisma_default.intakeTag.create({ data: { intakeEntryId: created.id, tag: t } });
        }
      }
      const fetched = await prisma_default.intakeEntry.findUnique({ where: { id: created.id }, include: { tags: true } });
      void logAudit(req, { action: "CREATE", tableName: "IntakeEntry", recordId: created.id, details: JSON.stringify(toClientIntake(fetched)) });
      res.json(toClientIntake(fetched));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/intake-entries/:id", async (req, res) => {
    const id = req.params.id;
    try {
      const data = { ...req.body };
      if (data.timestamp) data.timestamp = new Date(data.timestamp);
      const existingEntry = await prisma_default.intakeEntry.findUnique({ where: { id } });
      if (!existingEntry) return res.status(404).json({ error: "Not found" });
      const mergedValidation = validateIntakePayload({
        supplierId: data.supplierId ?? existingEntry.supplierId,
        supplierName: data.supplierName ?? existingEntry.supplierName,
        routeGroup: data.routeGroup ?? existingEntry.routeGroup,
        milkType: data.milkType ?? existingEntry.milkType,
        quantityKg: data.quantityKg ?? existingEntry.quantityKg,
        ph: data.ph ?? existingEntry.ph,
        fatPct: data.fatPct ?? existingEntry.fatPct,
        proteinPct: data.proteinPct ?? existingEntry.proteinPct,
        tempCelsius: data.tempCelsius ?? existingEntry.tempCelsius,
        timestamp: data.timestamp ? data.timestamp.getTime() : existingEntry.timestamp.getTime(),
        pricingMode: req.body.pricingMode ?? existingEntry.pricingMode ?? null,
        invoiceTotalEur: req.body.invoiceTotalEur ?? (existingEntry.pricingMode === "invoice_total" ? existingEntry.calculatedCost : null),
        unitPricePerKg: req.body.unitPricePerKg ?? existingEntry.unitPricePerKg ?? null,
        unitPriceBasis: req.body.unitPriceBasis ?? existingEntry.unitPriceBasis ?? null,
        applyLabCoefficient: typeof req.body.applyLabCoefficient === "boolean" ? req.body.applyLabCoefficient : (existingEntry.labCoefficient ?? 1) !== 1,
        manualLabCoefficient: req.body.manualLabCoefficient ?? null
      });
      if (!mergedValidation.ok) return res.status(400).json({ error: "Invalid intake payload", details: mergedValidation.errors });
      const persisted = await resolvePersistedIntakeValues({ body: req.body, existing: existingEntry });
      const updated = await prisma_default.intakeEntry.update({ where: { id }, data: persisted });
      if (Array.isArray(req.body.tags)) {
        await prisma_default.intakeTag.deleteMany({ where: { intakeEntryId: id } });
        for (const t of req.body.tags) {
          await prisma_default.intakeTag.create({ data: { intakeEntryId: id, tag: t } });
        }
      }
      const fetched = await prisma_default.intakeEntry.findUnique({ where: { id }, include: { tags: true } });
      void logAudit(req, { action: "UPDATE", tableName: "IntakeEntry", recordId: id, details: JSON.stringify(toClientIntake(fetched)) });
      res.json(toClientIntake(fetched));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.delete("/api/intake-entries/:id", async (req, res) => {
    try {
      await prisma_default.intakeEntry.delete({ where: { id: req.params.id } });
      void logAudit(req, { action: "DELETE", tableName: "IntakeEntry", recordId: req.params.id, details: JSON.stringify({ id: req.params.id }) });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.post("/api/output-entries", async (req, res) => {
    const body = req.body;
    const validation = validateOutputPayload(body);
    if (!validation.ok) return res.status(400).json({ error: "Invalid output payload", details: validation.errors });
    try {
      const product = await prisma_default.product.findUnique({ where: { id: body.productId } });
      const parsed = parsePackagingString(body.packagingString || "", product?.defaultPalletWeight ?? 900, product?.defaultBagWeight ?? 850);
      if (anyFractional(parsed)) return res.status(400).json({ error: "Fractional unit counts in output packaging are not allowed. Use partial unit weights (e.g. 1 pad*700) or add an explicit kg segment if truly loose." });
      const created = await prisma_default.outputEntry.create({ data: {
        productId: body.productId,
        batchId: body.batchId || "",
        packagingString: body.packagingString || "",
        destination: body.destination === "Pieno \u017Dvaig\u017Ed\u0117" ? "PienoZvaigzde" : body.destination || "Warehouse",
        timestamp: new Date(body.timestamp),
        pallets: parsed.pallets,
        bigBags: parsed.bigBags,
        tanks: parsed.tanks,
        totalWeight: parsed.totalWeight
      } });
      void logAudit(req, { action: "CREATE", tableName: "OutputEntry", recordId: created.id, details: JSON.stringify(toClientOutput(created)) });
      res.json(toClientOutput(created));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/output-entries/:id", async (req, res) => {
    const id = req.params.id;
    try {
      const existing = await prisma_default.outputEntry.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "Not found" });
      const validation = validateOutputPayload({
        productId: existing.productId,
        batchId: existing.batchId,
        packagingString: req.body.packagingString ?? existing.packagingString,
        timestamp: existing.timestamp.getTime()
      });
      if (!validation.ok) return res.status(400).json({ error: "Invalid output payload", details: validation.errors });
      const product = await prisma_default.product.findUnique({ where: { id: existing.productId } });
      const parsed = parsePackagingString(req.body.packagingString || existing.packagingString, product?.defaultPalletWeight ?? 900, product?.defaultBagWeight ?? 850);
      if (anyFractional(parsed)) return res.status(400).json({ error: "Fractional unit counts in output packaging are not allowed. Use partial unit weights (e.g. 1 pad*700) or add an explicit kg segment if truly loose." });
      const updated = await prisma_default.outputEntry.update({ where: { id }, data: {
        packagingString: req.body.packagingString ?? existing.packagingString,
        pallets: parsed.pallets,
        bigBags: parsed.bigBags,
        tanks: parsed.tanks,
        totalWeight: parsed.totalWeight
      } });
      void logAudit(req, { action: "UPDATE", tableName: "OutputEntry", recordId: updated.id, details: JSON.stringify(toClientOutput(updated)) });
      res.json(toClientOutput(updated));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.delete("/api/output-entries/:id", async (req, res) => {
    try {
      await prisma_default.outputEntry.delete({ where: { id: req.params.id } });
      void logAudit(req, { action: "DELETE", tableName: "OutputEntry", recordId: req.params.id, details: JSON.stringify({ id: req.params.id }) });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.post("/api/dispatch-entries", async (req, res) => {
    const b = req.body;
    const validation = validateDispatchPayload(b);
    if (!validation.ok) return res.status(400).json({ error: "Invalid dispatch payload", details: validation.errors });
    try {
      const created = await prisma_default.dispatchEntry.create({ data: {
        date: b.date ? new Date(b.date) : /* @__PURE__ */ new Date(),
        buyerId: b.buyerId ?? null,
        buyerName: b.buyerName || b.buyer || "",
        buyerCompanyCode: normalizeCompanyCodes(b.buyerCompanyCode) ?? getPrimaryCompanyCode(b.companyCode) ?? null,
        contractNumber: b.contractNumber ?? null,
        productId: b.productId,
        quantityKg: b.quantityKg,
        orderedQuantityKg: b.orderedQuantityKg ?? null,
        batchRefId: b.batchRefId ?? null,
        packagingString: b.packagingString ?? null,
        pallets: b.pallets ?? null,
        bigBags: b.bigBags ?? null,
        tanks: b.tanks ?? null,
        totalWeight: b.totalWeight ?? null,
        salesPricePerKg: b.salesPricePerKg ?? 0,
        totalRevenue: b.totalRevenue ?? 0,
        status: b.status ?? "planned"
      } });
      const fetched = await prisma_default.dispatchEntry.findUnique({ where: { id: created.id }, include: { shipments: true } });
      void logAudit(req, { action: "CREATE", tableName: "DispatchEntry", recordId: created.id, details: JSON.stringify(toClientDispatch(fetched)) });
      res.json(toClientDispatch(fetched));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/dispatch-entries/:id", async (req, res) => {
    try {
      const data = { ...req.body };
      const existing = await prisma_default.dispatchEntry.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (data.date) data.date = new Date(data.date);
      if (Object.prototype.hasOwnProperty.call(data, "buyer")) {
        data.buyerName = data.buyer;
        delete data.buyer;
      }
      if (Object.prototype.hasOwnProperty.call(data, "buyerCompanyCode")) {
        data.buyerCompanyCode = normalizeCompanyCodes(data.buyerCompanyCode) ?? null;
      }
      const mergedDispatch = {
        productId: data.productId ?? existing.productId,
        buyerName: data.buyerName ?? existing.buyerName,
        orderedQuantityKg: data.orderedQuantityKg ?? existing.orderedQuantityKg ?? existing.quantityKg,
        salesPricePerKg: data.salesPricePerKg ?? existing.salesPricePerKg,
        date: data.date ? data.date.getTime() : existing.date.getTime()
      };
      const dispatchValidation = validateDispatchPayload(mergedDispatch);
      if (!dispatchValidation.ok) return res.status(400).json({ error: "Invalid dispatch payload", details: dispatchValidation.errors });
      if (typeof data.orderedQuantityKg === "number") {
        const parent = await prisma_default.dispatchEntry.findUnique({ where: { id: req.params.id }, include: { shipments: true } });
        const shipped = parent ? (parent.shipments || []).reduce((acc, s) => acc + (s.quantityKg || 0), 0) : 0;
        if (data.orderedQuantityKg < shipped - 1e-6) {
          return res.status(409).json({ error: "orderedQuantityKg cannot be lower than already shipped quantity", orderedQuantityKg: data.orderedQuantityKg, shipped });
        }
      }
      await prisma_default.dispatchEntry.update({ where: { id: req.params.id }, data });
      const fetched = await prisma_default.dispatchEntry.findUnique({ where: { id: req.params.id }, include: { shipments: true } });
      void logAudit(req, { action: "UPDATE", tableName: "DispatchEntry", recordId: req.params.id, details: JSON.stringify(toClientDispatch(fetched)) });
      res.json(toClientDispatch(fetched));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.delete("/api/dispatch-entries/:id", async (req, res) => {
    try {
      await prisma_default.dispatchEntry.delete({ where: { id: req.params.id } });
      void logAudit(req, { action: "DELETE", tableName: "DispatchEntry", recordId: req.params.id, details: JSON.stringify({ id: req.params.id }) });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.post("/api/dispatch-entries/:id/shipments", async (req, res) => {
    const dispatchId = req.params.id;
    const s = req.body;
    const validation = validateShipmentPayload(s);
    if (!validation.ok) return res.status(400).json({ error: "Invalid shipment payload", details: validation.errors });
    try {
      const parent = await prisma_default.dispatchEntry.findUnique({ where: { id: dispatchId }, include: { shipments: true } });
      if (!parent) return res.status(404).json({ error: "Dispatch not found" });
      const product = await prisma_default.product.findUnique({ where: { id: s.productId ?? void 0 } });
      const parsed = s.packagingString ? parsePackagingString(s.packagingString, product?.defaultPalletWeight ?? 900, product?.defaultBagWeight ?? 850) : { pallets: 0, bigBags: 0, tanks: 0, totalWeight: 0, isValid: false };
      if (parsed.isValid && anyFractional(parsed)) {
        return res.status(400).json({ error: "Fractional unit counts in shipment packaging are not allowed. Use partial unit weights (e.g. 1 pad*700) or add an explicit kg segment if truly loose." });
      }
      const finalQty = parsed.isValid && parsed.totalWeight > 0 ? parsed.totalWeight : s.quantityKg;
      const orderLimit = parent.orderedQuantityKg ?? parent.quantityKg ?? null;
      if (orderLimit && orderLimit > 0) {
        const existingTotal = (parent.shipments || []).reduce((acc, cur) => acc + (cur.quantityKg || 0), 0);
        const attempted = finalQty;
        const projected = existingTotal + attempted;
        if (projected - orderLimit > 1e-6) {
          return res.status(409).json({ error: "Shipment exceeds orderedQuantityKg", orderLimit, currentTotal: existingTotal, attempted, projected });
        }
      }
      const created = await prisma_default.dispatchShipment.create({ data: {
        dispatchEntryId: dispatchId,
        date: s.date ? new Date(s.date) : /* @__PURE__ */ new Date(),
        quantityKg: finalQty,
        batchId: s.batchId ?? null,
        note: s.note ?? null,
        packagingString: s.packagingString ?? null,
        pallets: parsed.pallets || null,
        bigBags: parsed.bigBags || null,
        tanks: parsed.tanks || null,
        totalWeight: parsed.totalWeight || null
      } });
      void logAudit(req, { action: "CREATE", tableName: "DispatchShipment", recordId: created.id, details: JSON.stringify({ dispatchEntryId: dispatchId, quantityKg: created.quantityKg }) });
      const shipments = await prisma_default.dispatchShipment.findMany({ where: { dispatchEntryId: dispatchId } });
      const total = shipments.reduce((acc, cur) => acc + cur.quantityKg, 0);
      const dispatch = await prisma_default.dispatchEntry.findUnique({ where: { id: dispatchId } });
      const totalRevenue = (dispatch?.salesPricePerKg ?? 0) * total;
      await prisma_default.dispatchEntry.update({ where: { id: dispatchId }, data: { quantityKg: total, totalRevenue } });
      const fetched = await prisma_default.dispatchEntry.findUnique({ where: { id: dispatchId }, include: { shipments: true } });
      void logAudit(req, { action: "UPDATE", tableName: "DispatchEntry", recordId: dispatchId, details: JSON.stringify(toClientDispatch(fetched)) });
      res.json(toClientDispatch(fetched));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/dispatch-entries/:id/shipments/:shipmentId", async (req, res) => {
    const { id, shipmentId } = req.params;
    try {
      await prisma_default.dispatchShipment.delete({ where: { id: shipmentId } });
      void logAudit(req, { action: "DELETE", tableName: "DispatchShipment", recordId: shipmentId, details: JSON.stringify({ id: shipmentId, dispatchEntryId: id }) });
      const shipments = await prisma_default.dispatchShipment.findMany({ where: { dispatchEntryId: id } });
      const total = shipments.reduce((acc, cur) => acc + cur.quantityKg, 0);
      const dispatch = await prisma_default.dispatchEntry.findUnique({ where: { id } });
      const totalRevenue = (dispatch?.salesPricePerKg ?? 0) * total;
      await prisma_default.dispatchEntry.update({ where: { id }, data: { quantityKg: total, totalRevenue } });
      const fetched = await prisma_default.dispatchEntry.findUnique({ where: { id }, include: { shipments: true } });
      void logAudit(req, { action: "UPDATE", tableName: "DispatchEntry", recordId: id, details: JSON.stringify(toClientDispatch(fetched)) });
      res.json(toClientDispatch(fetched));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.put("/api/dispatch-entries/:id/shipments/:shipmentId", async (req, res) => {
    const { id, shipmentId } = req.params;
    const body = req.body;
    try {
      const existing = await prisma_default.dispatchShipment.findUnique({ where: { id: shipmentId } });
      if (!existing) return res.status(404).json({ error: "Shipment not found" });
      const shipmentValidation = validateShipmentPayload({
        quantityKg: body.quantityKg ?? existing.quantityKg,
        date: body.date ?? existing.date.getTime()
      });
      if (!shipmentValidation.ok) return res.status(400).json({ error: "Invalid shipment payload", details: shipmentValidation.errors });
      const dispatchEntry = await prisma_default.dispatchEntry.findUnique({ where: { id } });
      if (!dispatchEntry) return res.status(404).json({ error: "Dispatch not found" });
      const product = await prisma_default.product.findUnique({ where: { id: dispatchEntry.productId } });
      let parsed = { pallets: 0, bigBags: 0, tanks: 0, totalWeight: 0, isValid: false };
      if (typeof body.packagingString === "string" && body.packagingString.trim() !== "") {
        const { normalizePackagingString: normalizePackagingString2 } = await Promise.resolve().then(() => (init_packagingNormalize(), packagingNormalize_exports));
        const norm2 = normalizePackagingString2(body.packagingString, product?.defaultPalletWeight ?? 900, product?.defaultBagWeight ?? 850);
        const { parsePackagingString: parsePackagingString2 } = await Promise.resolve().then(() => (init_parser(), parser_exports));
        parsed = parsePackagingString2(norm2.normalized, product?.defaultPalletWeight ?? 900, product?.defaultBagWeight ?? 850);
        if (parsed.isValid && anyFractional(parsed)) return res.status(400).json({ error: "Fractional unit counts in shipment packaging are not allowed. Use partial unit weights (e.g. 1 pad*700) or add an explicit kg segment if truly loose." });
      }
      const finalQty = parsed.isValid && parsed.totalWeight > 0 ? parsed.totalWeight : body.quantityKg ?? existing.quantityKg;
      const parent = await prisma_default.dispatchEntry.findUnique({ where: { id }, include: { shipments: true } });
      const limit = parent ? parent.orderedQuantityKg ?? parent.quantityKg ?? null : null;
      if (parent && limit && limit > 0) {
        const existingTotal = (parent.shipments || []).reduce((acc, cur) => acc + (cur.quantityKg || 0), 0) - (existing.quantityKg || 0);
        const attempted = finalQty;
        const projected = existingTotal + attempted;
        if (projected - limit > 1e-6) {
          return res.status(409).json({ error: "Updating shipment exceeds orderedQuantityKg", orderLimit: limit, currentTotal: existingTotal, attempted, projected });
        }
      }
      const updatedShipment = await prisma_default.dispatchShipment.update({ where: { id: shipmentId }, data: {
        date: body.date ? new Date(body.date) : existing.date,
        quantityKg: finalQty,
        batchId: body.batchId ?? existing.batchId,
        note: body.note ?? existing.note,
        packagingString: body.packagingString ?? existing.packagingString,
        pallets: parsed.pallets || null,
        bigBags: parsed.bigBags || null,
        tanks: parsed.tanks || null,
        totalWeight: parsed.totalWeight || null
      } });
      void logAudit(req, { action: "UPDATE", tableName: "DispatchShipment", recordId: updatedShipment.id, details: JSON.stringify({ id: updatedShipment.id, quantityKg: updatedShipment.quantityKg }) });
      const shipments = await prisma_default.dispatchShipment.findMany({ where: { dispatchEntryId: id } });
      const total = shipments.reduce((acc, cur) => acc + cur.quantityKg, 0);
      const dispatch = await prisma_default.dispatchEntry.findUnique({ where: { id } });
      const totalRevenue = (dispatch?.salesPricePerKg ?? 0) * total;
      await prisma_default.dispatchEntry.update({ where: { id }, data: { quantityKg: total, totalRevenue } });
      const fetched = await prisma_default.dispatchEntry.findUnique({ where: { id }, include: { shipments: true } });
      void logAudit(req, { action: "UPDATE", tableName: "DispatchEntry", recordId: id, details: JSON.stringify(toClientDispatch(fetched)) });
      res.json(toClientDispatch(fetched));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    console.log("[ENV] VITE_AAD_API_SCOPE =", process.env.VITE_AAD_API_SCOPE);
    const root = process.cwd();
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root,
      envDir: root,
      configFile: path.resolve(root, "vite.config.ts"),
      mode: "development",
      define: {
        "import.meta.env.VITE_AAD_CLIENT_ID": JSON.stringify(process.env.VITE_AAD_CLIENT_ID || ""),
        "import.meta.env.VITE_AAD_TENANT_ID": JSON.stringify(process.env.VITE_AAD_TENANT_ID || ""),
        "import.meta.env.VITE_AAD_ALLOWED_DOMAIN": JSON.stringify(process.env.VITE_AAD_ALLOWED_DOMAIN || ""),
        "import.meta.env.VITE_AAD_API_SCOPE": JSON.stringify(process.env.VITE_AAD_API_SCOPE || "")
      },
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "../dist");
    const indexPath = path.join(distPath, "index.html");
    app.use(express.static(distPath));
    app.get(/^(?!\/(api|config)(\/|$)).*/, (req, res) => {
      return res.sendFile(indexPath);
    });
  }
  console.log("[BOOT] starting server", {
    node: process.version,
    env: process.env.NODE_ENV,
    port: process.env.PORT
  });
  app.listen(port, host, () => {
    console.log(`[BOOT] listening on ${host}:${port}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
//# sourceMappingURL=server.js.map