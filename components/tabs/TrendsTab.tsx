import React, { useMemo, useState } from "react";
import { useStore } from "../../store";
import { GlassCard } from "../ui/GlassCard";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  LineChart,
  AreaChart,
  Area,
  BarChart,
  ReferenceLine,
} from "recharts";
import {
  BarChart3,
  Factory,
  Microscope,
  Coins,
  Calendar,
  AlertCircle,
  Droplets,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  ShieldCheck,
  Package,
} from "lucide-react";
import ReportExportModal from "../ui/ReportExportModal";
import type { IntakeEntry, OutputEntry, DispatchEntry } from "../../types";
import { isShippedStatus, getShippedKg, getShippedRevenue, getShipmentsByDate } from "../../utils/dispatchMath";
import { formatDate } from '../../utils/date';
import { getEffectiveIntakeQuantityKg } from '../../utils/intakeCoefficient';

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

const TARGET_YIELD_FACTOR = 0.125;
const FAT_TARGET = 4.0;
const PROT_TARGET = 3.2;
const PH_MIN = 6.55;
const PH_MAX = 6.74;
const TEMP_MAX = 8;

type TimeRange = "day" | "week" | "month" | "quarter" | "year" | "all";
type ViewMode = "financial" | "production" | "quality";
type ProdSubtab = "output" | "intake";

const toISODate = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const endOfDayTs = (d: Date) => { const c = new Date(d); c.setHours(23,59,59,999); return c.getTime(); };
const startOfDayTs = (d: Date) => { const c = new Date(d); c.setHours(0,0,0,0); return c.getTime(); };

const formatKg = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${Math.round(v).toLocaleString()} kg`);
const formatEur = (v: number) => `€${Math.round(v).toLocaleString()}`;

/* ─────── Delta badge (period-over-period) ─────── */
const DeltaBadge: React.FC<{ current: number; previous: number; inverse?: boolean }> = ({ current, previous, inverse }) => {
  if (previous === 0 && current === 0) return null;
  const pct = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : (current > 0 ? 100 : -100);
  if (Math.abs(pct) < 0.5) return <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400"><Minus size={10} /> 0%</span>;
  const isPositive = pct > 0;
  const isGood = inverse ? !isPositive : isPositive;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${isGood ? 'text-emerald-600' : 'text-red-500'}`}>
      {isPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
};

/* ─────── Custom tooltip ─────── */
const ChartTooltip: React.FC<any> = ({ active, payload, label, eurKeys = [], kgKeys = [], pctKeys = [] }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl shadow-xl p-3 text-xs min-w-[140px]">
      <div className="font-bold text-slate-700 mb-1.5 border-b border-slate-100 pb-1">{label}</div>
      {payload.filter((e: any) => e.value != null).map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.color || entry.stroke || entry.fill || '#64748b' }} />
          <span className="text-slate-500 truncate">{entry.name}:</span>
          <span className="font-bold text-slate-800 ml-auto whitespace-nowrap">
            {eurKeys.includes(entry.dataKey) ? formatEur(Number(entry.value)) :
             kgKeys.includes(entry.dataKey) ? formatKg(Number(entry.value)) :
             pctKeys.includes(entry.dataKey) ? `${Number(entry.value).toFixed(2)}%` :
             typeof entry.value === 'number' ? Number(entry.value).toLocaleString(undefined, { maximumFractionDigits: 2 }) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
};

const EmptyState: React.FC<{ title: string; hint?: string }> = ({ title, hint }) => (
  <div className="p-6 text-center text-slate-500">
    <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
      <AlertCircle className="h-5 w-5" />
    </div>
    <div className="font-semibold text-slate-700">{title}</div>
    {hint && <div className="mt-1 text-sm">{hint}</div>}
  </div>
);

/* ═══════════════════════ MAIN COMPONENT ═══════════════════════ */

