
import React, { useMemo, useState } from 'react';
import { useStore } from '../../store';
import { GlassCard } from '../ui/GlassCard';
import { Scale, Truck, ChevronDown, ChevronRight, AlertCircle, Leaf, Package, Calendar, Filter, Factory, Droplets, Info, Ban } from 'lucide-react';
import { IntakeEntry, OutputEntry } from '../../types';

// Conservative average yield factor for plant (MPC85 + Permeate)
const THEORETICAL_YIELD_FACTOR = 0.17; 

type TimeRange = 'day' | 'week' | 'month' | 'quarter' | 'year';
type ViewMode = 'intake' | 'production';

export const LivePreviewTab: React.FC = () => {
  const { intakeEntries, outputEntries, suppliers, products } = useStore();
  const [viewMode, setViewMode] = useState<ViewMode>('intake');
  const [timeRange, setTimeRange] = useState<TimeRange>('month'); // Default to month for quota context
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('all');
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());
  const [showPallets, setShowPallets] = useState(false);

  // --- Helper: Date Filtering ---
  const getDateRangeStart = (range: TimeRange): number => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    switch (range) {
      case 'day': return startOfToday;
      case 'week': return startOfToday - (7 * 24 * 60 * 60 * 1000);
      case 'month': return new Date(now.getFullYear(), now.getMonth(), 1).getTime(); // Start of month
      case 'quarter': return startOfToday - (90 * 24 * 60 * 60 * 1000);
      case 'year': return new Date(now.getFullYear(), 0, 1).getTime(); // Start of year
      default: return startOfToday;
    }
  };

  const startTime = useMemo(() => getDateRangeStart(timeRange), [timeRange]);

  // --- Data Processing: Intake ---
  const intakeData = useMemo(() => {
    let entries = intakeEntries.filter(e => e.timestamp >= startTime);
    
    if (selectedSupplierId !== 'all') {
      entries = entries.filter(e => e.supplierId === selectedSupplierId);
    }

    const totalIntake = entries.reduce((sum, e) => sum + e.quantityKg, 0);
    const totalDiscarded = entries.filter(e => e.isDiscarded).reduce((sum, e) => sum + e.quantityKg, 0);
    
    // Group by Supplier for the list
    const bySupplier = suppliers.map(supplier => {
      const supplierEntries = entries.filter(e => e.supplierId === supplier.id);
      const supplierTotal = supplierEntries.reduce((sum, e) => sum + e.quantityKg, 0);
      const supplierDiscarded = supplierEntries.filter(e => e.isDiscarded).reduce((sum, e) => sum + e.quantityKg, 0);
      
      // Quota Calculation (Always based on current calendar month for context)
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const currentMonthEntries = intakeEntries.filter(e => e.supplierId === supplier.id && e.timestamp >= startOfMonth);
      const currentMonthTotal = currentMonthEntries.reduce((sum, e) => sum + e.quantityKg, 0);
      
      const monthlyQuota = supplier.contractQuota / 12; // Assuming annual quota
      const quotaProgress = (currentMonthTotal / monthlyQuota) * 100;
      
      // Quota Health Check
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const dayOfMonth = now.getDate();
      const timeProgress = (dayOfMonth / daysInMonth) * 100;
      
      // Flag if: Time is > 33% (10 days in) AND Progress is < 70% of expected time progress
      // e.g. Day 15 (50%), expected 50%. If actual is < 35%, flag it.
      const isBehind = timeProgress > 33 && quotaProgress < (timeProgress * 0.7);

      return {
        ...supplier,
        entries: supplierEntries,
        total: supplierTotal,
        discardedTotal: supplierDiscarded,
        quota: {
          monthly: monthlyQuota,
          current: currentMonthTotal,
          progress: quotaProgress,
          isBehind
        }
      };
    }).filter(s => selectedSupplierId === 'all' || s.id === selectedSupplierId);

    // Sort: If 'all', sort by total intake descending. If filtered, just show that one.
    bySupplier.sort((a, b) => b.total - a.total);

    return { totalIntake, totalDiscarded, bySupplier };
  }, [intakeEntries, suppliers, startTime, selectedSupplierId]);

  // --- Data Processing: Production ---
  const productionData = useMemo(() => {
    const entries = outputEntries.filter(e => e.timestamp >= startTime);
    const totalOutput = entries.reduce((sum, e) => sum + e.parsed.totalWeight, 0);
    const totalPallets = entries.reduce((sum, e) => sum + e.parsed.pallets, 0);
    const totalBigBags = entries.reduce((sum, e) => sum + e.parsed.bigBags, 0);
    const totalTanks = entries.reduce((sum, e) => sum + e.parsed.tanks, 0);

    // Group by Product
    const byProduct = products.map(product => {
      const productEntries = entries.filter(e => e.productId === product.id);
      const productTotal = productEntries.reduce((sum, e) => sum + e.parsed.totalWeight, 0);
      const productPallets = productEntries.reduce((sum, e) => sum + e.parsed.pallets, 0);
      const productBigBags = productEntries.reduce((sum, e) => sum + e.parsed.bigBags, 0);
      const productTanks = productEntries.reduce((sum, e) => sum + e.parsed.tanks, 0);
      return {
        ...product,
        entries: productEntries,
        total: productTotal,
        totalPallets,
        totalBigBags,
        totalTanks
      };
    }).filter(p => p.total > 0).sort((a, b) => b.total - a.total);

    return { totalOutput, totalPallets, totalBigBags, totalTanks, byProduct };
  }, [outputEntries, startTime]);


  const toggleCollapse = (id: string) => {
    const newSet = new Set(collapsedItems);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setCollapsedItems(newSet);
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      
      {/* --- Top Controls --- */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        
        {/* View Switcher */}
        <div className="flex bg-slate-100 p-1 rounded-lg shrink-0">
          <button
            onClick={() => setViewMode('intake')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-md transition-all ${
              viewMode === 'intake' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Droplets size={16} /> Intake
          </button>
          <button
            onClick={() => setViewMode('production')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-md transition-all ${
              viewMode === 'production' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Factory size={16} /> Production
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          
          {/* Unit Toggle (Production Only) */}
          {viewMode === 'production' && (
             <div className="flex bg-slate-100 p-1 rounded-lg">
                <button 
                   onClick={() => setShowPallets(false)}
                   className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${!showPallets ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                   KG
                </button>
                <button 
                   onClick={() => setShowPallets(true)}
                   className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${showPallets ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                   Pallets
                </button>
             </div>
          )}

          {/* Supplier Filter (Intake Only) */}
          {viewMode === 'intake' && (
            <div className="relative flex-1 md:flex-none md:w-48">
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold py-2 pl-3 pr-8 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="all">All Suppliers</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <Filter size={14} className="absolute right-3 top-2.5 text-slate-400 pointer-events-none" />
            </div>
          )}

          {/* Time Range */}
          <div className="flex bg-slate-100 p-1 rounded-lg overflow-x-auto">
            {(['day', 'week', 'month', 'quarter', 'year'] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all uppercase whitespace-nowrap ${
                  timeRange === range 
                    ? 'bg-white text-slate-800 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* --- INTAKE VIEW --- */}
      {viewMode === 'intake' && (
        <div className="flex flex-col gap-6 animate-slide-up">
          
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <GlassCard className="p-5 bg-blue-50/50 border-blue-100 flex items-center justify-between">
                <div>
                  <div className="text-xs text-blue-600 uppercase tracking-widest font-bold mb-1">Total Intake</div>
                  <div className="text-3xl font-mono font-bold text-slate-900">{intakeData.totalIntake.toLocaleString()} <span className="text-sm font-normal text-slate-500">kg</span></div>
                </div>
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                  <Droplets size={20} />
                </div>
             </GlassCard>
             
             <GlassCard className="p-5 bg-slate-50 border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-1">Active Suppliers</div>
                  <div className="text-3xl font-mono font-bold text-slate-900">{intakeData.bySupplier.filter(s => s.total > 0).length} <span className="text-sm font-normal text-slate-500">/ {suppliers.length}</span></div>
                </div>
                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                  <Truck size={20} />
                </div>
             </GlassCard>

             <GlassCard className="p-5 bg-red-50/50 border-red-100 flex items-center justify-between">
                <div>
                  <div className="text-xs text-red-600 uppercase tracking-widest font-bold mb-1">Discarded Milk</div>
                  <div className="text-3xl font-mono font-bold text-slate-900">{intakeData.totalDiscarded.toLocaleString()} <span className="text-sm font-normal text-slate-500">kg</span></div>
                </div>
                <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                   <Ban size={20} />
                </div>
             </GlassCard>
          </div>

          {/* Suppliers List */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2 px-1">
              <Truck size={16} /> Supplier Performance
            </h3>
            
            {intakeData.bySupplier.map(supplier => {
              const isCollapsed = collapsedItems.has(supplier.id);
              const hasData = supplier.total > 0;
              
              return (
                <div key={supplier.id} className={`bg-white rounded-xl border transition-all ${supplier.quota.isBehind ? 'border-amber-200 shadow-sm' : 'border-slate-200'}`}>
                  {/* Header Row */}
                  <div 
                    className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50 transition-colors rounded-xl"
                    onClick={() => toggleCollapse(supplier.id)}
                  >
                    {/* Supplier Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                         {isCollapsed ? <ChevronRight size={16} className="text-slate-400"/> : <ChevronDown size={16} className="text-slate-400"/>}
                         <span className="font-bold text-slate-800">{supplier.name}</span>
                         <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{supplier.routeGroup}</span>
                         {supplier.isEco && <Leaf size={14} className="text-emerald-500" />}
                      </div>
                      
                      {/* Quota Progress Bar */}
                      <div className="mt-3 max-w-md">
                        <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400 mb-1">
                          <span>Monthly Quota Progress</span>
                          <span className={supplier.quota.isBehind ? 'text-amber-600' : 'text-emerald-600'}>
                             {supplier.quota.current.toLocaleString()} / {supplier.quota.monthly.toLocaleString()} kg ({supplier.quota.progress.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${supplier.quota.isBehind ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(supplier.quota.progress, 100)}%` }}
                          />
                        </div>
                        {supplier.quota.isBehind && (
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-600 font-bold animate-pulse">
                             <AlertCircle size={10} /> Falling behind monthly target
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Total Intake */}
                    <div className="text-right shrink-0 flex flex-col items-end">
                      <div className="text-xs text-slate-500 uppercase font-bold mb-0.5">Period Intake</div>
                      <div className="text-xl font-mono font-bold text-blue-600">{supplier.total.toLocaleString()} kg</div>
                      {supplier.discardedTotal > 0 && (
                        <div className="text-[10px] font-bold text-red-600 flex items-center gap-1">
                          <Ban size={10} /> {supplier.discardedTotal.toLocaleString()} kg discarded
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expanded Entries */}
                  {!isCollapsed && hasData && (
                    <div className="border-t border-slate-100 bg-slate-50/50 p-3 md:p-4 animate-slide-up">
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {supplier.entries.sort((a,b) => b.timestamp - a.timestamp).map(entry => (
                            <div key={entry.id} className={`bg-white p-3 rounded-lg border shadow-sm flex justify-between items-center ${entry.isDiscarded ? 'border-red-200 bg-red-50/30' : 'border-slate-200'}`}>
                               <div>
                                  <div className="flex items-center gap-2">
                                     <div className="text-xs font-bold text-slate-700">{new Date(entry.timestamp).toLocaleDateString()}</div>
                                     {entry.isDiscarded && <span className="text-[8px] bg-red-600 text-white px-1 rounded font-bold uppercase">Discarded</span>}
                                  </div>
                                  <div className="text-[10px] text-slate-500 flex gap-2 mt-0.5">
                                     <span>F: {entry.fatPct}%</span>
                                     <span>P: {entry.proteinPct}%</span>
                                     <span>{entry.milkType}</span>
                                  </div>
                               </div>
                               <div className={`font-mono font-bold text-sm ${entry.isDiscarded ? 'text-red-600 line-through' : 'text-slate-800'}`}>
                                 {entry.quantityKg.toLocaleString()} kg
                               </div>
                            </div>
                          ))}
                       </div>
                    </div>
                  )}
                  {!isCollapsed && !hasData && (
                    <div className="border-t border-slate-100 bg-slate-50/50 p-4 text-center text-xs text-slate-400 italic">
                      No intake entries for this period.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- PRODUCTION VIEW --- */}
      {viewMode === 'production' && (
        <div className="flex flex-col gap-6 animate-slide-up">
           
           {/* KPIs */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <GlassCard className="p-5 bg-emerald-50/50 border-emerald-100 flex items-center justify-between">
                <div>
                  <div className="text-xs text-emerald-600 uppercase tracking-widest font-bold mb-1">Total Output</div>
                  {showPallets ? (
                    <div className="flex flex-col">
                       <div className="text-2xl font-mono font-bold text-slate-900">
                          {productionData.totalPallets} <span className="text-sm font-normal text-slate-500">pl</span>
                       </div>
                       <div className="text-sm font-mono font-bold text-slate-600">
                          {productionData.totalBigBags} <span className="text-xs font-normal text-slate-500">bb</span>
                       </div>
                       {productionData.totalTanks > 0 && (
                         <div className="text-sm font-mono font-bold text-slate-600">
                            {productionData.totalTanks} <span className="text-xs font-normal text-slate-500">tank</span>
                         </div>
                       )}
                    </div>
                  ) : (
                    <div className="text-3xl font-mono font-bold text-slate-900">{productionData.totalOutput.toLocaleString()} <span className="text-sm font-normal text-slate-500">kg</span></div>
                  )}
                </div>
                <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <Factory size={20} />
                </div>
             </GlassCard>

             {/* Mass Balance Check */}
             <GlassCard className="p-5 bg-slate-50 border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-1">Yield Efficiency</div>
                  <div className="text-3xl font-mono font-bold text-slate-900">
                    {intakeData.totalIntake > 0 
                      ? ((productionData.totalOutput / intakeData.totalIntake) * 100).toFixed(1) 
                      : '0.0'} 
                    <span className="text-sm font-normal text-slate-500">%</span>
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                  <Scale size={20} />
                </div>
             </GlassCard>
           </div>

           {/* Products List */}
           <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2 px-1">
              <Package size={16} /> Product Output
            </h3>

            {productionData.byProduct.length === 0 && (
               <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 italic">
                 No production data found for this period.
               </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {productionData.byProduct.map(product => {
                const isCollapsed = collapsedItems.has(product.id);
                return (
                  <div key={product.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div 
                      className="p-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => toggleCollapse(product.id)}
                    >
                       <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-xs">
                            {product.id}
                          </div>
                          <div>
                             <div className="font-bold text-slate-800">{product.name}</div>
                             <div className="text-xs text-slate-500">{product.entries.length} batches</div>
                          </div>
                       </div>
                       <div className="text-right">
                          {showPallets ? (
                            <div className="flex flex-col items-end">
                               <div className="text-xl font-mono font-bold text-emerald-600">{product.totalPallets} pl</div>
                               <div className="text-xs font-mono font-bold text-emerald-500">{product.totalBigBags} bb</div>
                               {product.totalTanks > 0 && <div className="text-xs font-mono font-bold text-emerald-500">{product.totalTanks} tank</div>}
                            </div>
                          ) : (
                            <div className="text-xl font-mono font-bold text-emerald-600">{product.total.toLocaleString()} kg</div>
                          )}
                       </div>
                    </div>

                    {!isCollapsed && (
                      <div className="bg-slate-50 border-t border-slate-100 p-2 max-h-60 overflow-y-auto">
                         <table className="w-full text-xs text-left">
                           <thead className="text-slate-400 font-bold uppercase">
                             <tr>
                               <th className="p-2">Date</th>
                               <th className="p-2">Batch</th>
                               <th className="p-2 text-right">Amount</th>
                             </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-200">
                             {product.entries.map(e => (
                               <tr key={e.id}>
                                 <td className="p-2 text-slate-600">{new Date(e.timestamp).toLocaleDateString()}</td>
                                 <td className="p-2 font-mono text-slate-700">{e.batchId}</td>
                                 <td className="p-2 text-right font-bold text-slate-800">
                                   {showPallets ? (
                                     <span>
                                      {e.parsed.pallets > 0 && `${e.parsed.pallets} pl `}
                                      {e.parsed.bigBags > 0 && `${e.parsed.bigBags} bb `}
                                      {e.parsed.tanks > 0 && `${e.parsed.tanks} tank`}
                                    </span>
                                   ) : (
                                     <span>{e.parsed.totalWeight.toLocaleString()} kg</span>
                                   )}
                                 </td>
                               </tr>
                             ))}
                           </tbody>
                         </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
           </div>
        </div>
      )}

    </div>
  );
};
