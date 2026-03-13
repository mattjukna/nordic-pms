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
      { header: "Kg", key: "kg", width: 12 },
      { header: "Fat %", key: "fat", width: 10 },
      { header: "Protein %", key: "protein", width: 10 },
      { header: "pH", key: "ph", width: 8 },
      { header: "Temp \xB0C", key: "temp", width: 10 },
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
        fat: r.fatPct,
        protein: r.proteinPct,
        ph: r.ph,
        temp: r.tempCelsius,
        eco: r.isEcological ? "Yes" : "No",
        tags: Array.isArray(r.tags) ? r.tags.map((t) => t.tag).join(", ") : "",
        note: r.note || ""
      });
    }
    sheet.getColumn("kg").numFmt = "#,##0";
    sheet.getColumn("fat").numFmt = "0.00";
    sheet.getColumn("protein").numFmt = "0.00";
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
  ph: i.ph,
  fatPct: i.fatPct,
  proteinPct: i.proteinPct,
  tempCelsius: i.tempCelsius,
  isEcological: Boolean(i.isEcological),
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
  app.use(cors());
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
        prisma_default.product.findMany(),
        prisma_default.milkType.findMany(),
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
      console.error("DB bootstrap error:", err?.message ?? err);
      res.status(500).json({ error: err?.message ?? "Database error", hint: "Check DATABASE_URL / firewall / db paused" });
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
        companyCode: body.companyCode ?? null,
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
        companyCode: b.companyCode ?? null,
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
      await prisma_default.buyer.update({ where: { id: req.params.id }, data: req.body });
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
    const p = req.body;
    if (!p.id || !p.name) return res.status(400).json({ error: "Missing product id or name" });
    try {
      const created = await prisma_default.product.create({ data: p });
      res.json(created);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/products/:id", async (req, res) => {
    try {
      const updated = await prisma_default.product.update({ where: { id: req.params.id }, data: req.body });
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
  app.post("/api/milk-types", async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Missing milk type name" });
    try {
      const created = await prisma_default.milkType.upsert({ where: { name }, update: {}, create: { name } });
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
    if (!body.supplierId || !body.timestamp) return res.status(400).json({ error: "Missing supplierId or timestamp" });
    try {
      const ts = new Date(body.timestamp);
      const year = ts.getFullYear();
      const month = ts.getMonth();
      const periodStart = new Date(year, month, 1);
      const supplier = await prisma_default.supplier.findUnique({ where: { id: body.supplierId } });
      const pricing = await prisma_default.supplierPricingPeriod.findFirst({ where: { supplierId: body.supplierId, periodStart } });
      const basePrice = pricing?.normalMilkPricePerKg ?? pricing?.basePricePerKg ?? supplier?.normalMilkPricePerKg ?? supplier?.basePricePerKg ?? 0;
      const fatBonus = pricing?.fatBonusPerPct ?? supplier?.fatBonusPerPct ?? 0;
      const proteinBonus = pricing?.proteinBonusPerPct ?? supplier?.proteinBonusPerPct ?? 0;
      const unitAdjust = (body.fatPct - 4) * 10 * fatBonus + (body.proteinPct - 3.2) * 10 * proteinBonus;
      const unitPrice = basePrice + unitAdjust;
      const calculatedCost = (body.quantityKg || 0) * unitPrice;
      const created = await prisma_default.intakeEntry.create({ data: {
        supplierId: body.supplierId,
        supplierName: body.supplierName,
        routeGroup: body.routeGroup,
        milkType: body.milkType,
        quantityKg: body.quantityKg,
        ph: body.ph,
        fatPct: body.fatPct,
        proteinPct: body.proteinPct,
        tempCelsius: body.tempCelsius,
        isEcological: body.isEcological ?? false,
        note: body.note ?? null,
        timestamp: ts,
        calculatedCost,
        isTempAlertDismissed: body.isTempAlertDismissed ?? false,
        isDiscarded: body.isDiscarded ?? false
      } });
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
      const ts = data.timestamp ? new Date(data.timestamp) : null;
      if (data.supplierId && ts) {
        const year = ts.getFullYear();
        const month = ts.getMonth();
        const periodStart = new Date(year, month, 1);
        const supplier = await prisma_default.supplier.findUnique({ where: { id: data.supplierId } });
        const pricing = await prisma_default.supplierPricingPeriod.findFirst({ where: { supplierId: data.supplierId, periodStart } });
        const basePrice = pricing?.normalMilkPricePerKg ?? pricing?.basePricePerKg ?? supplier?.normalMilkPricePerKg ?? supplier?.basePricePerKg ?? 0;
        const fatBonus = pricing?.fatBonusPerPct ?? supplier?.fatBonusPerPct ?? 0;
        const proteinBonus = pricing?.proteinBonusPerPct ?? supplier?.proteinBonusPerPct ?? 0;
        const fatPct = data.fatPct ?? 4;
        const proteinPct = data.proteinPct ?? 3.2;
        const unitAdjust = (fatPct - 4) * 10 * fatBonus + (proteinPct - 3.2) * 10 * proteinBonus;
        const unitPrice = basePrice + unitAdjust;
        data.calculatedCost = (data.quantityKg ?? 0) * unitPrice;
      }
      const updated = await prisma_default.intakeEntry.update({ where: { id }, data });
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
    if (!body.productId || !body.timestamp) return res.status(400).json({ error: "Missing productId or timestamp" });
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
    if (!b.productId || b.quantityKg == null) return res.status(400).json({ error: "Missing productId or quantityKg" });
    try {
      const created = await prisma_default.dispatchEntry.create({ data: {
        date: b.date ? new Date(b.date) : /* @__PURE__ */ new Date(),
        buyerId: b.buyerId ?? null,
        buyerName: b.buyerName || "",
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
      if (data.date) data.date = new Date(data.date);
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
    if (!s.quantityKg) return res.status(400).json({ error: "Missing quantityKg" });
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