export const TrendsTab: React.FC = () => {
  const intakeEntries = useStore((s) => s.intakeEntries);
  const outputEntries = useStore((s) => s.outputEntries);
  const dispatchEntries = useStore((s) => s.dispatchEntries);
  const globalConfig = useStore((s) => s.globalConfig);
  const products = useStore((s) => s.products);
  const suppliers = useStore((s) => s.suppliers);
  const milkTypes = useStore((s) => s.milkTypes);
  const userSettings = useStore((s) => s.userSettings);

  const [activeView, setActiveView] = useState<ViewMode>("financial");
  const [timeRange, setTimeRange] = useState<TimeRange>((userSettings?.defaultAnalyticsRange as any) || "month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [prodSubtab, setProdSubtab] = useState<ProdSubtab>("output");
  const ALL = "__all__";
  const [productFilter, setProductFilter] = useState(ALL);
  const [milkTypeFilter, setMilkTypeFilter] = useState(ALL);
  const [supplierFilter, setSupplierFilter] = useState(ALL);
  const [showReportModal, setShowReportModal] = useState(false);

  const productNameById = useMemo(() => new Map(products.map(p => [p.id, p.name])), [products]);

  /* ───── DATE FILTER ───── */
  const { filteredIntake, filteredOutput, filteredDispatch, dateLabel, rangeStartTs, rangeEndTs } = useMemo(() => {
    const now = new Date();
    const defaultEnd = endOfDayTs(now);
    let startTs = 0, endTs = defaultEnd, label = "";

    if (customStart) {
      startTs = startOfDayTs(new Date(customStart));
      endTs = customEnd ? endOfDayTs(new Date(customEnd)) : defaultEnd;
      label = `${customStart}${customEnd ? ` → ${customEnd}` : ""}`;
    } else {
      const todayStart = startOfDayTs(now);
      const sub = (days: number) => { const d = new Date(todayStart); d.setDate(d.getDate() - days); return d.getTime(); };
      switch (timeRange) {
        case "day": startTs = todayStart; label = "Today"; break;
        case "week": startTs = sub(7); label = "Last 7 days"; break;
        case "month": startTs = sub(30); label = "Last 30 days"; break;
        case "quarter": startTs = sub(90); label = "Last 90 days"; break;
        case "year": startTs = sub(365); label = "Last 365 days"; break;
        case "all": startTs = 0; label = "All time"; break;
      }
    }

    const intake = (intakeEntries as IntakeEntry[]).filter(e => e.timestamp >= startTs && e.timestamp <= endTs);
    const output = (outputEntries as OutputEntry[]).filter(e => e.timestamp >= startTs && e.timestamp <= endTs);
    const dispatch = (dispatchEntries as DispatchEntry[]).filter(e => e.date >= startTs && e.date <= endTs && isShippedStatus(e.status));
    return { filteredIntake: intake, filteredOutput: output, filteredDispatch: dispatch, dateLabel: label, rangeStartTs: startTs, rangeEndTs: endTs };
  }, [timeRange, customStart, customEnd, intakeEntries, outputEntries, dispatchEntries]);

  /* ───── PREVIOUS PERIOD (for delta comparison) ───── */
  const { prevIntake, prevOutput, prevDispatch } = useMemo(() => {
    if (timeRange === "all" && !customStart) return { prevIntake: [] as IntakeEntry[], prevOutput: [] as OutputEntry[], prevDispatch: [] as DispatchEntry[] };
    const dur = rangeEndTs - rangeStartTs;
    if (dur <= 0) return { prevIntake: [] as IntakeEntry[], prevOutput: [] as OutputEntry[], prevDispatch: [] as DispatchEntry[] };
    const pStart = rangeStartTs - dur;
    const pEnd = rangeStartTs - 1;
    return {
      prevIntake: (intakeEntries as IntakeEntry[]).filter(e => e.timestamp >= pStart && e.timestamp <= pEnd),
      prevOutput: (outputEntries as OutputEntry[]).filter(e => e.timestamp >= pStart && e.timestamp <= pEnd),
      prevDispatch: (dispatchEntries as DispatchEntry[]).filter(e => e.date >= pStart && e.date <= pEnd && isShippedStatus(e.status)),
    };
  }, [timeRange, customStart, rangeStartTs, rangeEndTs, intakeEntries, outputEntries, dispatchEntries]);

  const nonDiscardedFilteredIntake = useMemo(() => filteredIntake.filter(e => e.isDiscarded !== true), [filteredIntake]);
  const prevNonDiscarded = useMemo(() => prevIntake.filter(e => e.isDiscarded !== true), [prevIntake]);

  /* ───── FINANCIAL KPIs ───── */
  const financialKPIs = useMemo(() => {
    const totalRevenue = filteredDispatch.reduce((s, e) => s + getShippedRevenue(e), 0);
    const rawMaterialCost = nonDiscardedFilteredIntake.reduce((s, e) => s + (e.calculatedCost || 0), 0);
    const discardedLoss = filteredIntake.filter(e => e.isDiscarded === true).reduce((s, e) => s + (e.calculatedCost || 0), 0);
    const totalIntakeKg = nonDiscardedFilteredIntake.reduce((s, e) => s + (e.quantityKg || 0), 0);
    const processingCost = (totalIntakeKg / 1000) * (globalConfig?.processingCostPerTon || 0);
    const cogs = rawMaterialCost + processingCost;
    const margin = totalRevenue - cogs;
    const marginPct = totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0;
    const totalDispatchKg = filteredDispatch.reduce((s, e) => s + getShippedKg(e), 0);
    return { revenue: totalRevenue, rawMaterialCost, discardedLoss, processingCost, cogs, margin, marginPct, avgMilkPrice: totalIntakeKg > 0 ? rawMaterialCost / totalIntakeKg : 0, avgSalesPrice: totalDispatchKg > 0 ? totalRevenue / totalDispatchKg : 0 };
  }, [filteredDispatch, filteredIntake, nonDiscardedFilteredIntake, globalConfig]);

  const prevFinancialKPIs = useMemo(() => {
    const revenue = prevDispatch.reduce((s, e) => s + getShippedRevenue(e), 0);
    const rawMaterialCost = prevNonDiscarded.reduce((s, e) => s + (e.calculatedCost || 0), 0);
    const totalIntakeKg = prevNonDiscarded.reduce((s, e) => s + (e.quantityKg || 0), 0);
    const processingCost = (totalIntakeKg / 1000) * (globalConfig?.processingCostPerTon || 0);
    const cogs = rawMaterialCost + processingCost;
    const margin = revenue - cogs;
    const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;
    return { revenue, rawMaterialCost, margin, marginPct };
  }, [prevDispatch, prevNonDiscarded, globalConfig]);

  /* ───── PRODUCTION KPIs ───── */
  const productionKPIs = useMemo(() => {
    const totalIntake = nonDiscardedFilteredIntake.reduce((s, e) => s + (e.quantityKg || 0), 0);
    const totalEffective = nonDiscardedFilteredIntake.reduce((s, e) => s + getEffectiveIntakeQuantityKg(e), 0);
    const discardedKg = filteredIntake.filter(e => e.isDiscarded === true).reduce((s, e) => s + (e.quantityKg || 0), 0);
    const totalOutput = filteredOutput.reduce((s, e) => s + (e.parsed?.totalWeight || 0), 0);
    const currentYield = totalEffective > 0 ? (totalOutput / totalEffective) * 100 : 0;
    const varianceKg = totalOutput - (totalEffective * TARGET_YIELD_FACTOR);
    const productTotals: Record<string, number> = {};
    filteredOutput.forEach(e => { productTotals[e.productId] = (productTotals[e.productId] || 0) + (e.parsed?.totalWeight || 0); });
    const top = Object.entries(productTotals).sort((a, b) => b[1] - a[1])[0];
    return { totalIntake, totalEffective, totalOutput, discardedKg, discardedPct: (totalIntake + discardedKg) > 0 ? (discardedKg / (totalIntake + discardedKg)) * 100 : 0, currentYield, varianceKg, topProductName: top?.[0] || 'N/A' };
  }, [nonDiscardedFilteredIntake, filteredIntake, filteredOutput]);

  const prevProductionKPIs = useMemo(() => {
    const totalIntake = prevNonDiscarded.reduce((s, e) => s + (e.quantityKg || 0), 0);
    const totalEffective = prevNonDiscarded.reduce((s, e) => s + getEffectiveIntakeQuantityKg(e), 0);
    const totalOutput = prevOutput.reduce((s, e) => s + (e.parsed?.totalWeight || 0), 0);
    const currentYield = totalEffective > 0 ? (totalOutput / totalEffective) * 100 : 0;
    return { totalIntake, totalOutput, currentYield };
  }, [prevNonDiscarded, prevOutput]);

  /* ───── QUALITY KPIs ───── */
  const qualityKPIs = useMemo(() => {
    const total = nonDiscardedFilteredIntake.length;
    const totalKg = nonDiscardedFilteredIntake.reduce((s, e) => s + (e.quantityKg || 0), 0);
    const wFat = nonDiscardedFilteredIntake.reduce((s, e) => s + ((e.fatPct || 0) * (e.quantityKg || 0)), 0);
    const wProt = nonDiscardedFilteredIntake.reduce((s, e) => s + ((e.proteinPct || 0) * (e.quantityKg || 0)), 0);
    const wPh = nonDiscardedFilteredIntake.reduce((s, e) => s + ((e.ph || 0) * (e.quantityKg || 0)), 0);
    const highTemp = filteredIntake.filter(e => (e.tempCelsius || 0) > TEMP_MAX).length;
    const badPh = filteredIntake.filter(e => (e.ph || 0) > PH_MAX || (e.ph || 0) < PH_MIN).length;
    const fullyOk = nonDiscardedFilteredIntake.filter(e => (e.tempCelsius || 0) <= TEMP_MAX && (e.ph || 0) >= PH_MIN && (e.ph || 0) <= PH_MAX).length;
    return { avgFat: totalKg > 0 ? wFat / totalKg : 0, avgProt: totalKg > 0 ? wProt / totalKg : 0, avgPh: totalKg > 0 ? wPh / totalKg : 0, highTempCount: highTemp, badPhCount: badPh, compliancePct: total > 0 ? (fullyOk / total) * 100 : 0, total };
  }, [nonDiscardedFilteredIntake, filteredIntake]);

  const prevQualityKPIs = useMemo(() => {
    const total = prevNonDiscarded.length;
    const fullyOk = prevNonDiscarded.filter(e => (e.tempCelsius || 0) <= TEMP_MAX && (e.ph || 0) >= PH_MIN && (e.ph || 0) <= PH_MAX).length;
    return { compliancePct: total > 0 ? (fullyOk / total) * 100 : 0 };
  }, [prevNonDiscarded]);

  /* ───── DAILY SERIES ───── */
  const dailyFinancialData = useMemo(() => {
    const map: Record<string, { date: string; revenue: number; cost: number; discarded: number; profit: number }> = {};
    nonDiscardedFilteredIntake.forEach(e => { const d = toISODate(e.timestamp); if (!map[d]) map[d] = { date: d, revenue: 0, cost: 0, discarded: 0, profit: 0 }; map[d].cost += e.calculatedCost || 0; });
    filteredIntake.filter(e => e.isDiscarded === true).forEach(e => { const d = toISODate(e.timestamp); if (!map[d]) map[d] = { date: d, revenue: 0, cost: 0, discarded: 0, profit: 0 }; map[d].discarded += e.calculatedCost || 0; });
    filteredDispatch.forEach(e => {
      const ship = getShipmentsByDate(e);
      if (ship?.length) ship.forEach(s => { const d = toISODate(s.date); if (!map[d]) map[d] = { date: d, revenue: 0, cost: 0, discarded: 0, profit: 0 }; const p = Number.isFinite(Number(e.salesPricePerKg)) ? Number(e.salesPricePerKg) : 0; map[d].revenue += (s.quantityKg || 0) * p; });
      else { const d = toISODate(e.date); if (!map[d]) map[d] = { date: d, revenue: 0, cost: 0, discarded: 0, profit: 0 }; map[d].revenue += getShippedRevenue(e); }
    });
    return Object.values(map).map(r => ({ ...r, profit: r.revenue - r.cost })).sort((a, b) => a.date < b.date ? -1 : 1);
  }, [nonDiscardedFilteredIntake, filteredIntake, filteredDispatch]);

  const dailyProductionData = useMemo(() => {
    const map: Record<string, { date: string; intake: number; effectiveIntake: number; discarded: number; output: number; yield: number }> = {};
    nonDiscardedFilteredIntake.forEach(e => { const d = toISODate(e.timestamp); if (!map[d]) map[d] = { date: d, intake: 0, effectiveIntake: 0, discarded: 0, output: 0, yield: 0 }; map[d].intake += e.quantityKg || 0; map[d].effectiveIntake += getEffectiveIntakeQuantityKg(e); });
    filteredIntake.filter(e => e.isDiscarded === true).forEach(e => { const d = toISODate(e.timestamp); if (!map[d]) map[d] = { date: d, intake: 0, effectiveIntake: 0, discarded: 0, output: 0, yield: 0 }; map[d].discarded += e.quantityKg || 0; });
    filteredOutput.forEach(e => { const d = toISODate(e.timestamp); if (!map[d]) map[d] = { date: d, intake: 0, effectiveIntake: 0, discarded: 0, output: 0, yield: 0 }; map[d].output += e.parsed?.totalWeight || 0; });
    return Object.values(map).map(r => ({ ...r, yield: r.effectiveIntake > 0 ? (r.output / r.effectiveIntake) * 100 : 0 })).sort((a, b) => a.date < b.date ? -1 : 1);
  }, [nonDiscardedFilteredIntake, filteredIntake, filteredOutput]);

  /* ───── BUYER REVENUE ───── */
  const buyerRevenueData = useMemo(() => {
    const totals: Record<string, number> = {};
    filteredDispatch.forEach(d => { const name = d.buyer || 'Unknown'; totals[name] = (totals[name] || 0) + getShippedRevenue(d); });
    return Object.entries(totals).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [filteredDispatch]);

  /* ───── PRODUCT REVENUE ───── */
  const productRevenueData = useMemo(() => {
    const totals: Record<string, { revenue: number; kg: number }> = {};
    filteredDispatch.forEach(d => {
      const name = productNameById.get(d.productId) || d.productId;
      if (!totals[name]) totals[name] = { revenue: 0, kg: 0 };
      totals[name].revenue += getShippedRevenue(d);
      totals[name].kg += getShippedKg(d);
    });
    return Object.entries(totals).map(([name, data]) => ({ name, revenue: data.revenue, kg: data.kg, pricePerKg: data.kg > 0 ? data.revenue / data.kg : 0 })).sort((a, b) => b.revenue - a.revenue);
  }, [filteredDispatch, productNameById]);

  /* ───── COST BREAKDOWN ───── */
  const costBreakdownData = useMemo(() => {
    return [
      { name: 'Milk Cost', value: financialKPIs.rawMaterialCost, color: '#3b82f6' },
      { name: 'Processing', value: financialKPIs.processingCost, color: '#f59e0b' },
      { name: 'Discarded', value: financialKPIs.discardedLoss, color: '#ef4444' },
    ].filter(i => i.value > 0);
  }, [financialKPIs]);

  /* ───── PRODUCT MIX (top N + Other) ───── */
  const productMixData = useMemo(() => {
    const totals: Record<string, number> = {};
    filteredOutput.forEach(e => { totals[e.productId] = (totals[e.productId] || 0) + (e.parsed?.totalWeight || 0); });
    const list = Object.entries(totals).map(([productId, value]) => ({ id: productId, name: productNameById.get(productId) || productId, value }));
    const sorted = list.sort((a, b) => b.value - a.value);
    if (sorted.length <= 6) return sorted;
    const top = sorted.slice(0, 6);
    top.push({ id: 'other', name: "Other", value: sorted.slice(6).reduce((s, it) => s + it.value, 0) });
    return top;
  }, [filteredOutput, productNameById]);

  /* ───── INTAKE: filtered by milkType/supplier ───── */
  const intakeFiltered = useMemo(() =>
    nonDiscardedFilteredIntake.filter(e =>
      (milkTypeFilter === ALL || e.milkType === milkTypeFilter) &&
      (supplierFilter === ALL || e.supplierId === supplierFilter)
    ), [nonDiscardedFilteredIntake, milkTypeFilter, supplierFilter]);

  const intakeKPIs = useMemo(() => {
    const netKg = intakeFiltered.reduce((s, e) => s + (e.quantityKg || 0), 0);
    const discardedKg = filteredIntake.filter(e => e.isDiscarded === true && (milkTypeFilter === ALL || e.milkType === milkTypeFilter) && (supplierFilter === ALL || e.supplierId === supplierFilter)).reduce((s, e) => s + (e.quantityKg || 0), 0);
    const wFat = intakeFiltered.reduce((s, e) => s + ((e.fatPct || 0) * (e.quantityKg || 0)), 0);
    const wProt = intakeFiltered.reduce((s, e) => s + ((e.proteinPct || 0) * (e.quantityKg || 0)), 0);
    const wPh = intakeFiltered.reduce((s, e) => s + ((e.ph || 0) * (e.quantityKg || 0)), 0);
    return { netKg, discardedKg, avgFat: netKg > 0 ? wFat / netKg : 0, avgProt: netKg > 0 ? wProt / netKg : 0, avgPh: netKg > 0 ? wPh / netKg : 0 };
  }, [intakeFiltered, filteredIntake, milkTypeFilter, supplierFilter]);

  const dailyIntakeData = useMemo(() => {
    const map: Record<string, { date: string; intake: number; discarded: number }> = {};
    intakeFiltered.forEach(e => { const d = toISODate(e.timestamp); if (!map[d]) map[d] = { date: d, intake: 0, discarded: 0 }; map[d].intake += e.quantityKg || 0; });
    filteredIntake.filter(e => e.isDiscarded === true && (milkTypeFilter === ALL || e.milkType === milkTypeFilter) && (supplierFilter === ALL || e.supplierId === supplierFilter))
      .forEach(e => { const d = toISODate(e.timestamp); if (!map[d]) map[d] = { date: d, intake: 0, discarded: 0 }; map[d].discarded += e.quantityKg || 0; });
    return Object.values(map).sort((a, b) => a.date < b.date ? -1 : 1);
  }, [intakeFiltered, filteredIntake, milkTypeFilter, supplierFilter]);

  const milkTypeMixFiltered = useMemo(() => {
    const totals: Record<string, number> = {};
    intakeFiltered.forEach(e => { totals[e.milkType] = (totals[e.milkType] || 0) + (e.quantityKg || 0); });
    return Object.entries(totals).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 7);
  }, [intakeFiltered]);

  const supplierMix = useMemo(() => {
    const totals: Record<string, number> = {};
    intakeFiltered.forEach(e => { const sup = suppliers.find(s => s.id === e.supplierId)?.name || e.supplierId || 'Unknown'; totals[sup] = (totals[sup] || 0) + (e.quantityKg || 0); });
    return Object.entries(totals).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [intakeFiltered, suppliers]);

  /* ───── QUALITY TREND (daily average values) ───── */
  const qualityTrendData = useMemo(() => {
    const map: Record<string, { date: string; fat: number; protein: number; ph: number; count: number }> = {};
    nonDiscardedFilteredIntake.forEach(e => { const d = toISODate(e.timestamp); if (!map[d]) map[d] = { date: d, fat: 0, protein: 0, ph: 0, count: 0 }; map[d].fat += e.fatPct || 0; map[d].protein += e.proteinPct || 0; map[d].ph += e.ph || 0; map[d].count += 1; });
    return Object.values(map).map(r => ({ date: r.date, fat: r.count > 0 ? r.fat / r.count : 0, protein: r.count > 0 ? r.protein / r.count : 0, ph: r.count > 0 ? r.ph / r.count : 0 })).sort((a, b) => a.date < b.date ? -1 : 1);
  }, [nonDiscardedFilteredIntake]);

  /* ───── SUPPLIER QUALITY SCORECARD ───── */
  const supplierScorecard = useMemo(() => {
    const data: Record<string, { name: string; kg: number; loads: number; fatSum: number; protSum: number; phSum: number; tempOk: number; phOk: number; costSum: number }> = {};
    nonDiscardedFilteredIntake.forEach(e => {
      const id = e.supplierId;
      const name = suppliers.find(s => s.id === id)?.name || id || 'Unknown';
      if (!data[id]) data[id] = { name, kg: 0, loads: 0, fatSum: 0, protSum: 0, phSum: 0, tempOk: 0, phOk: 0, costSum: 0 };
      data[id].kg += e.quantityKg || 0;
      data[id].loads += 1;
      data[id].fatSum += e.fatPct || 0;
      data[id].protSum += e.proteinPct || 0;
      data[id].phSum += e.ph || 0;
      data[id].costSum += e.calculatedCost || 0;
      if ((e.tempCelsius || 0) <= TEMP_MAX) data[id].tempOk += 1;
      if ((e.ph || 0) >= PH_MIN && (e.ph || 0) <= PH_MAX) data[id].phOk += 1;
    });
    return Object.values(data).map(s => ({
      name: s.name, totalKg: s.kg, loads: s.loads,
      avgFat: s.loads > 0 ? s.fatSum / s.loads : 0,
      avgProtein: s.loads > 0 ? s.protSum / s.loads : 0,
      avgPh: s.loads > 0 ? s.phSum / s.loads : 0,
      totalCost: s.costSum,
      compliancePct: s.loads > 0 ? ((s.tempOk + s.phOk) / (s.loads * 2)) * 100 : 0,
    })).sort((a, b) => b.totalKg - a.totalKg);
  }, [nonDiscardedFilteredIntake, suppliers]);

  /* ───── PER-PRODUCT DATA (production subtab) ───── */
  const outputForProduct = useMemo(() => productFilter === ALL ? filteredOutput : filteredOutput.filter(o => o.productId === productFilter), [productFilter, filteredOutput]);
  const dispatchForProduct = useMemo(() => productFilter === ALL ? filteredDispatch : filteredDispatch.filter(d => d.productId === productFilter), [productFilter, filteredDispatch]);

  const perProductRows = useMemo(() => {
    const produced: Record<string, number> = {};
    const shipped: Record<string, number> = {};
    const revenue: Record<string, number> = {};
    filteredOutput.forEach(o => { produced[o.productId] = (produced[o.productId] || 0) + (o.parsed?.totalWeight || 0); });
    filteredDispatch.forEach(d => { shipped[d.productId] = (shipped[d.productId] || 0) + getShippedKg(d); revenue[d.productId] = (revenue[d.productId] || 0) + getShippedRevenue(d); });
    const ids = Array.from(new Set([...Object.keys(produced), ...Object.keys(shipped)]));
    return ids.map(id => ({ productId: id, produced: produced[id] || 0, shipped: shipped[id] || 0, revenue: revenue[id] || 0, avgPrice: (shipped[id] || 0) > 0 ? (revenue[id] || 0) / (shipped[id] || 0) : 0, netKg: (produced[id] || 0) - (shipped[id] || 0) })).sort((a, b) => b.revenue - a.revenue);
  }, [filteredOutput, filteredDispatch]);

  const buildDailySeriesForProduct = (outs: OutputEntry[], dispatches: DispatchEntry[]) => {
    const map: Record<string, { date: string; produced: number; shipped: number; revenue: number }> = {};
    outs.forEach(o => { const d = toISODate(o.timestamp); if (!map[d]) map[d] = { date: d, produced: 0, shipped: 0, revenue: 0 }; map[d].produced += o.parsed?.totalWeight || 0; });
    dispatches.forEach(d => {
      const ship = getShipmentsByDate(d);
      if (ship?.length) ship.forEach(s => { const day = toISODate(s.date); if (!map[day]) map[day] = { date: day, produced: 0, shipped: 0, revenue: 0 }; map[day].shipped += s.quantityKg || 0; map[day].revenue += (s.quantityKg || 0) * (Number.isFinite(Number(d.salesPricePerKg)) ? Number(d.salesPricePerKg) : 0); });
      else { const day = toISODate(d.date); if (!map[day]) map[day] = { date: day, produced: 0, shipped: 0, revenue: 0 }; map[day].shipped += getShippedKg(d); map[day].revenue += getShippedRevenue(d); }
    });
    return Object.values(map).sort((a, b) => a.date < b.date ? -1 : 1);
  };

  /* ───── QUALITY OUTLIERS ───── */
  const outliers = useMemo(() =>
    nonDiscardedFilteredIntake.map(e => {
      const tempScore = Math.max(0, (e.tempCelsius || 0) - TEMP_MAX);
      const phDist = Math.max(0, PH_MIN - (e.ph || 0), (e.ph || 0) - PH_MAX);
      const protDist = Math.max(0, PROT_TARGET - (e.proteinPct || 0));
      return { entry: e, score: tempScore * 2 + phDist * 5 + protDist * 3 };
    }).sort((a, b) => b.score - a.score).slice(0, 8).map(r => r.entry),
  [nonDiscardedFilteredIntake]);

  const setQuickRange = (r: TimeRange) => { setTimeRange(r); setCustomStart(''); setCustomEnd(''); };

  /* ═══════════ RENDER ═══════════ */
  return (
    <div className="space-y-5 overflow-x-hidden">

      {/* ─── HEADER / FILTERS ─── */}
      <GlassCard className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-slate-700 min-w-0">
            <Calendar className="h-4 w-4 text-slate-400" />
            <div className="text-sm font-semibold">Analytics Range:</div>
            <div className="text-sm text-slate-500">{dateLabel}</div>
            {timeRange !== 'all' && <span className="text-[10px] text-slate-400 hidden md:inline">vs previous {timeRange === 'day' ? 'day' : timeRange === 'week' ? '7 days' : timeRange === 'month' ? '30 days' : timeRange === 'quarter' ? '90 days' : '365 days'}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["day","week","month","quarter","year","all"] as TimeRange[]).map(r => (
              <button key={r} onClick={() => setQuickRange(r)} className={`px-3 py-1 text-xs font-bold rounded-md transition-all duration-200 uppercase whitespace-nowrap ${timeRange === r && !customStart ? 'bg-white text-emerald-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>
                {r}
              </button>
            ))}
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1">
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="text-xs bg-transparent outline-none text-slate-600 font-medium" />
              <span className="text-xs text-slate-400">→</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="text-xs bg-transparent outline-none text-slate-600 font-medium" />
            </div>
            <button onClick={() => setShowReportModal(true)} className="ml-2 bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-md text-sm font-semibold hover:bg-indigo-100 transition-colors" title="Export monthly report">
              Export report
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(["financial","production","quality"] as const).map(view => (
            <button key={view} onClick={() => setActiveView(view)} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all duration-200 uppercase whitespace-nowrap ${activeView === view ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>
              {view === 'financial' && <Coins className="h-4 w-4" />}
              {view === 'production' && <Factory className="h-4 w-4" />}
              {view === 'quality' && <Microscope className="h-4 w-4" />}
              {view}
            </button>
          ))}
        </div>

        {activeView === 'production' && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => setProdSubtab('output')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-md transition-all duration-200 uppercase whitespace-nowrap ${prodSubtab === 'output' ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>
              <Factory className="h-4 w-4" /> Output
            </button>
            <button onClick={() => setProdSubtab('intake')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-md transition-all duration-200 uppercase whitespace-nowrap ${prodSubtab === 'intake' ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>
              <Droplets className="h-4 w-4" /> Intake
            </button>
          </div>
        )}
      </GlassCard>

      {/* ═══════════════════ FINANCIAL ═══════════════════ */}
      {activeView === 'financial' && (
        <div className="space-y-5">
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <GlassCard className="p-4 hover:shadow-md transition-shadow duration-200" hint="Total revenue from dispatches with shipped or delivered status in the selected time period. The delta badge shows percentage change compared to the previous period of equal length.">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase text-slate-500">Revenue</div>
                <DeltaBadge current={financialKPIs.revenue} previous={prevFinancialKPIs.revenue} />
              </div>
              <div className="mt-2 text-xl md:text-2xl font-extrabold text-slate-800">{formatEur(financialKPIs.revenue)}</div>
              <div className="mt-1 text-xs text-slate-500">From {filteredDispatch.length} dispatches</div>
            </GlassCard>

            <GlassCard className="p-4 hover:shadow-md transition-shadow duration-200" hint="Total cost of raw milk purchases, calculated as quantity (kg) × agreed price per kg for each intake. Delta badge shows change vs previous period — green means costs decreased.">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase text-slate-500">Milk Spend</div>
                <DeltaBadge current={financialKPIs.rawMaterialCost} previous={prevFinancialKPIs.rawMaterialCost} inverse />
              </div>
              <div className="mt-2 text-xl md:text-2xl font-extrabold text-slate-800">{formatEur(financialKPIs.rawMaterialCost)}</div>
              <div className="mt-1 text-xs text-slate-500">Avg {financialKPIs.avgMilkPrice.toFixed(3)} €/kg</div>
            </GlassCard>

            <GlassCard className="p-4 hover:shadow-md transition-shadow duration-200" hint="Cost of Goods Sold = raw milk cost + estimated processing cost + value of discarded milk. Represents the total cost attributable to production.">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase text-slate-500">Total COGS</div>
              </div>
              <div className="mt-2 text-xl md:text-2xl font-extrabold text-slate-800">{formatEur(financialKPIs.cogs)}</div>
              <div className="mt-1 text-xs text-slate-500">Milk + Processing + Loss</div>
            </GlassCard>

            <GlassCard className="p-4 hover:shadow-md transition-shadow duration-200" hint="Gross margin = (Revenue − COGS) ÷ Revenue × 100. Shows how much of each euro earned is retained as profit before operating expenses.">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase text-slate-500">Gross Margin</div>
                <DeltaBadge current={financialKPIs.marginPct} previous={prevFinancialKPIs.marginPct} />
              </div>
              <div className="mt-2 text-xl md:text-2xl font-extrabold text-emerald-700">{financialKPIs.marginPct.toFixed(1)}%</div>
              <div className="mt-1 text-xs text-slate-500">{formatEur(financialKPIs.margin)} • Avg sell {financialKPIs.avgSalesPrice.toFixed(2)} €/kg</div>
            </GlassCard>
          </div>

          {/* Financial trend chart */}
          <GlassCard className="p-4" hint="Daily comparison of dispatch revenue (blue bars) vs milk purchase cost (amber bars). The green profit line shows Revenue − Cost per day. Helps identify profitable and unprofitable periods.">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-500" />
                <div className="text-sm font-extrabold text-slate-800">Revenue vs Costs</div>
              </div>
              <div className="text-xs text-slate-500 hidden sm:block">
                Profit {formatEur(financialKPIs.margin)} • {financialKPIs.marginPct.toFixed(1)}%
              </div>
            </div>
            {dailyFinancialData.length === 0 ? <EmptyState title="No financial data" hint="Try a wider range" /> : (
              <div className="h-72 md:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dailyFinancialData} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                    <defs>
                      <linearGradient id="finGradRevenue" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.15} />
                      </linearGradient>
                      <linearGradient id="finGradCost" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.2} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
                    <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip eurKeys={['revenue', 'cost', 'profit', 'discarded']} />} />
                    <Legend wrapperStyle={{ paddingTop: 8, fontSize: 12 }} />
                    <Bar dataKey="revenue" name="Revenue" fill="url(#finGradRevenue)" barSize={24} animationDuration={800} animationEasing="ease-out" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="cost" name="Milk Cost" fill="url(#finGradCost)" barSize={18} animationDuration={800} animationEasing="ease-out" radius={[3, 3, 0, 0]} />
                    <Line type="monotone" dataKey="profit" name="Profit" stroke="#10b981" strokeWidth={2.5} dot={false} animationDuration={1000} animationEasing="ease-out" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </GlassCard>

          {/* Buyer Revenue + Cost Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <GlassCard className="p-4" hint="Horizontal bar chart ranking buyers by total revenue from shipped dispatches. Useful for identifying revenue concentration — ideally no single buyer should dominate.">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-purple-500" />
                <div className="text-sm font-extrabold text-slate-800">Revenue by Buyer</div>
              </div>
              {buyerRevenueData.length === 0 ? <EmptyState title="No buyer data" /> : (
                <div style={{ height: Math.max(200, buyerRevenueData.length * 36 + 40) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={buyerRevenueData} layout="vertical" margin={{ left: 16, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" tick={{ fill: '#64748b', fontSize: 10 }} width={160} interval={0} />
                      <Tooltip content={<ChartTooltip eurKeys={['value']} />} />
                      <Bar dataKey="value" name="Revenue" fill="#8b5cf6" barSize={18} animationDuration={800} animationEasing="ease-out" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-4" hint="Pie chart showing the split of total costs: raw milk purchases, estimated processing costs, and losses from discarded milk.">
              <div className="flex items-center gap-2 mb-3">
                <Coins className="h-4 w-4 text-amber-500" />
                <div className="text-sm font-extrabold text-slate-800">Cost Breakdown</div>
              </div>
              {costBreakdownData.length === 0 ? <EmptyState title="No cost data" /> : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={costBreakdownData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} animationDuration={800} animationEasing="ease-out">
                        {costBreakdownData.map((item, i) => <Cell key={i} fill={item.color} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip eurKeys={['value']} />} />
                      <Legend formatter={(value) => <span className="text-xs font-medium">{value}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </GlassCard>
          </div>

          {/* Revenue by Product */}
          <GlassCard className="p-4" hint="Table of all products ranked by revenue. Shows total revenue, shipped volume (kg), average selling price per kg, and each product's share of total revenue.">
            <div className="flex items-center gap-2 mb-3">
              <Package className="h-4 w-4 text-emerald-500" />
              <div className="text-sm font-extrabold text-slate-800">Revenue by Product</div>
            </div>
            {productRevenueData.length === 0 ? <EmptyState title="No product revenue data" /> : (
              <div className="mt-3 w-full overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold sticky top-0 z-10">
                    <tr>
                      <th className="p-2">Product</th>
                      <th className="p-2 text-right">Revenue</th>
                      <th className="p-2 text-right">Shipped (kg)</th>
                      <th className="p-2 text-right">Avg €/kg</th>
                      <th className="p-2 hidden md:table-cell">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {productRevenueData.map(r => {
                      const totalRev = productRevenueData.reduce((s, p) => s + p.revenue, 0);
                      const pct = totalRev > 0 ? (r.revenue / totalRev) * 100 : 0;
                      return (
                        <tr key={r.name} className="hover:bg-slate-50 transition-colors">
                          <td className="p-2 font-medium">{r.name}</td>
                          <td className="p-2 text-right font-bold">{formatEur(r.revenue)}</td>
                          <td className="p-2 text-right">{Math.round(r.kg).toLocaleString()}</td>
                          <td className="p-2 text-right">{r.pricePerKg > 0 ? `€${r.pricePerKg.toFixed(2)}` : '—'}</td>
                          <td className="p-2 hidden md:table-cell">
                            <div className="flex items-center gap-2">
                              <div className="h-2 rounded-full bg-slate-100 flex-1 max-w-[120px]">
                                <div className="h-2 rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs text-slate-500">{pct.toFixed(0)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* ═══════════════════ PRODUCTION ═══════════════════ */}
      {activeView === 'production' && (
        <div className="space-y-5">
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <GlassCard className="p-4 hover:shadow-md transition-shadow duration-200" hint="Net milk intake = total intake minus discarded loads. Counts only milk accepted for production in the selected period.">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase text-slate-500">Intake (Net)</div>
                <DeltaBadge current={productionKPIs.totalIntake} previous={prevProductionKPIs.totalIntake} />
              </div>
              <div className="mt-2 text-xl md:text-2xl font-extrabold text-slate-800">{formatKg(productionKPIs.totalIntake)}</div>
              <div className="mt-1 text-xs text-slate-500">Top: {productionKPIs.topProductName}</div>
            </GlassCard>

            <GlassCard className="p-4 hover:shadow-md transition-shadow duration-200" hint="Total weight of finished products produced. Variance = Output − (Net Intake × target yield factor).">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase text-slate-500">Output</div>
                <DeltaBadge current={productionKPIs.totalOutput} previous={prevProductionKPIs.totalOutput} />
              </div>
              <div className="mt-2 text-xl md:text-2xl font-extrabold text-slate-800">{formatKg(productionKPIs.totalOutput)}</div>
              <div className="mt-1 text-xs text-slate-500">Variance: {formatKg(productionKPIs.varianceKg)}</div>
            </GlassCard>

            <GlassCard className="p-4 hover:shadow-md transition-shadow duration-200" hint="Production yield = Total Output ÷ Net Intake × 100. Target is 12.5% (typical for cheese production). Higher yield means more efficient conversion of milk to product.">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase text-slate-500">Yield</div>
                <DeltaBadge current={productionKPIs.currentYield} previous={prevProductionKPIs.currentYield} />
              </div>
              <div className="mt-2 text-xl md:text-2xl font-extrabold text-slate-800">{productionKPIs.currentYield.toFixed(2)}%</div>
              <div className="mt-1 text-xs text-slate-500">Target: {(TARGET_YIELD_FACTOR * 100).toFixed(1)}%</div>
            </GlassCard>

            <GlassCard className="p-4 hover:shadow-md transition-shadow duration-200" hint="Milk loads rejected during intake due to quality issues (temperature, pH, contamination). Shows total discarded kg and percentage of total intake.">
              <div className="text-xs font-bold uppercase text-slate-500">Discarded</div>
              <div className="mt-2 text-xl md:text-2xl font-extrabold text-red-600">{formatKg(productionKPIs.discardedKg)}</div>
              <div className="mt-1 text-xs text-slate-500">{productionKPIs.discardedPct.toFixed(1)}% of total intake</div>
            </GlassCard>
          </div>

          {/* OUTPUT SUBTAB */}
          {prodSubtab === 'output' && (
            <>
              <GlassCard className="p-4 flex items-center justify-between gap-4 flex-wrap" hint="Use the product filter to drill down into a specific product's production, shipment, and revenue data.">
                <div>
                  <div className="text-sm font-extrabold text-slate-800">Output Overview</div>
                  <div className="text-xs text-slate-500 mt-1">Select product to inspect per-product KPIs and trends</div>
                </div>
                <div className="flex gap-2 flex-wrap items-center min-w-0">
                  <div className="text-xs text-slate-500 uppercase font-bold">Product</div>
                  <select value={productFilter} onChange={e => setProductFilter(e.target.value)} className="bg-white border border-slate-200 rounded p-2 text-sm min-w-0 w-full md:w-auto">
                    <option value={ALL}>All products</option>
                    {products.map(p => <option key={p.id} value={p.id}>{`${p.id} — ${p.name}`}</option>)}
                  </select>
                </div>
              </GlassCard>

              {productFilter === ALL ? (
                <GlassCard className="p-4" hint="Summary table showing each product's produced quantity, shipped quantity, revenue, average price per kg, and net stock (produced − shipped).">
                  <div className="text-sm font-extrabold text-slate-800 mb-3">Product Summary</div>
                  <div className="w-full overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold sticky top-0 z-10">
                        <tr>
                          <th className="p-2">Product</th>
                          <th className="p-2 text-right">Produced</th>
                          <th className="p-2 text-right">Shipped</th>
                          <th className="p-2 text-right hidden md:table-cell">Revenue</th>
                          <th className="p-2 text-right hidden md:table-cell">Avg €/kg</th>
                          <th className="p-2 text-right">Net</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {perProductRows.length === 0 ? (
                          <tr><td colSpan={6} className="p-6 text-center text-slate-400 italic">No product activity in range</td></tr>
                        ) : perProductRows.map(r => (
                          <tr key={r.productId} className="hover:bg-slate-50 transition-colors">
                            <td className="p-2 font-medium">{r.productId}</td>
                            <td className="p-2 text-right">{Math.round(r.produced).toLocaleString()}</td>
                            <td className="p-2 text-right">{Math.round(r.shipped).toLocaleString()}</td>
                            <td className="p-2 text-right hidden md:table-cell">{formatEur(r.revenue)}</td>
                            <td className="p-2 text-right hidden md:table-cell">{r.avgPrice > 0 ? `€${r.avgPrice.toFixed(2)}` : '—'}</td>
                            <td className={`p-2 text-right font-bold ${r.netKg < 0 ? 'text-red-600' : 'text-slate-800'}`}>{Math.round(r.netKg).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>
              ) : (
                <>
                  <GlassCard className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4" hint="Key metrics for the selected product: total produced weight, total shipped weight, and total revenue from shipped dispatches.">
                    <div className="p-2">
                      <div className="text-xs font-bold uppercase text-slate-500">Produced</div>
                      <div className="mt-2 text-2xl font-extrabold text-slate-800">{formatKg(outputForProduct.reduce((s, o) => s + (o.parsed?.totalWeight || 0), 0))}</div>
                    </div>
                    <div className="p-2">
                      <div className="text-xs font-bold uppercase text-slate-500">Shipped</div>
                      <div className="mt-2 text-2xl font-extrabold text-slate-800">{formatKg(dispatchForProduct.reduce((s, d) => s + getShippedKg(d), 0))}</div>
                    </div>
                    <div className="p-2">
                      <div className="text-xs font-bold uppercase text-slate-500">Revenue</div>
                      <div className="mt-2 text-2xl font-extrabold text-slate-800">{formatEur(dispatchForProduct.reduce((s, d) => s + getShippedRevenue(d), 0))}</div>
                    </div>
                  </GlassCard>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    <GlassCard className="p-4 lg:col-span-2" hint="Area chart showing daily production output (blue) vs daily shipped quantity (green) for the selected product. Gaps indicate stock building up or being depleted.">
                      <div className="text-sm font-extrabold text-slate-800 mb-3">Daily Produced vs Shipped</div>
                      {buildDailySeriesForProduct(outputForProduct, dispatchForProduct).length === 0 ? <EmptyState title="No daily data" /> : (
                        <div className="h-60 md:h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={buildDailySeriesForProduct(outputForProduct, dispatchForProduct)}>
                              <defs>
                                <linearGradient id="prodGradProd" x1="0" x2="0" y1="0" y2="1">
                                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
                              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                              <Tooltip content={<ChartTooltip kgKeys={['produced', 'shipped']} />} />
                              <Legend wrapperStyle={{ fontSize: 12 }} />
                              <Area type="monotone" dataKey="produced" name="Produced" stroke="#3b82f6" fill="url(#prodGradProd)" strokeWidth={2} animationDuration={800} />
                              <Line type="monotone" dataKey="shipped" name="Shipped" stroke="#10b981" strokeWidth={2} dot={false} animationDuration={800} />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </GlassCard>

                    <GlassCard className="p-4 lg:col-span-1" hint="Bar chart showing daily revenue from shipped dispatches for the selected product.">
                      <div className="text-sm font-extrabold text-slate-800 mb-3">Daily Revenue</div>
                      {buildDailySeriesForProduct(outputForProduct, dispatchForProduct).length === 0 ? <EmptyState title="No revenue data" /> : (
                        <div className="h-60 md:h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={buildDailySeriesForProduct(outputForProduct, dispatchForProduct)}>
                              <defs>
                                <linearGradient id="prodGradRev" x1="0" x2="0" y1="0" y2="1">
                                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.15} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
                              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                              <Tooltip content={<ChartTooltip eurKeys={['revenue']} />} />
                              <Bar dataKey="revenue" name="Revenue" fill="url(#prodGradRev)" barSize={20} animationDuration={800} radius={[3, 3, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </GlassCard>
                  </div>
                </>
              )}

              {/* Product Mix Pie */}
              <GlassCard className="p-4" hint="Pie chart showing the share of each product in total output by weight. Helps visualize production focus and diversification.">
                <div className="text-sm font-extrabold text-slate-800 mb-3">Product Mix (Output)</div>
                {productMixData.length === 0 ? <EmptyState title="No output data" /> : (
                  <div className="h-56 md:h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={productMixData} dataKey="value" nameKey="name" outerRadius={80} animationDuration={800} animationEasing="ease-out" label={false}>
                          {productMixData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip content={<ChartTooltip kgKeys={['value']} />} />
                        <Legend content={() => (
                          <div className="overflow-x-auto py-1 -mx-2 px-2">
                            <div className="whitespace-nowrap text-xs max-w-full">
                              {productMixData.map((p, i) => (
                                <span key={p.id} className="inline-block align-middle mr-4 px-2 py-1">
                                  <span className="inline-block w-3 h-3 mr-2 align-middle rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                                  <span className="font-medium">{p.name}</span>
                                  <span className="text-slate-500 ml-1">{formatKg(p.value)}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </GlassCard>

              {/* Yield Trend */}
              {dailyProductionData.length > 1 && (
                <GlassCard className="p-4" hint="Daily yield percentage (output ÷ intake × 100) over time. The red dashed line shows the 12.5% target. Consistent yield above target indicates efficient production.">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    <div className="text-sm font-extrabold text-slate-800">Daily Yield Trend</div>
                    <span className="text-xs text-slate-400">target {(TARGET_YIELD_FACTOR * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-56 md:h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dailyProductionData} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                        <defs>
                          <linearGradient id="yieldGrad" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
                        <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} domain={[0, 'auto']} />
                        <Tooltip content={<ChartTooltip pctKeys={['yield']} />} />
                        <ReferenceLine y={TARGET_YIELD_FACTOR * 100} stroke="#ef4444" strokeDasharray="6 4" strokeWidth={1.5} />
                        <Area type="monotone" dataKey="yield" name="Yield %" stroke="#10b981" fill="url(#yieldGrad)" strokeWidth={2} dot={false} animationDuration={800} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>
              )}
            </>
          )}

          {/* INTAKE SUBTAB */}
          {prodSubtab === 'intake' && (
            <>
              <GlassCard className="p-4 flex items-center justify-between gap-4 flex-wrap" hint="Intake analytics filtered by milk type and supplier. Use the filters to drill down into specific intake segments.">
                <div>
                  <div className="text-sm font-extrabold text-slate-800">Intake Overview</div>
                  <div className="text-xs text-slate-500 mt-1">Filters apply to intake analytics</div>
                </div>
                <div className="flex gap-2 flex-wrap items-center min-w-0">
                  <select value={milkTypeFilter} onChange={e => setMilkTypeFilter(e.target.value)} className="bg-white border border-slate-200 rounded p-2 text-sm min-w-0 w-full md:w-auto">
                    <option value="__all__">All milk types</option>
                    {(milkTypes && milkTypes.length > 0 ? milkTypes : Array.from(new Set(filteredIntake.map(i => i.milkType))))?.map(mt => (
                      <option key={mt} value={mt}>{mt}</option>
                    ))}
                  </select>
                  <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} className="bg-white border border-slate-200 rounded p-2 text-sm min-w-0 w-full md:w-auto">
                    <option value="__all__">All suppliers</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </GlassCard>

              <GlassCard className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4" hint="Net Intake: accepted milk volume. Discarded: rejected milk volume. Avg Fat/Prot/pH: average quality parameters for accepted milk loads in this period.">
                <div>
                  <div className="text-xs font-bold uppercase text-slate-500">Net Intake</div>
                  <div className="mt-2 text-2xl font-extrabold text-slate-800">{formatKg(intakeKPIs.netKg)}</div>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase text-slate-500">Discarded</div>
                  <div className="mt-2 text-2xl font-extrabold text-red-600">{formatKg(intakeKPIs.discardedKg)}</div>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase text-slate-500">Avg Fat / Prot / pH</div>
                  <div className="mt-2 text-2xl font-extrabold text-slate-800">{intakeKPIs.avgFat.toFixed(2)}% / {intakeKPIs.avgProt.toFixed(2)}% / {intakeKPIs.avgPh.toFixed(2)}</div>
                </div>
              </GlassCard>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <GlassCard className="p-4 lg:col-span-2" hint="Area chart showing daily accepted intake (blue) vs discarded volume (red). Spikes in discards may indicate supply chain quality issues.">
                  <div className="text-sm font-extrabold text-slate-800 mb-3">Daily Intake vs Discarded</div>
                  {dailyIntakeData.length === 0 ? <EmptyState title="No intake data" /> : (
                    <div className="h-64 md:h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={dailyIntakeData}>
                          <defs>
                            <linearGradient id="intGradIntake" x1="0" x2="0" y1="0" y2="1">
                              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                            </linearGradient>
                            <linearGradient id="intGradDiscard" x1="0" x2="0" y1="0" y2="1">
                              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
                          <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                          <Tooltip content={<ChartTooltip kgKeys={['intake', 'discarded']} />} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Area type="monotone" dataKey="intake" name="Intake" stroke="#3b82f6" fill="url(#intGradIntake)" strokeWidth={2} animationDuration={800} />
                          <Area type="monotone" dataKey="discarded" name="Discarded" stroke="#ef4444" fill="url(#intGradDiscard)" strokeWidth={2} animationDuration={800} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </GlassCard>

                <GlassCard className="p-4 lg:col-span-1" hint="Pie chart showing the volume share of each milk type (e.g. cow, goat, sheep) in total intake.">
                  <div className="text-sm font-extrabold text-slate-800 mb-3">Milk Types</div>
                  {milkTypeMixFiltered.length === 0 ? <EmptyState title="No milk type data" /> : (
                    <div className="h-56 md:h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={milkTypeMixFiltered} dataKey="value" nameKey="name" outerRadius={70} animationDuration={800} label={false}>
                            {milkTypeMixFiltered.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip content={<ChartTooltip kgKeys={['value']} />} />
                          <Legend content={() => (
                            <div className="overflow-x-auto py-1">
                              <div className="whitespace-nowrap text-xs">
                                {milkTypeMixFiltered.map((p, i) => (
                                  <span key={p.name} className="inline-block align-middle mr-3 px-2 py-1">
                                    <span className="inline-block w-3 h-3 mr-2 align-middle rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                                    <span className="font-medium">{p.name}</span>
                                    <span className="text-slate-500 ml-1">{formatKg(p.value)}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </GlassCard>
              </div>

              <GlassCard className="p-4" hint="Bar chart showing each supplier's contribution to total intake volume (kg). Helps identify supplier concentration and diversification.">
                <div className="text-sm font-extrabold text-slate-800 mb-3">Supplier Mix</div>
                {supplierMix.length === 0 ? <EmptyState title="No supplier data" /> : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={supplierMix}>
                        <defs>
                          <linearGradient id="supGradBar" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.15} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
                        <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                        <Tooltip content={<ChartTooltip kgKeys={['value']} />} />
                        <Bar dataKey="value" name="Kg" fill="url(#supGradBar)" barSize={28} animationDuration={800} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </GlassCard>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════ QUALITY ═══════════════════ */}
      {activeView === 'quality' && (
        <div className="space-y-5">
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <GlassCard className="p-4 hover:shadow-md transition-shadow duration-200" hint="Percentage of intake loads meeting all quality standards: temperature ≤8°C and pH within 6.55–6.74 range. Green ≥90%, amber ≥70%, red <70%.">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase text-slate-500">Compliance</div>
                <DeltaBadge current={qualityKPIs.compliancePct} previous={prevQualityKPIs.compliancePct} />
              </div>
              <div className={`mt-2 text-xl md:text-2xl font-extrabold ${qualityKPIs.compliancePct >= 90 ? 'text-emerald-700' : qualityKPIs.compliancePct >= 70 ? 'text-amber-600' : 'text-red-600'}`}>{qualityKPIs.compliancePct.toFixed(0)}%</div>
              <div className="mt-1 text-xs text-slate-500">{qualityKPIs.total} loads analyzed</div>
            </GlassCard>

            <GlassCard className="p-4 hover:shadow-md transition-shadow duration-200" hint="Average fat percentage across all intake loads in the period. Target is 4.0%. Higher fat content generally means better cheese yield.">
              <div className="text-xs font-bold uppercase text-slate-500">Avg Fat</div>
              <div className="mt-2 text-xl md:text-2xl font-extrabold text-slate-800">{qualityKPIs.avgFat.toFixed(2)}%</div>
              <div className="mt-1 text-xs text-slate-500">Target: {FAT_TARGET.toFixed(1)}%</div>
            </GlassCard>

            <GlassCard className="p-4 hover:shadow-md transition-shadow duration-200" hint="Average protein percentage across all intake loads. Target is 3.2%. Protein is essential for cheese curd formation.">
              <div className="text-xs font-bold uppercase text-slate-500">Avg Protein</div>
              <div className="mt-2 text-xl md:text-2xl font-extrabold text-slate-800">{qualityKPIs.avgProt.toFixed(2)}%</div>
              <div className="mt-1 text-xs text-slate-500">Target: {PROT_TARGET.toFixed(1)}%</div>
            </GlassCard>

            <GlassCard className="p-4 hover:shadow-md transition-shadow duration-200" hint="Average pH across all intake loads. Standard range is 6.55–6.74. pH outside this range may indicate spoilage or contamination.">
              <div className="text-xs font-bold uppercase text-slate-500">Avg pH</div>
              <div className="mt-2 text-xl md:text-2xl font-extrabold text-slate-800">{qualityKPIs.avgPh.toFixed(2)}</div>
              <div className="mt-1 text-xs text-slate-500">Std: {PH_MIN}–{PH_MAX}</div>
            </GlassCard>
          </div>

          {/* Violations alert */}
          {(qualityKPIs.highTempCount + qualityKPIs.badPhCount > 0) && (
            <GlassCard className="p-4 bg-red-50/60 border border-red-200" hint="Count of temperature violations (>8°C) and pH violations (outside 6.55–6.74) detected in intake loads during the current period.">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <div className="text-sm font-extrabold text-red-800">Quality Violations</div>
              </div>
              <div className="mt-2 flex gap-6 text-sm text-red-700">
                <span>Temp &gt;{TEMP_MAX}°C: <strong>{qualityKPIs.highTempCount}</strong></span>
                <span>pH out of range: <strong>{qualityKPIs.badPhCount}</strong></span>
              </div>
            </GlassCard>
          )}

          {/* Quality trend with reference lines */}
          <GlassCard className="p-4" hint="Line chart tracking daily average fat % (blue), protein % (green), and pH (red) over time. Dashed reference lines show target values. Helps identify quality trends and seasonal patterns.">
            <div className="text-sm font-extrabold text-slate-800 mb-3">Quality Trends (Fat, Protein, pH)</div>
            {qualityTrendData.length === 0 ? <EmptyState title="No quality data in this range" /> : (
              <div className="h-72 md:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={qualityTrendData} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
                    <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip pctKeys={['fat', 'protein']} />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine yAxisId="left" y={FAT_TARGET} stroke="#3b82f6" strokeDasharray="6 4" strokeOpacity={0.5} />
                    <ReferenceLine yAxisId="left" y={PROT_TARGET} stroke="#10b981" strokeDasharray="6 4" strokeOpacity={0.5} />
                    <ReferenceLine yAxisId="right" y={PH_MIN} stroke="#ef4444" strokeDasharray="6 4" strokeOpacity={0.3} />
                    <ReferenceLine yAxisId="right" y={PH_MAX} stroke="#ef4444" strokeDasharray="6 4" strokeOpacity={0.3} />
                    <Line yAxisId="left" type="monotone" dataKey="fat" name="Fat %" stroke="#3b82f6" strokeWidth={2} dot={false} animationDuration={800} />
                    <Line yAxisId="left" type="monotone" dataKey="protein" name="Protein %" stroke="#10b981" strokeWidth={2} dot={false} animationDuration={800} />
                    <Line yAxisId="right" type="monotone" dataKey="ph" name="pH" stroke="#ef4444" strokeWidth={2} dot={false} animationDuration={800} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </GlassCard>

          {/* Supplier Quality Scorecard */}
          <GlassCard className="p-4" hint="Table ranking suppliers by quality compliance. Shows number of loads, total volume, average fat/protein/pH values, and overall compliance percentage. Use to identify unreliable suppliers.">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="h-4 w-4 text-blue-500" />
              <div className="text-sm font-extrabold text-slate-800">Supplier Quality Scorecard</div>
            </div>
            {supplierScorecard.length === 0 ? <EmptyState title="No supplier quality data" /> : (
              <div className="w-full overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold sticky top-0 z-10">
                    <tr>
                      <th className="p-2">Supplier</th>
                      <th className="p-2 text-right">Loads</th>
                      <th className="p-2 text-right">Volume</th>
                      <th className="p-2 text-right hidden md:table-cell">Avg Fat</th>
                      <th className="p-2 text-right hidden md:table-cell">Avg Prot</th>
                      <th className="p-2 text-right hidden md:table-cell">Avg pH</th>
                      <th className="p-2 text-right">Compliance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {supplierScorecard.map(s => (
                      <tr key={s.name} className="hover:bg-slate-50 transition-colors">
                        <td className="p-2 font-medium">{s.name}</td>
                        <td className="p-2 text-right">{s.loads}</td>
                        <td className="p-2 text-right">{formatKg(s.totalKg)}</td>
                        <td className="p-2 text-right hidden md:table-cell">{s.avgFat.toFixed(2)}%</td>
                        <td className="p-2 text-right hidden md:table-cell">{s.avgProtein.toFixed(2)}%</td>
                        <td className="p-2 text-right hidden md:table-cell">{s.avgPh.toFixed(2)}</td>
                        <td className="p-2 text-right">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${s.compliancePct >= 90 ? 'bg-emerald-100 text-emerald-700' : s.compliancePct >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                            {s.compliancePct.toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>

          {/* Top Issues / Outliers */}
          <GlassCard className="p-4" hint="Table of specific intake loads with quality parameter violations. Red-highlighted values indicate fat, protein, pH, or temperature outside acceptable ranges. Review with suppliers.">
            <div className="text-sm font-extrabold text-slate-800 mb-3">Top Quality Issues</div>
            {outliers.length === 0 ? (
              <div className="text-slate-400 italic text-sm">No notable issues in this range</div>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold sticky top-0 z-10">
                    <tr>
                      <th className="p-2">Date</th>
                      <th className="p-2">Supplier</th>
                      <th className="p-2">Type</th>
                      <th className="p-2 text-right">Kg</th>
                      <th className="p-2 text-right">Fat</th>
                      <th className="p-2 text-right">Prot</th>
                      <th className="p-2 text-right">pH</th>
                      <th className="p-2 text-right">Temp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {outliers.map(o => (
                      <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-2 font-mono text-xs">{formatDate(o.timestamp, userSettings?.dateFormat || 'ISO')}</td>
                        <td className="p-2">{suppliers.find(s => s.id === o.supplierId)?.name || o.supplierId}</td>
                        <td className="p-2">{o.milkType}</td>
                        <td className="p-2 text-right">{Math.round(o.quantityKg).toLocaleString()}</td>
                        <td className={`p-2 text-right ${(o.fatPct || 0) < FAT_TARGET * 0.9 ? 'text-red-600 font-bold' : ''}`}>{(o.fatPct || 0).toFixed(2)}</td>
                        <td className={`p-2 text-right ${(o.proteinPct || 0) < PROT_TARGET * 0.9 ? 'text-red-600 font-bold' : ''}`}>{(o.proteinPct || 0).toFixed(2)}</td>
                        <td className={`p-2 text-right ${(o.ph || 0) < PH_MIN || (o.ph || 0) > PH_MAX ? 'text-red-600 font-bold' : ''}`}>{(o.ph || 0).toFixed(2)}</td>
                        <td className={`p-2 text-right ${(o.tempCelsius || 0) > TEMP_MAX ? 'text-red-600 font-bold' : ''}`}>{(o.tempCelsius || 0).toFixed(1)}°C</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </div>
      )}

      <ReportExportModal open={showReportModal} onClose={() => setShowReportModal(false)} />
    </div>
  );
};
