
import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '../../store';
import { GlassCard } from '../ui/GlassCard';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import { PackagingWizard } from '../ui/PackagingWizard';
import ReportExportModal from '../ui/ReportExportModal';
import { SmartSelect } from '../ui/SmartSelect';
import { Plus, Trash2, Tag, Pencil, Check, X, Hash, Filter, Search, Calendar, ChevronDown, ChevronUp, Leaf, Calculator, Droplets, Factory, Ban } from 'lucide-react';
import { parsePackagingString } from '../../utils/parser';
import { anyFractional } from '../../utils/wholeUnits';
import { buildIntakeTags } from '../../utils/intakeRules';
import { getEffectiveIntakeQuantityKg, isRawMilkType, resolveEffectiveQuantityKg } from '../../utils/intakeCoefficient';
import { resolveIntakeCost } from '../../utils/intakePricing';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning';
import { clearDraft, loadDraft, saveDraft } from '../../utils/sessionDraft';
import { validateIntakeForm, validateOutputForm } from '../../utils/validation';
import type { IntakePricingMode, IntakeUnitPriceBasis } from '../../types';

// --- Smart Note Input Component ---
const SUGGESTED_TAGS = ['#HighTemp', '#HighAcid', '#LowProtein', '#DamagedPackaging', '#LateArrival'];
const INTAKE_DRAFT_KEY = 'nordic-pms-draft-intake';
const OUTPUT_DRAFT_KEY = 'nordic-pms-draft-output';

