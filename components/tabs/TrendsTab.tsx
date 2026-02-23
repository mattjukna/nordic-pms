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
} from "lucide-react";
import type { IntakeEntry, OutputEntry, DispatchEntry } from "../../types";
import { isShippedStatus, getShippedKg, getShippedRevenue, getShipmentsByDate } from "../../utils/dispatchMath";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

// Business defaults (you already had these concepts)
const TARGET_YIELD_FACTOR = 0.125; // 12.5% theoretical output from (net) milk intake
const FAT_TARGET = 4.0;
const PROT_TARGET = 3.2;

type TimeRange = "day" | "week" | "month" | "quarter" | "year" | "all";
type ViewMode = "financial" | "production" | "quality";

const toISODate = (ts: number) => new Date(ts).toISOString().slice(0, 10);

const endOfDayTs = (d: Date) => {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy.getTime();
};

const startOfDayTs = (d: Date) => {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
};

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
  const { intakeEntries, outputEntries, dispatchEntries, globalConfig } = useStore();

  const [activeView, setActiveView] = useState<ViewMode>("financial");
  const [timeRange, setTimeRange] = useState<TimeRange>("month");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  // ---------- FILTERS ----------
  const { filteredIntake, filteredOutput, filteredDispatch, dateLabel } = useMemo(() => {
    const now = new Date();
    const defaultEnd = endOfDayTs(now);

    let startTs = 0;
    let endTs = defaultEnd;
    let label = "";

    // custom date range overrides quick ranges
    if (customStart) {
      const start = new Date(customStart);
      startTs = startOfDayTs(start);

      if (customEnd) {
        const end = new Date(customEnd);
        endTs = endOfDayTs(end);
      } else {
        endTs = defaultEnd;
      }

      label = `${customStart}${customEnd ? ` → ${customEnd}` : ""}`;
    } else {
      const today = new Date();
      const todayStart = startOfDayTs(today);

      const subtractDays = (days: number) => {
        const d = new Date(todayStart);
        d.setDate(d.getDate() - days);
        return d.getTime();
      };

      switch (timeRange) {
        case "day":
          startTs = todayStart;
          label = "Today";
          break;
        case "week":
          startTs = subtractDays(7);
          label = "Last 7 days";
          break;
        case "month":
          startTs = subtractDays(30);
          label = "Last 30 days";
          break;
        case "quarter":
          startTs = subtractDays(90);
          label = "Last 90 days";
          break;
        case "year":
          startTs = subtractDays(365);
          label = "Last 365 days";
          break;
        case "all":
          startTs = 0;
          label = "All time";
          break;
      }
    }

    const intake = (intakeEntries as IntakeEntry[]).filter((e) => e.timestamp >= startTs && e.timestamp <= endTs);
    const output = (outputEntries as OutputEntry[]).filter((e) => e.timestamp >= startTs && e.timestamp <= endTs);

    // Business rule: treat any non-planned dispatch as shipped (confirmed or completed)
    const dispatch = (dispatchEntries as DispatchEntry[]).filter(
      (e) => e.date >= startTs && e.date <= endTs && isShippedStatus(e.status)
    );

    return { filteredIntake: intake, filteredOutput: output, filteredDispatch: dispatch, dateLabel: label };
  }, [timeRange, customStart, customEnd, intakeEntries, outputEntries, dispatchEntries]);

  const nonDiscardedFilteredIntake = useMemo(
    () => filteredIntake.filter((e) => e.isDiscarded !== true),
    [filteredIntake]
  );

  // ---------- KPIs ----------
  const financialKPIs = useMemo(() => {
    // revenue must be computed from shipped kg * salesPricePerKg to match Inventory logic
    const totalRevenue = filteredDispatch.reduce((sum, e) => sum + getShippedRevenue(e), 0);

    const rawMaterialCost = nonDiscardedFilteredIntake.reduce((sum, e) => sum + (e.calculatedCost || 0), 0);
    const discardedLoss = filteredIntake
      .filter((e) => e.isDiscarded === true)
      .reduce((sum, e) => sum + (e.calculatedCost || 0), 0);

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

  const productionKPIs = useMemo(() => {
    const totalIntake = nonDiscardedFilteredIntake.reduce((sum, e) => sum + (e.quantityKg || 0), 0);
    const discardedKg = filteredIntake
      .filter((e) => e.isDiscarded === true)
      .reduce((sum, e) => sum + (e.quantityKg || 0), 0);

    const totalOutput = filteredOutput.reduce((sum, e) => sum + (e.parsed?.totalWeight || 0), 0);

    const currentYield = totalIntake > 0 ? (totalOutput / totalIntake) * 100 : 0;
    const theoreticalOutput = totalIntake * TARGET_YIELD_FACTOR;
    const varianceKg = totalOutput - theoreticalOutput;

    const productTotals: Record<string, number> = {};
    filteredOutput.forEach((e) => {
      productTotals[e.productId] = (productTotals[e.productId] || 0) + (e.parsed?.totalWeight || 0);
    });
    const top = Object.entries(productTotals).sort((a, b) => b[1] - a[1])[0];

    return {
      totalIntake,
      totalOutput,
      discardedKg,
      discardedPct: (totalIntake + discardedKg) > 0 ? (discardedKg / (totalIntake + discardedKg)) * 100 : 0,
      currentYield,
      varianceKg,
      topProductName: top?.[0] || "N/A",
    };
  }, [nonDiscardedFilteredIntake, filteredIntake, filteredOutput]);

  const qualityKPIs = useMemo(() => {
    const totalKg = nonDiscardedFilteredIntake.reduce((sum, e) => sum + (e.quantityKg || 0), 0);
    const weightedFat = nonDiscardedFilteredIntake.reduce((sum, e) => sum + (e.fatPct * (e.quantityKg || 0)), 0);
    const weightedProt = nonDiscardedFilteredIntake.reduce((sum, e) => sum + (e.proteinPct * (e.quantityKg || 0)), 0);
    const weightedPh = nonDiscardedFilteredIntake.reduce((sum, e) => sum + (e.ph * (e.quantityKg || 0)), 0);

    const highTempCount = filteredIntake.filter((e) => (e.tempCelsius || 0) > 8).length;
    const badPhCount = filteredIntake.filter((e) => (e.ph || 0) > 6.74 || (e.ph || 0) < 6.55).length;

    return {
      avgFat: totalKg > 0 ? weightedFat / totalKg : 0,
      avgProt: totalKg > 0 ? weightedProt / totalKg : 0,
      avgPh: totalKg > 0 ? weightedPh / totalKg : 0,
      highTempCount,
      badPhCount,
    };
  }, [nonDiscardedFilteredIntake, filteredIntake]);

  // ---------- DAILY SERIES (ISO KEYS) ----------
  const dailyFinancialData = useMemo(() => {
    const map: Record<string, { date: string; revenue: number; cost: number; discarded: number; profit: number }> = {};

    nonDiscardedFilteredIntake.forEach((e) => {
      const d = toISODate(e.timestamp);
      if (!map[d]) map[d] = { date: d, revenue: 0, cost: 0, discarded: 0, profit: 0 };
      map[d].cost += e.calculatedCost || 0;
    });

    filteredIntake
      .filter((e) => e.isDiscarded === true)
      .forEach((e) => {
        const d = toISODate(e.timestamp);
        if (!map[d]) map[d] = { date: d, revenue: 0, cost: 0, discarded: 0, profit: 0 };
        map[d].discarded += e.calculatedCost || 0;
      });

    // bucket revenue by shipment date when shipments exist, otherwise by dispatch date
    filteredDispatch.forEach((e) => {
      const shipments = getShipmentsByDate(e);
      if (shipments && shipments.length > 0) {
        shipments.forEach((s) => {
          const d = toISODate(s.date);
          if (!map[d]) map[d] = { date: d, revenue: 0, cost: 0, discarded: 0, profit: 0 };
          const price = Number.isFinite(Number(e.salesPricePerKg)) ? Number(e.salesPricePerKg) : 0;
          map[d].revenue += (s.quantityKg || 0) * price;
        });
      } else {
        const d = toISODate(e.date);
        if (!map[d]) map[d] = { date: d, revenue: 0, cost: 0, discarded: 0, profit: 0 };
        map[d].revenue += getShippedRevenue(e);
      }
    });

    return Object.values(map)
      .map((row) => ({ ...row, profit: row.revenue - row.cost }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [nonDiscardedFilteredIntake, filteredIntake, filteredDispatch]);

  const dailyProductionData = useMemo(() => {
    const map: Record<string, { date: string; intake: number; discarded: number; output: number; yield: number }> = {};

    nonDiscardedFilteredIntake.forEach((e) => {
      const d = toISODate(e.timestamp);
      if (!map[d]) map[d] = { date: d, intake: 0, discarded: 0, output: 0, yield: 0 };
      map[d].intake += e.quantityKg || 0;
    });

    filteredIntake
      .filter((e) => e.isDiscarded === true)
      .forEach((e) => {
        const d = toISODate(e.timestamp);
        if (!map[d]) map[d] = { date: d, intake: 0, discarded: 0, output: 0, yield: 0 };
        map[d].discarded += e.quantityKg || 0;
      });

    filteredOutput.forEach((e) => {
      const d = toISODate(e.timestamp);
      if (!map[d]) map[d] = { date: d, intake: 0, discarded: 0, output: 0, yield: 0 };
      map[d].output += e.parsed?.totalWeight || 0;
    });

    return Object.values(map)
      .map((row) => ({
        ...row,
        yield: row.intake > 0 ? (row.output / row.intake) * 100 : 0,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [nonDiscardedFilteredIntake, filteredIntake, filteredOutput]);

  const productMixData = useMemo(() => {
    const totals: Record<string, number> = {};
    filteredOutput.forEach((e) => {
      totals[e.productId] = (totals[e.productId] || 0) + (e.parsed?.totalWeight || 0);
    });
    const list = Object.entries(totals).map(([name, value]) => ({ name, value }));
    // top N, group rest into Other
    const sorted = list.sort((a, b) => b.value - a.value);
    const TOP_N = 6;
    if (sorted.length <= TOP_N) return sorted;
    const top = sorted.slice(0, TOP_N);
    const otherSum = sorted.slice(TOP_N).reduce((s, it) => s + it.value, 0);
    top.push({ name: "Other", value: otherSum });
    return top;
  }, [filteredOutput]);

  const milkTypeMix = useMemo(() => {
    const totals: Record<string, number> = {};
    nonDiscardedFilteredIntake.forEach((e) => {
      totals[e.milkType] = (totals[e.milkType] || 0) + (e.quantityKg || 0);
    });
    return Object.entries(totals).map(([name, value]) => ({ name, value }));
  }, [nonDiscardedFilteredIntake]);

  const qualityTrendData = useMemo(() => {
    const map: Record<string, { date: string; fat: number; protein: number; ph: number; count: number }> = {};
    nonDiscardedFilteredIntake.forEach((e) => {
      const d = toISODate(e.timestamp);
      if (!map[d]) map[d] = { date: d, fat: 0, protein: 0, ph: 0, count: 0 };
      map[d].fat += e.fatPct;
      map[d].protein += e.proteinPct;
      map[d].ph += e.ph;
      map[d].count += 1;
    });

    return Object.values(map)
      .map((row) => ({
        date: row.date,
        fat: row.count > 0 ? row.fat / row.count : 0,
        protein: row.count > 0 ? row.protein / row.count : 0,
        ph: row.count > 0 ? row.ph / row.count : 0,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [nonDiscardedFilteredIntake]);

  // ---------- UI ----------
  const setQuickRange = (r: TimeRange) => {
    setTimeRange(r);
    setCustomStart("");
    setCustomEnd("");
  };

  return (
    <div className="space-y-5">
      {/* Header / Filters */}
      <GlassCard className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-slate-700">
            <Calendar className="h-4 w-4 text-slate-400" />
            <div className="text-sm font-semibold">Analytics Range:</div>
            <div className="text-sm text-slate-500">{dateLabel}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(["day", "week", "month", "quarter", "year", "all"] as TimeRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setQuickRange(r)}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all uppercase whitespace-nowrap ${
                  timeRange === r && !customStart
                    ? "bg-white text-emerald-600 shadow-sm border border-slate-200"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                }`}
              >
                {r}
              </button>
            ))}

            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="text-xs bg-transparent outline-none text-slate-600 font-medium"
              />
              <span className="text-xs text-slate-400">→</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="text-xs bg-transparent outline-none text-slate-600 font-medium"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(["financial", "production", "quality"] as const).map((view) => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all uppercase whitespace-nowrap ${
                activeView === view
                  ? "bg-white text-blue-700 shadow-sm border border-slate-200"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
              }`}
            >
              {view === "financial" && <Coins className="h-4 w-4" />}
              {view === "production" && <Factory className="h-4 w-4" />}
              {view === "quality" && <Microscope className="h-4 w-4" />}
              {view}
            </button>
          ))}
        </div>
      </GlassCard>

      {/* FINANCIAL */}
      {activeView === "financial" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <GlassCard className="p-4">
            <div className="text-xs font-bold uppercase text-slate-500">Revenue (Confirmed)</div>
            <div className="mt-2 text-2xl font-extrabold text-slate-800">{formatEur(financialKPIs.revenue)}</div>
            <div className="mt-1 text-sm text-slate-500">From {filteredDispatch.length} confirmed dispatches</div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="text-xs font-bold uppercase text-slate-500">Milk Spend (Net)</div>
            <div className="mt-2 text-2xl font-extrabold text-slate-800">{formatEur(financialKPIs.rawMaterialCost)}</div>
            <div className="mt-1 text-sm text-slate-500">Avg {financialKPIs.avgMilkPrice.toFixed(3)} €/kg</div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="text-xs font-bold uppercase text-slate-500">Gross Margin</div>
            <div className="mt-2 text-2xl font-extrabold text-slate-800">
              {financialKPIs.marginPct.toFixed(1)}% <span className="text-base font-semibold text-slate-500">({formatEur(financialKPIs.margin)})</span>
            </div>
            <div className="mt-1 text-sm text-slate-500">Avg sales {financialKPIs.avgSalesPrice.toFixed(2)} €/kg</div>
          </GlassCard>

          <GlassCard className="p-4 lg:col-span-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-slate-400" />
              <div className="text-sm font-extrabold text-slate-800">Financial Trend (Revenue vs Costs)</div>
            </div>

            {dailyFinancialData.length === 0 ? (
              <EmptyState title="No financial data in this range" hint="Try a wider date range or add entries." />
            ) : (
              <div className="mt-3 h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dailyFinancialData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" />
                    <Bar dataKey="cost" name="Milk Cost" />
                    <Line type="monotone" dataKey="profit" name="Profit" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* PRODUCTION */}
      {activeView === "production" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
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

          <GlassCard className="p-4 lg:col-span-3">
            <div className="text-sm font-extrabold text-slate-800">Daily Production Flow</div>
            {dailyProductionData.length === 0 ? (
              <EmptyState title="No production data in this range" hint="Try a wider date range or add intake/output logs." />
            ) : (
              <div className="mt-3 h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyProductionData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="intake" name="Intake" strokeWidth={2} fillOpacity={0.15} />
                    <Area type="monotone" dataKey="output" name="Output" strokeWidth={2} fillOpacity={0.15} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </GlassCard>

          <GlassCard className="p-4 lg:col-span-2">
            <div className="text-sm font-extrabold text-slate-800">Product Mix (Output)</div>
            {productMixData.length === 0 ? (
              <EmptyState title="No output data" />
            ) : (
              <div className="mt-3 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={productMixData} dataKey="value" nameKey="name" outerRadius={110} label={false}>
                      {productMixData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => `${Math.round(v).toLocaleString()} kg`} />
                    <Legend content={() => (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-2">
                        {productMixData.map((p, i) => (
                          <div key={p.name} className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                            <span className="font-medium">{p.name}</span>
                            <span className="text-slate-500 ml-1">{Math.round(p.value).toLocaleString()} kg</span>
                          </div>
                        ))}
                      </div>
                    )} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </GlassCard>

          <GlassCard className="p-4">
            <div className="text-sm font-extrabold text-slate-800">Milk Types (Intake)</div>
            {milkTypeMix.length === 0 ? (
              <EmptyState title="No intake data" />
            ) : (
              <div className="mt-3 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={milkTypeMix} dataKey="value" nameKey="name" outerRadius={110} label>
                      {milkTypeMix.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* QUALITY */}
      {activeView === "quality" && (
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
            <div className="mt-2 text-sm text-slate-600">
              Violations: <span className="font-bold">{qualityKPIs.highTempCount + qualityKPIs.badPhCount}</span> (Temp & pH)
            </div>
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
    </div>
  );
};
