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
} from "recharts";
import {
  BarChart3,
  Factory,
  Microscope,
  Coins,
  Calendar,
  AlertCircle,
  Droplets,
} from "lucide-react";
import ReportExportModal from "../ui/ReportExportModal";
import type { IntakeEntry, OutputEntry, DispatchEntry } from "../../types";
import { isShippedStatus, getShippedKg, getShippedRevenue, getShipmentsByDate } from "../../utils/dispatchMath";
import { formatDate } from '../../utils/date';

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

// Business defaults
const TARGET_YIELD_FACTOR = 0.125; // 12.5% theoretical output from milk
const FAT_TARGET = 4.0;
const PROT_TARGET = 3.2;

type TimeRange = "day" | "week" | "month" | "quarter" | "year" | "all";
type ViewMode = "financial" | "production" | "quality";
type ProdSubtab = "output" | "intake";

const toISODate = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const endOfDayTs = (d: Date) => { const copy = new Date(d); copy.setHours(23,59,59,999); return copy.getTime(); };
const startOfDayTs = (d: Date) => { const copy = new Date(d); copy.setHours(0,0,0,0); return copy.getTime(); };

const formatKg = (val: number) => (val >= 1000 ? `${(val / 1000).toFixed(1)}t` : `${Math.round(val).toLocaleString()} kg`);
const formatEur = (val: number) => `€${Math.round(val).toLocaleString()}`;

const EmptyState: React.FC<{ title: string; hint?: string }> = ({ title, hint }) => (
  <div className="p-6 text-center text-slate-500">
    <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
      <AlertCircle className="h-5 w-5" />
    </div>
    <div className="font-semibold text-slate-700">{title}</div>
    {hint ? <div className="mt-1 text-sm">{hint}</div> : null}
  </div>
);