const SmartNoteInput: React.FC<{ 
  value: string; 
  onChange: (val: string, tags: string[]) => void 
}> = ({ value, onChange }) => {
  const [showMenu, setShowMenu] = useState(false);
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    if (newVal.endsWith('#')) {
      setShowMenu(true);
    } else if (newVal.endsWith(' ')) {
      setShowMenu(false);
    }
    
    const tags = newVal.match(/#[a-zA-Z0-9]+/g) || [];
    onChange(newVal, tags);
  };

  const insertTag = (tag: string) => {
    const cleanValue = value.slice(0, -1); 
    const finalValue = `${cleanValue}${tag} `;
    onChange(finalValue, [tag]);
    setShowMenu(false);
  };

  return (
    <div className="relative w-full">
      <input 
        type="text" 
        value={value}
        onChange={handleChange}
        placeholder="Add note (type # for tags)..."
        className="w-full bg-white border border-slate-300 rounded-md px-3 py-2.5 text-base md:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
      />
      {showMenu && (
        <div className="absolute top-full left-0 mt-1 w-full md:w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden animate-fade-in">
          <div className="bg-slate-50 px-3 py-2 text-[10px] uppercase font-bold text-slate-500 tracking-wider">Select Issue Tag</div>
          {SUGGESTED_TAGS.map(tag => (
            <button
              key={tag}
              onClick={() => insertTag(tag)}
              className="w-full text-left px-3 py-3 md:py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-2 border-b md:border-b-0 border-slate-50"
            >
              <Hash size={12} className="text-blue-400" /> {tag.replace('#', '')}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// --- Reusable Input Components ---
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

const FieldHint: React.FC<{ message?: string; tone?: 'error' | 'warning' | 'muted' }> = ({ message, tone = 'error' }) => {
  if (!message) return null;
  return (
    <div className={`mt-1 text-xs ${tone === 'error' ? 'text-red-600' : tone === 'warning' ? 'text-amber-600' : 'text-slate-400'}`}>
      {message}
    </div>
  );
};

const INTAKE_ERROR_CLASS = 'border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-red-500/10';
const INTAKE_WARNING_CLASS = 'border-amber-300 bg-amber-50/40 focus:border-amber-400 focus:ring-amber-500/10';

// --- Filter Component with Range ---
interface FilterState {
  search: string;
  dateStart: string;
  dateEnd: string;
}

const FilterSection: React.FC<{
  isOpen: boolean;
  onToggle: () => void;
  filters: FilterState;
  onFilterChange: (updates: Partial<FilterState>) => void;
  count: number;
  label: string;
}> = ({ isOpen, onToggle, filters, onFilterChange, count, label }) => {
  
  const setPreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    onFilterChange({
      dateStart: start.toISOString().split('T')[0],
      dateEnd: end.toISOString().split('T')[0]
    });
  };

  return (
    <div className="flex flex-col gap-2 mb-2 bg-slate-50 border border-slate-200 rounded-lg p-2">
      <div className="flex items-center justify-between cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
          <Filter size={14} className={isOpen ? 'text-blue-600' : 'text-slate-400'} />
          <span>{label} History</span>
          <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-[10px]">{count}</span>
        </div>
        <button className="text-slate-400 hover:text-blue-600">
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      
      {isOpen && (
        <div className="grid grid-cols-12 gap-2 pt-2 border-t border-slate-200 animate-slide-up">
          <div className="col-span-12 relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search..." 
              className="w-full bg-white text-slate-900 pl-8 pr-2 py-1.5 text-xs border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-100 outline-none placeholder:text-slate-400"
              value={filters.search}
              onChange={(e) => onFilterChange({ search: e.target.value })}
            />
          </div>
          
          <div className="col-span-12 flex gap-2 items-center bg-white p-1.5 rounded border border-slate-200">
             <Calendar size={14} className="text-slate-400 ml-1" />
             <div className="flex gap-2 flex-1">
               <input 
                  type="date" 
                  className="w-full bg-white text-slate-700 text-xs outline-none"
                  value={filters.dateStart}
                  onChange={(e) => onFilterChange({ dateStart: e.target.value })}
                />
                <span className="text-slate-300">-</span>
                <input 
                  type="date" 
                  className="w-full bg-white text-slate-700 text-xs outline-none"
                  value={filters.dateEnd}
                  onChange={(e) => onFilterChange({ dateEnd: e.target.value })}
                />
             </div>
          </div>
          
          <div className="col-span-12 flex gap-1 justify-between">
             {[
               { l: 'Today', d: 0 }, { l: 'Week', d: 7 }, { l: 'Month', d: 30 }, { l: 'Qtr', d: 90 }
             ].map(p => (
               <button 
                  key={p.l}
                  onClick={() => setPreset(p.d)}
                  className="flex-1 bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-200 text-[10px] py-1 rounded transition-colors uppercase font-semibold"
                >
                  {p.l}
               </button>
             ))}
          </div>

          <div className="col-span-12 text-[10px] text-center text-slate-400 italic">
            Showing all matching results. Clear filters to reset.
          </div>
        </div>
      )}
      {!isOpen && <div className="text-[10px] text-slate-400 pl-6">Showing recent 5 entries</div>}
    </div>
  );
};

// --- Main Component ---

export const InputTab: React.FC = () => {
  const { 
    suppliers,
    intakeEntries, 
    addIntakeEntry, 
    updateIntakeEntry,
    removeIntakeEntry, 
    editingIntakeId,
    setEditingIntakeId,
    outputEntries, 
    addOutputEntry, 
    updateOutputEntry,
    removeOutputEntry,
    editingOutputId,
    setEditingOutputId,
    products,
    milkTypes
  } = useStore();

  // Input Form States (Intake)
  const [activeMode, setActiveMode] = useState<'intake' | 'output'>('intake');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [milkType, setMilkType] = useState(milkTypes[0] || 'Skim milk');
  const [intakeKg, setIntakeKg] = useState('');
  const [intakeDate, setIntakeDate] = useState(new Date().toISOString().split('T')[0]); // Default to today
  const [fat, setFat] = useState('');
  const [protein, setProtein] = useState('');
  const [ph, setPh] = useState('');
  const [temp, setTemp] = useState('');
  const [applyLabCoefficient, setApplyLabCoefficient] = useState(() => isRawMilkType(milkTypes[0] || ''));
  const [pricingMode, setPricingMode] = useState<IntakePricingMode>('invoice_total');
  const [invoiceTotalEur, setInvoiceTotalEur] = useState('');
  const [unitPricePerKg, setUnitPricePerKg] = useState('');
  const [unitPriceBasis, setUnitPriceBasis] = useState<IntakeUnitPriceBasis>('received_kg');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [isEcological, setIsEcological] = useState(false);
  const [note, setNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  
  // Input Form States (Output)
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '');
  const [batchId, setBatchId] = useState(`MPC-${new Date().toISOString().slice(0,10)}`);
  const [pkgString, setPkgString] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const defaultBatchId = `MPC-${new Date().toISOString().slice(0,10)}`;

  // Supplier Options for SmartSelect
  const supplierOptions = useMemo(() => suppliers.map(s => ({
    id: s.id,
    label: s.name,
    subLabel: `${s.routeGroup} • ${s.defaultMilkType || 'Milk'}`,
    tags: [s.isEco ? 'ECO' : '', s.defaultMilkType || ''].filter(Boolean),
    data: s
  })), [suppliers]);

  const supplierFilters = useMemo(() => [
    { id: 'concentrate', label: 'Concentrate', predicate: (s: any) => s.defaultMilkType?.toLowerCase().includes('concentrate') },
    { id: 'milk', label: 'Raw Milk', predicate: (s: any) => !s.defaultMilkType?.toLowerCase().includes('concentrate') },
    { id: 'eco', label: 'Ecological', predicate: (s: any) => s.isEco }
  ], []);

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
    isDanger?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: () => {}
  });

  // Set default supplier when list loads
  useEffect(() => {
    if (suppliers.length === 0) {
      if (selectedSupplierId) setSelectedSupplierId('');
      return;
    }

    if (!selectedSupplierId || !suppliers.some(s => s.id === selectedSupplierId)) {
      setSelectedSupplierId(suppliers[0].id);
    }
  }, [suppliers, selectedSupplierId]);

  useEffect(() => {
    if (products.length === 0) {
      if (selectedProductId) setSelectedProductId('');
      return;
    }

    if (!selectedProductId || !products.some(product => product.id === selectedProductId)) {
      setSelectedProductId(products[0].id);
    }
  }, [products, selectedProductId]);

  useEffect(() => {
    const supplier = suppliers.find(s => s.id === selectedSupplierId);
    const preferredMilkType = supplier?.defaultMilkType;

    if (preferredMilkType && milkTypes.includes(preferredMilkType)) {
      if (milkType !== preferredMilkType) setMilkType(preferredMilkType);
      return;
    }

    if (!milkType || (milkTypes.length > 0 && !milkTypes.includes(milkType))) {
      setMilkType(milkTypes[0] || 'Skim milk');
    }
  }, [milkTypes, milkType, selectedSupplierId, suppliers]);

  // Auto-fill Supplier Details
  useEffect(() => {
    const supplier = suppliers.find(s => s.id === selectedSupplierId);
    if (supplier) {
      if (supplier.defaultMilkType && milkTypes.includes(supplier.defaultMilkType)) {
        setMilkType(supplier.defaultMilkType);
      }
      if (supplier.isEco !== undefined) setIsEcological(supplier.isEco);
    }
  }, [selectedSupplierId, suppliers, milkTypes]);

  useEffect(() => {
    if (editingIntakeId) return;
    setApplyLabCoefficient(isRawMilkType(milkType));
  }, [milkType, editingIntakeId]);

  // Filtering States
  const [showIntakeFilter, setShowIntakeFilter] = useState(false);
  const [intakeFilters, setIntakeFilters] = useState<FilterState>({ search: '', dateStart: '', dateEnd: '' });
  
  const [showOutputFilter, setShowOutputFilter] = useState(false);
  const [outputFilters, setOutputFilters] = useState<FilterState>({ search: '', dateStart: '', dateEnd: '' });

  // Load editing data (Intake)
  useEffect(() => {
    if (editingIntakeId) {
      const entry = intakeEntries.find(e => e.id === editingIntakeId);
      if (entry) {
        setSelectedSupplierId(entry.supplierId);
        setMilkType(entry.milkType || milkTypes[0] || 'Skim milk');
        setIntakeKg(entry.quantityKg.toString());
        setIntakeDate(new Date(entry.timestamp).toISOString().split('T')[0]);
        setFat(entry.fatPct.toString());
        setProtein(entry.proteinPct.toString());
        setPh(entry.ph?.toString() || '');
        setTemp(entry.tempCelsius.toString());
        setApplyLabCoefficient((entry.labCoefficient ?? 1) !== 1 || Math.abs(getEffectiveIntakeQuantityKg(entry) - entry.quantityKg) > 0.0001);
        setPricingMode(entry.pricingMode || 'invoice_total');
        setInvoiceTotalEur(entry.calculatedCost?.toString() || '');
        setUnitPricePerKg(entry.unitPricePerKg?.toString() || '');
        setUnitPriceBasis(entry.unitPriceBasis || 'received_kg');
        setInvoiceNumber(entry.invoiceNumber || '');
        setIsEcological(entry.isEcological || false);
        setNote(entry.note || '');
        setTags(entry.tags || []);
      }
    }
  }, [editingIntakeId, intakeEntries]);

  // Load editing data (Output)
  useEffect(() => {
    if (editingOutputId) {
      const entry = outputEntries.find(e => e.id === editingOutputId);
      if (entry) {
        setSelectedProductId(entry.productId);
        setBatchId(entry.batchId);
        setPkgString(entry.packagingString);
      }
    }
  }, [editingOutputId, outputEntries]);

  // Derived Values
  const activeProduct = products.find(p => p.id === selectedProductId);
  const parserPreview = useMemo(() => {
    if (!activeProduct) return null;
    return parsePackagingString(pkgString, activeProduct.defaultPalletWeight, activeProduct.defaultBagWeight);
  }, [pkgString, activeProduct]);
  const intakeDerived = useMemo(() => {
    return resolveEffectiveQuantityKg({
      quantityKg: Number(intakeKg),
      applyCoefficient: applyLabCoefficient,
      fatPct: Number(fat),
      proteinPct: Number(protein),
    });
  }, [intakeKg, applyLabCoefficient, fat, protein]);
  const intakePricingPreview = useMemo(() => {
    return resolveIntakeCost({
      pricingMode,
      invoiceTotalEur: pricingMode === 'invoice_total' ? Number(invoiceTotalEur) : null,
      unitPricePerKg: pricingMode === 'unit_price' ? Number(unitPricePerKg) : null,
      unitPriceBasis: pricingMode === 'unit_price' ? unitPriceBasis : null,
      quantityKg: Number(intakeKg),
      effectiveQuantityKg: intakeDerived.effectiveQuantityKg,
    });
  }, [pricingMode, invoiceTotalEur, unitPricePerKg, unitPriceBasis, intakeKg, intakeDerived.effectiveQuantityKg]);
  const intakeErrors = useMemo(() => validateIntakeForm({
    supplierId: selectedSupplierId,
    milkType,
    intakeDate,
    intakeKg,
    fat,
    protein,
    ph,
    temp,
    pricingMode,
    invoiceTotalEur,
    unitPricePerKg,
    unitPriceBasis,
  }), [selectedSupplierId, milkType, intakeDate, intakeKg, fat, protein, ph, temp, pricingMode, invoiceTotalEur, unitPricePerKg, unitPriceBasis]);
  const outputErrors = useMemo(() => validateOutputForm({
    productId: selectedProductId,
    batchId,
    packagingString: pkgString,
    parserPreview,
  }), [selectedProductId, batchId, pkgString, parserPreview]);
  const intakeWarningState = useMemo(() => {
    const nextTemp = Number(temp);
    const nextPh = Number(ph);
    return {
      temp: Number.isFinite(nextTemp) && nextTemp > 8,
      ph: Number.isFinite(nextPh) && (nextPh > 6.74 || nextPh < 6.55),
    };
  }, [temp, ph]);
  const hasIntakeChanges = Boolean(intakeKg || fat || protein || ph || temp || invoiceTotalEur || unitPricePerKg || invoiceNumber || isEcological || note || tags.length || editingIntakeId);
  const hasOutputChanges = Boolean(pkgString || editingOutputId || (batchId && batchId !== defaultBatchId));

  useUnsavedChangesWarning(hasIntakeChanges || hasOutputChanges);

  useEffect(() => {
    if (editingIntakeId) return;
    const draft = loadDraft<any>(INTAKE_DRAFT_KEY);
    if (!draft) return;
    if (draft.selectedSupplierId) setSelectedSupplierId(draft.selectedSupplierId);
    if (draft.milkType) setMilkType(draft.milkType);
    if (draft.intakeKg) setIntakeKg(draft.intakeKg);
    if (draft.intakeDate) setIntakeDate(draft.intakeDate);
    if (draft.fat) setFat(draft.fat);
    if (draft.protein) setProtein(draft.protein);
    if (draft.ph) setPh(draft.ph);
    if (draft.temp) setTemp(draft.temp);
    if (typeof draft.applyLabCoefficient === 'boolean') setApplyLabCoefficient(draft.applyLabCoefficient);
    if (draft.pricingMode) setPricingMode(draft.pricingMode);
    if (draft.invoiceTotalEur) setInvoiceTotalEur(draft.invoiceTotalEur);
    if (draft.unitPricePerKg) setUnitPricePerKg(draft.unitPricePerKg);
    if (draft.unitPriceBasis) setUnitPriceBasis(draft.unitPriceBasis);
    if (draft.invoiceNumber) setInvoiceNumber(draft.invoiceNumber);
    if (typeof draft.isEcological === 'boolean') setIsEcological(draft.isEcological);
    if (draft.note) setNote(draft.note);
    if (Array.isArray(draft.tags)) setTags(draft.tags);
  }, [editingIntakeId]);

  useEffect(() => {
    if (editingOutputId) return;
    const draft = loadDraft<any>(OUTPUT_DRAFT_KEY);
    if (!draft) return;
    if (draft.selectedProductId) setSelectedProductId(draft.selectedProductId);
    if (draft.batchId) setBatchId(draft.batchId);
    if (draft.pkgString) setPkgString(draft.pkgString);
  }, [editingOutputId]);

  useEffect(() => {
    if (editingIntakeId) return;
    saveDraft(INTAKE_DRAFT_KEY, { selectedSupplierId, milkType, intakeKg, intakeDate, fat, protein, ph, temp, applyLabCoefficient, pricingMode, invoiceTotalEur, unitPricePerKg, unitPriceBasis, invoiceNumber, isEcological, note, tags });
  }, [selectedSupplierId, milkType, intakeKg, intakeDate, fat, protein, ph, temp, applyLabCoefficient, pricingMode, invoiceTotalEur, unitPricePerKg, unitPriceBasis, invoiceNumber, isEcological, note, tags, editingIntakeId]);

  useEffect(() => {
    if (editingOutputId) return;
    saveDraft(OUTPUT_DRAFT_KEY, { selectedProductId, batchId, pkgString });
  }, [selectedProductId, batchId, pkgString, editingOutputId]);

  // Filter Logic: Intake
  const displayedIntake = useMemo(() => {
    let data = [...intakeEntries].sort((a, b) => b.timestamp - a.timestamp);
    
    // Apply Filters
    if (showIntakeFilter) {
      if (intakeFilters.search) {
        const lowerQ = intakeFilters.search.toLowerCase();
        data = data.filter(e => 
          e.supplierName.toLowerCase().includes(lowerQ) ||
          e.quantityKg.toString().includes(lowerQ) ||
          e.routeGroup.toLowerCase().includes(lowerQ) ||
          (e.note && e.note.toLowerCase().includes(lowerQ))
        );
      }
      if (intakeFilters.dateStart) {
        const startTs = new Date(intakeFilters.dateStart).getTime();
        data = data.filter(e => e.timestamp >= startTs);
      }
      if (intakeFilters.dateEnd) {
        // End of the day
        const endTs = new Date(intakeFilters.dateEnd).setHours(23, 59, 59, 999);
        data = data.filter(e => e.timestamp <= endTs);
      }
      return data;
    }
    return data.slice(0, 5);
  }, [intakeEntries, showIntakeFilter, intakeFilters]);

  // Filter Logic: Output
  const displayedOutput = useMemo(() => {
    let data = [...outputEntries].sort((a, b) => b.timestamp - a.timestamp);

    if (showOutputFilter) {
      if (outputFilters.search) {
        const lowerQ = outputFilters.search.toLowerCase();
        data = data.filter(e => 
          e.productId.toLowerCase().includes(lowerQ) ||
          e.batchId.toLowerCase().includes(lowerQ) ||
          e.parsed.totalWeight.toString().includes(lowerQ)
        );
      }
      if (outputFilters.dateStart) {
        const startTs = new Date(outputFilters.dateStart).getTime();
        data = data.filter(e => e.timestamp >= startTs);
      }
      if (outputFilters.dateEnd) {
        const endTs = new Date(outputFilters.dateEnd).setHours(23, 59, 59, 999);
        data = data.filter(e => e.timestamp <= endTs);
      }
      return data;
    }

    return data.slice(0, 5);
  }, [outputEntries, showOutputFilter, outputFilters]);

  // Handlers
  const confirmIntakeSubmit = () => {
    const supplier = suppliers.find(s => s.id === selectedSupplierId);
    if (!supplier || Object.keys(intakeErrors).length > 0) return;

    setConfirmModal({
      isOpen: true,
      title: editingIntakeId ? "Confirm Update" : "Confirm New Intake",
      message: `Are you sure you want to ${editingIntakeId ? 'update' : 'add'} this intake entry for ${supplier.name} (${intakeKg}kg) on ${intakeDate}?`,
      action: () => { void executeIntakeSubmit(); },
      isDanger: false
    });
  };

  const executeIntakeSubmit = async () => {
    const supplier = suppliers.find(s => s.id === selectedSupplierId);
    if (!supplier || Object.keys(intakeErrors).length > 0) return;

    // Construct Timestamp
    const selectedDate = new Date(intakeDate);
    const now = new Date();
    const isToday = selectedDate.toDateString() === now.toDateString();
    
    if (isToday) {
       selectedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
    } else {
       selectedDate.setHours(12, 0, 0, 0); // Default to noon
    }
    
    const timestamp = selectedDate.getTime();
    const parsedPh = Number(ph);
    const parsedTemp = Number(temp);
    const parsedFat = Number(fat);
    const parsedProtein = Number(protein);
    const autoTags = buildIntakeTags({ tempCelsius: parsedTemp, ph: parsedPh }, tags);

    const entryData = {
      supplierId: supplier.id,
      supplierName: supplier.name,
      routeGroup: supplier.routeGroup,
      milkType: milkType,
      quantityKg: Number(intakeKg),
      ph: parsedPh,
      fatPct: parsedFat,
      proteinPct: parsedProtein,
      tempCelsius: parsedTemp,
      applyLabCoefficient,
      pricingMode,
      invoiceTotalEur: pricingMode === 'invoice_total' ? Number(invoiceTotalEur) : null,
      unitPricePerKg: pricingMode === 'unit_price' ? Number(unitPricePerKg) : null,
      unitPriceBasis: pricingMode === 'unit_price' ? unitPriceBasis : null,
      invoiceNumber: invoiceNumber.trim() || null,
      isEcological,
      tags: autoTags,
      note: note,
      timestamp: timestamp
    };

    try {
      if (editingIntakeId) {
        await updateIntakeEntry(editingIntakeId, entryData);
        setEditingIntakeId(null);
      } else {
        await addIntakeEntry(entryData);
      }

      // Reset Form
      setIntakeKg(''); setFat(''); setProtein(''); setPh(''); setTemp(''); setInvoiceTotalEur(''); setUnitPricePerKg(''); setInvoiceNumber(''); setPricingMode('invoice_total'); setUnitPriceBasis('received_kg'); setNote(''); setTags([]); setIsEcological(false);
      setMilkType(milkTypes[0] || 'Skim milk');
      setIntakeDate(new Date().toISOString().split('T')[0]);
      setApplyLabCoefficient(isRawMilkType(milkTypes[0] || 'Skim milk'));
      clearDraft(INTAKE_DRAFT_KEY);
    } catch (error) {
      console.error('Failed to save intake entry', error);
    }
  };

  const confirmIntakeDelete = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Intake Entry",
      message: "Are you sure you want to delete this intake entry? This action cannot be undone.",
      action: () => removeIntakeEntry(id),
      isDanger: true
    });
  };

  const handleCancelIntakeEdit = () => {
    setEditingIntakeId(null);
    setIntakeKg(''); setFat(''); setProtein(''); setPh(''); setTemp(''); setInvoiceTotalEur(''); setUnitPricePerKg(''); setInvoiceNumber(''); setPricingMode('invoice_total'); setUnitPriceBasis('received_kg'); setNote(''); setTags([]); setIsEcological(false);
    setMilkType(milkTypes[0] || 'Skim milk');
    setIntakeDate(new Date().toISOString().split('T')[0]);
    setApplyLabCoefficient(isRawMilkType(milkTypes[0] || 'Skim milk'));
    clearDraft(INTAKE_DRAFT_KEY);
  };

  const confirmOutputSubmit = () => {
    if (Object.keys(outputErrors).length > 0) return;
    if (anyFractional(parserPreview)) {
      setConfirmModal({ isOpen: true, title: 'Invalid Packaging', message: "Fractional pallets/bigbags/tanks not allowed. Use 'loose kg' for remainder.", action: () => setConfirmModal(prev => ({ ...prev, isOpen: false })), isDanger: false });
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: editingOutputId ? "Confirm Update" : "Confirm Production Log",
      message: `Are you sure you want to log ${parserPreview.totalWeight.toLocaleString()}kg of ${selectedProductId} (Batch: ${batchId})?`,
      action: () => { void executeOutputSubmit(); },
      isDanger: false
    });
  };

  const executeOutputSubmit = async () => {
    try {
      if (Object.keys(outputErrors).length > 0) return;
      if (editingOutputId) {
        await updateOutputEntry(editingOutputId, pkgString);
      } else {
        await addOutputEntry({ productId: selectedProductId, batchId, packagingString: pkgString, destination: 'Warehouse' });
      }
      setPkgString('');
      clearDraft(OUTPUT_DRAFT_KEY);
    } catch (error) {
      console.error('Failed to save production output', error);
    }
  };

  const confirmOutputDelete = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Production Log",
      message: "Are you sure you want to delete this production output log? This will affect stock levels.",
      action: () => removeOutputEntry(id),
      isDanger: true
    });
  };

  const handleCancelOutputEdit = () => {
    setEditingOutputId(null);
    setPkgString('');
    setBatchId(defaultBatchId);
    clearDraft(OUTPUT_DRAFT_KEY);
  };

  const isOutputValid = parserPreview && parserPreview.isValid && Object.keys(outputErrors).length === 0;

  return (
    <div className="flex flex-col gap-6 animate-fade-in min-w-0">
      <ConfirmationModal 
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.action}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        isDanger={confirmModal.isDanger}
      />

      <PackagingWizard 
        isOpen={showWizard} 
        onClose={() => setShowWizard(false)} 
        onApply={(str) => setPkgString(str)}
        defaultPallet={activeProduct?.defaultPalletWeight || 750}
        defaultBag={activeProduct?.defaultBagWeight || 1000}
      />

      <ReportExportModal open={showReportModal} onClose={() => setShowReportModal(false)} />

      {/* Mode Toggle */}
      <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-200 shadow-sm w-full">
         <div className="flex bg-slate-100 p-1 rounded-lg w-full md:w-auto">
            <button
              onClick={() => setActiveMode('intake')}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2 text-sm font-bold rounded-md transition-all ${
                activeMode === 'intake' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Droplets size={16} /> Milk Intake
            </button>
            <button
              onClick={() => setActiveMode('output')}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2 text-sm font-bold rounded-md transition-all ${
                activeMode === 'output' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Factory size={16} /> Production
            </button>
         </div>
         <div className="ml-3 hidden md:block">
           <button
             onClick={() => setShowReportModal(true)}
             className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-md text-sm font-semibold hover:bg-indigo-100 transition-colors"
             title="Export monthly report"
           >
             Export
           </button>
         </div>
      </div>

      {activeMode === 'intake' && (
      <div className="flex flex-col lg:flex-row gap-6 animate-slide-up min-w-0">
        <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="text-slate-500 uppercase text-xs font-bold tracking-widest px-1 pt-2 md:pt-0">
          New Intake Entry
        </div>
        
        {/* Entry Form */}
        <GlassCard className={`p-4 md:p-5 transition-all duration-300 overflow-hidden ${editingIntakeId ? 'bg-amber-50/50 border-amber-200 shadow-md ring-2 ring-amber-100' : 'bg-slate-50/50'}`}>
          <div className="grid grid-cols-12 gap-3 md:gap-4 items-end">
             {/* ... Form Fields ... */}
             {/* Note: Kept existing logic mostly same, just ensuring PackagingWizard usage below */}
             {editingIntakeId && (
               <div className="col-span-12 flex items-center gap-2 text-amber-700 text-xs font-bold uppercase tracking-wider mb-[-8px]">
                 <Pencil size={12} /> Editing Mode
               </div>
             )}
            <div className="col-span-12 md:col-span-4">
              <SmartSelect 
                label="Supplier"
                placeholder="Select Supplier..."
                options={supplierOptions}
                value={selectedSupplierId}
                onChange={setSelectedSupplierId}
                filters={supplierFilters}
                triggerClassName={intakeErrors.supplierId ? INTAKE_ERROR_CLASS : ''}
              />
            </div>
            
            <div className="col-span-12 md:col-span-4">
               <label className="text-xs font-semibold text-slate-600 block mb-1.5">Milk Type</label>
               <SelectField value={milkType} onChange={e => setMilkType(e.target.value)} className={intakeErrors.milkType ? INTAKE_ERROR_CLASS : ''}>
                  {milkTypes.map(t => <option key={t} value={t}>{t}</option>)}
               </SelectField>
            </div>

            <div className="col-span-12 md:col-span-4">
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Date</label>
              <InputField 
                type="date"
                value={intakeDate}
                onChange={(e) => setIntakeDate(e.target.value)}
                className={intakeErrors.intakeDate ? INTAKE_ERROR_CLASS : ''}
              />
            </div>

            <div className="col-span-4 md:col-span-3">
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Received kg</label>
              <InputField 
                type="number" 
                value={intakeKg}
                onChange={(e) => setIntakeKg(e.target.value)}
                placeholder="0"
                className={intakeErrors.intakeKg ? INTAKE_ERROR_CLASS : ''}
              />
            </div>

            <div className="col-span-4 md:col-span-2">
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Fat %</label>
              <InputField 
                type="number" 
                value={fat}
                onChange={(e) => setFat(e.target.value)}
                placeholder="0.00"
                className={intakeErrors.fat ? INTAKE_ERROR_CLASS : ''}
              />
            </div>
            <div className="col-span-4 md:col-span-2">
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">Prot %</label>
              <InputField 
                type="number" 
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                placeholder="0.00"
                className={intakeErrors.protein ? INTAKE_ERROR_CLASS : ''}
              />
            </div>
            <div className="col-span-4 md:col-span-2">
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">pH</label>
              <InputField 
                type="number" 
                step="0.01"
                value={ph}
                onChange={(e) => setPh(e.target.value)}
                placeholder="6.65"
                className={intakeErrors.ph ? INTAKE_ERROR_CLASS : intakeWarningState.ph ? INTAKE_WARNING_CLASS : ''}
              />
            </div>
            <div className="col-span-4 md:col-span-2">
                 <label className="text-xs font-semibold text-slate-600 block mb-1.5">Temp °C</label>
                  <InputField 
                    type="number" 
                    value={temp}
                    onChange={(e) => setTemp(e.target.value)}
                    placeholder="4.0"
                    className={intakeErrors.temp ? INTAKE_ERROR_CLASS : intakeWarningState.temp ? INTAKE_WARNING_CLASS : ''}
                  />
            </div>

            <div className="col-span-12 rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-500">Raw Milk Coefficient</div>
                  <div className="mt-1 text-xs text-slate-500">Use lab-adjusted kg for raw milk yield calculations only.</div>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={applyLabCoefficient}
                    onChange={(e) => setApplyLabCoefficient(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Apply raw-milk coefficient
                </label>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-md bg-slate-50 px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Received kg</div>
                  <div className="mt-1 text-sm font-bold text-slate-800">{Number(intakeKg || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} kg</div>
                </div>
                <div className="rounded-md bg-slate-50 px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lab coefficient</div>
                  <div className="mt-1 text-sm font-bold text-slate-800">{applyLabCoefficient ? intakeDerived.labCoefficient.toFixed(3) : '1.000'}</div>
                </div>
                <div className="rounded-md bg-slate-50 px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Effective kg</div>
                  <div className="mt-1 text-sm font-bold text-slate-800">{intakeDerived.effectiveQuantityKg.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg</div>
                </div>
              </div>
            </div>

            <div className="col-span-12 rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-500">Pricing</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPricingMode('invoice_total')}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase transition-all ${pricingMode === 'invoice_total' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  Invoice total (€)
                </button>
                <button
                  type="button"
                  onClick={() => setPricingMode('unit_price')}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase transition-all ${pricingMode === 'unit_price' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  Unit price × quantity
                </button>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-slate-600 block mb-1.5">Invoice number</label>
                  <InputField value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Optional invoice reference" />
                </div>

                {pricingMode === 'invoice_total' ? (
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-slate-600 block mb-1.5">Invoice total (€)</label>
                    <InputField
                      type="number"
                      step="0.01"
                      value={invoiceTotalEur}
                      onChange={(e) => setInvoiceTotalEur(e.target.value)}
                      placeholder="0.00"
                      className={intakeErrors.invoiceTotalEur ? INTAKE_ERROR_CLASS : ''}
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-1.5">Unit price (€/kg)</label>
                      <InputField
                        type="number"
                        step="0.0001"
                        value={unitPricePerKg}
                        onChange={(e) => setUnitPricePerKg(e.target.value)}
                        placeholder="0.0000"
                        className={intakeErrors.unitPricePerKg ? INTAKE_ERROR_CLASS : ''}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-1.5">Pricing basis</label>
                      <SelectField value={unitPriceBasis} onChange={(e) => setUnitPriceBasis(e.target.value as IntakeUnitPriceBasis)} className={intakeErrors.unitPriceBasis ? INTAKE_ERROR_CLASS : ''}>
                        <option value="received_kg">Received kg</option>
                        <option value="effective_kg">Lab-adjusted kg</option>
                      </SelectField>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                <div className="rounded-md bg-slate-50 px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total €</div>
                  <div className="mt-1 text-sm font-bold text-slate-800">€{intakePricingPreview.calculatedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
                <div className="rounded-md bg-slate-50 px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">€/received kg</div>
                  <div className="mt-1 text-sm font-bold text-slate-800">€{intakePricingPreview.derivedUnitPricePerReceivedKg.toFixed(4)}</div>
                </div>
                <div className="rounded-md bg-slate-50 px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">€/effective kg</div>
                  <div className="mt-1 text-sm font-bold text-slate-800">€{intakePricingPreview.derivedUnitPricePerEffectiveKg.toFixed(4)}</div>
                </div>
              </div>
            </div>

            {/* Ecological Toggle */}
            <div className="col-span-8 md:col-span-3 flex flex-col justify-end">
               <label className="text-xs font-semibold text-slate-600 block mb-1.5 md:opacity-0">Eco</label>
               <button
                  onClick={() => setIsEcological(!isEcological)}
                  className={`h-[42px] px-3 rounded-md border flex items-center justify-center gap-2 transition-all w-full ${isEcological ? 'bg-green-100 border-green-300 text-green-700' : 'bg-white border-slate-300 text-slate-400'}`}
                  title="Is Ecological Milk?"
              >
                <Leaf size={18} />
                <span className="text-xs font-bold">ECO</span>
              </button>
           </div>
            
            <div className="col-span-12 md:col-span-12">
               <label className="text-xs font-semibold text-slate-600 block mb-1.5">Notes</label>
               <SmartNoteInput value={note} onChange={(val, newTags) => {
                 setNote(val);
                 setTags(prev => Array.from(new Set([...prev, ...newTags])));
               }} />
            </div>

            <div className="col-span-12 md:col-span-12 flex gap-2 h-[42px] mt-2">
              {editingIntakeId ? (
                <>
                   <button 
                    onClick={confirmIntakeSubmit}
                    disabled={Object.keys(intakeErrors).length > 0}
                    className={`flex-1 text-white shadow-sm rounded-md flex items-center justify-center gap-2 transition-all font-bold ${Object.keys(intakeErrors).length > 0 ? 'bg-amber-300 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-700'}`}
                    title="Update Entry"
                  >
                    <Check size={20} /> Update Entry
                  </button>
                  <button 
                    onClick={handleCancelIntakeEdit}
                    className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-600 shadow-sm rounded-md flex items-center justify-center transition-all"
                    title="Cancel"
                  >
                    <X size={20} />
                  </button>
                </>
              ) : (
                <button 
                  onClick={confirmIntakeSubmit}
                  disabled={Object.keys(intakeErrors).length > 0}
                  className={`w-full text-white shadow-sm rounded-md flex items-center justify-center gap-2 transition-all active:scale-[0.98] font-bold ${Object.keys(intakeErrors).length > 0 ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                  <Plus size={20} /> Add Intake Entry
                </button>
              )}
            </div>
          </div>
        </GlassCard>

        {/* Filter & List */}
        <div className="flex flex-col gap-2">
          <FilterSection 
            isOpen={showIntakeFilter} 
            onToggle={() => setShowIntakeFilter(!showIntakeFilter)}
            filters={intakeFilters}
            onFilterChange={(updates) => setIntakeFilters(prev => ({ ...prev, ...updates }))}
            count={intakeEntries.length}
            label="Raw Milk Intake"
          />

          <div className="space-y-2">
            {displayedIntake.length === 0 && (
              <div className="text-center py-6 text-slate-400 text-sm italic border-2 border-dashed border-slate-200 rounded-lg">
                No intake entries found.
              </div>
            )}
            {displayedIntake.map(entry => (
              <div key={entry.id} className={`group flex items-center justify-between p-3 border rounded-lg transition-all shadow-sm ${entry.isDiscarded ? 'bg-red-50 border-red-200 opacity-75' : editingIntakeId === entry.id ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-200' : 'bg-white hover:bg-slate-50 border-slate-200'}`}>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold flex flex-wrap items-center gap-2 ${entry.isDiscarded ? 'text-red-800' : entry.isEcological ? 'text-red-600' : 'text-slate-800'}`}>
                    <span className="truncate">{entry.supplierName}</span>
                    {entry.isDiscarded && <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">Discarded</span>}
                    <span className="text-[10px] text-slate-500 font-normal bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{entry.milkType}</span>
                    {entry.isEcological && <Leaf size={12} className="text-red-500 fill-red-100" />}
                    {entry.tags.map(t => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-medium whitespace-nowrap">
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-2">
                    <span className="whitespace-nowrap">{new Date(entry.timestamp).toLocaleDateString()}</span>
                    <span className="text-slate-300 hidden md:inline">•</span>
                    <span className="whitespace-nowrap">{entry.routeGroup}</span>
                    <span className="text-slate-300 hidden md:inline">•</span> 
                    <span className="text-slate-700 font-medium whitespace-nowrap">{entry.fatPct}% F</span> 
                    <span className="text-slate-700 font-medium whitespace-nowrap">{entry.proteinPct}% P</span>
                    <span className="text-slate-300 hidden md:inline">•</span>
                    <span className={`font-medium whitespace-nowrap ${
                      entry.ph > 6.74 || entry.ph < 6.55 ? 'text-red-600 font-bold' :
                      entry.ph < 6.60 ? 'text-amber-600' : 'text-slate-700'
                    }`}>pH {entry.ph}</span>
                    <span className="text-slate-300 hidden md:inline">•</span>
                    <span className="whitespace-nowrap text-slate-700">€{entry.calculatedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    {entry.invoiceNumber && (
                      <>
                        <span className="text-slate-300 hidden md:inline">•</span>
                        <span className="whitespace-nowrap text-slate-500">Inv {entry.invoiceNumber}</span>
                      </>
                    )}
                    {entry.note && <span className="italic opacity-75 truncate max-w-[150px] md:max-w-none">- {entry.note}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 pl-2">
                  <div className="text-right shrink-0">
                    <div className={`font-mono font-bold text-sm md:text-base ${entry.isEcological ? 'text-red-600' : 'text-blue-700'}`}>
                      {entry.quantityKg.toLocaleString()} kg
                    </div>
                    {(entry.labCoefficient ?? 1) !== 1 && (
                      <div className="text-[11px] text-slate-500">x{(entry.labCoefficient ?? 1).toFixed(3)} • {getEffectiveIntakeQuantityKg(entry).toLocaleString(undefined, { maximumFractionDigits: 1 })} eff kg</div>
                    )}
                    <div className="flex items-center gap-1 justify-end">
                      <div className={`text-xs font-medium ${entry.tempCelsius > 8 && !entry.isTempAlertDismissed ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
                        {entry.tempCelsius}°C
                      </div>
                      {entry.tempCelsius > 8 && !entry.isTempAlertDismissed && (
                        <button 
                          onClick={() => useStore.getState().dismissTempAlert(entry.id)}
                          className="text-[10px] bg-red-100 text-red-600 px-1 rounded hover:bg-red-200 transition-colors"
                          title="Dismiss Alert"
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 md:opacity-0 group-hover:opacity-100 transition-opacity">
                     <button 
                      onClick={() => useStore.getState().toggleIntakeDiscard(entry.id)}
                      className={`p-2 md:p-1.5 rounded transition-colors ${entry.isDiscarded ? 'text-red-600 bg-red-100' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}
                      title={entry.isDiscarded ? "Restore Intake" : "Discard Intake"}
                    >
                      <Ban size={16} />
                    </button>
                     <button 
                      onClick={() => setEditingIntakeId(entry.id)}
                      className="text-slate-400 hover:text-blue-500 p-2 md:p-1.5 rounded hover:bg-blue-50 transition-colors"
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </button>
                    <button 
                      onClick={() => confirmIntakeDelete(entry.id)}
                      className="text-slate-400 hover:text-red-500 p-2 md:p-1.5 rounded hover:bg-red-50 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>
      )}

      {activeMode === 'output' && (
      <div className="flex flex-col lg:flex-row gap-6 animate-slide-up min-w-0">
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="text-slate-500 uppercase text-xs font-bold tracking-widest px-1">
          New Output Log
        </div>

        {/* Output Form */}
        <GlassCard className={`p-4 md:p-5 transition-all duration-300 relative overflow-visible ${editingOutputId ? 'bg-amber-50/50 border-amber-200 shadow-md ring-2 ring-amber-100' : 'bg-slate-50/50'}`}>
          {Object.keys(outputErrors).length > 0 && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm">
              {Object.values(outputErrors).map((message) => (
                <div key={message} className="text-red-600">• {message}</div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4">
            {editingOutputId && (
               <div className="flex items-center gap-2 text-amber-700 text-xs font-bold uppercase tracking-wider mb-[-8px]">
                 <Pencil size={12} /> Editing Mode
               </div>
             )}
            <div className="flex flex-col md:flex-row gap-3">
              <SelectField 
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="flex-1"
                disabled={!!editingOutputId} 
              >
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </SelectField>
              <InputField 
                type="text" 
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                className="w-full md:w-1/3 font-mono"
                disabled={!!editingOutputId}
              />
              <FieldHint message={outputErrors.batchId} />
            </div>
            
            <div className="relative">
              <label className="text-xs font-semibold text-slate-600 block mb-1.5 flex items-center gap-2">
                Log String <span className="text-slate-400 font-normal italic text-[10px] md:text-xs">(e.g. "34,96 pad; 2 bb")</span>
              </label>
              <div className="flex gap-2 h-[42px]">
                <div className="relative flex-1">
                   <InputField 
                      type="text" 
                      value={pkgString}
                      onChange={(e) => setPkgString(e.target.value)}
                      placeholder="e.g. 10 pad; 2 bb *1100"
                      className="font-mono pr-10"
                    />
                    <button 
                       onClick={() => setShowWizard(true)}
                       className="absolute right-2 top-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded p-1"
                       title="Open Packaging Wizard"
                    >
                       <Calculator size={18} />
                    </button>
                </div>
                
                {editingOutputId ? (
                  <>
                     <button 
                      onClick={confirmOutputSubmit}
                      disabled={!isOutputValid}
                      className={`bg-amber-600 hover:bg-amber-700 text-white shadow-sm rounded-md px-4 flex items-center justify-center transition-all ${!isOutputValid ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title="Update Output"
                    >
                      <Check size={20} />
                    </button>
                    <button 
                      onClick={handleCancelOutputEdit}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-600 shadow-sm rounded-md px-4 flex items-center justify-center transition-all"
                      title="Cancel"
                    >
                      <X size={20} />
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={confirmOutputSubmit}
                    disabled={!isOutputValid}
                    className={`bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm rounded-md px-4 flex items-center justify-center transition-all active:scale-[0.98] ${!isOutputValid ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Plus size={24} />
                  </button>
                )}
              </div>
              <FieldHint message={outputErrors.packagingString} />
            </div>

            {parserPreview && (
              <div className={`mt-0 p-3 rounded-md border flex justify-between items-center text-xs transition-colors ${parserPreview.isValid ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                <div className="flex flex-col md:flex-row gap-1 md:gap-3">
                  <span className="flex items-center gap-1 font-medium"><Tag size={12}/> {parserPreview.pallets} Pallets</span>
                  <span className="flex items-center gap-1 font-medium"><Tag size={12}/> {parserPreview.bigBags} Big Bags</span>
                </div>
                <div className="font-bold font-mono text-sm">
                  {parserPreview.totalWeight.toLocaleString()} kg
                </div>
              </div>
            )}
          </div>
        </GlassCard>

        {/* Filter & List */}
        <div className="flex flex-col gap-2">
          <FilterSection 
            isOpen={showOutputFilter} 
            onToggle={() => setShowOutputFilter(!showOutputFilter)}
            filters={outputFilters}
            onFilterChange={(updates) => setOutputFilters(prev => ({ ...prev, ...updates }))}
            count={outputEntries.length}
            label="Fractionation Output"
          />

          <div className="space-y-2">
            {displayedOutput.length === 0 && (
              <div className="text-center py-6 text-slate-400 text-sm italic border-2 border-dashed border-slate-200 rounded-lg">
                No output entries found.
              </div>
            )}
            {displayedOutput.map(entry => (
              <div key={entry.id} className={`group flex items-center justify-between p-3 border rounded-lg transition-all shadow-sm ${editingOutputId === entry.id ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-200' : 'bg-white hover:bg-slate-50 border-slate-200'}`}>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 flex items-center gap-2 flex-wrap">
                    {entry.productId}
                    <span className="bg-slate-100 border border-slate-200 text-slate-600 text-[10px] px-1.5 rounded uppercase tracking-wider">{entry.batchId}</span>
                  </div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5 truncate max-w-[180px] md:max-w-none">
                    {new Date(entry.timestamp).toLocaleDateString()} • {entry.packagingString}
                  </div>
                </div>
                <div className="flex items-center gap-3 pl-2">
                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-emerald-700 text-sm md:text-base">{entry.parsed.totalWeight.toLocaleString()} kg</div>
                    <div className="text-xs text-slate-500 font-medium hidden md:block">{entry.parsed.pallets} pl / {entry.parsed.bigBags} bb</div>
                  </div>
                  <div className="flex gap-1 md:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => setEditingOutputId(entry.id)}
                      className="text-slate-400 hover:text-blue-500 p-2 md:p-1.5 rounded hover:bg-blue-50 transition-colors"
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </button>
                    <button 
                      onClick={() => confirmOutputDelete(entry.id)}
                      className="text-slate-400 hover:text-red-500 p-2 md:p-1.5 rounded hover:bg-red-50 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>
      )}
    </div>
  );
};
