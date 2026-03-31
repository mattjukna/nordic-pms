import React, { useState, useMemo, useCallback } from 'react';
import { useStore } from '../../store';
import { GlassCard } from '../ui/GlassCard';
import { SmartSelect } from '../ui/SmartSelect';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import { Search, Calendar, CheckSquare, Square, FileText, AlertCircle, Check, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import type { IntakeEntry, IntakePricingMode, IntakeUnitPriceBasis } from '../../types';

type PricingStatus = 'all' | 'unpriced' | 'priced';

const InputField = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={`w-full min-w-0 bg-white border border-slate-300 rounded-md px-3 py-2.5 md:py-2 text-base md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400 ${props.className || ''}`}
  />
);

const SelectField = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    className={`w-full bg-white border border-slate-300 rounded-md px-3 py-2.5 md:py-2 text-base md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${props.className || ''}`}
  />
);

function isUnpriced(e: IntakeEntry): boolean {
  return !e.pricingMode || e.calculatedCost === 0;
}

export const PurchaseDataTab: React.FC = () => {
  const { intakeEntries, suppliers, updateIntakeEntry } = useStore();

  // ─── Filters ──────────────────────────────────────────────────────
  const [supplierFilter, setSupplierFilter] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [statusFilter, setStatusFilter] = useState<PricingStatus>('unpriced');
  const [searchQuery, setSearchQuery] = useState('');

  // ─── Selection ────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ─── Invoice form ─────────────────────────────────────────────────
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [assignMode, setAssignMode] = useState<IntakePricingMode>('invoice_total');
  const [invoiceTotal, setInvoiceTotal] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [priceBasis, setPriceBasis] = useState<IntakeUnitPriceBasis>('received_kg');

  // ─── UI state ─────────────────────────────────────────────────────
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ ok: number; fail: number } | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean; title: string; message: string; action: () => void;
  }>({ isOpen: false, title: '', message: '', action: () => {} });

  // ─── Supplier options for filter ──────────────────────────────────
  const supplierOptions = useMemo(() => suppliers.map(s => ({
    id: s.id,
    label: s.name,
    subLabel: s.routeGroup,
    tags: [s.isEco ? 'ECO' : ''].filter(Boolean),
    data: s,
  })), [suppliers]);

  // ─── Filtered entries ─────────────────────────────────────────────
  const filteredEntries = useMemo(() => {
    let entries = [...intakeEntries]
      .filter(e => !e.isDiscarded)
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

    if (supplierFilter) {
      entries = entries.filter(e => e.supplierId === supplierFilter);
    }
    if (dateStart) {
      const start = new Date(dateStart).getTime();
      entries = entries.filter(e => (e.timestamp ?? 0) >= start);
    }
    if (dateEnd) {
      const end = new Date(dateEnd).setHours(23, 59, 59, 999);
      entries = entries.filter(e => (e.timestamp ?? 0) <= end);
    }
    if (statusFilter === 'unpriced') {
      entries = entries.filter(isUnpriced);
    } else if (statusFilter === 'priced') {
      entries = entries.filter(e => !isUnpriced(e));
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      entries = entries.filter(e =>
        e.supplierName.toLowerCase().includes(q) ||
        e.milkType.toLowerCase().includes(q) ||
        (e.invoiceNumber && e.invoiceNumber.toLowerCase().includes(q)) ||
        (e.note && e.note.toLowerCase().includes(q))
      );
    }
    return entries;
  }, [intakeEntries, supplierFilter, dateStart, dateEnd, statusFilter, searchQuery]);

  // ─── Selection helpers ────────────────────────────────────────────
  const selectedEntries = useMemo(
    () => filteredEntries.filter(e => selectedIds.has(e.id)),
    [filteredEntries, selectedIds],
  );

  const totalSelectedKg = useMemo(
    () => selectedEntries.reduce((sum, e) => sum + e.quantityKg, 0),
    [selectedEntries],
  );

  const allFilteredSelected = filteredEntries.length > 0 && filteredEntries.every(e => selectedIds.has(e.id));

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEntries.map(e => e.id)));
    }
  }, [allFilteredSelected, filteredEntries]);

  // ─── Per-entry cost preview ───────────────────────────────────────
  const costPreview = useMemo(() => {
    if (selectedEntries.length === 0) return [];
    const total = Number(invoiceTotal) || 0;
    const price = Number(unitPrice) || 0;

    return selectedEntries.map(entry => {
      let cost = 0;
      if (assignMode === 'invoice_total' && total > 0 && totalSelectedKg > 0) {
        cost = total * (entry.quantityKg / totalSelectedKg);
      } else if (assignMode === 'unit_price' && price > 0) {
        const basisQty = priceBasis === 'effective_kg'
          ? (entry.effectiveQuantityKg ?? entry.quantityKg)
          : entry.quantityKg;
        cost = price * basisQty;
      }
      return { id: entry.id, cost, pricePerKg: entry.quantityKg > 0 ? cost / entry.quantityKg : 0 };
    });
  }, [selectedEntries, assignMode, invoiceTotal, unitPrice, priceBasis, totalSelectedKg]);

  const previewTotalCost = useMemo(
    () => costPreview.reduce((s, p) => s + p.cost, 0),
    [costPreview],
  );

  // ─── Validation ───────────────────────────────────────────────────
  const canApply = useMemo(() => {
    if (selectedEntries.length === 0) return false;
    if (assignMode === 'invoice_total') {
      const v = Number(invoiceTotal);
      return Number.isFinite(v) && v > 0;
    }
    const v = Number(unitPrice);
    return Number.isFinite(v) && v >= 0;
  }, [selectedEntries, assignMode, invoiceTotal, unitPrice]);

  // ─── Apply pricing ───────────────────────────────────────────────
  const applyPricing = async () => {
    if (!canApply) return;
    setIsApplying(true);
    setApplyResult(null);
    let ok = 0;
    let fail = 0;

    for (const entry of selectedEntries) {
      try {
        if (assignMode === 'invoice_total') {
          const proportion = totalSelectedKg > 0 ? entry.quantityKg / totalSelectedKg : 1 / selectedEntries.length;
          const entryTotal = Number(invoiceTotal) * proportion;
          await updateIntakeEntry(entry.id, {
            pricingMode: 'invoice_total',
            invoiceTotalEur: entryTotal,
            invoiceNumber: invoiceNumber.trim() || null,
          } as any);
        } else {
          await updateIntakeEntry(entry.id, {
            pricingMode: 'unit_price',
            unitPricePerKg: Number(unitPrice),
            unitPriceBasis: priceBasis,
            invoiceNumber: invoiceNumber.trim() || null,
          } as any);
        }
        ok++;
      } catch {
        fail++;
      }
    }

    setIsApplying(false);
    setApplyResult({ ok, fail });
    if (ok > 0) {
      setSelectedIds(new Set());
      setInvoiceTotal('');
      setUnitPrice('');
      setInvoiceNumber('');
    }
    // Auto-clear success message
    setTimeout(() => setApplyResult(null), 5000);
  };

  const confirmApply = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Apply Invoice Pricing',
      message: `Assign pricing to ${selectedEntries.length} intake ${selectedEntries.length === 1 ? 'entry' : 'entries'} (${totalSelectedKg.toLocaleString()} kg total) for €${previewTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}?`,
      action: () => { void applyPricing(); },
    });
  };

  // ─── Date presets ─────────────────────────────────────────────────
  const setPreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setDateStart(start.toISOString().split('T')[0]);
    setDateEnd(end.toISOString().split('T')[0]);
  };

  // ─── Stats ────────────────────────────────────────────────────────
  const unpricedCount = useMemo(() => intakeEntries.filter(e => !e.isDiscarded && isUnpriced(e)).length, [intakeEntries]);

  return (
    <div className="flex flex-col gap-4 animate-slide-up min-w-0">
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.action}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Status bar */}
      {applyResult && (
        <div className={`rounded-lg border px-4 py-3 text-sm font-medium flex items-center gap-2 ${
          applyResult.fail > 0
            ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}>
          <Check size={16} />
          {applyResult.ok > 0 && <span>Pricing applied to {applyResult.ok} {applyResult.ok === 1 ? 'entry' : 'entries'}.</span>}
          {applyResult.fail > 0 && <span className="text-red-600">{applyResult.fail} failed.</span>}
        </div>
      )}

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1 rounded-full text-xs font-bold">
          <AlertCircle size={12} />
          {unpricedCount} unpriced {unpricedCount === 1 ? 'delivery' : 'deliveries'}
        </div>
        <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1 rounded-full text-xs font-medium">
          {intakeEntries.filter(e => !e.isDiscarded).length} total intake entries
        </div>
      </div>

      {/* Filters */}
      <GlassCard className="p-3 md:p-4 bg-slate-50/50">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowFilters(!showFilters)}>
          <div className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
            <Search size={14} className={showFilters ? 'text-blue-600' : 'text-slate-400'} />
            Find Deliveries
          </div>
          <button className="text-slate-400 hover:text-blue-600">
            {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-12 gap-3 mt-3 pt-3 border-t border-slate-200 animate-slide-up">
            {/* Supplier */}
            <div className="col-span-12 md:col-span-4">
              <SmartSelect
                label="Supplier"
                placeholder="All suppliers"
                options={[{ id: '', label: 'All suppliers', subLabel: '', tags: [], data: null }, ...supplierOptions]}
                value={supplierFilter}
                onChange={setSupplierFilter}
              />
            </div>

            {/* Date range */}
            <div className="col-span-6 md:col-span-2">
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">From</label>
              <InputField type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} />
            </div>
            <div className="col-span-6 md:col-span-2">
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">To</label>
              <InputField type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
            </div>

            {/* Search */}
            <div className="col-span-12 md:col-span-4">
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Search</label>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-3 text-slate-400" />
                <InputField
                  type="text"
                  placeholder="Note, invoice #..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            {/* Status filter */}
            <div className="col-span-12 flex flex-wrap gap-2">
              {([
                { id: 'unpriced', label: 'Unpriced', count: intakeEntries.filter(e => !e.isDiscarded && isUnpriced(e)).length },
                { id: 'all', label: 'All', count: intakeEntries.filter(e => !e.isDiscarded).length },
                { id: 'priced', label: 'Priced', count: intakeEntries.filter(e => !e.isDiscarded && !isUnpriced(e)).length },
              ] as const).map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setStatusFilter(opt.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-all ${
                    statusFilter === opt.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {opt.label} <span className="opacity-70">({opt.count})</span>
                </button>
              ))}
            </div>

            {/* Date presets */}
            <div className="col-span-12 flex gap-1">
              {[
                { l: 'Today', d: 0 },
                { l: 'Week', d: 7 },
                { l: '2 Weeks', d: 14 },
                { l: 'Month', d: 30 },
                { l: 'Quarter', d: 90 },
              ].map(p => (
                <button
                  key={p.l}
                  onClick={() => setPreset(p.d)}
                  className="flex-1 bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-200 text-[10px] py-1 rounded transition-colors uppercase font-semibold"
                >
                  {p.l}
                </button>
              ))}
              <button
                onClick={() => { setDateStart(''); setDateEnd(''); setSupplierFilter(''); setSearchQuery(''); setStatusFilter('unpriced'); }}
                className="flex-1 bg-white border border-slate-200 text-red-400 hover:text-red-600 hover:border-red-200 text-[10px] py-1 rounded transition-colors uppercase font-semibold"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Entry list */}
      <div className="flex flex-col gap-1">
        {/* Select-all header */}
        {filteredEntries.length > 0 && (
          <div className="flex items-center justify-between px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg">
            <button onClick={toggleSelectAll} className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-blue-600 transition-colors">
              {allFilteredSelected
                ? <CheckSquare size={16} className="text-blue-600" />
                : <Square size={16} className="text-slate-400" />
              }
              {allFilteredSelected ? 'Deselect all' : 'Select all'}
            </button>
            <div className="text-xs text-slate-500">
              {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
              {selectedEntries.length > 0 && (
                <span className="ml-2 text-blue-600 font-bold">{selectedEntries.length} selected • {totalSelectedKg.toLocaleString()} kg</span>
              )}
            </div>
          </div>
        )}

        {/* Entries */}
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {filteredEntries.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-sm italic border-2 border-dashed border-slate-200 rounded-lg">
              {statusFilter === 'unpriced'
                ? 'No unpriced intake entries found. All deliveries have pricing data.'
                : 'No intake entries match the current filters.'}
            </div>
          )}
          {filteredEntries.map(entry => {
            const selected = selectedIds.has(entry.id);
            const priced = !isUnpriced(entry);
            const preview = costPreview.find(p => p.id === entry.id);

            return (
              <div
                key={entry.id}
                onClick={() => toggleSelect(entry.id)}
                className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                  selected
                    ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-200'
                    : 'bg-white hover:bg-slate-50 border-slate-200'
                }`}
              >
                {/* Checkbox */}
                <div className="shrink-0">
                  {selected
                    ? <CheckSquare size={18} className="text-blue-600" />
                    : <Square size={18} className="text-slate-300" />
                  }
                </div>

                {/* Entry info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800 flex flex-wrap items-center gap-2">
                    <span className="truncate">{entry.supplierName}</span>
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">{entry.milkType}</span>
                    {priced ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">✓ Priced</span>
                    ) : (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">⚠ Unpriced</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-2">
                    <span>{entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : '—'}</span>
                    <span className="text-slate-300 hidden md:inline">•</span>
                    <span className="text-slate-700 font-medium">{entry.fatPct}% F</span>
                    <span className="text-slate-700 font-medium">{entry.proteinPct}% P</span>
                    {entry.invoiceNumber && (
                      <>
                        <span className="text-slate-300 hidden md:inline">•</span>
                        <span className="text-slate-500">Inv: {entry.invoiceNumber}</span>
                      </>
                    )}
                    {priced && (
                      <>
                        <span className="text-slate-300 hidden md:inline">•</span>
                        <span className="text-emerald-600 font-medium">€{entry.calculatedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Weight + preview */}
                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-sm text-blue-700">{entry.quantityKg.toLocaleString()} kg</div>
                  {selected && preview && preview.cost > 0 && (
                    <div className="text-[11px] text-blue-600 font-medium mt-0.5">
                      → €{preview.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Assignment panel */}
      {selectedEntries.length > 0 && (
        <GlassCard className="p-4 md:p-5 bg-blue-50/50 border-blue-200 animate-slide-up">
          <div className="text-xs font-bold uppercase tracking-widest text-blue-700 flex items-center gap-2 mb-3">
            <FileText size={14} />
            Assign Pricing — {selectedEntries.length} {selectedEntries.length === 1 ? 'entry' : 'entries'} • {totalSelectedKg.toLocaleString()} kg
          </div>

          <div className="grid grid-cols-12 gap-3">
            {/* Invoice number */}
            <div className="col-span-12 md:col-span-4">
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Invoice number</label>
              <InputField
                value={invoiceNumber}
                onChange={e => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-2026-0315"
              />
            </div>

            {/* Pricing mode */}
            <div className="col-span-12 md:col-span-8">
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Pricing mode</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setAssignMode('invoice_total')}
                  className={`flex-1 rounded-md px-3 py-2 text-xs font-bold uppercase transition-all ${
                    assignMode === 'invoice_total' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Invoice total (€)
                </button>
                <button
                  onClick={() => setAssignMode('unit_price')}
                  className={`flex-1 rounded-md px-3 py-2 text-xs font-bold uppercase transition-all ${
                    assignMode === 'unit_price' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Unit price (€/kg)
                </button>
              </div>
            </div>

            {/* Amount fields */}
            {assignMode === 'invoice_total' ? (
              <div className="col-span-12 md:col-span-6">
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                  Invoice total (€) — split across {selectedEntries.length} entries by kg
                </label>
                <InputField
                  type="number"
                  step="0.01"
                  value={invoiceTotal}
                  onChange={e => setInvoiceTotal(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            ) : (
              <>
                <div className="col-span-6 md:col-span-3">
                  <label className="text-xs font-semibold text-slate-600 block mb-1.5">Unit price (€/kg)</label>
                  <InputField
                    type="number"
                    step="0.0001"
                    value={unitPrice}
                    onChange={e => setUnitPrice(e.target.value)}
                    placeholder="0.0000"
                  />
                </div>
                <div className="col-span-6 md:col-span-3">
                  <label className="text-xs font-semibold text-slate-600 block mb-1.5">Pricing basis</label>
                  <SelectField value={priceBasis} onChange={e => setPriceBasis(e.target.value as IntakeUnitPriceBasis)}>
                    <option value="received_kg">Received kg</option>
                    <option value="effective_kg">Lab-adjusted kg</option>
                  </SelectField>
                </div>
              </>
            )}

            {/* Preview */}
            {canApply && costPreview.length > 0 && (
              <div className="col-span-12 rounded-lg border border-blue-200 bg-white p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Preview</div>
                <div className="space-y-1 max-h-[150px] overflow-y-auto">
                  {costPreview.map(p => {
                    const entry = selectedEntries.find(e => e.id === p.id);
                    if (!entry) return null;
                    return (
                      <div key={p.id} className="flex items-center justify-between text-xs text-slate-600">
                        <span className="truncate max-w-[200px]">
                          {entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : '—'} • {entry.supplierName} • {entry.quantityKg.toLocaleString()} kg
                        </span>
                        <span className="font-mono font-bold text-blue-700 shrink-0 ml-2">
                          €{p.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <span className="text-slate-400 font-normal ml-1">(€{p.pricePerKg.toFixed(4)}/kg)</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between text-sm font-bold">
                  <span className="text-slate-700">Total</span>
                  <span className="text-blue-700">€{previewTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            )}

            {/* Apply button */}
            <div className="col-span-12">
              <button
                onClick={confirmApply}
                disabled={!canApply || isApplying}
                className={`w-full py-3 rounded-md font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                  canApply && !isApplying
                    ? 'bg-blue-600 hover:bg-blue-700 text-white active:scale-[0.98]'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isApplying ? (
                  <><Loader2 size={18} className="animate-spin" /> Applying…</>
                ) : (
                  <><Check size={18} /> Apply Pricing to {selectedEntries.length} {selectedEntries.length === 1 ? 'Entry' : 'Entries'}</>
                )}
              </button>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
};
