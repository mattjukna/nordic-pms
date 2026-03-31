import React, { useMemo, useState } from 'react';
import { useStore } from '../../store';
import { GlassCard } from '../ui/GlassCard';
import { Hintable } from '../ui/Hintable';
import {
  AlertCircle,
  AlertTriangle,
  Lightbulb,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Users,
  Package,
  DollarSign,
  Droplets,
  Target,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { IntakeEntry, DispatchEntry } from '../../types';
import { isShippedStatus, getShippedKg, getShippedRevenue } from '../../utils/dispatchMath';
import { getEffectiveIntakeQuantityKg } from '../../utils/intakeCoefficient';

const TARGET_YIELD = 12.5;
const TEMP_MAX = 8;
const PH_MIN = 6.55;
const PH_MAX = 6.74;

const formatKg = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${Math.round(v).toLocaleString()} kg`);
const formatEur = (v: number) => `€${Math.round(v).toLocaleString()}`;

type InsightSeverity = 'danger' | 'warning' | 'info';
type InsightCategory = 'financial' | 'inventory' | 'quality' | 'operational' | 'contracts';

interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  description: string;
  category: InsightCategory;
}

/* ─── Circular health gauge ─── */
const HealthGauge: React.FC<{ score: number; label: string; color: string }> = ({ score, label, color }) => {
  const r = 32;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (Math.min(score, 100) / 100) * circumference;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#e2e8f0" strokeWidth="7" />
        <circle
          cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 40 40)"
          className="transition-all duration-1000 ease-out"
        />
        <text x="40" y="40" textAnchor="middle" dominantBaseline="central" className="text-base font-extrabold" fill="#1e293b">
          {Math.round(score)}
        </text>
      </svg>
      <div className="text-xs font-bold text-slate-600 uppercase tracking-wide">{label}</div>
    </div>
  );
};

/* ─── Insight card ─── */
const InsightCard: React.FC<{ insight: Insight }> = ({ insight }) => {
  const styles: Record<InsightSeverity, { border: string; bg: string; icon: JSX.Element }> = {
    danger: { border: 'border-l-red-400', bg: 'bg-red-50/50', icon: <AlertCircle className="text-red-500" size={16} /> },
    warning: { border: 'border-l-amber-400', bg: 'bg-amber-50/50', icon: <AlertTriangle className="text-amber-500" size={16} /> },
    info: { border: 'border-l-blue-400', bg: 'bg-blue-50/50', icon: <Lightbulb className="text-blue-500" size={16} /> },
  };
  const s = styles[insight.severity];
  return (
    <div className={`p-4 rounded-xl border-l-4 ${s.border} ${s.bg} transition-all duration-200 hover:shadow-sm`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{s.icon}</div>
        <div className="min-w-0">
          <div className="font-bold text-sm text-slate-800">{insight.title}</div>
          <div className="text-xs text-slate-600 mt-1 leading-relaxed">{insight.description}</div>
          <div className="text-[10px] uppercase font-bold text-slate-400 mt-2">{insight.category}</div>
        </div>
      </div>
    </div>
  );
};

/* ─── Trend card ─── */
const TrendCard: React.FC<{ metric: string; current: string; delta: number; period: string }> = ({ metric, current, delta, period }) => {
  const isUp = delta > 0;
  return (
    <GlassCard className="p-4 hover:shadow-md transition-shadow duration-200">
      <div className="text-xs font-bold uppercase text-slate-500">{metric}</div>
      <div className="mt-1 text-lg font-extrabold text-slate-800">{current}</div>
      <div className="mt-1 flex items-center gap-1">
        {Math.abs(delta) < 0.5 ? (
          <span className="text-[10px] text-slate-400">No change</span>
        ) : (
          <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
            {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {Math.abs(delta).toFixed(1)}% {period}
          </span>
        )}
      </div>
    </GlassCard>
  );
};

/* ═══════════════════════ MAIN COMPONENT ═══════════════════════ */

export const AITab: React.FC = () => {
  const intakeEntries = useStore(s => s.intakeEntries);
  const outputEntries = useStore(s => s.outputEntries);
  const dispatchEntries = useStore(s => s.dispatchEntries);
  const suppliers = useStore(s => s.suppliers);
  const products = useStore(s => s.products);
  const buyers = useStore(s => s.buyers);
  const alerts = useStore(s => s.alerts);

  const [showAllInsights, setShowAllInsights] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ insights: true, suppliers: true, products: true, alerts: false });

  const toggleSection = (key: string) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));

  /* ─── Health scores ─── */
  const healthScores = useMemo(() => {
    // Financial: margin-based (33%+ margin = 100)
    const totalRevenue = dispatchEntries.filter(d => isShippedStatus(d.status)).reduce((s, d) => s + getShippedRevenue(d), 0);
    const totalCost = intakeEntries.filter(e => !e.isDiscarded).reduce((s, e) => s + (e.calculatedCost || 0), 0);
    const margin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;
    const financial = Math.min(100, Math.max(0, margin * 3));

    // Operational: yield-based
    const totalEffIntake = intakeEntries.filter(e => !e.isDiscarded).reduce((s, e) => s + getEffectiveIntakeQuantityKg(e), 0);
    const totalOutput = outputEntries.reduce((s, e) => s + (e.parsed?.totalWeight || 0), 0);
    const yieldPct = totalEffIntake > 0 ? (totalOutput / totalEffIntake) * 100 : 0;
    const operational = Math.min(100, Math.max(0, (yieldPct / TARGET_YIELD) * 100));

    // Quality: compliance in last 30 days
    const recent = intakeEntries.filter(e => !e.isDiscarded && e.timestamp >= Date.now() - 30 * 86400000);
    const compliant = recent.filter(e => (e.tempCelsius || 0) <= TEMP_MAX && (e.ph || 0) >= PH_MIN && (e.ph || 0) <= PH_MAX).length;
    const quality = recent.length > 0 ? (compliant / recent.length) * 100 : 100;

    return { financial, operational, quality };
  }, [intakeEntries, outputEntries, dispatchEntries]);

  /* ─── Weekly trends ─── */
  const weeklyTrends = useMemo(() => {
    const now = Date.now();
    const w1Start = now - 7 * 86400000;
    const w2Start = now - 14 * 86400000;

    const thisWeekIntake = intakeEntries.filter(e => !e.isDiscarded && e.timestamp >= w1Start);
    const lastWeekIntake = intakeEntries.filter(e => !e.isDiscarded && e.timestamp >= w2Start && e.timestamp < w1Start);
    const thisWeekKg = thisWeekIntake.reduce((s, e) => s + (e.quantityKg || 0), 0);
    const lastWeekKg = lastWeekIntake.reduce((s, e) => s + (e.quantityKg || 0), 0);

    const thisWeekRev = dispatchEntries.filter(d => isShippedStatus(d.status) && d.date >= w1Start).reduce((s, d) => s + getShippedRevenue(d), 0);
    const lastWeekRev = dispatchEntries.filter(d => isShippedStatus(d.status) && d.date >= w2Start && d.date < w1Start).reduce((s, d) => s + getShippedRevenue(d), 0);

    const thisWeekOutput = outputEntries.filter(e => e.timestamp >= w1Start).reduce((s, e) => s + (e.parsed?.totalWeight || 0), 0);
    const lastWeekOutput = outputEntries.filter(e => e.timestamp >= w2Start && e.timestamp < w1Start).reduce((s, e) => s + (e.parsed?.totalWeight || 0), 0);

    const thisWeekCompliant = thisWeekIntake.filter(e => (e.tempCelsius || 0) <= TEMP_MAX && (e.ph || 0) >= PH_MIN && (e.ph || 0) <= PH_MAX).length;
    const thisWeekCompPct = thisWeekIntake.length > 0 ? (thisWeekCompliant / thisWeekIntake.length) * 100 : 100;
    const lastWeekCompliant = lastWeekIntake.filter(e => (e.tempCelsius || 0) <= TEMP_MAX && (e.ph || 0) >= PH_MIN && (e.ph || 0) <= PH_MAX).length;
    const lastWeekCompPct = lastWeekIntake.length > 0 ? (lastWeekCompliant / lastWeekIntake.length) * 100 : 100;

    const trends: { metric: string; current: string; delta: number; period: string }[] = [];
    if (lastWeekKg > 0 || thisWeekKg > 0) {
      trends.push({ metric: 'Intake Volume', current: formatKg(thisWeekKg), delta: lastWeekKg > 0 ? ((thisWeekKg - lastWeekKg) / lastWeekKg) * 100 : 0, period: 'vs last week' });
    }
    if (lastWeekRev > 0 || thisWeekRev > 0) {
      trends.push({ metric: 'Revenue', current: formatEur(thisWeekRev), delta: lastWeekRev > 0 ? ((thisWeekRev - lastWeekRev) / lastWeekRev) * 100 : 0, period: 'vs last week' });
    }
    if (lastWeekOutput > 0 || thisWeekOutput > 0) {
      trends.push({ metric: 'Output', current: formatKg(thisWeekOutput), delta: lastWeekOutput > 0 ? ((thisWeekOutput - lastWeekOutput) / lastWeekOutput) * 100 : 0, period: 'vs last week' });
    }
    if (thisWeekIntake.length > 0) {
      trends.push({ metric: 'Quality Compliance', current: `${thisWeekCompPct.toFixed(0)}%`, delta: lastWeekCompPct > 0 ? ((thisWeekCompPct - lastWeekCompPct) / lastWeekCompPct) * 100 : 0, period: 'vs last week' });
    }
    return trends;
  }, [intakeEntries, outputEntries, dispatchEntries]);

  /* ─── Computed insights ─── */
  const insights = useMemo(() => {
    const result: Insight[] = [];
    let idx = 0;
    const id = () => `insight-${idx++}`;

    // Financial: margin
    const totalRevenue = dispatchEntries.filter(d => isShippedStatus(d.status)).reduce((s, d) => s + getShippedRevenue(d), 0);
    const totalCost = intakeEntries.filter(e => !e.isDiscarded).reduce((s, e) => s + (e.calculatedCost || 0), 0);
    const margin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;
    if (totalRevenue > 0 && margin < 10) result.push({ id: id(), severity: 'danger', title: 'Low Gross Margin', description: `Margin is only ${margin.toFixed(1)}%. Review product pricing or reduce raw material costs.`, category: 'financial' });
    else if (totalRevenue > 0 && margin >= 25) result.push({ id: id(), severity: 'info', title: 'Healthy Margins', description: `Gross margin is ${margin.toFixed(1)}%. Financial operations are performing well.`, category: 'financial' });

    // Revenue concentration by buyer
    const buyerRevenue: Record<string, number> = {};
    dispatchEntries.filter(d => isShippedStatus(d.status)).forEach(d => { buyerRevenue[d.buyer || 'Unknown'] = (buyerRevenue[d.buyer || 'Unknown'] || 0) + getShippedRevenue(d); });
    const topBuyer = Object.entries(buyerRevenue).sort((a, b) => b[1] - a[1])[0];
    if (topBuyer && totalRevenue > 0 && (topBuyer[1] / totalRevenue) > 0.5) {
      result.push({ id: id(), severity: 'warning', title: 'Revenue Concentration Risk', description: `${topBuyer[0]} accounts for ${((topBuyer[1] / totalRevenue) * 100).toFixed(0)}% of total revenue. Single-buyer dependency is high.`, category: 'financial' });
    }

    // Per-product stock
    products.forEach(p => {
      const produced = outputEntries.filter(o => o.productId === p.id).reduce((s, o) => s + (o.parsed?.totalWeight || 0), 0);
      const shipped = dispatchEntries.filter(d => d.productId === p.id && isShippedStatus(d.status)).reduce((s, d) => s + getShippedKg(d), 0);
      const planned = dispatchEntries.filter(d => d.productId === p.id && d.status === 'planned').reduce((s, d) => s + d.quantityKg, 0);
      const stock = produced - shipped;
      if (stock < 0) result.push({ id: id(), severity: 'danger', title: `${p.id} Over-Shipped`, description: `${formatKg(Math.abs(stock))} more shipped than produced. Verify inventory records immediately.`, category: 'inventory' });
      else if (planned > stock && planned > 0) result.push({ id: id(), severity: 'warning', title: `${p.id} Stock at Risk`, description: `Planned shipments (${formatKg(planned)}) exceed current stock (${formatKg(stock)}). Schedule production.`, category: 'inventory' });
      else if (stock > 0 && produced > 0 && stock > produced * 0.8) result.push({ id: id(), severity: 'info', title: `${p.id} Stock Building Up`, description: `Stock is ${formatKg(stock)} with only ${formatKg(shipped)} shipped. Consider new sales channels.`, category: 'inventory' });
    });

    // Quality: recent temperature violations
    const recent7d = intakeEntries.filter(e => e.timestamp >= Date.now() - 7 * 86400000 && !e.isDiscarded);
    const highTemp = recent7d.filter(e => (e.tempCelsius || 0) > TEMP_MAX);
    if (highTemp.length > 0) result.push({ id: id(), severity: 'warning', title: `${highTemp.length} Temperature Violations`, description: `${highTemp.length} loads in the past 7 days exceeded ${TEMP_MAX}°C. Review cold chain logistics.`, category: 'quality' });

    // Quality: recent discards
    const discarded7d = intakeEntries.filter(e => e.timestamp >= Date.now() - 7 * 86400000 && e.isDiscarded === true);
    if (discarded7d.length > 0) {
      const lossKg = discarded7d.reduce((s, e) => s + (e.quantityKg || 0), 0);
      const lossCost = discarded7d.reduce((s, e) => s + (e.calculatedCost || 0), 0);
      result.push({ id: id(), severity: 'danger', title: 'Recent Discards', description: `${discarded7d.length} loads (${formatKg(lossKg)}, ${formatEur(lossCost)}) discarded in the past 7 days.`, category: 'quality' });
    }

    // Supplier concentration
    const supplierVolumes: Record<string, number> = {};
    intakeEntries.filter(e => !e.isDiscarded).forEach(e => { supplierVolumes[e.supplierId] = (supplierVolumes[e.supplierId] || 0) + (e.quantityKg || 0); });
    const totalVolume = Object.values(supplierVolumes).reduce((s, v) => s + v, 0);
    const topSupplier = Object.entries(supplierVolumes).sort((a, b) => b[1] - a[1])[0];
    if (topSupplier && totalVolume > 0 && (topSupplier[1] / totalVolume) > 0.4) {
      const name = suppliers.find(s => s.id === topSupplier[0])?.name || topSupplier[0];
      result.push({ id: id(), severity: 'warning', title: 'Supplier Concentration', description: `${name} accounts for ${((topSupplier[1] / totalVolume) * 100).toFixed(0)}% of all intake. Consider diversifying supply.`, category: 'operational' });
    }

    // Worst quality supplier (by compliance)
    const supplierQuality: Record<string, { total: number; ok: number; name: string }> = {};
    intakeEntries.filter(e => !e.isDiscarded).forEach(e => {
      if (!supplierQuality[e.supplierId]) supplierQuality[e.supplierId] = { total: 0, ok: 0, name: suppliers.find(s => s.id === e.supplierId)?.name || e.supplierId };
      supplierQuality[e.supplierId].total += 1;
      if ((e.tempCelsius || 0) <= TEMP_MAX && (e.ph || 0) >= PH_MIN && (e.ph || 0) <= PH_MAX) supplierQuality[e.supplierId].ok += 1;
    });
    const worstSupplier = Object.values(supplierQuality).filter(s => s.total >= 3).sort((a, b) => (a.ok / a.total) - (b.ok / b.total))[0];
    if (worstSupplier && (worstSupplier.ok / worstSupplier.total) < 0.7) {
      result.push({ id: id(), severity: 'warning', title: 'Low Compliance Supplier', description: `${worstSupplier.name} has only ${((worstSupplier.ok / worstSupplier.total) * 100).toFixed(0)}% quality compliance (${worstSupplier.total} loads). Review supplier standards.`, category: 'quality' });
    }

    // Contract fulfillment risk
    buyers.forEach(b => {
      b.contracts?.forEach(c => {
        if (c.endDate && c.endDate < Date.now()) return;
        const shipped = dispatchEntries.filter(d => d.contractNumber === c.contractNumber && isShippedStatus(d.status)).reduce((s, d) => s + getShippedKg(d), 0);
        const pct = c.agreedAmountKg > 0 ? (shipped / c.agreedAmountKg) * 100 : 0;
        if (c.agreedAmountKg > 0 && pct < 50 && c.endDate && (c.endDate - Date.now()) < 30 * 86400000) {
          result.push({ id: id(), severity: 'warning', title: `Contract ${c.contractNumber} Behind`, description: `Only ${pct.toFixed(0)}% of ${formatKg(c.agreedAmountKg)} fulfilled for ${b.name} with less than 30 days remaining.`, category: 'contracts' });
        }
      });
    });

    // Yield
    const totalEffIntake = intakeEntries.filter(e => !e.isDiscarded).reduce((s, e) => s + getEffectiveIntakeQuantityKg(e), 0);
    const totalOutput = outputEntries.reduce((s, e) => s + (e.parsed?.totalWeight || 0), 0);
    const overallYield = totalEffIntake > 0 ? (totalOutput / totalEffIntake) * 100 : 0;
    if (overallYield > 0 && overallYield < TARGET_YIELD * 0.8) result.push({ id: id(), severity: 'warning', title: 'Low Overall Yield', description: `Yield is ${overallYield.toFixed(1)}%, significantly below the ${TARGET_YIELD}% target. Investigate production efficiency.`, category: 'operational' });
    else if (overallYield >= TARGET_YIELD) result.push({ id: id(), severity: 'info', title: 'Yield On Target', description: `Overall yield is ${overallYield.toFixed(1)}%, meeting the ${TARGET_YIELD}% target.`, category: 'operational' });

    // Sort: danger first, then warning, then info
    const order: Record<InsightSeverity, number> = { danger: 0, warning: 1, info: 2 };
    return result.sort((a, b) => order[a.severity] - order[b.severity]);
  }, [intakeEntries, outputEntries, dispatchEntries, suppliers, products, buyers]);

  /* ─── Supplier performance table ─── */
  const supplierPerformance = useMemo(() => {
    const data: Record<string, { name: string; kg: number; loads: number; cost: number; ok: number }> = {};
    intakeEntries.filter(e => !e.isDiscarded).forEach(e => {
      const id = e.supplierId;
      const name = suppliers.find(s => s.id === id)?.name || id || 'Unknown';
      if (!data[id]) data[id] = { name, kg: 0, loads: 0, cost: 0, ok: 0 };
      data[id].kg += e.quantityKg || 0;
      data[id].loads += 1;
      data[id].cost += e.calculatedCost || 0;
      if ((e.tempCelsius || 0) <= TEMP_MAX && (e.ph || 0) >= PH_MIN && (e.ph || 0) <= PH_MAX) data[id].ok += 1;
    });
    return Object.values(data).map(s => ({
      name: s.name, totalKg: s.kg, loads: s.loads, totalCost: s.cost,
      avgCostPerKg: s.kg > 0 ? s.cost / s.kg : 0,
      compliancePct: s.loads > 0 ? (s.ok / s.loads) * 100 : 0,
    })).sort((a, b) => b.totalKg - a.totalKg);
  }, [intakeEntries, suppliers]);

  /* ─── Product performance table ─── */
  const productPerformance = useMemo(() => {
    return products.map(p => {
      const produced = outputEntries.filter(o => o.productId === p.id).reduce((s, o) => s + (o.parsed?.totalWeight || 0), 0);
      const shipped = dispatchEntries.filter(d => d.productId === p.id && isShippedStatus(d.status)).reduce((s, d) => s + getShippedKg(d), 0);
      const revenue = dispatchEntries.filter(d => d.productId === p.id && isShippedStatus(d.status)).reduce((s, d) => s + getShippedRevenue(d), 0);
      const stock = produced - shipped;
      return { id: p.id, name: p.name, produced, shipped, revenue, stock, avgPrice: shipped > 0 ? revenue / shipped : 0 };
    }).filter(p => p.produced > 0 || p.shipped > 0).sort((a, b) => b.revenue - a.revenue);
  }, [products, outputEntries, dispatchEntries]);

  const visibleInsights = showAllInsights ? insights : insights.slice(0, 6);
  const dangerCount = insights.filter(i => i.severity === 'danger').length;
  const warningCount = insights.filter(i => i.severity === 'warning').length;

  /* ═══════════ RENDER ═══════════ */
  return (
    <div className="space-y-5 overflow-x-hidden">

      {/* Health Scores */}
      <GlassCard className="p-6" hint="Three health gauges scored 0–100. Financial: based on gross margin (33%+ = 100). Efficiency: based on production yield vs 12.5% target. Quality: intake compliance rate over the last 30 days.">
        <div className="text-sm font-extrabold text-slate-800 mb-4">Operations Health</div>
        <div className="flex flex-wrap justify-center gap-8 md:gap-16">
          <HealthGauge score={healthScores.financial} label="Financial" color={healthScores.financial >= 70 ? '#10b981' : healthScores.financial >= 40 ? '#f59e0b' : '#ef4444'} />
          <HealthGauge score={healthScores.operational} label="Efficiency" color={healthScores.operational >= 70 ? '#10b981' : healthScores.operational >= 40 ? '#f59e0b' : '#ef4444'} />
          <HealthGauge score={healthScores.quality} label="Quality" color={healthScores.quality >= 70 ? '#10b981' : healthScores.quality >= 40 ? '#f59e0b' : '#ef4444'} />
        </div>
      </GlassCard>

      {/* Weekly Trends */}
      {weeklyTrends.length > 0 && (
        <Hintable hint="Week-over-week comparison of key operational metrics: intake volume, revenue, production output, and quality compliance. Delta percentages show change from the previous 7-day period.">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {weeklyTrends.map(t => <TrendCard key={t.metric} {...t} />)}
        </div>
        </Hintable>
      )}

      {/* Key Insights */}
      <GlassCard className="p-4" hint="Auto-computed alerts and recommendations based on your data: margin analysis, inventory warnings, quality violations, supplier risks, and contract fulfillment status. Sorted by severity — critical issues first.">
        <button onClick={() => toggleSection('insights')} className="w-full flex items-center justify-between group">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-blue-500" />
            <div className="text-sm font-extrabold text-slate-800">Key Insights</div>
            {dangerCount > 0 && <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">{dangerCount} critical</span>}
            {warningCount > 0 && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{warningCount} warnings</span>}
          </div>
          {expandedSections.insights ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
        </button>
        {expandedSections.insights && (
          <div className="mt-4 space-y-3">
            {insights.length === 0 ? (
              <div className="text-sm text-slate-400 italic p-4 text-center">No notable insights at this time. All systems operating normally.</div>
            ) : (
              <>
                {visibleInsights.map(insight => <InsightCard key={insight.id} insight={insight} />)}
                {insights.length > 6 && (
                  <button onClick={() => setShowAllInsights(!showAllInsights)} className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors px-1">
                    {showAllInsights ? 'Show fewer' : `Show all ${insights.length} insights`}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </GlassCard>

      {/* Supplier Performance */}
      <GlassCard className="p-4" hint="Table showing each supplier's total intake volume, number of loads, total cost, average cost per kg, and quality compliance percentage. Sorted by volume.">
        <button onClick={() => toggleSection('suppliers')} className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-purple-500" />
            <div className="text-sm font-extrabold text-slate-800">Supplier Performance</div>
            <span className="text-xs text-slate-400">{supplierPerformance.length} suppliers</span>
          </div>
          {expandedSections.suppliers ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
        </button>
        {expandedSections.suppliers && supplierPerformance.length > 0 && (
          <div className="mt-4 w-full overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold sticky top-0 z-10">
                <tr>
                  <th className="p-2">Supplier</th>
                  <th className="p-2 text-right">Loads</th>
                  <th className="p-2 text-right">Volume</th>
                  <th className="p-2 text-right hidden md:table-cell">Total Cost</th>
                  <th className="p-2 text-right hidden md:table-cell">€/kg</th>
                  <th className="p-2 text-right">Compliance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supplierPerformance.map(s => (
                  <tr key={s.name} className="hover:bg-slate-50 transition-colors">
                    <td className="p-2 font-medium">{s.name}</td>
                    <td className="p-2 text-right">{s.loads}</td>
                    <td className="p-2 text-right">{formatKg(s.totalKg)}</td>
                    <td className="p-2 text-right hidden md:table-cell">{formatEur(s.totalCost)}</td>
                    <td className="p-2 text-right hidden md:table-cell">{s.avgCostPerKg > 0 ? `€${s.avgCostPerKg.toFixed(3)}` : '—'}</td>
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

      {/* Product Performance */}
      <GlassCard className="p-4" hint="Table showing each product's produced and shipped quantities, total revenue, average selling price per kg, and current stock level (produced − shipped). Sorted by revenue.">
        <button onClick={() => toggleSection('products')} className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-emerald-500" />
            <div className="text-sm font-extrabold text-slate-800">Product Performance</div>
            <span className="text-xs text-slate-400">{productPerformance.length} products</span>
          </div>
          {expandedSections.products ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
        </button>
        {expandedSections.products && productPerformance.length > 0 && (
          <div className="mt-4 w-full overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold sticky top-0 z-10">
                <tr>
                  <th className="p-2">Product</th>
                  <th className="p-2 text-right">Produced</th>
                  <th className="p-2 text-right">Shipped</th>
                  <th className="p-2 text-right">Revenue</th>
                  <th className="p-2 text-right hidden md:table-cell">Avg €/kg</th>
                  <th className="p-2 text-right">Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productPerformance.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-2 font-medium">{p.id}</td>
                    <td className="p-2 text-right">{formatKg(p.produced)}</td>
                    <td className="p-2 text-right">{formatKg(p.shipped)}</td>
                    <td className="p-2 text-right font-bold">{formatEur(p.revenue)}</td>
                    <td className="p-2 text-right hidden md:table-cell">{p.avgPrice > 0 ? `€${p.avgPrice.toFixed(2)}` : '—'}</td>
                    <td className={`p-2 text-right font-bold ${p.stock < 0 ? 'text-red-600' : 'text-slate-800'}`}>{formatKg(p.stock)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* System Alerts */}
      <GlassCard className="p-4" hint="Real-time system notifications including data sync issues, validation warnings, and operational alerts.">
        <button onClick={() => toggleSection('alerts')} className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <div className="text-sm font-extrabold text-slate-800">System Alerts</div>
            {alerts.length > 0 && <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-bold">{alerts.length}</span>}
          </div>
          {expandedSections.alerts ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
        </button>
        {expandedSections.alerts && (
          <div className="mt-4 space-y-3">
            {alerts.length === 0 ? (
              <div className="text-sm text-slate-400 italic p-4 text-center">No system alerts</div>
            ) : (
              alerts.map(alert => (
                <div key={alert.id} className={`p-4 rounded-lg border text-sm shadow-sm transition-all duration-200 ${
                  alert.type === 'danger' ? 'bg-red-50 border-red-200 text-red-800' :
                  alert.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                  'bg-blue-50 border-blue-200 text-blue-800'
                }`}>
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-bold text-xs uppercase opacity-70">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                  </div>
                  {alert.message}
                </div>
              ))
            )}
          </div>
        )}
      </GlassCard>
    </div>
  );
};
