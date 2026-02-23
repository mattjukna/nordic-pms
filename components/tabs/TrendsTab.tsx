
import React, { useMemo, useState } from 'react';
import { useStore } from '../../store';
import { GlassCard } from '../ui/GlassCard';
import { 
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Bar, Legend, CartesianGrid, 
  ScatterChart, Scatter, Cell, ReferenceLine, PieChart, Pie, BarChart, Area, AreaChart, LineChart
} from 'recharts';
import { 
  Activity, TrendingUp, DollarSign, Calculator, Factory, Droplets, Trophy, Scale, 
  Thermometer, FlaskConical, LayoutDashboard, Coins, Microscope, Calendar, Filter, PieChart as PieIcon, Ban, AlertCircle
} from 'lucide-react';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const TARGET_YIELD = 0.125; // 12.5% Target Yield
const FAT_TARGET = 4.0;
const PROT_TARGET = 3.2;

type TimeRange = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all';

export const TrendsTab: React.FC = () => {
  const { intakeEntries, outputEntries, dispatchEntries, globalConfig } = useStore();
  const [activeView, setActiveView] = useState<'financial' | 'production' | 'quality'>('financial');
  
  // --- Date Filtering State ---
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // --- Filter Logic ---
  const { filteredIntake, filteredOutput, filteredDispatch, dateLabel, rangeFrom, rangeTo } = useMemo(() => {
    const now = new Date();
    let startTs = 0;
    let endTs = now.setHours(23, 59, 59, 999);
    let label = '';

    // If custom dates are set, they take precedence
    if (customStart) {
       startTs = new Date(customStart).getTime();
       if (customEnd) endTs = new Date(customEnd).setHours(23, 59, 59, 999);
       label = `${new Date(startTs).toLocaleDateString()} - ${new Date(endTs).toLocaleDateString()}`;
    } else {
       // Quick Ranges
       const today = new Date(); 
       today.setHours(0,0,0,0);
       
       switch (timeRange) {
         case 'day':
           startTs = today.getTime();
           label = 'Today';
           break;
         case 'week':
           startTs = new Date(today.setDate(today.getDate() - 7)).getTime();
           label = 'Last 7 Days';
           break;
         case 'month':
           startTs = new Date(today.setDate(today.getDate() - 30)).getTime();
           label = 'Last 30 Days';
           break;
         case 'quarter':
           startTs = new Date(today.setDate(today.getDate() - 90)).getTime();
           label = 'Last 90 Days';
           break;
         case 'year':
           startTs = new Date(today.setDate(today.getDate() - 365)).getTime();
           label = 'Last Year';
           break;
         case 'all':
           startTs = 0;
           label = 'All Time History';
           break;
       }
    }

    return {
      filteredIntake: intakeEntries.filter(e => e.timestamp >= startTs && e.timestamp <= endTs),
      filteredOutput: outputEntries.filter(e => e.timestamp >= startTs && e.timestamp <= endTs),
      // Filter dispatch: within range AND confirmed
      filteredDispatch: dispatchEntries.filter(e => e.date >= startTs && e.date <= endTs && e.status === 'confirmed'),
      dateLabel: label,
      rangeFrom: startTs,
      rangeTo: endTs
    };
  }, [timeRange, customStart, customEnd, intakeEntries, outputEntries, dispatchEntries]);

  // Pull analytics actions/state
  const analytics = useStore(s => s.analytics);
  const fetchMilkSpendRange = useStore(s => s.fetchMilkSpendRange);

  // Fetch milk spend for the selected range whenever it changes (only when viewing financial)
  React.useEffect(() => {
    if (!rangeFrom || !rangeTo) return;
    const fromIso = new Date(rangeFrom).toISOString();
    const toIso = new Date(rangeTo).toISOString();
    fetchMilkSpendRange(fromIso, toIso).catch(err => console.error('fetchMilkSpendRange failed', err));
  }, [rangeFrom, rangeTo, fetchMilkSpendRange]);

  // Non-discarded intake for statistics (discarded entries are excluded from totals)
  const nonDiscardedFilteredIntake = useMemo(() => filteredIntake.filter(e => !e.isDiscarded), [filteredIntake]);

  // Simulator State
  const [simulatedPrice, setSimulatedPrice] = useState('0.35');
  const [breakEvenResult, setBreakEvenResult] = useState<number | null>(null);

  const formatKg = (val: number) => {
    return val >= 1000 ? `${(val/1000).toFixed(1)}t` : `${val.toLocaleString()} kg`;
  };

  // --- 1. DATA PREPARATION (Based on Filtered Data) ---

  // A. Financial Data

  const financialKPIs = useMemo(() => {
    // Prefer server-aggregated milk spend when available
    const totalMilkCost = analytics?.milkSpend?.totalCost ?? nonDiscardedFilteredIntake.reduce((sum, e) => sum + (e.calculatedCost || 0), 0);
    const discardedIntake = filteredIntake.filter(e => e.isDiscarded);
    const totalDiscardedCost = discardedIntake.reduce((sum, e) => sum + (e.calculatedCost || 0), 0);
    const totalRevenue = filteredDispatch.reduce((sum, e) => sum + (e.totalRevenue || 0), 0);
    const totalIntakeKg = nonDiscardedFilteredIntake.reduce((sum, e) => sum + e.quantityKg, 0);
    
    // Processing cost estimate
    const totalProcessingCost = (totalIntakeKg / 1000) * globalConfig.processingCostPerTon;
    
    const grossMargin = totalRevenue - (totalMilkCost + totalProcessingCost);
    const marginPct = totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0;

    return {
      revenue: totalRevenue,
      cogs: totalMilkCost + totalProcessingCost,
      rawMaterialCost: totalMilkCost,
      discardedLoss: totalDiscardedCost,
      processingCost: totalProcessingCost,
      margin: grossMargin,
      marginPct,
      avgMilkPrice: totalIntakeKg > 0 ? totalMilkCost / totalIntakeKg : 0,
      avgSalesPrice: filteredDispatch.length > 0 ? totalRevenue / filteredDispatch.reduce((s, e) => s + e.quantityKg, 0) : 0
    };
  }, [filteredIntake, filteredDispatch, globalConfig]);

  // Trigger fetch when range changes
  React.useEffect(() => {
    // derive from/to from filter logic in this component
    const now = new Date();
    let startTs = 0;
    let endTs = now.setHours(23, 59, 59, 999);
    if (customStart) {
       startTs = new Date(customStart).getTime();
       if (customEnd) endTs = new Date(customEnd).setHours(23, 59, 59, 999);
    } else {
       const today = new Date();
       today.setHours(0,0,0,0);
       switch (timeRange) {
         case 'day': startTs = today.getTime(); break;
         case 'week': startTs = new Date(today.setDate(today.getDate() - 7)).getTime(); break;
         case 'month': startTs = new Date(today.setDate(today.getDate() - 30)).getTime(); break;
         case 'quarter': startTs = new Date(today.setDate(today.getDate() - 90)).getTime(); break;
         case 'year': startTs = new Date(today.setDate(today.getDate() - 365)).getTime(); break;
         case 'all': startTs = 0; break;
       }
    }
    const fromIso = new Date(startTs).toISOString();
    const toIso = new Date(endTs).toISOString();
    fetchMilkSpendRange(fromIso, toIso);
  }, [timeRange, customStart, customEnd, fetchMilkSpendRange]);

  // Daily Financial Trend
  const dailyFinancialData = useMemo(() => {
    const dailyMap: Record<string, { date: string, revenue: number, cost: number, discarded: number }> = {};
    
    filteredIntake.forEach(e => {
        const d = new Date(e.timestamp).toLocaleDateString();
        if (!dailyMap[d]) dailyMap[d] = { date: d, revenue: 0, cost: 0, discarded: 0 };
        if (e.isDiscarded) {
          dailyMap[d].discarded += (e.calculatedCost || 0);
        } else {
          dailyMap[d].cost += (e.calculatedCost || 0);
        }
    });

    filteredDispatch.forEach(e => {
        const d = new Date(e.date).toLocaleDateString();
        if (!dailyMap[d]) dailyMap[d] = { date: d, revenue: 0, cost: 0, discarded: 0 };
        dailyMap[d].revenue += (e.totalRevenue || 0);
    });

    return Object.values(dailyMap)
        .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map(d => ({...d, profit: d.revenue - d.cost}));
  }, [filteredIntake, filteredDispatch]);

  // Use client-side daily milk spend series (from non-discarded entries) for plotting
  const dailyMilkSpendSeries = useMemo(() => {
    const dailyMap: Record<string, number> = {};
    nonDiscardedFilteredIntake.forEach(e => {
      const d = new Date(e.timestamp).toLocaleDateString();
      dailyMap[d] = (dailyMap[d] || 0) + (e.calculatedCost || 0);
    });
    return Object.entries(dailyMap).map(([date, cost]) => ({ date, milkCost: cost })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [nonDiscardedFilteredIntake]);

  // B. Production Data
  const productionKPIs = useMemo(() => {
    const totalIntakeAll = filteredIntake.reduce((sum, e) => sum + e.quantityKg, 0);
    const totalIntake = nonDiscardedFilteredIntake.reduce((sum, e) => sum + e.quantityKg, 0);
    const discardedKg = filteredIntake.filter(e => e.isDiscarded).reduce((sum, e) => sum + e.quantityKg, 0);
    const totalOutput = filteredOutput.reduce((sum, e) => sum + e.parsed.totalWeight, 0);
    const currentYield = totalIntake > 0 ? (totalOutput / totalIntake) * 100 : 0;
    const globalYield = totalIntake > 0 ? (totalOutput / totalIntake) * 100 : 0;
    const theoreticalOutput = totalIntake * TARGET_YIELD;
    const varianceKg = totalOutput - theoreticalOutput;

    // Top Product
    const productTotals: Record<string, number> = {};
    filteredOutput.forEach(e => {
      productTotals[e.productId] = (productTotals[e.productId] || 0) + e.parsed.totalWeight;
    });
    const topProduct = Object.entries(productTotals).sort((a, b) => b[1] - a[1])[0];

    return { 
      totalIntake, 
      totalOutput, 
      discardedKg,
      discardedPct: totalIntake > 0 ? (discardedKg / totalIntake) * 100 : 0,
      currentYield, 
      globalYield,
      varianceKg, 
      topProductName: topProduct?.[0] || 'N/A' 
    };
  }, [filteredIntake, filteredOutput]);

  const dailyProductionData = useMemo(() => {
    const dailyMap: Record<string, { date: string, output: number, intake: number, discarded: number }> = {};
    filteredIntake.forEach(e => {
      const d = new Date(e.timestamp).toLocaleDateString();
      if (!dailyMap[d]) dailyMap[d] = { date: d, output: 0, intake: 0, discarded: 0 };
      if (e.isDiscarded) dailyMap[d].discarded += e.quantityKg;
      else dailyMap[d].intake += e.quantityKg;
    });
    filteredOutput.forEach(e => {
      const d = new Date(e.timestamp).toLocaleDateString();
      if (!dailyMap[d]) dailyMap[d] = { date: d, output: 0, intake: 0, discarded: 0 };
      dailyMap[d].output += e.parsed.totalWeight;
    });
    return Object.values(dailyMap).map(day => ({
      date: day.date,
      output: day.output,
      intake: day.intake,
      discarded: day.discarded,
      yield: (day.intake - day.discarded) > 0 ? (day.output/(day.intake - day.discarded))*100 : 0
    })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filteredIntake, filteredOutput]);

    // Product Mix (for Pie)
    const productMixData = useMemo(() => {
      const totals: Record<string, number> = {};
      filteredOutput.forEach(e => {
        totals[e.productId] = (totals[e.productId] || 0) + (e.parsed?.totalWeight || 0);
      });
      return Object.entries(totals).map(([name, value]) => ({ name, value }));
    }, [filteredOutput]);

    // Milk Type Mix (for Pie)
    const milkTypeMix = useMemo(() => {
      const totals: Record<string, number> = {};
      nonDiscardedFilteredIntake.forEach(e => {
        totals[e.milkType] = (totals[e.milkType] || 0) + (e.quantityKg || 0);
      });
      return Object.entries(totals).map(([name, value]) => ({ name, value }));
    }, [filteredIntake]);

  // C. Quality Data
  const qualityKPIs = useMemo(() => {
    const totalIntake = nonDiscardedFilteredIntake.reduce((sum, e) => sum + e.quantityKg, 0);
    const weightedFat = nonDiscardedFilteredIntake.reduce((sum, e) => sum + (e.fatPct * e.quantityKg), 0);
    const weightedProt = nonDiscardedFilteredIntake.reduce((sum, e) => sum + (e.proteinPct * e.quantityKg), 0);
    const weightedPh = nonDiscardedFilteredIntake.reduce((sum, e) => sum + (e.ph * e.quantityKg), 0);
    const highTempCount = filteredIntake.filter(e => e.tempCelsius > 8).length;
    const badPhCount = filteredIntake.filter(e => e.ph > 6.74 || e.ph < 6.55).length;

    return {
      avgFat: totalIntake ? weightedFat / totalIntake : 0,
      avgProt: totalIntake ? weightedProt / totalIntake : 0,
      avgPh: totalIntake ? weightedPh / totalIntake : 0,
      highTempCount,
      badPhCount
    };
  }, [filteredIntake]);

  const supplierQualityData = useMemo(() => {
    const map: Record<string, { count: number, fat: number, protein: number, cost: number, kg: number, discardedKg: number }> = {};
    filteredIntake.forEach(e => {
      if (!map[e.supplierName]) map[e.supplierName] = { count: 0, fat: 0, protein: 0, cost: 0, kg: 0, discardedKg: 0 };
      if (e.isDiscarded) {
        map[e.supplierName].discardedKg += e.quantityKg;
      } else {
        map[e.supplierName].count++;
        map[e.supplierName].fat += e.fatPct;
        map[e.supplierName].protein += e.proteinPct;
        map[e.supplierName].cost += e.calculatedCost;
        map[e.supplierName].kg += e.quantityKg;
      }
    });

    return Object.entries(map)
      .map(([name, data]) => ({
         name: name.replace(/UAB|AB|ŽŪB|"/g, '').trim().substring(0, 15), 
         avgFat: parseFloat((data.fat / data.count).toFixed(2)),
         avgProtein: parseFloat((data.protein / data.count).toFixed(2)),
         avgCost: parseFloat((data.cost / data.kg).toFixed(3)),
         discardRate: parseFloat(((data.discardedKg / data.kg) * 100).toFixed(1)),
         totalKg: data.kg
      }))
      .sort((a, b) => b.avgProtein - a.avgProtein)
      .slice(0, 10);
  }, [filteredIntake]);

  const qualityTrendData = useMemo(() => {
    const dailyMap: Record<string, { date: string, fat: number, protein: number, ph: number, count: number }> = {};
    filteredIntake.forEach(e => {
      const d = new Date(e.timestamp).toLocaleDateString();
      if (!dailyMap[d]) dailyMap[d] = { date: d, fat: 0, protein: 0, ph: 0, count: 0 };
      dailyMap[d].fat += e.fatPct;
      dailyMap[d].protein += e.proteinPct;
      dailyMap[d].ph += e.ph;
      dailyMap[d].count++;
    });
    return Object.values(dailyMap).map(day => ({
      date: day.date,
      fat: day.fat / day.count,
      protein: day.protein / day.count,
      ph: day.ph / day.count
    })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filteredIntake]);


  // --- Simulator Logic ---
  const calculateBreakEven = () => {
    const milkPrice = parseFloat(simulatedPrice);
    if (isNaN(milkPrice)) return;
    const yieldFactor = 7; // Approx for MPC85
    const procCostPerKgMilk = globalConfig.processingCostPerTon / 1000;
    const costOfGoods = (milkPrice * yieldFactor) + (procCostPerKgMilk * yieldFactor);
    setBreakEvenResult(parseFloat(costOfGoods.toFixed(2)));
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      
      {/* --- FILTER & HEADER SECTION --- */}
      <GlassCard className="p-3 shrink-0 flex flex-col gap-3 bg-white/80 border-slate-200">
         <div className="flex flex-col md:flex-row justify-between items-center gap-4">
             {/* View Toggle */}
             <div className="flex bg-slate-100 p-1 rounded-lg w-full md:w-auto overflow-x-auto">
                {(['financial', 'production', 'quality'] as const).map(view => (
                    <button 
                    key={view}
                    onClick={() => setActiveView(view)}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-bold transition-all uppercase whitespace-nowrap ${activeView === view ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        {view === 'financial' && <Coins size={14} />}
                        {view === 'production' && <Factory size={14} />}
                        {view === 'quality' && <Microscope size={14} />}
                        {view}
                    </button>
                ))}
             </div>

             {/* Date Ranges */}
             <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
                 <div className="flex bg-slate-100 p-1 rounded-lg w-full md:w-auto overflow-x-auto">
                     {(['day', 'week', 'month', 'quarter', 'year', 'all'] as TimeRange[]).map(r => (
                         <button
                           key={r}
                           onClick={() => { setTimeRange(r); setCustomStart(''); setCustomEnd(''); }}
                           className={`px-3 py-1 text-xs font-bold rounded-md transition-all uppercase whitespace-nowrap ${timeRange === r && !customStart ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                         >
                            {r}
                         </button>
                     ))}
                 </div>
                 
                 <div className="hidden md:block w-px h-6 bg-slate-200"></div>

                 <div className="flex items-center gap-2 w-full md:w-auto bg-white border border-slate-200 rounded-md px-2 py-1">
                    <Calendar size={14} className="text-slate-400"/>
                    <input 
                       type="date" 
                       value={customStart} 
                       onChange={e => setCustomStart(e.target.value)} 
                       className="text-xs bg-transparent outline-none w-24 text-slate-600 font-medium"
                    />
                    <span className="text-slate-300">-</span>
                    <input 
                       type="date" 
                       value={customEnd} 
                       onChange={e => setCustomEnd(e.target.value)} 
                       className="text-xs bg-transparent outline-none w-24 text-slate-600 font-medium"
                    />
                 </div>
             </div>
         </div>
         <div className="text-[10px] text-slate-400 font-medium text-center md:text-right uppercase tracking-wider">
            Analytics Range: <span className="text-blue-600 font-bold">{dateLabel}</span>
         </div>
      </GlassCard>

      {/* --- FINANCIAL VIEW --- */}
      {activeView === 'financial' && (
        <div className="flex flex-col gap-4">
           {/* Financial KPIs */}
           <div className="grid grid-cols-1 md:grid-cols-6 gap-4 shrink-0">
              <GlassCard className="p-4 flex flex-col justify-between border-emerald-200 bg-emerald-50/30">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Revenue (Confirmed)</span>
                  <div className="p-1.5 bg-emerald-100 text-emerald-600 rounded-lg"><DollarSign size={16}/></div>
                </div>
                <div className="mt-2 text-2xl font-mono font-bold text-slate-800">€{financialKPIs.revenue.toLocaleString()}</div>
                <div className="text-[10px] text-slate-400 mt-1">From {filteredDispatch.length} confirmed dispatches</div>
              </GlassCard>

              <GlassCard className="p-4 flex flex-col justify-between border-red-200 bg-red-50/30">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Discarded Loss</span>
                  <div className="p-1.5 bg-red-100 text-red-600 rounded-lg"><Ban size={16}/></div>
                </div>
                <div className="mt-2 text-2xl font-mono font-bold text-red-700">€{financialKPIs.discardedLoss.toLocaleString()}</div>
                <div className="text-[10px] text-slate-400 mt-1">Sunk cost from bad milk</div>
              </GlassCard>

              <GlassCard className="p-4 flex flex-col justify-between border-slate-200 bg-white">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Milk Spend</span>
                  <DollarSign size={16} className="text-slate-400"/>
                </div>
                <div className="mt-2 text-2xl font-mono font-bold text-slate-800">€{(analytics.milkSpend?.totalCost ?? 0).toLocaleString()}</div>
                <div className="text-[10px] text-slate-400 mt-1">Selected range</div>
              </GlassCard>

              <GlassCard className="p-4 flex flex-col justify-between border-slate-200 bg-white">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Avg Milk Price</span>
                  <Coins size={16} className="text-slate-400"/>
                </div>
                <div className="mt-2 text-2xl font-mono font-bold text-slate-800">€{(analytics.milkSpend?.avgPricePerKg ?? 0).toFixed(3)}<span className="text-sm text-slate-400">/kg</span></div>
                <div className="text-[10px] text-slate-400 mt-1">Excludes discarded</div>
              </GlassCard>

              <GlassCard className={`p-4 flex flex-col justify-between ${financialKPIs.marginPct < 15 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Gross Margin</span>
                  <Activity size={16} className="text-slate-400"/>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <div className="text-3xl font-mono font-bold text-slate-800">{financialKPIs.marginPct.toFixed(1)}%</div>
                  <span className="text-xs text-slate-500">(€{financialKPIs.margin.toLocaleString()})</span>
                </div>
                  <div className="w-full h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
                     <div className={`h-full rounded-full ${financialKPIs.marginPct < 15 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(financialKPIs.marginPct * 3, 100)}%` }}></div>
                  </div>
              </GlassCard>

              <GlassCard className="p-4 flex flex-col justify-between border-blue-200 bg-blue-50/20">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Avg Sales Price</span>
                  <TrendingUp size={16} className="text-blue-400"/>
                </div>
                <div className="mt-2 text-2xl font-mono font-bold text-blue-700">€{financialKPIs.avgSalesPrice.toFixed(2)}<span className="text-sm text-blue-400">/kg</span></div>
              </GlassCard>
           </div>

           {/* Charts Row */}
           <div className="flex flex-col md:flex-row gap-4 h-[400px] shrink-0">
               <GlassCard className="flex-[2] p-4 flex flex-col">
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">Financial Trend (Revenue vs Costs)</h3>
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dailyFinancialData}>
                          <defs>
                            <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorDiscarded" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#000000" stopOpacity={0.8}/>
                              <stop offset="95%" stopColor="#000000" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="date" fontSize={10} stroke="#64748b" tickLine={false} axisLine={false} dy={5} />
                          <YAxis fontSize={10} stroke="#64748b" tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ borderRadius: '8px' }} />
                          <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" fillOpacity={1} fill="url(#colorRev)" />
                          <Area type="monotone" dataKey="cost" name="Total Cost" stroke="#ef4444" fillOpacity={1} fill="url(#colorCost)" />
                          <Area type="monotone" dataKey="discarded" name="Discarded Loss" stroke="#000000" fillOpacity={1} fill="url(#colorDiscarded)" />
                              {/* Milk Spend is represented by 'cost' series (non-discarded intake calculatedCost) */}
                          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
               </GlassCard>

               <GlassCard className="flex-1 p-6 flex flex-col bg-slate-900 text-white border-slate-800">
                   <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide mb-1 flex items-center gap-2">
                      <Calculator size={16} /> Batch Simulator
                   </h3>
                   <p className="text-[10px] text-slate-400 mb-6">Break-even calc for MPC85</p>
                   <div className="space-y-4">
                     <div>
                        <label className="text-xs font-bold text-slate-400 uppercase">Milk Price (€/kg)</label>
                        <input 
                          type="number" value={simulatedPrice} onChange={(e) => setSimulatedPrice(e.target.value)} step="0.01"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-xl font-mono text-white mt-2 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                     </div>
                     <button onClick={calculateBreakEven} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-all">Calculate</button>
                     {breakEvenResult !== null && (
                       <div className="mt-4 pt-4 border-t border-slate-700 text-center animate-slide-up">
                          <div className="text-xs text-slate-400 uppercase">Min Sales Price</div>
                          <div className="text-3xl font-bold text-emerald-400 font-mono mt-1">€{breakEvenResult}</div>
                       </div>
                     )}
                   </div>
               </GlassCard>
           </div>
           
           {/* Supplier Matrix */}
           <GlassCard className="h-[300px] p-4 flex flex-col shrink-0">
               <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">Supplier Value Matrix (Cost vs Protein)</h3>
               <div className="flex-1 min-h-0">
                 <ResponsiveContainer width="100%" height="100%">
                   <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                     <CartesianGrid strokeDasharray="3 3" />
                     <XAxis type="number" dataKey="avgCost" name="Cost" unit="€" domain={['auto', 'auto']} fontSize={10} stroke="#94a3b8" />
                     <YAxis type="number" dataKey="avgProtein" name="Protein" unit="%" domain={['auto', 'auto']} fontSize={10} stroke="#94a3b8" />
                     <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-2 border border-slate-200 rounded shadow text-xs">
                              <p className="font-bold">{data.name}</p>
                              <p>Cost: €{data.avgCost}</p>
                              <p>Prot: {data.avgProtein}%</p>
                              <p>Vol: {data.totalKg.toLocaleString()}kg</p>
                              <p>Discard Rate: {data.discardRate}%</p>
                            </div>
                          );
                        }
                        return null;
                     }} />
                     <Scatter name="Suppliers" data={supplierQualityData} fill="#3b82f6">
                        {supplierQualityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.discardRate > 5 ? '#ef4444' : entry.avgProtein > PROT_TARGET ? '#10b981' : '#3b82f6'} />
                        ))}
                     </Scatter>
                   </ScatterChart>
                 </ResponsiveContainer>
               </div>
           </GlassCard>
        </div>
      )}

      {/* --- PRODUCTION VIEW --- */}
      {activeView === 'production' && (
        <div className="flex flex-col gap-4">
           {/* Production KPIs */}
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
              <GlassCard className="p-4 border-blue-200 bg-blue-50/30">
                 <div className="text-xs font-bold text-slate-500 uppercase">Intake (Input)</div>
                 <div className="text-xl font-mono font-bold text-slate-800 mt-1">{formatKg(productionKPIs.totalIntake)}</div>
              </GlassCard>
              <GlassCard className="p-4 border-emerald-200 bg-emerald-50/30">
                 <div className="text-xs font-bold text-slate-500 uppercase">Output (Product)</div>
                 <div className="text-xl font-mono font-bold text-slate-800 mt-1">{formatKg(productionKPIs.totalOutput)}</div>
              </GlassCard>
              <GlassCard className="p-4 border-red-200 bg-red-50/30">
                 <div className="text-xs font-bold text-slate-500 uppercase">Discarded</div>
                 <div className="text-xl font-mono font-bold text-red-700 mt-1">
                    {formatKg(productionKPIs.discardedKg)} <span className="text-xs font-normal">({productionKPIs.discardedPct.toFixed(1)}%)</span>
                 </div>
              </GlassCard>
              <GlassCard className="p-4 border-slate-200">
                 <div className="text-xs font-bold text-slate-500 uppercase">Yield (Net)</div>
                 <div className={`text-xl font-mono font-bold mt-1 ${productionKPIs.currentYield < 12 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {productionKPIs.currentYield.toFixed(2)}%
                 </div>
              </GlassCard>
           </div>

           <GlassCard className="h-[350px] p-4 flex flex-col shrink-0">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                 <Activity size={16} /> Daily Production Flow
              </h3>
              <div className="flex-1 min-h-0">
                 <ResponsiveContainer width="100%" height="100%">
                   <ComposedChart data={dailyProductionData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="date" fontSize={10} stroke="#64748b" tickLine={false} axisLine={false} dy={5} />
                      <YAxis yAxisId="left" fontSize={10} stroke="#64748b" tickLine={false} axisLine={false} />
                      <YAxis yAxisId="right" orientation="right" fontSize={10} stroke="#ef4444" tickLine={false} axisLine={false} unit="%" domain={[0, 20]} />
                      <Tooltip contentStyle={{ borderRadius: '8px' }} />
                      <Bar yAxisId="left" dataKey="intake" name="Intake (kg)" fill="#94a3b8" barSize={20} radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="left" dataKey="output" name="Output (kg)" fill="#3b82f6" barSize={20} radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="left" dataKey="discarded" name="Discarded (kg)" fill="#ef4444" barSize={20} radius={[4, 4, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="yield" name="Yield %" stroke="#ef4444" strokeWidth={2} dot={{r: 3}} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                   </ComposedChart>
                 </ResponsiveContainer>
              </div>
           </GlassCard>

           <div className="flex flex-col md:flex-row gap-4 h-[300px] shrink-0">
               <GlassCard className="flex-1 p-4 flex flex-col">
                   <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">Product Mix (Output)</h3>
                   <div className="flex-1 min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={productMixData}
                            cx="50%" cy="50%"
                            innerRadius={60} outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {productMixData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                   </div>
               </GlassCard>

               <GlassCard className="flex-1 p-4 flex flex-col">
                   <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
                      <PieIcon size={14}/> Raw Milk Types (Intake)
                   </h3>
                   <div className="flex-1 min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={milkTypeMix}
                            cx="50%" cy="50%"
                            innerRadius={0} outerRadius={80}
                            dataKey="value"
                          >
                            {milkTypeMix.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                   </div>
               </GlassCard>
           </div>
        </div>
      )}

      {/* --- QUALITY VIEW --- */}
      {activeView === 'quality' && (
        <div className="flex flex-col gap-4">
           {/* Quality KPIs */}
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
              <GlassCard className="p-4 border-slate-200">
                 <div className="flex justify-between items-start">
                    <div className="text-xs font-bold text-slate-500 uppercase">Avg Fat</div>
                    <Droplets size={16} className="text-blue-400" />
                 </div>
                 <div className="text-2xl font-mono font-bold text-slate-800 mt-2">{qualityKPIs.avgFat.toFixed(2)}%</div>
                 <div className="text-[10px] text-slate-400">Target: {FAT_TARGET}%</div>
              </GlassCard>
              <GlassCard className="p-4 border-slate-200">
                 <div className="flex justify-between items-start">
                    <div className="text-xs font-bold text-slate-500 uppercase">Avg Protein</div>
                    <FlaskConical size={16} className="text-emerald-400" />
                 </div>
                 <div className="text-2xl font-mono font-bold text-slate-800 mt-2">{qualityKPIs.avgProt.toFixed(2)}%</div>
                 <div className="text-[10px] text-slate-400">Target: {PROT_TARGET}%</div>
              </GlassCard>
              <GlassCard className="p-4 border-slate-200">
                 <div className="flex justify-between items-start">
                    <div className="text-xs font-bold text-slate-500 uppercase">Avg pH</div>
                    <Microscope size={16} className="text-purple-400" />
                 </div>
                 <div className="text-2xl font-mono font-bold text-slate-800 mt-2">{qualityKPIs.avgPh.toFixed(2)}</div>
                 <div className="text-[10px] text-slate-400">Std: 6.60 - 6.70</div>
              </GlassCard>
              <GlassCard className={`p-4 ${qualityKPIs.highTempCount > 0 || qualityKPIs.badPhCount > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                 <div className="flex justify-between items-start">
                    <div className="text-xs font-bold text-slate-500 uppercase">Quality Alerts</div>
                    <AlertCircle size={16} className={qualityKPIs.highTempCount > 0 || qualityKPIs.badPhCount > 0 ? 'text-red-500' : 'text-slate-400'} />
                 </div>
                 <div className="text-2xl font-mono font-bold text-slate-800 mt-2">{qualityKPIs.highTempCount + qualityKPIs.badPhCount}</div>
                 <div className="text-[10px] text-slate-400">Temp & pH violations</div>
              </GlassCard>
           </div>

           <GlassCard className="h-[350px] p-4 flex flex-col shrink-0">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">Quality Trends (Fat, Protein, pH)</h3>
              <div className="flex-1 min-h-0">
                 <ResponsiveContainer width="100%" height="100%">
                   <LineChart data={qualityTrendData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="date" fontSize={10} stroke="#64748b" tickLine={false} axisLine={false} dy={5} />
                      <YAxis yAxisId="left" fontSize={10} stroke="#64748b" tickLine={false} axisLine={false} domain={[0, 6]} />
                      <YAxis yAxisId="right" orientation="right" fontSize={10} stroke="#8b5cf6" tickLine={false} axisLine={false} domain={[6.4, 6.9]} />
                      <Tooltip contentStyle={{ borderRadius: '8px' }} />
                      <Line yAxisId="left" type="monotone" dataKey="fat" name="Fat %" stroke="#3b82f6" strokeWidth={2} dot={{r: 3}} />
                      <Line yAxisId="left" type="monotone" dataKey="protein" name="Protein %" stroke="#10b981" strokeWidth={2} dot={{r: 3}} />
                      <Line yAxisId="right" type="monotone" dataKey="ph" name="pH" stroke="#8b5cf6" strokeWidth={2} dot={{r: 3}} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                   </LineChart>
                 </ResponsiveContainer>
              </div>
           </GlassCard>

           <GlassCard className="h-[400px] p-4 flex flex-col shrink-0">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">Supplier Quality Ranking (Fat & Protein)</h3>
              <div className="flex-1 min-h-0">
                 <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={supplierQualityData} layout="vertical" margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
                     <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                     <XAxis type="number" domain={[0, 6]} hide />
                     <YAxis dataKey="name" type="category" width={100} stroke="#64748b" fontSize={10} tick={{fontWeight: 600}} axisLine={false} tickLine={false} />
                     <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px'}} />
                     <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', top: -10 }} />
                     
                     <Bar dataKey="avgFat" name="Fat %" stackId="a" fill="#3b82f6" barSize={15} radius={[0, 4, 4, 0]} />
                     <Bar dataKey="avgProtein" name="Protein %" stackId="a" fill="#10b981" barSize={15} radius={[0, 4, 4, 0]} />
                     
                     <ReferenceLine x={FAT_TARGET} stroke="#f59e0b" strokeDasharray="3 3" label={{ position: 'top', value: 'Fat Std', fontSize: 9, fill: '#f59e0b' }} />
                   </BarChart>
                 </ResponsiveContainer>
              </div>
           </GlassCard>
        </div>
      )}

    </div>
  );
};