export const TrendsTab: React.FC = () => {
  const intakeEntries = useStore((state) => state.intakeEntries);
  const outputEntries = useStore((state) => state.outputEntries);
  const dispatchEntries = useStore((state) => state.dispatchEntries);
  const globalConfig = useStore((state) => state.globalConfig);
  const products = useStore((state) => state.products);
  const suppliers = useStore((state) => state.suppliers);
  const milkTypes = useStore((state) => state.milkTypes);
  const userSettings = useStore((state) => state.userSettings);

  const [activeView, setActiveView] = useState<ViewMode>("financial");
  const [timeRange, setTimeRange] = useState<TimeRange>((userSettings?.defaultAnalyticsRange as any) || "month");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  // Production subtab
  const [prodSubtab, setProdSubtab] = useState<ProdSubtab>("output");

  // Product filter for Output
  const ALL = "__all__";
  const [productFilter, setProductFilter] = useState<string>(ALL);
  const [showReportModal, setShowReportModal] = useState(false);

  // Intake filters
  const [milkTypeFilter, setMilkTypeFilter] = useState<string>("__all__");
  const [supplierFilter, setSupplierFilter] = useState<string>("__all__");

  // ---------- FILTERS (date & quick ranges) ----------
  const { filteredIntake, filteredOutput, filteredDispatch, dateLabel } = useMemo(() => {
    const now = new Date();
    const defaultEnd = endOfDayTs(now);

    let startTs = 0;
    let endTs = defaultEnd;
    let label = "";

    if (customStart) {
      const start = new Date(customStart);
      startTs = startOfDayTs(start);
      if (customEnd) {
        const end = new Date(customEnd);
        endTs = endOfDayTs(end);
      } else endTs = defaultEnd;
      label = `${customStart}${customEnd ? ` → ${customEnd}` : ""}`;
    } else {
      const today = new Date();
      const todayStart = startOfDayTs(today);
      const subtractDays = (days: number) => { const d = new Date(todayStart); d.setDate(d.getDate() - days); return d.getTime(); };
      switch (timeRange) {
        case "day": startTs = todayStart; label = "Today"; break;
        case "week": startTs = subtractDays(7); label = "Last 7 days"; break;
        case "month": startTs = subtractDays(30); label = "Last 30 days"; break;
        case "quarter": startTs = subtractDays(90); label = "Last 90 days"; break;
        case "year": startTs = subtractDays(365); label = "Last 365 days"; break;
        case "all": startTs = 0; label = "All time"; break;
      }
    }

    const intake = (intakeEntries as IntakeEntry[]).filter(e => e.timestamp >= startTs && e.timestamp <= endTs);
    const output = (outputEntries as OutputEntry[]).filter(e => e.timestamp >= startTs && e.timestamp <= endTs);
    const dispatch = (dispatchEntries as DispatchEntry[]).filter(e => e.date >= startTs && e.date <= endTs && isShippedStatus(e.status));

    return { filteredIntake: intake, filteredOutput: output, filteredDispatch: dispatch, dateLabel: label };
  }, [timeRange, customStart, customEnd, intakeEntries, outputEntries, dispatchEntries]);

  const nonDiscardedFilteredIntake = useMemo(() => filteredIntake.filter(e => e.isDiscarded !== true), [filteredIntake]);

  // ---------- Financial KPIs (existing) ----------
  const financialKPIs = useMemo(() => {
    const totalRevenue = filteredDispatch.reduce((sum, e) => sum + getShippedRevenue(e), 0);
    const rawMaterialCost = nonDiscardedFilteredIntake.reduce((sum, e) => sum + (e.calculatedCost || 0), 0);
    const discardedLoss = filteredIntake.filter(e => e.isDiscarded === true).reduce((sum, e) => sum + (e.calculatedCost || 0), 0);
    const totalIntakeKg = nonDiscardedFilteredIntake.reduce((sum, e) => sum + (e.quantityKg || 0), 0);
    const processingCost = (totalIntakeKg / 1000) * (globalConfig?.processingCostPerTon || 0);
    const cogs = rawMaterialCost + processingCost;
    const margin = totalRevenue - cogs;
    const marginPct = totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0;
    const totalDispatchKg = filteredDispatch.reduce((s, e) => s + getShippedKg(e), 0);
    return {
      revenue: totalRevenue,
      rawMaterialCost,
      discardedLoss,
      processingCost,
      cogs,
      margin,
      marginPct,
      avgMilkPrice: totalIntakeKg > 0 ? rawMaterialCost / totalIntakeKg : 0,
      avgSalesPrice: totalDispatchKg > 0 ? totalRevenue / totalDispatchKg : 0,
    };
  }, [filteredDispatch, filteredIntake, nonDiscardedFilteredIntake, globalConfig]);

  // ---------- Production KPIs ----------
  const productionKPIs = useMemo(() => {
    const totalIntake = nonDiscardedFilteredIntake.reduce((s, e) => s + (e.quantityKg || 0), 0);
    const discardedKg = filteredIntake.filter(e => e.isDiscarded === true).reduce((s, e) => s + (e.quantityKg || 0), 0);
    const totalOutput = filteredOutput.reduce((s, e) => s + (e.parsed?.totalWeight || 0), 0);
    const currentYield = totalIntake > 0 ? (totalOutput / totalIntake) * 100 : 0;
    const theoreticalOutput = totalIntake * TARGET_YIELD_FACTOR;
    const varianceKg = totalOutput - theoreticalOutput;
    const productTotals: Record<string, number> = {};
    filteredOutput.forEach(e => { productTotals[e.productId] = (productTotals[e.productId] || 0) + (e.parsed?.totalWeight || 0); });
    const top = Object.entries(productTotals).sort((a,b) => b[1]-a[1])[0];
    return { totalIntake, totalOutput, discardedKg, discardedPct: (totalIntake+discardedKg)>0 ? (discardedKg/(totalIntake+discardedKg))*100 : 0, currentYield, varianceKg, topProductName: top?.[0]||'N/A' };
  }, [nonDiscardedFilteredIntake, filteredIntake, filteredOutput]);

  // ---------- Quality KPIs ----------
  const qualityKPIs = useMemo(() => {
    const totalKg = nonDiscardedFilteredIntake.reduce((s,e) => s + (e.quantityKg||0), 0);
    const weightedFat = nonDiscardedFilteredIntake.reduce((s,e) => s + ((e.fatPct||0) * (e.quantityKg||0)), 0);
    const weightedProt = nonDiscardedFilteredIntake.reduce((s,e) => s + ((e.proteinPct||0) * (e.quantityKg||0)), 0);
    const weightedPh = nonDiscardedFilteredIntake.reduce((s,e) => s + ((e.ph||0) * (e.quantityKg||0)), 0);
    const highTempCount = filteredIntake.filter(e => (e.tempCelsius||0) > 8).length;
    const badPhCount = filteredIntake.filter(e => (e.ph||0) > 6.74 || (e.ph||0) < 6.55).length;
    return { avgFat: totalKg>0 ? weightedFat/totalKg : 0, avgProt: totalKg>0 ? weightedProt/totalKg : 0, avgPh: totalKg>0 ? weightedPh/totalKg : 0, highTempCount, badPhCount };
  }, [nonDiscardedFilteredIntake, filteredIntake]);

  // ---------- DAILY SERIES (ISO KEYS) ----------
  const dailyFinancialData = useMemo(() => {
    const map: Record<string, { date: string; revenue: number; cost: number; discarded: number; profit: number }> = {};
    nonDiscardedFilteredIntake.forEach(e => { const d = toISODate(e.timestamp); if(!map[d]) map[d] = {date:d,revenue:0,cost:0,discarded:0,profit:0}; map[d].cost += e.calculatedCost||0; });
    filteredIntake.filter(e=>e.isDiscarded===true).forEach(e=>{ const d=toISODate(e.timestamp); if(!map[d]) map[d]={date:d,revenue:0,cost:0,discarded:0,profit:0}; map[d].discarded += e.calculatedCost||0; });
    filteredDispatch.forEach(e=>{
      const shipments = getShipmentsByDate(e);
      if (shipments && shipments.length>0) shipments.forEach(s=>{ const d=toISODate(s.date); if(!map[d]) map[d]={date:d,revenue:0,cost:0,discarded:0,profit:0}; const price = Number.isFinite(Number(e.salesPricePerKg))?Number(e.salesPricePerKg):0; map[d].revenue += (s.quantityKg||0)*price; });
      else { const d = toISODate(e.date); if(!map[d]) map[d] = {date:d,revenue:0,cost:0,discarded:0,profit:0}; map[d].revenue += getShippedRevenue(e); }
    });
    return Object.values(map).map(row=>({ ...row, profit: row.revenue - row.cost })).sort((a,b)=> a.date < b.date ? -1 : 1);
  }, [nonDiscardedFilteredIntake, filteredIntake, filteredDispatch]);

  const dailyProductionData = useMemo(() => {
    const map: Record<string, { date: string; intake: number; discarded: number; output: number; yield: number }> = {};
    nonDiscardedFilteredIntake.forEach(e=>{ const d=toISODate(e.timestamp); if(!map[d]) map[d] = {date:d,intake:0,discarded:0,output:0,yield:0}; map[d].intake += e.quantityKg||0; });
    filteredIntake.filter(e=>e.isDiscarded===true).forEach(e=>{ const d=toISODate(e.timestamp); if(!map[d]) map[d] = {date:d,intake:0,discarded:0,output:0,yield:0}; map[d].discarded += e.quantityKg||0; });
    filteredOutput.forEach(e=>{ const d=toISODate(e.timestamp); if(!map[d]) map[d] = {date:d,intake:0,discarded:0,output:0,yield:0}; map[d].output += e.parsed?.totalWeight||0; });
    return Object.values(map).map(row=>({ ...row, yield: row.intake>0 ? (row.output/row.intake)*100 : 0 })).sort((a,b)=> a.date < b.date ? -1 : 1);
  }, [nonDiscardedFilteredIntake, filteredIntake, filteredOutput]);

  // Product mix (top N + Other)
  const productMixData = useMemo(() => {
    const totals: Record<string, number> = {};
    filteredOutput.forEach(e => { totals[e.productId] = (totals[e.productId] || 0) + (e.parsed?.totalWeight || 0); });
    const list = Object.entries(totals).map(([name, value]) => ({ name, value }));
    const sorted = list.sort((a,b)=>b.value-a.value);
    const TOP_N = 6;
    if (sorted.length <= TOP_N) return sorted;
    const top = sorted.slice(0, TOP_N);
    const otherSum = sorted.slice(TOP_N).reduce((s,it)=>s+it.value,0);
    top.push({ name: "Other", value: otherSum });
    return top;
  }, [filteredOutput]);

  const milkTypeMix = useMemo(() => {
    const totals: Record<string, number> = {};
    nonDiscardedFilteredIntake.forEach(e => { totals[e.milkType] = (totals[e.milkType] || 0) + (e.quantityKg || 0); });
    const list = Object.entries(totals).map(([name,value])=>({ name, value }));
    const sorted = list.sort((a,b)=>b.value-a.value);
    const TOP_N = 6;
    if (sorted.length <= TOP_N) return sorted;
    const top = sorted.slice(0, TOP_N);
    const other = sorted.slice(TOP_N).reduce((s,it)=>s+it.value,0);
    top.push({ name: 'Other', value: other });
    return top;
  }, [nonDiscardedFilteredIntake]);

  // Quality trend (daily average values)
  const qualityTrendData = useMemo(() => {
    const map: Record<string, { date: string; fat: number; protein: number; ph: number; count: number }> = {};
    nonDiscardedFilteredIntake.forEach(e=>{ const d = toISODate(e.timestamp); if(!map[d]) map[d] = {date:d,fat:0,protein:0,ph:0,count:0}; map[d].fat += e.fatPct||0; map[d].protein += e.proteinPct||0; map[d].ph += e.ph||0; map[d].count += 1; });
    return Object.values(map).map(row=>({ date: row.date, fat: row.count>0 ? row.fat/row.count:0, protein: row.count>0?row.protein/row.count:0, ph: row.count>0?row.ph/row.count:0 })).sort((a,b)=> a.date < b.date ? -1 : 1);
  }, [nonDiscardedFilteredIntake]);

  // ---------- PRODUCTION: per-product datasets ----------
  const filteredOutputAll = filteredOutput; // date limited
  const filteredDispatchAll = filteredDispatch; // date limited

  const outputForProduct = useMemo(() => {
    if (productFilter === ALL) return filteredOutputAll;
    return filteredOutputAll.filter(o => o.productId === productFilter);
  }, [productFilter, filteredOutputAll]);

  const dispatchForProduct = useMemo(() => {
    if (productFilter === ALL) return filteredDispatchAll;
    return filteredDispatchAll.filter(d => d.productId === productFilter);
  }, [productFilter, filteredDispatchAll]);

  const perProductRows = useMemo(() => {
    const producedByProd: Record<string, number> = {};
    filteredOutputAll.forEach(o => { producedByProd[o.productId] = (producedByProd[o.productId] || 0) + (o.parsed?.totalWeight || 0); });
    const shippedByProd: Record<string, number> = {};
    const revenueByProd: Record<string, number> = {};
    filteredDispatchAll.forEach(d => {
      const kg = getShippedKg(d);
      const rev = getShippedRevenue(d);
      shippedByProd[d.productId] = (shippedByProd[d.productId] || 0) + kg;
      revenueByProd[d.productId] = (revenueByProd[d.productId] || 0) + rev;
    });
    const ids = Array.from(new Set([...Object.keys(producedByProd), ...Object.keys(shippedByProd)]));
    return ids.map(id => {
      const produced = producedByProd[id] || 0;
      const shipped = shippedByProd[id] || 0;
      const revenue = revenueByProd[id] || 0;
      return {
        productId: id,
        produced,
        shipped,
        revenue,
        avgPrice: shipped > 0 ? revenue / shipped : 0,
        netKg: produced - shipped,
      };
    }).sort((a,b) => b.revenue - a.revenue);
  }, [filteredOutputAll, filteredDispatchAll]);

  // Per-product daily series builder
  const buildDailySeriesForProduct = (outs: OutputEntry[], dispatches: DispatchEntry[]) => {
    const map: Record<string, { date: string; produced: number; shipped: number; revenue: number }> = {};
    outs.forEach(o => { const d = toISODate(o.timestamp); if(!map[d]) map[d] = {date:d, produced:0, shipped:0, revenue:0}; map[d].produced += o.parsed?.totalWeight||0; });
    dispatches.forEach(d => {
      const shipments = getShipmentsByDate(d);
      if (shipments && shipments.length>0) shipments.forEach(s => { const day = toISODate(s.date); if(!map[day]) map[day] = {date:day, produced:0, shipped:0, revenue:0}; map[day].shipped += s.quantityKg||0; map[day].revenue += (s.quantityKg||0) * (Number.isFinite(Number(d.salesPricePerKg))?Number(d.salesPricePerKg):0); });
      else { const day = toISODate(d.date); if(!map[day]) map[day] = {date:day, produced:0, shipped:0, revenue:0}; map[day].shipped += getShippedKg(d); map[day].revenue += getShippedRevenue(d); }
    });
    return Object.values(map).sort((a,b)=> a.date < b.date ? -1 : 1);
  };

  // ---------- INTAKE: filtered by milkType/supplier ----------
  const intakeBase = nonDiscardedFilteredIntake;
  const intakeFiltered = useMemo(() => {
    return intakeBase.filter(e => (
      (milkTypeFilter === '__all__' || e.milkType === milkTypeFilter) &&
      (supplierFilter === '__all__' || e.supplierId === supplierFilter)
    ));
  }, [intakeBase, milkTypeFilter, supplierFilter]);

  const intakeKPIs = useMemo(() => {
    const netKg = intakeFiltered.reduce((s, e) => s + (e.quantityKg||0), 0);
    const discardedKg = filteredIntake.filter(e=>e.isDiscarded===true && (milkTypeFilter==='__all__' || e.milkType===milkTypeFilter) && (supplierFilter==='__all__' || e.supplierId===supplierFilter)).reduce((s,e)=>s+(e.quantityKg||0),0);
    const weightedFat = intakeFiltered.reduce((s,e)=>s+((e.fatPct||0)*(e.quantityKg||0)),0);
    const weightedProt = intakeFiltered.reduce((s,e)=>s+((e.proteinPct||0)*(e.quantityKg||0)),0);
    const weightedPh = intakeFiltered.reduce((s,e)=>s+((e.ph||0)*(e.quantityKg||0)),0);
    const avgFat = netKg>0 ? weightedFat/netKg : 0;
    const avgProt = netKg>0 ? weightedProt/netKg : 0;
    const avgPh = netKg>0 ? weightedPh/netKg : 0;
    const highTemp = intakeFiltered.filter(e => (e.tempCelsius||0) > 8).length;
    const badPh = intakeFiltered.filter(e => (e.ph||0) > 6.74 || (e.ph||0) < 6.55).length;
    return { netKg, discardedKg, avgFat, avgProt, avgPh, highTemp, badPh };
  }, [intakeFiltered, filteredIntake, milkTypeFilter, supplierFilter]);

  // Daily intake vs discarded
  const dailyIntakeData = useMemo(() => {
    const map: Record<string, { date: string; intake: number; discarded: number }> = {};
    intakeFiltered.forEach(e=>{ const d=toISODate(e.timestamp); if(!map[d]) map[d] = {date:d,intake:0,discarded:0}; map[d].intake += e.quantityKg||0; });
    filteredIntake.filter(e=>e.isDiscarded===true && (milkTypeFilter==='__all__'||e.milkType===milkTypeFilter) && (supplierFilter==='__all__' || e.supplierId===supplierFilter)).forEach(e=>{ const d=toISODate(e.timestamp); if(!map[d]) map[d] = {date:d,intake:0,discarded:0}; map[d].discarded += e.quantityKg||0; });
    return Object.values(map).sort((a,b)=> a.date < b.date ? -1 : 1);
  }, [intakeFiltered, filteredIntake, milkTypeFilter, supplierFilter]);

  // Milk types pie for intakeFiltered
  const milkTypeMixFiltered = useMemo(() => {
    const totals: Record<string, number> = {};
    intakeFiltered.forEach(e => { totals[e.milkType] = (totals[e.milkType] || 0) + (e.quantityKg || 0); });
    const list = Object.entries(totals).map(([name,value])=>({ name, value }));
    const sorted = list.sort((a,b)=>b.value-a.value);
    const TOP_N = 6;
    if (sorted.length <= TOP_N) return sorted;
    const top = sorted.slice(0, TOP_N);
    const other = sorted.slice(TOP_N).reduce((s,it)=>s+it.value,0);
    top.push({ name: 'Other', value: other });
    return top;
  }, [intakeFiltered]);

  // Supplier mix bar (top 8 + Other)
  const supplierMix = useMemo(() => {
    const totals: Record<string, number> = {};
    intakeFiltered.forEach(e => { const sup = suppliers.find(s=>s.id===e.supplierId)?.name || e.supplierId || 'Unknown'; totals[sup] = (totals[sup]||0) + (e.quantityKg||0); });
    const arr = Object.entries(totals).map(([name, value])=>({ name, value })).sort((a,b)=>b.value-a.value);
    const TOP = 8;
    if (arr.length <= TOP) return arr;
    const top = arr.slice(0,TOP);
    const other = arr.slice(TOP).reduce((s,it)=>s+it.value,0);
    top.push({ name: 'Other', value: other });
    return top;
  }, [intakeFiltered, suppliers]);

  // Quality: compliance & outliers
  const qualityFilteredBase = useMemo(() => nonDiscardedFilteredIntake.filter(e => (milkTypeFilter==='__all__' || e.milkType===milkTypeFilter) && (supplierFilter==='__all__' || e.supplierId===supplierFilter)), [nonDiscardedFilteredIntake, milkTypeFilter, supplierFilter]);

  const complianceKPIs = useMemo(() => {
    const tempOkCount = qualityFilteredBase.filter(e => (e.tempCelsius||0) <= 8).length;
    const phOkCount = qualityFilteredBase.filter(e => (e.ph||0) >= 6.55 && (e.ph||0) <= 6.74).length;
    const fullyOkCount = qualityFilteredBase.filter(e => ((e.tempCelsius||0) <= 8) && ((e.ph||0) >= 6.55 && (e.ph||0) <= 6.74)).length;
    const total = qualityFilteredBase.length || 1;
    const fullyOkPct = (fullyOkCount / total) * 100;
    return { tempOkCount, phOkCount, fullyOkCount, fullyOkPct };
  }, [qualityFilteredBase]);

  const outliers = useMemo(() => {
    // compute a simple severity score and pick top 8
    const rows = qualityFilteredBase.map(e => {
      const tempScore = Math.max(0, (e.tempCelsius||0) - 8);
      const phDist = Math.max(0, 6.55 - (e.ph||0), (e.ph||0) - 6.74);
      const proteinDist = Math.max(0, 3.2 - (e.proteinPct||0));
      const score = tempScore * 2 + phDist * 5 + proteinDist * 3;
      return { entry: e, score };
    }).sort((a,b)=>b.score-a.score).slice(0,8).map(r => r.entry);
    return rows;
  }, [qualityFilteredBase]);

  // ---------- UI helpers ----------
  const setQuickRange = (r: TimeRange) => { setTimeRange(r); setCustomStart(''); setCustomEnd(''); };

  return (
    <div className="space-y-5 overflow-x-hidden">
      {/* Header / Filters */}
      <GlassCard className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-slate-700 min-w-0">
            <Calendar className="h-4 w-4 text-slate-400" />
            <div className="text-sm font-semibold">Analytics Range:</div>
            <div className="text-sm text-slate-500">{dateLabel}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(["day","week","month","quarter","year","all"] as TimeRange[]).map(r => (
              <button key={r} onClick={() => setQuickRange(r)} className={`px-3 py-1 text-xs font-bold rounded-md transition-all uppercase whitespace-nowrap ${timeRange===r && !customStart ? 'bg-white text-emerald-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>
                {r}
              </button>
            ))}

            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1">
              <input type="date" value={customStart} onChange={(e)=>setCustomStart(e.target.value)} className="text-xs bg-transparent outline-none text-slate-600 font-medium" />
              <span className="text-xs text-slate-400">→</span>
              <input type="date" value={customEnd} onChange={(e)=>setCustomEnd(e.target.value)} className="text-xs bg-transparent outline-none text-slate-600 font-medium" />
            </div>
            <button
              onClick={() => setShowReportModal(true)}
              className="ml-2 bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-md text-sm font-semibold hover:bg-indigo-100 transition-colors"
              title="Export monthly report"
            >
              Export report
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
                    {(["financial","production","quality"] as const).map(view => (
            <button key={view} onClick={() => setActiveView(view)} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all uppercase whitespace-nowrap ${activeView===view ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>
              {view === 'financial' && <Coins className="h-4 w-4" />}
              {view === 'production' && <Factory className="h-4 w-4" />}
              {view === 'quality' && <Microscope className="h-4 w-4" />}
              {view}
            </button>
          ))}
        </div>

        {/* Production subtab toggles */}
        {activeView === 'production' && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => setProdSubtab('output')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-md transition-all uppercase whitespace-nowrap ${prodSubtab==='output' ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>
              <Factory className="h-4 w-4" /> OUTPUT
            </button>
            <button onClick={() => setProdSubtab('intake')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-md transition-all uppercase whitespace-nowrap ${prodSubtab==='intake' ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>
              <Droplets className="h-4 w-4" /> INTAKE
            </button>
          </div>
        )}
      </GlassCard>

      {/* FINANCIAL */}
      {activeView === 'financial' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <GlassCard className="p-4">
            <div className="text-xs font-bold uppercase text-slate-500">Revenue (Confirmed)</div>
            <div className="mt-2 text-xl md:text-2xl lg:text-3xl font-extrabold text-slate-800">{formatEur(financialKPIs.revenue)}</div>
            <div className="mt-1 text-sm text-slate-500">From {filteredDispatch.length} confirmed dispatches</div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="text-xs font-bold uppercase text-slate-500">Milk Spend (Net)</div>
            <div className="mt-2 text-xl md:text-2xl lg:text-3xl font-extrabold text-slate-800">{formatEur(financialKPIs.rawMaterialCost)}</div>
            <div className="mt-1 text-sm text-slate-500">Avg {financialKPIs.avgMilkPrice.toFixed(3)} €/kg</div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="text-xs font-bold uppercase text-slate-500">Gross Margin</div>
            <div className="mt-2 text-xl md:text-2xl lg:text-3xl font-extrabold text-slate-800">{financialKPIs.marginPct.toFixed(1)}% <span className="text-base font-semibold text-slate-500">({formatEur(financialKPIs.margin)})</span></div>
            <div className="mt-1 text-sm text-slate-500">Avg sales {financialKPIs.avgSalesPrice.toFixed(2)} €/kg</div>
          </GlassCard>

          <GlassCard className="p-4 lg:col-span-3">
            <div className="flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <BarChart3 className="h-4 w-4 text-slate-400" />
                <div className="text-sm font-extrabold text-slate-800 truncate">Financial Trend (Revenue vs Costs)</div>
              </div>
              <div className="ml-4 text-right hidden sm:block">
                <div className="text-xs text-slate-500">Range totals</div>
                <div className="text-sm font-semibold text-slate-800">{formatEur(financialKPIs.revenue)} <span className="text-slate-400">/</span> {formatEur(financialKPIs.rawMaterialCost)}</div>
                <div className="text-xs text-slate-500">Profit {formatEur(financialKPIs.margin)} • {financialKPIs.marginPct.toFixed(1)}%</div>
              </div>
            </div>
            {dailyFinancialData.length === 0 ? (
              <EmptyState title="No financial data in this range" hint="Try a wider date range or add entries." />
              ) : (
              <div className="mt-3 h-64 md:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dailyFinancialData} margin={{ left: 0, right: 24, top: 8, bottom: 8 }}>
                    <defs>
                      <linearGradient id="gradRevenue" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.18} />
                      </linearGradient>
                      <linearGradient id="gradCost" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.22} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
                    <XAxis dataKey="date" tick={{ fill: '#475569' }} />
                    <YAxis tick={{ fill: '#475569' }} />
                    <Tooltip formatter={(value: any, name: string) => {
                      if (name === 'revenue' || name === 'cost' || name === 'profit') return [formatEur(Number(value)), name.charAt(0).toUpperCase()+name.slice(1)];
                      return [value, name];
                    }} />
                    <Legend wrapperStyle={{ paddingTop: 8 }} />
                    <Bar dataKey="revenue" name="Revenue" fill="url(#gradRevenue)" barSize={28} animationDuration={700} animationEasing="ease" />
                    <Bar dataKey="cost" name="Milk Cost" fill="url(#gradCost)" barSize={20} animationDuration={700} animationEasing="ease" />
                    <Line type="monotone" dataKey="profit" name="Profit" stroke="#10b981" strokeWidth={2} dot={false} animationDuration={900} animationEasing="ease" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* PRODUCTION */}
      {activeView === 'production' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Top KPIs */}
          <GlassCard className="p-4">
            <div className="text-xs font-bold uppercase text-slate-500">Intake (Net)</div>
            <div className="mt-2 text-2xl font-extrabold text-slate-800">{formatKg(productionKPIs.totalIntake)}</div>
            <div className="mt-1 text-sm text-slate-500">Top product: {productionKPIs.topProductName}</div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="text-xs font-bold uppercase text-slate-500">Output</div>
            <div className="mt-2 text-2xl font-extrabold text-slate-800">{formatKg(productionKPIs.totalOutput)}</div>
            <div className="mt-1 text-sm text-slate-500">Variance: {formatKg(productionKPIs.varianceKg)}</div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="text-xs font-bold uppercase text-slate-500">Yield</div>
            <div className="mt-2 text-2xl font-extrabold text-slate-800">{productionKPIs.currentYield.toFixed(2)}%</div>
            <div className="mt-1 text-sm text-slate-500">Discarded: {formatKg(productionKPIs.discardedKg)} ({productionKPIs.discardedPct.toFixed(1)}%)</div>
          </GlassCard>

          {/* OUTPUT SUBTAB */}
          {prodSubtab === 'output' && (
            <>
              <GlassCard className="p-4 lg:col-span-3 flex items-center justify-between gap-4 flex-wrap">
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

              {/* When All: product summary table */}
              {productFilter === ALL ? (
                <GlassCard className="p-4 lg:col-span-3">
                  <div className="text-sm font-extrabold text-slate-800">Product Summary</div>
                    <div className="mt-3 w-full overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold sticky top-0 z-10">
                                <tr>
                                  <th className="p-2">Product</th>
                                  <th className="p-2 text-right">Produced (kg)</th>
                                  <th className="p-2 text-right">Shipped (kg)</th>
                                  <th className="p-2 text-right hidden md:table-cell">Revenue (€)</th>
                                  <th className="p-2 text-right hidden md:table-cell">Avg Sales €/kg</th>
                                  <th className="p-2 text-right">Net (kg)</th>
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
                              <td className="p-2 text-right hidden md:table-cell">€{Math.round(r.revenue).toLocaleString()}</td>
                              <td className="p-2 text-right hidden md:table-cell">{r.avgPrice > 0 ? `€${r.avgPrice.toFixed(2)}` : '-'}</td>
                            <td className="p-2 text-right">{Math.round(r.netKg).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>
              ) : (
                // Product detail view
                <>
                  <GlassCard className="p-4 lg:col-span-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-2">
                        <div className="text-xs font-bold uppercase text-slate-500">Produced</div>
                        <div className="mt-2 text-2xl font-extrabold text-slate-800">{formatKg(outputForProduct.reduce((s,o)=>s+(o.parsed?.totalWeight||0),0))}</div>
                      </div>
                      <div className="p-2">
                        <div className="text-xs font-bold uppercase text-slate-500">Shipped</div>
                        <div className="mt-2 text-2xl font-extrabold text-slate-800">{formatKg(dispatchForProduct.reduce((s,d)=>s+getShippedKg(d),0))}</div>
                      </div>
                      <div className="p-2">
                        <div className="text-xs font-bold uppercase text-slate-500">Revenue</div>
                        <div className="mt-2 text-2xl font-extrabold text-slate-800">{formatEur(dispatchForProduct.reduce((s,d)=>s+getShippedRevenue(d),0))}</div>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-4 lg:col-span-2">
                    <div className="text-sm font-extrabold text-slate-800">Daily Produced vs Shipped</div>
                    {buildDailySeriesForProduct(outputForProduct, dispatchForProduct).length === 0 ? (
                      <EmptyState title="No daily data" />
                    ) : (
                      <div className="mt-3 h-56 md:h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={buildDailySeriesForProduct(outputForProduct, dispatchForProduct)}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Area type="monotone" dataKey="produced" name="Produced" stroke="#3b82f6" fillOpacity={0.1} />
                            <Line type="monotone" dataKey="shipped" name="Shipped" stroke="#10b981" dot={false} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </GlassCard>

                  <GlassCard className="p-4 lg:col-span-1">
                    <div className="text-sm font-extrabold text-slate-800">Daily Revenue</div>
                    {buildDailySeriesForProduct(outputForProduct, dispatchForProduct).length === 0 ? (
                      <EmptyState title="No revenue data" />
                    ) : (
                          <div className="mt-3 h-72">
                            <ResponsiveContainer width="100%" height="100%">
                              <ComposedChart data={buildDailySeriesForProduct(outputForProduct, dispatchForProduct)}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" />
                              </ComposedChart>
                            </ResponsiveContainer>
                          </div>
                    )}
                  </GlassCard>
                </>
              )}

              {/* Product Mix Pie (still shown for context) */}
              <GlassCard className="p-4 lg:col-span-3">
                <div className="text-sm font-extrabold text-slate-800">Product Mix (Output)</div>
                {productMixData.length === 0 ? (
                  <EmptyState title="No output data" />
                ) : (
                  <div className="mt-3 h-56 md:h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={productMixData} dataKey="value" nameKey="name" outerRadius={80} label={false}>
                          {productMixData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v:any) => `${Math.round(v).toLocaleString()} kg`} />
                        <Legend content={() => (
                          <div className="overflow-x-auto py-1 -mx-2 px-2">
                            <div className="whitespace-nowrap text-xs max-w-full">
                              {productMixData.map((p,i)=>(
                                <span key={p.name} className="inline-block align-middle mr-4 px-2 py-1">
                                  <span className="inline-block w-3 h-3 mr-2 align-middle" style={{ background: COLORS[i % COLORS.length] }} />
                                  <span className="font-medium">{p.name}</span>
                                  <span className="text-slate-500 ml-1">{Math.round(p.value).toLocaleString()} kg</span>
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
            </>
          )}

          {/* INTAKE SUBTAB */}
          {prodSubtab === 'intake' && (
            <>
              <GlassCard className="p-4 lg:col-span-3 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-sm font-extrabold text-slate-800">Intake Overview</div>
                  <div className="text-xs text-slate-500 mt-1">Filters apply to intake analytics</div>
                </div>

                <div className="flex gap-2 flex-wrap items-center min-w-0">
                  <select value={milkTypeFilter} onChange={e=>setMilkTypeFilter(e.target.value)} className="bg-white border border-slate-200 rounded p-2 text-sm min-w-0 w-full md:w-auto">
                    <option value="__all__">All milk types</option>
                    {(milkTypes && milkTypes.length>0 ? milkTypes : Array.from(new Set(filteredIntake.map(i=>i.milkType))))?.map(mt => (
                      <option key={mt} value={mt}>{mt}</option>
                    ))}
                  </select>

                  <select value={supplierFilter} onChange={e=>setSupplierFilter(e.target.value)} className="bg-white border border-slate-200 rounded p-2 text-sm min-w-0 w-full md:w-auto">
                    <option value="__all__">All suppliers</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </GlassCard>

              <GlassCard className="p-4 lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs font-bold uppercase text-slate-500">Intake (Net)</div>
                  <div className="mt-2 text-2xl font-extrabold text-slate-800">{formatKg(intakeKPIs.netKg)}</div>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase text-slate-500">Discarded</div>
                  <div className="mt-2 text-2xl font-extrabold text-slate-800">{formatKg(intakeKPIs.discardedKg)}</div>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase text-slate-500">Avg Fat / Prot / pH</div>
                  <div className="mt-2 text-2xl font-extrabold text-slate-800">{intakeKPIs.avgFat.toFixed(2)}% / {intakeKPIs.avgProt.toFixed(2)}% / {intakeKPIs.avgPh.toFixed(2)}</div>
                </div>
              </GlassCard>

              <GlassCard className="p-4 lg:col-span-2">
                <div className="text-sm font-extrabold text-slate-800">Daily Intake vs Discarded</div>
                {dailyIntakeData.length === 0 ? (
                  <EmptyState title="No intake data" />
                ) : (
                  <div className="mt-3 h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dailyIntakeData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Area type="monotone" dataKey="intake" name="Intake" stroke="#3b82f6" fillOpacity={0.12} />
                        <Area type="monotone" dataKey="discarded" name="Discarded" stroke="#ef4444" fillOpacity={0.12} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </GlassCard>

              <GlassCard className="p-4 lg:col-span-1">
                <div className="text-sm font-extrabold text-slate-800">Milk Types</div>
                {milkTypeMixFiltered.length === 0 ? (
                  <EmptyState title="No milk type data" />
                ) : (
                  <div className="mt-3 h-56 md:h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={milkTypeMixFiltered} dataKey="value" nameKey="name" outerRadius={70} label={false}>
                          {milkTypeMixFiltered.map((_,i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v:any)=>`${Math.round(v).toLocaleString()} kg`} />
                        <Legend content={() => (
                          <div className="overflow-x-auto py-1">
                            <div className="whitespace-nowrap text-xs">
                              {milkTypeMixFiltered.map((p,i)=> (
                                <span key={p.name} className="inline-block align-middle mr-3 px-2 py-1">
                                  <span className="inline-block w-3 h-3 mr-2 align-middle" style={{ background: COLORS[i % COLORS.length] }} />
                                  <span className="font-medium">{p.name}</span>
                                  <span className="text-slate-500 ml-1">{Math.round(p.value).toLocaleString()} kg</span>
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

              <GlassCard className="p-4 lg:col-span-3">
                <div className="text-sm font-extrabold text-slate-800">Supplier Mix</div>
                {supplierMix.length === 0 ? (
                  <EmptyState title="No supplier data" />
                ) : (
                  <div className="mt-3">
                    <ResponsiveContainer width="100%" height={300}>
                      <ComposedChart data={supplierMix}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip formatter={(v:any)=>`${Math.round(v).toLocaleString()} kg`} />
                        <Bar dataKey="value" name="Kg" fill="#3b82f6" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </GlassCard>
            </>
          )}

          {/* QUALITY */}
          <>
            <GlassCard className="p-4 lg:col-span-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-extrabold text-slate-800">Quality Overview</div>
                  <div className="text-xs text-slate-500 mt-1">Filters apply to quality analytics</div>
                </div>

                <div className="flex gap-2 flex-wrap items-center">
                  <select value={milkTypeFilter} onChange={e=>setMilkTypeFilter(e.target.value)} className="bg-white border border-slate-200 rounded p-2 text-sm min-w-0 w-full md:w-auto">
                    <option value="__all__">All milk types</option>
                    {(milkTypes && milkTypes.length>0 ? milkTypes : Array.from(new Set(filteredIntake.map(i=>i.milkType))))?.map(mt => (
                      <option key={mt} value={mt}>{mt}</option>
                    ))}
                  </select>

                  <select value={supplierFilter} onChange={e=>setSupplierFilter(e.target.value)} className="bg-white border border-slate-200 rounded p-2 text-sm min-w-0 w-full md:w-auto">
                    <option value="__all__">All suppliers</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 lg:col-span-3">
              <div>
                <div className="text-xs font-bold uppercase text-slate-500">Loads OK (%)</div>
                <div className="mt-2 text-2xl font-extrabold text-slate-800">{complianceKPIs.fullyOkPct.toFixed(0)}%</div>
              </div>
              <div>
                <div className="text-xs font-bold uppercase text-slate-500">Temp Violations</div>
                <div className="mt-2 text-2xl font-extrabold text-slate-800">{qualityFilteredBase.length - complianceKPIs.tempOkCount}</div>
              </div>
              <div>
                <div className="text-xs font-bold uppercase text-slate-500">pH Violations</div>
                <div className="mt-2 text-2xl font-extrabold text-slate-800">{qualityFilteredBase.length - complianceKPIs.phOkCount}</div>
              </div>
            </GlassCard>

            <GlassCard className="p-4 lg:col-span-3">
              <div className="text-sm font-extrabold text-slate-800">Quality Trends</div>
              {qualityTrendData.length === 0 ? (
                <EmptyState title="No quality data in this range" />
              ) : (
              <div className="mt-3 h-64 md:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={qualityTrendData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="fat" name="Fat %" stroke="#3b82f6" dot={false} />
                      <Line yAxisId="left" type="monotone" dataKey="protein" name="Protein %" stroke="#10b981" dot={false} />
                      <Line yAxisId="right" type="monotone" dataKey="ph" name="pH" stroke="#ef4444" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-4 lg:col-span-3">
              <div className="text-sm font-extrabold text-slate-800">Top Issues (last range)</div>
              {outliers.length === 0 ? (
                <div className="mt-3 text-slate-400 italic">No notable issues</div>
              ) : (
                <div className="mt-3 w-full overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold sticky top-0 z-10">
                      <tr>
                        <th className="p-2">Date</th>
                        <th className="p-2">Supplier</th>
                        <th className="p-2">MilkType</th>
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
                          <td className="p-2">{suppliers.find(s=>s.id===o.supplierId)?.name || o.supplierId}</td>
                          <td className="p-2">{o.milkType}</td>
                          <td className="p-2 text-right">{Math.round(o.quantityKg).toLocaleString()}</td>
                          <td className="p-2 text-right">{(o.fatPct||0).toFixed(2)}</td>
                          <td className="p-2 text-right">{(o.proteinPct||0).toFixed(2)}</td>
                          <td className="p-2 text-right">{(o.ph||0).toFixed(2)}</td>
                          <td className="p-2 text-right">{(o.tempCelsius||0).toFixed(1)}°C</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassCard>
          </>
        </div>
      )}

      {/* QUALITY view when not inside the production flow (handle separately) */}
      {activeView === 'quality' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <GlassCard className="p-4">
            <div className="text-xs font-bold uppercase text-slate-500">Avg Fat</div>
            <div className="mt-2 text-2xl font-extrabold text-slate-800">{qualityKPIs.avgFat.toFixed(2)}%</div>
            <div className="mt-1 text-sm text-slate-500">Target: {FAT_TARGET.toFixed(1)}%</div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="text-xs font-bold uppercase text-slate-500">Avg Protein</div>
            <div className="mt-2 text-2xl font-extrabold text-slate-800">{qualityKPIs.avgProt.toFixed(2)}%</div>
            <div className="mt-1 text-sm text-slate-500">Target: {PROT_TARGET.toFixed(1)}%</div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="text-xs font-bold uppercase text-slate-500">Avg pH</div>
            <div className="mt-2 text-2xl font-extrabold text-slate-800">{qualityKPIs.avgPh.toFixed(2)}</div>
            <div className="mt-1 text-sm text-slate-500">Std: 6.60–6.70</div>
          </GlassCard>

          <GlassCard className={`p-4 lg:col-span-3 ${qualityKPIs.highTempCount + qualityKPIs.badPhCount > 0 ? "bg-red-50 border border-red-200" : "bg-white"}`}>
            <div className="flex items-center gap-2">
              <AlertCircle className={`h-4 w-4 ${qualityKPIs.highTempCount + qualityKPIs.badPhCount > 0 ? "text-red-500" : "text-slate-400"}`} />
              <div className="text-sm font-extrabold text-slate-800">Quality Alerts</div>
            </div>
            <div className="mt-2 text-sm text-slate-600">Violations: <span className="font-bold">{qualityKPIs.highTempCount + qualityKPIs.badPhCount}</span> (Temp & pH)</div>
          </GlassCard>

          <GlassCard className="p-4 lg:col-span-3">
            <div className="text-sm font-extrabold text-slate-800">Quality Trends (Fat, Protein, pH)</div>
            {qualityTrendData.length === 0 ? (
              <EmptyState title="No quality data in this range" />
            ) : (
              <div className="mt-3 h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={qualityTrendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="fat" name="Fat %" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="protein" name="Protein %" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="ph" name="pH" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </GlassCard>
        </div>
      )}
      <ReportExportModal open={showReportModal} onClose={() => setShowReportModal(false)} />
    </div>
  );
};
