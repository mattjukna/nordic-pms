
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import { GlassCard } from '../ui/GlassCard';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import { PackagingWizard } from '../ui/PackagingWizard';
import { parsePackagingString, normalizePackagingString, parsePackagingSegments } from '../../utils/parser';
import { formatDate } from '../../utils/date';
import { anyFractional } from '../../utils/wholeUnits';
import { inferPackagingStringFromKg } from '../../utils/packagingNormalize';
import { getPrimaryCompanyCode, parseCompanyCodes } from '../../utils/companyCodes';
import { Package, Truck, ArrowUpRight, Box, Filter, Search, Calendar, ChevronDown, ChevronUp, FileText, Download, Scale, Layers, Tag, Calculator, CheckCircle2, Clock, Trash2, Check, Pencil, Plus, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning';
import { useUndoDelete } from '../../hooks/useUndoDelete';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { clearDraft, loadDraft, saveDraft } from '../../utils/sessionDraft';
import { apiFetch } from '../../services/apiFetch';
import { validateDispatchForm, validateShipmentForm } from '../../utils/validation';
import { useTranslation } from '../../i18n/useTranslation';
// autoptable has no types exposed here
// @ts-ignore
import autoTable from 'jspdf-autotable';

const DISPATCH_DRAFT_KEY = 'nordic-pms-draft-dispatch';
const INVALID_FIELD_CLASS = 'border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-red-500/10';

export const InventoryTab: React.FC = () => {
  const { outputEntries, dispatchEntries, addDispatchEntry, updateDispatchEntry, removeDispatchEntry, addDispatchShipment, removeDispatchShipment, updateDispatchShipment, buyers, products, setActiveTab, setEditingOutputId, userSettings, isHydrating, stockAdjustments, addStockAdjustment, removeStockAdjustment, addContract } = useStore();
  const undoableDelete = useUndoDelete();
  const { t } = useTranslation();
  const [showDispatchForm, setShowDispatchForm] = useState(false);
  const [showPallets, setShowPallets] = useState<boolean>(() => (userSettings?.defaultStockView === 'pallets'));
  const [editingDispatchId, setEditingDispatchId] = useState<string | null>(null);
  const [shipmentQty, setShipmentQty] = useState('');
  const [shipmentPkgString, setShipmentPkgString] = useState('');
  const [shipmentDate, setShipmentDate] = useState(new Date().toISOString().split('T')[0]);
  const [shipmentNote, setShipmentNote] = useState('');
  const [wizardTarget, setWizardTarget] = useState<'dispatch' | 'shipment'>('dispatch');
  const [investigateTarget, setInvestigateTarget] = useState<string | null>(null);
  const [showInvestigateModal, setShowInvestigateModal] = useState(false);

  // Form State
  const [dispatchStatus, setDispatchStatus] = useState<'confirmed' | 'planned'>('confirmed');
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedBuyerId, setSelectedBuyerId] = useState('');
  const [selectedBuyerCompanyCode, setSelectedBuyerCompanyCode] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(products[0]?.id || '');
  const [selectedContractId, setSelectedContractId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [pkgString, setPkgString] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [pricePerKg, setPricePerKg] = useState('');
  const [batchRef, setBatchRef] = useState('');

  // Confirmation State
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    type: 'standard' | 'override' | 'delete'; 
    message: string;
    pendingAction?: () => void;
  }>({
    isOpen: false,
    type: 'standard',
    message: ''
  });

  // Keyboard shortcuts: Ctrl+S → submit dispatch form, Escape → close form/modal
  const handleKeyboardSave = useCallback(() => {
    if (confirmState.isOpen) return;
    if (showDispatchForm) document.getElementById('dispatch-submit-btn')?.click();
  }, [showDispatchForm, confirmState.isOpen]);

  const handleKeyboardEscape = useCallback(() => {
    if (confirmState.isOpen) {
      setConfirmState(prev => ({ ...prev, isOpen: false }));
    } else if (editingDispatchId) {
      setEditingDispatchId(null);
    } else if (showDispatchForm) {
      setShowDispatchForm(false);
    }
  }, [confirmState.isOpen, editingDispatchId, showDispatchForm]);

  useKeyboardShortcuts({ onSave: handleKeyboardSave, onEscape: handleKeyboardEscape });

  // Bulk selection state
  const [selectedDispatchIds, setSelectedDispatchIds] = useState<Set<string>>(new Set());
  const [showBulkDispatch, setShowBulkDispatch] = useState(false);

  // Filter State
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState({ search: '', dateStart: '', dateEnd: '', status: 'all' as 'all' | 'confirmed' | 'planned', buyer: '', product: '' });
  const [localFilterSearch, setLocalFilterSearch] = useState('');
  const filterDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showArchivedContracts, setShowArchivedContracts] = useState(false);

  // Stock Correction state
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [corrProductId, setCorrProductId] = useState('');
  const [corrPallets, setCorrPallets] = useState('');
  const [corrBigBags, setCorrBigBags] = useState('');
  const [corrTanks, setCorrTanks] = useState('');
  const [corrLooseKg, setCorrLooseKg] = useState('');
  const [corrReason, setCorrReason] = useState<'initial_balance' | 'audit' | 'correction'>('correction');
  const [corrNote, setCorrNote] = useState('');
  const [corrSubmitting, setCorrSubmitting] = useState(false);
  const [corrError, setCorrError] = useState('');
  const [showAdjustmentHistory, setShowAdjustmentHistory] = useState(false);

  // Inline contract creation state
  const [showInlineContract, setShowInlineContract] = useState(false);
  const [inlineContractNumber, setInlineContractNumber] = useState('');
  const [inlineContractPrice, setInlineContractPrice] = useState('');
  const [inlineContractAmount, setInlineContractAmount] = useState('');
  const [inlineContractStart, setInlineContractStart] = useState(new Date().toISOString().split('T')[0]);
  const [inlineContractEnd, setInlineContractEnd] = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().split('T')[0]; });
  const [inlineContractSubmitting, setInlineContractSubmitting] = useState(false);
  const [inlineContractError, setInlineContractError] = useState('');

  useEffect(() => {
    if (buyers.length === 0) {
      if (selectedBuyerId) setSelectedBuyerId('');
      return;
    }

    if (!selectedBuyerId || !buyers.some((buyer) => buyer.id === selectedBuyerId)) {
      setSelectedBuyerId(buyers[0].id);
    }
  }, [buyers, selectedBuyerId]);

  useEffect(() => {
    if (products.length === 0) {
      if (selectedProduct) setSelectedProduct('');
      return;
    }

    if (!selectedProduct || !products.some((product) => product.id === selectedProduct)) {
      setSelectedProduct(products[0].id);
    }
  }, [products, selectedProduct]);

  // Derived: Current Buyer Object
  const currentBuyer = useMemo(() => buyers.find(b => b.id === selectedBuyerId), [buyers, selectedBuyerId]);
  const currentBuyerCompanyCodes = useMemo(() => parseCompanyCodes(currentBuyer?.companyCode), [currentBuyer?.companyCode]);
  
  // Derived: Active Product Object
  const activeProduct = useMemo(() => products.find(p => p.id === selectedProduct), [selectedProduct, products]);

  // Derived: Available Contracts for selected Buyer & Product
  const { activeContracts, archivedContracts } = useMemo(() => {
    if (!currentBuyer || !currentBuyer.contracts) return { activeContracts: [], archivedContracts: [] };
    const matching = currentBuyer.contracts.filter(c => c.productId === selectedProduct);
    const now = Date.now();
    const active: typeof matching = [];
    const archived: typeof matching = [];
    for (const c of matching) {
      const usedCount = dispatchEntries
        .filter(d => d.contractNumber === c.contractNumber && d.buyerId === currentBuyer.id)
        .length;
      const isPastEnd = c.endDate != null && c.endDate < now;
      const isUsed = usedCount > 0;
      if (isPastEnd || isUsed) {
        archived.push(c);
      } else {
        active.push(c);
      }
    }
    return { activeContracts: active, archivedContracts: archived };
  }, [currentBuyer, selectedProduct, dispatchEntries]);

  const allContracts = useMemo(() => [...activeContracts, ...archivedContracts], [activeContracts, archivedContracts]);

  // Auto-fill price when contract changes
  useEffect(() => {
    if (selectedContractId) {
       const contract = allContracts.find(c => c.id === selectedContractId);
       if (contract) {
         setPricePerKg(contract.pricePerKg.toString());
       }
    }
  }, [selectedContractId, allContracts]);

  useEffect(() => {
    if (currentBuyerCompanyCodes.length === 0) {
      if (selectedBuyerCompanyCode) setSelectedBuyerCompanyCode('');
      return;
    }

    if (!selectedBuyerCompanyCode || !currentBuyerCompanyCodes.includes(selectedBuyerCompanyCode)) {
      setSelectedBuyerCompanyCode(currentBuyerCompanyCodes[0]);
    }
  }, [currentBuyerCompanyCodes, selectedBuyerCompanyCode]);

  // Parse Packaging String automatically
  const parserPreview = useMemo(() => {
    if (!activeProduct) return null;
    return parsePackagingString(pkgString, activeProduct.defaultPalletWeight, activeProduct.defaultBagWeight);
  }, [pkgString, activeProduct]);
  const shipmentParserPreview = useMemo(() => {
    if (!editingDispatchId) return null;
    const entry = dispatchEntries.find((item) => item.id === editingDispatchId);
    const product = products.find((item) => item.id === entry?.productId);
    if (!product || !shipmentPkgString) return null;
    return parsePackagingString(shipmentPkgString, product.defaultPalletWeight, product.defaultBagWeight);
  }, [editingDispatchId, dispatchEntries, products, shipmentPkgString]);
  const dispatchErrors = useMemo(() => validateDispatchForm({
    buyerId: selectedBuyerId,
    productId: selectedProduct,
    dispatchDate,
    quantity,
    pricePerKg,
    parserPreview,
  }), [selectedBuyerId, selectedProduct, dispatchDate, quantity, pricePerKg, parserPreview]);
  const shipmentErrors = useMemo(() => validateShipmentForm({
    shipmentDate,
    shipmentQty,
    shipmentPkgString,
    parserPreview: shipmentParserPreview,
  }), [shipmentDate, shipmentQty, shipmentPkgString, shipmentParserPreview]);
  const hasDispatchChanges = Boolean(showDispatchForm && (editingDispatchId || selectedContractId || quantity || pkgString || pricePerKg || batchRef || shipmentQty || shipmentPkgString || shipmentNote));

  useUnsavedChangesWarning(hasDispatchChanges);

  useEffect(() => {
    if (editingDispatchId) return;
    const draft = loadDraft<any>(DISPATCH_DRAFT_KEY);
    if (!draft) return;
    if (draft.showDispatchForm) setShowDispatchForm(true);
    if (draft.dispatchStatus) setDispatchStatus(draft.dispatchStatus);
    if (draft.dispatchDate) setDispatchDate(draft.dispatchDate);
    if (draft.selectedBuyerId) setSelectedBuyerId(draft.selectedBuyerId);
    if (draft.selectedBuyerCompanyCode) setSelectedBuyerCompanyCode(draft.selectedBuyerCompanyCode);
    if (draft.selectedProduct) setSelectedProduct(draft.selectedProduct);
    if (draft.selectedContractId) setSelectedContractId(draft.selectedContractId);
    if (draft.quantity) setQuantity(draft.quantity);
    if (draft.pkgString) setPkgString(draft.pkgString);
    if (draft.pricePerKg) setPricePerKg(draft.pricePerKg);
    if (draft.batchRef) setBatchRef(draft.batchRef);
  }, [editingDispatchId]);

  useEffect(() => {
    if (editingDispatchId) return;
    saveDraft(DISPATCH_DRAFT_KEY, {
      showDispatchForm,
      dispatchStatus,
      dispatchDate,
      selectedBuyerId,
      selectedBuyerCompanyCode,
      selectedProduct,
      selectedContractId,
      quantity,
      pkgString,
      pricePerKg,
      batchRef,
    });
  }, [showDispatchForm, dispatchStatus, dispatchDate, selectedBuyerId, selectedBuyerCompanyCode, selectedProduct, selectedContractId, quantity, pkgString, pricePerKg, batchRef, editingDispatchId]);

  // Update quantity when parser updates
  useEffect(() => {
    if (parserPreview) {
      setQuantity(parserPreview.totalWeight > 0 ? parserPreview.totalWeight.toString() : '');
    }
  }, [parserPreview]);

  // Update shipment quantity when shipment packaging string updates
  useEffect(() => {
    if (editingDispatchId && shipmentPkgString) {
      const entry = dispatchEntries.find(e => e.id === editingDispatchId);
      if (entry) {
        const product = products.find(p => p.id === entry.productId);
        if (product) {
          const parsed = parsePackagingString(shipmentPkgString, product.defaultPalletWeight, product.defaultBagWeight);
          if (parsed.isValid) {
            setShipmentQty(parsed.totalWeight.toString());
          }
        }
      }
    }
  }, [shipmentPkgString, editingDispatchId, dispatchEntries]);

  // Derived values for currently editing dispatch (order/shipped/remaining)
  const editingEntry = editingDispatchId ? dispatchEntries.find(e => e.id === editingDispatchId) : null;
  const editingShippedSoFar = editingEntry ? (editingEntry.shipments || []).reduce((acc, s) => acc + (s.quantityKg || 0), 0) : 0;
  const editingOrderLimit = editingEntry ? (editingEntry.orderedQuantityKg ?? editingEntry.quantityKg ?? 0) : 0;
  const editingRemaining = editingOrderLimit - editingShippedSoFar;

  // Calculate current stock and Aging — ledgered by discrete units (pallets/bigBags/tanks)
  const stockLevels = useMemo(() => {
    return products.map(product => {
      const productOutputs = outputEntries.filter(e => e.productId === product.id);
      const productAdjustments = stockAdjustments.filter(a => a.productId === product.id);

      // Produced aggregates (from explicit segments or parsed totals)
      let producedKg = 0;
      let producedPallets = 0;
      let producedBigBags = 0;
      let producedTanks = 0;
      let producedPadKg = 0;
      let producedBbKg = 0;
      let producedTankKg = 0;
      const batchKgs: { timestamp: number; kg: number }[] = [];

      for (const out of productOutputs) {
        const prevProducedKg = producedKg;
        const segs = out.packagingString ? parsePackagingSegments(out.packagingString, product.defaultPalletWeight, product.defaultBagWeight) : [] as any[];
        if (segs.length > 0) {
          for (const seg of segs) {
            if (seg.unit === 'pad') { producedPallets += seg.count; const w = seg.unitWeight || product.defaultPalletWeight || 0; producedPadKg += seg.count * w; producedKg += seg.count * w; }
            else if (seg.unit === 'bb') { producedBigBags += seg.count; const w = seg.unitWeight || product.defaultBagWeight || 0; producedBbKg += seg.count * w; producedKg += seg.count * w; }
            else if (seg.unit === 'tank') { producedTanks += seg.count; const w = seg.unitWeight || 25000; producedTankKg += seg.count * w; producedKg += seg.count * w; }
            else if (seg.unit === 'kg') { producedKg += seg.count; }
          }
        } else if (out.parsed) {
          const p = out.parsed;
          // whole units
          const wholeP = Math.floor(p.pallets || 0);
          const fracP = (p.pallets || 0) - wholeP;
          if (wholeP > 0) { producedPallets += wholeP; producedPadKg += wholeP * (product.defaultPalletWeight || 0); producedKg += wholeP * (product.defaultPalletWeight || 0); }
          if (fracP > 1e-6) { producedPallets += 1; const pk = Math.round(fracP * (product.defaultPalletWeight || 0)); producedPadKg += pk; producedKg += pk; }

          const wholeB = Math.floor(p.bigBags || 0);
          const fracB = (p.bigBags || 0) - wholeB;
          if (wholeB > 0) { producedBigBags += wholeB; producedBbKg += wholeB * (product.defaultBagWeight || 0); producedKg += wholeB * (product.defaultBagWeight || 0); }
          if (fracB > 1e-6) { producedBigBags += 1; const bk = Math.round(fracB * (product.defaultBagWeight || 0)); producedBbKg += bk; producedKg += bk; }

          const wholeT = Math.floor(p.tanks || 0);
          const fracT = (p.tanks || 0) - wholeT;
          if (wholeT > 0) { producedTanks += wholeT; producedTankKg += wholeT * 25000; producedKg += wholeT * 25000; }
          if (fracT > 1e-6) { producedTanks += 1; const tk = Math.round(fracT * 25000); producedTankKg += tk; producedKg += tk; }
        }
        if (out.timestamp) batchKgs.push({ timestamp: out.timestamp, kg: producedKg - prevProducedKg });
      }

      // Shipments / dispatches
      let shippedKg = 0;
      let shippedPallets = 0;
      let shippedBigBags = 0;
      let shippedTanks = 0;
      let shippedPadKg = 0;
      let shippedBbKg = 0;
      let shippedTankKg = 0;
      let unmappedKgForUnits = 0;
      const fractionalOutputs: any[] = [];
      const problematicShipments: any[] = [];
      const unmappedDispatches: any[] = [];

      const relevantDispatches = dispatchEntries.filter(d => d.productId === product.id && d.status !== 'planned');
      for (const d of relevantDispatches) {
        if (Array.isArray(d.shipments) && d.shipments.length > 0) {
          for (const s of d.shipments) {
            shippedKg += s.quantityKg || 0;
            const segs = s.packagingString ? parsePackagingSegments(s.packagingString, product.defaultPalletWeight, product.defaultBagWeight) : [] as any[];
            if (segs.length > 0) {
              for (const seg of segs) {
                if (seg.unit === 'pad') { shippedPallets += seg.count; const w = seg.unitWeight || product.defaultPalletWeight || 0; shippedPadKg += seg.count * w; }
                else if (seg.unit === 'bb') { shippedBigBags += seg.count; const w = seg.unitWeight || product.defaultBagWeight || 0; shippedBbKg += seg.count * w; }
                else if (seg.unit === 'tank') { shippedTanks += seg.count; const w = seg.unitWeight || 25000; shippedTankKg += seg.count * w; }
                else if (seg.unit === 'kg') { /* loose kg */ }
              }
              if (s.parsed && s.parsed.totalWeight && Math.abs((s.parsed.totalWeight || 0) - (s.quantityKg || 0)) > 25) problematicShipments.push({ type: 'shipment', entry: s, dispatchId: d.id });
            } else if (s.parsed) {
              const p = s.parsed;
              const wholeP = Math.floor(p.pallets || 0);
              const fracP = (p.pallets || 0) - wholeP;
              if (wholeP > 0) { shippedPallets += wholeP; shippedPadKg += wholeP * (product.defaultPalletWeight || 0); }
              if (fracP > 1e-6) { unmappedKgForUnits += fracP * (product.defaultPalletWeight || 0); problematicShipments.push({ type: 'shipment', entry: s, dispatchId: d.id }); }

              const wholeB = Math.floor(p.bigBags || 0);
              const fracB = (p.bigBags || 0) - wholeB;
              if (wholeB > 0) { shippedBigBags += wholeB; shippedBbKg += wholeB * (product.defaultBagWeight || 0); }
              if (fracB > 1e-6) { unmappedKgForUnits += fracB * (product.defaultBagWeight || 0); problematicShipments.push({ type: 'shipment', entry: s, dispatchId: d.id }); }

              const wholeT = Math.floor(p.tanks || 0);
              const fracT = (p.tanks || 0) - wholeT;
              if (wholeT > 0) { shippedTanks += wholeT; shippedTankKg += wholeT * 25000; }
              if (fracT > 1e-6) { unmappedKgForUnits += fracT * 25000; problematicShipments.push({ type: 'shipment', entry: s, dispatchId: d.id }); }
            } else {
              unmappedKgForUnits += s.quantityKg || 0;
              problematicShipments.push({ type: 'shipment', entry: s, dispatchId: d.id });
            }
          }
        } else {
          // Do NOT deduct stock for confirmed / planned dispatches that have no shipments yet.
          // Mark as unmapped so user can investigate and the UI can surface it.
          unmappedDispatches.push(d);
          if (d.packagingString || d.parsed) problematicShipments.push({ type: 'dispatch', entry: d });
        }
      }

      // Identify fractional outputs from output entries
      for (const out of productOutputs) {
        const p = out.parsed || { pallets: 0, bigBags: 0, tanks: 0 } as any;
        if (!Number.isInteger(p.pallets || 0) || !Number.isInteger(p.bigBags || 0) || !Number.isInteger(p.tanks || 0)) {
          fractionalOutputs.push(out);
        }
      }

      // Stock adjustments (initial balances, audits, corrections)
      let adjKg = 0;
      let adjPallets = 0;
      let adjBigBags = 0;
      let adjTanks = 0;
      let adjLooseKg = 0;
      for (const a of productAdjustments) {
        adjKg += a.adjustmentKg || 0;
        adjPallets += a.pallets || 0;
        adjBigBags += a.bigBags || 0;
        adjTanks += a.tanks || 0;
        adjLooseKg += a.looseKg || 0;
      }

      const realStockKg = producedKg - shippedKg + adjKg;
      const currentStockKg = Math.max(0, realStockKg);

      // Ledgered units (integer counts)
      const currentStockPallets = Math.max(0, Math.round(producedPallets) - Math.round(shippedPallets) + Math.round(adjPallets));
      const currentStockBigBags = Math.max(0, Math.round(producedBigBags) - Math.round(shippedBigBags) + Math.round(adjBigBags));
      const currentStockTanks = Math.max(0, Math.round(producedTanks) - Math.round(shippedTanks) + Math.round(adjTanks));

      // Use product default weights for unit kg calculations
      const avgPadKg = product.defaultPalletWeight || 0;
      const avgBbKg = product.defaultBagWeight || 0;

      const expectedKgFromUnits = (currentStockPallets * avgPadKg) + (currentStockBigBags * avgBbKg) + (currentStockTanks * 25000);
      const looseKgEstimate = currentStockKg - expectedKgFromUnits;

      const hasFractionalInput = fractionalOutputs.length > 0 || problematicShipments.some(p => (
        (p.entry?.pallets && !Number.isInteger(p.entry.pallets)) || (p.entry?.bigBags && !Number.isInteger(p.entry.bigBags)) || (p.entry?.tanks && !Number.isInteger(p.entry.tanks))
      ));

      const looseWarning = unmappedKgForUnits > 0 || Math.abs(looseKgEstimate) > 50 || unmappedDispatches.length > 0 || problematicShipments.length > 0;

      // FIFO aging: only consider batches produced AFTER the latest initial_balance
      // adjustment, since that represents a verified stock reset point.
      let ageStatus: 'green' | 'yellow' | 'red' = 'green';
      if (currentStockKg > 50) {
        const initialBalances = productAdjustments.filter(a => a.type === 'initial_balance');
        const latestResetTs = initialBalances.length > 0
          ? Math.max(...initialBalances.map(a => new Date(a.timestamp).getTime()))
          : 0;
        const recentBatches = batchKgs
          .filter(b => b.timestamp > latestResetTs)
          .sort((a, b) => a.timestamp - b.timestamp);

        if (recentBatches.length > 0) {
          // FIFO within post-reset batches only
          const postResetProducedKg = recentBatches.reduce((sum, b) => sum + b.kg, 0);
          let consumed = Math.max(0, postResetProducedKg - currentStockKg);
          for (const batch of recentBatches) {
            if (consumed >= batch.kg) { consumed -= batch.kg; continue; }
            const ageDays = (Date.now() - batch.timestamp) / (1000 * 60 * 60 * 24);
            if (ageDays > 60) ageStatus = 'red';
            else if (ageDays > 30) ageStatus = 'yellow';
            break;
          }
        }
      }

      return {
        ...product,
        currentStockKg,
        realStockKg,
        currentStockPallets,
        currentStockBigBags,
        currentStockTanks,
        expectedKgFromUnits,
        looseKgEstimate,
        unmappedKgForUnits,
        fractionalOutputs,
        problematicShipments,
        unmappedDispatches,
        ageStatus,
        hasFractionalInput,
        looseWarning
      };
    });
  }, [outputEntries, dispatchEntries, products, stockAdjustments]);

  // Auto-map helpers
  const autoMapShipment = async (dispatchId: string, shipmentId: string, kg: number) => {
    const dispatch = dispatchEntries.find(d => d.id === dispatchId);
    if (!dispatch) return;
    const product = products.find(p => p.id === dispatch.productId);
    const inferred = inferPackagingStringFromKg(kg, product);
    try {
      await updateDispatchShipment(dispatchId, shipmentId, { packagingString: inferred });
    } catch (err) {
      console.error('Auto-map shipment failed', err);
    }
  };

  const autoMapDispatch = async (dispatchId: string, kg: number) => {
    const dispatch = dispatchEntries.find(d => d.id === dispatchId);
    if (!dispatch) return;
    const product = products.find(p => p.id === dispatch.productId);
    const inferred = inferPackagingStringFromKg(kg, product);
    try {
      await updateDispatchEntry(dispatchId, { packagingString: inferred });
    } catch (err) {
      console.error('Auto-map dispatch failed', err);
    }
  };

  const recomputeShipment = async (dispatchId: string, shipment: any) => {
    const dispatch = dispatchEntries.find(d => d.id === dispatchId);
    if (!dispatch) return;
    const product = products.find(p => p.id === dispatch.productId);
    try {
      const raw = shipment.packagingString || (shipment.quantityKg ? inferPackagingStringFromKg(shipment.quantityKg, product) : '');
      const normalized = normalizePackagingString(raw, product?.defaultPalletWeight || 900, product?.defaultBagWeight || 850).normalized;
      await updateDispatchShipment(dispatchId, shipment.id, { packagingString: normalized });
    } catch (err) {
      console.error('Recompute shipment failed', err);
    }
  };

  const recomputeDispatch = async (dispatch: any) => {
    const product = products.find(p => p.id === dispatch.productId);
    try {
      const raw = dispatch.packagingString || inferPackagingStringFromKg(dispatch.quantityKg || 0, product);
      const normalized = normalizePackagingString(raw, product?.defaultPalletWeight || 900, product?.defaultBagWeight || 850).normalized;
      await updateDispatchEntry(dispatch.id, { packagingString: normalized });
    } catch (err) {
      console.error('Recompute dispatch failed', err);
    }
  };

  const initiateDispatch = () => {
    if (Object.keys(dispatchErrors).length > 0) return;
    
    const qty = parseFloat(quantity);
    const price = parseFloat(pricePerKg);
    const buyerName = buyers.find(b => b.id === selectedBuyerId)?.name || 'Unknown';
    const contractNum = allContracts.find(c => c.id === selectedContractId)?.contractNumber;

    // Stock Check Logic
    const currentStock = stockLevels.find(p => p.id === selectedProduct)?.realStockKg || 0;
    
    // If editing, we need to add back the original quantity to the stock before checking
    let effectiveStock = currentStock;
    if (editingDispatchId) {
      const originalEntry = dispatchEntries.find(e => e.id === editingDispatchId);
      if (originalEntry && originalEntry.status === 'confirmed') {
        effectiveStock += originalEntry.quantityKg;
      }
    }

    const isNegativeStock = (effectiveStock - qty) < 0;

    // Construct Pending Data
    const pendingData = {
      date: new Date(dispatchDate).getTime(),
      buyer: buyerName,
      buyerId: selectedBuyerId,
      buyerName,
      buyerCompanyCode: selectedBuyerCompanyCode || getPrimaryCompanyCode(currentBuyer?.companyCode) || undefined,
      productId: selectedProduct,
      contractNumber: contractNum,
      quantityKg: dispatchStatus === 'planned' ? qty : (editingDispatchId ? (dispatchEntries.find(e => e.id === editingDispatchId)?.quantityKg || 0) : 0), 
      orderedQuantityKg: qty,
      packagingString: pkgString,
      parsed: parserPreview?.isValid ? {
        pallets: parserPreview.pallets,
        bigBags: parserPreview.bigBags,
        tanks: parserPreview.tanks,
        totalWeight: parserPreview.totalWeight
      } : undefined,
      batchRefId: batchRef || 'MIXED',
      salesPricePerKg: price,
      totalRevenue: (dispatchStatus === 'planned' ? qty : (editingDispatchId ? (dispatchEntries.find(e => e.id === editingDispatchId)?.quantityKg || 0) : 0)) * price,
      status: dispatchStatus,
      shipments: editingDispatchId ? (dispatchEntries.find(e => e.id === editingDispatchId)?.shipments || []) : []
    };

    const commitAction = () => {
       if (editingDispatchId) {
         updateDispatchEntry(editingDispatchId, pendingData);
       } else {
         addDispatchEntry(pendingData);
       }
       resetForm();
    };
    // Prevent fractional unit submits
    if (pendingData.parsed && anyFractional(pendingData.parsed)) {
      setConfirmState({ isOpen: true, type: 'standard', message: "Fractional pallets/bigbags/tanks not allowed. Use 'loose kg' for remainder." });
      return;
    }
    if (dispatchStatus === 'confirmed' && isNegativeStock) {
       setConfirmState({
          isOpen: true,
          type: 'override',
          message: `Warning: Confirmed dispatch of ${qty}kg will result in negative stock (Available: ${effectiveStock}kg). Admin authorization is required.`,
          pendingAction: commitAction
       });
    } else {
       // For Planned sales or Valid Confirmed Sales
       setConfirmState({
          isOpen: true,
          type: 'standard',
          message: editingDispatchId 
            ? `Update dispatch entry for ${buyerName}?`
            : (dispatchStatus === 'planned' 
                ? `Schedule PLANNED dispatch of ${qty}kg to ${buyerName} on ${dispatchDate}? Stock will not be deducted yet.`
                : `Confirm FINAL dispatch of ${qty}kg to ${buyerName}? Total Revenue: €${(qty*price).toLocaleString()}.`),
          pendingAction: commitAction
       });
    }
  };

  const convertToConfirmed = (entry: any) => {
    const currentStock = stockLevels.find(p => p.id === entry.productId)?.realStockKg || 0;
    const isNegativeStock = (currentStock - entry.quantityKg) < 0;

    const commitAction = () => {
      updateDispatchEntry(entry.id, { 
        status: 'confirmed',
        orderedQuantityKg: entry.orderedQuantityKg || entry.quantityKg,
        quantityKg: 0, // Reset shipped to 0 until shipments are added
        totalRevenue: 0,
        shipments: []
      });
    };

    if (isNegativeStock) {
      setConfirmState({
        isOpen: true,
        type: 'override',
        message: `Confirming this plan will result in negative stock (${currentStock}kg available). Proceed?`,
        pendingAction: commitAction
      });
    } else {
      setConfirmState({
        isOpen: true,
        type: 'standard',
        message: `Mark dispatch to ${entry.buyer} as CONFIRMED? Stock will be deducted and revenue recognized.`,
        pendingAction: commitAction
      });
    }
  };

  const handleDeleteEntry = (id: string) => {
    const item = dispatchEntries.find(d => d.id === id);
    if (!item) return;
    undoableDelete({
      label: `${item.buyerName} dispatch (${(item.orderedQuantityKg ?? item.quantityKg).toLocaleString()} kg)`,
      removeFromState: () => useStore.setState((s) => ({ dispatchEntries: s.dispatchEntries.filter(d => d.id !== id) })),
      restoreToState: () => useStore.setState((s) => ({ dispatchEntries: [item, ...s.dispatchEntries] })),
      apiEndpoint: `/api/dispatch-entries/${id}`,
    });
  };

  const bulkDeleteDispatches = () => {
    if (selectedDispatchIds.size === 0) return;
    const items = dispatchEntries.filter(e => selectedDispatchIds.has(e.id));
    const ids = [...selectedDispatchIds];
    undoableDelete({
      label: `${ids.length} dispatch ${ids.length === 1 ? 'entry' : 'entries'}`,
      removeFromState: () => useStore.setState((s) => ({ dispatchEntries: s.dispatchEntries.filter(e => !selectedDispatchIds.has(e.id)) })),
      restoreToState: () => useStore.setState((s) => ({ dispatchEntries: [...items, ...s.dispatchEntries] })),
      apiDelete: () => Promise.all(ids.map(id => apiFetch(`/api/dispatch-entries/${id}`, { method: 'DELETE' }))).then(() => {}),
    });
    setSelectedDispatchIds(new Set());
  };

  const handleConfirmModal = () => {
    if (confirmState.pendingAction) {
      confirmState.pendingAction();
    }
    setConfirmState(prev => ({ ...prev, isOpen: false }));
  };

  const handleEditDispatch = (entry: typeof dispatchEntries[0]) => {
    setEditingDispatchId(entry.id);
    setDispatchStatus(entry.status === 'completed' ? 'confirmed' : entry.status);
    setDispatchDate(new Date(entry.date).toISOString().split('T')[0]);
    
    const buyer = buyers.find(b => b.id === entry.buyerId) || buyers.find(b => b.name === entry.buyer);
    setSelectedBuyerId(buyer ? buyer.id : '');
    setSelectedBuyerCompanyCode(entry.buyerCompanyCode || getPrimaryCompanyCode(buyer?.companyCode) || '');
    
    setSelectedProduct(entry.productId);
    
    // Find contract if exists
    if (entry.contractNumber && buyer) {
       const contract = buyer.contracts.find(c => c.contractNumber === entry.contractNumber);
       setSelectedContractId(contract ? contract.id : '');
    } else {
       setSelectedContractId('');
    }

    setQuantity((entry.orderedQuantityKg || entry.quantityKg).toString());
    setPkgString(entry.packagingString || '');
    setBatchRef(entry.batchRefId || '');
    setPricePerKg(entry.salesPricePerKg.toString());
    
    setShowDispatchForm(true);
  };

  const handleAddShipment = async () => {
    if (!editingDispatchId || Object.keys(shipmentErrors).length > 0) return;
    const qty = parseFloat(shipmentQty);
    const entry = dispatchEntries.find(e => e.id === editingDispatchId);
    if (!entry) return;

    const product = products.find(p => p.id === entry.productId);
    const parsed = product && shipmentPkgString 
      ? parsePackagingString(shipmentPkgString, product.defaultPalletWeight, product.defaultBagWeight)
      : undefined;

    if (parsed && parsed.isValid && anyFractional(parsed)) {
      setConfirmState({ isOpen: true, type: 'standard', message: "Fractional pallets/bigbags/tanks not allowed. Use 'loose kg' for remainder." });
      return;
    }

    // Order limit enforcement (client-side): prefer orderedQuantityKg when present
    const shippedSoFar = (entry.shipments || []).reduce((acc, s) => acc + (s.quantityKg || 0), 0);
    const orderLimit = (entry.orderedQuantityKg ?? entry.quantityKg ?? 0);
    const remaining = orderLimit - shippedSoFar;

    const payload: any = {
      productId: entry.productId,
      date: new Date(shipmentDate).getTime(),
      quantityKg: qty,
      batchId: undefined,
      note: shipmentNote,
      packagingString: shipmentPkgString
    };

    if (orderLimit > 0 && qty > remaining) {
      setConfirmState({
        isOpen: true,
        type: 'override',
        message: `This shipment would exceed the ordered quantity. Ordered: ${orderLimit} kg, Shipped: ${shippedSoFar} kg, Attempting: ${qty} kg. Increase order to allow this shipment?`,
        pendingAction: async () => {
          // Increase the order to cover the new shipment, then add shipment
          await updateDispatchEntry(editingDispatchId, { orderedQuantityKg: shippedSoFar + qty });
          await addDispatchShipment(editingDispatchId, payload);
          setShipmentQty('');
          setShipmentPkgString('');
          setShipmentNote('');
        }
      });
      return;
    }

    await addDispatchShipment(editingDispatchId, payload);

    setShipmentQty('');
    setShipmentPkgString('');
    setShipmentNote('');
  };

  const handleRemoveShipment = async (shipmentId: string) => {
    if (!editingDispatchId) return;
    const entry = dispatchEntries.find(e => e.id === editingDispatchId);
    if (!entry || !entry.shipments) return;
    const shipment = entry.shipments.find(s => s.id === shipmentId);
    if (!shipment) return;

    undoableDelete({
      label: `Shipment (${shipment.quantityKg.toLocaleString()} kg)`,
      removeFromState: () => useStore.setState((s) => ({
        dispatchEntries: s.dispatchEntries.map(d => d.id === editingDispatchId
          ? { ...d, shipments: (d.shipments || []).filter(sh => sh.id !== shipmentId) }
          : d)
      })),
      restoreToState: () => useStore.setState((s) => ({
        dispatchEntries: s.dispatchEntries.map(d => d.id === editingDispatchId
          ? { ...d, shipments: [...(d.shipments || []), shipment] }
          : d)
      })),
      apiEndpoint: `/api/dispatch-entries/${editingDispatchId}/shipments/${shipmentId}`,
    });
  };

  const toggleComplete = (id: string, currentStatus: string) => {
    updateDispatchEntry(id, { status: currentStatus === 'completed' ? 'confirmed' : 'completed' });
  };

  const resetForm = () => {
    setShowDispatchForm(false);
    setEditingDispatchId(null);
    setQuantity('');
    setPkgString('');
    setBatchRef('');
    setPricePerKg('');
    setSelectedContractId('');
    setDispatchStatus('confirmed');
    setDispatchDate(new Date().toISOString().split('T')[0]);
    setSelectedBuyerCompanyCode('');
    setShipmentQty('');
    setShipmentPkgString('');
    setShipmentNote('');
    clearDraft(DISPATCH_DRAFT_KEY);
  };

  const generateInvoice = (entry: typeof dispatchEntries[0]) => {
    const doc = new jsPDF();
    const buyer = buyers.find(b => b.id === entry.buyerId) || buyers.find(b => b.name === entry.buyer);
    const invoiceCompanyCode = entry.buyerCompanyCode || getPrimaryCompanyCode(buyer?.companyCode) || '';

    // Header
    doc.setFontSize(22);
    doc.setTextColor(40);
    doc.text(entry.status === 'planned' ? 'PRO FORMA INVOICE' : 'COMMERCIAL INVOICE', 14, 20);

    // Supplier Info
    doc.setFontSize(10);
    doc.text('Nordic Proteins UAB', 14, 30);
    doc.text('Fractionation Plant 01', 14, 35);
    doc.text('Lithuania', 14, 40);

    // Buyer Info
    doc.setFontSize(12);
    doc.text('Bill To:', 14, 55);
    doc.setFontSize(10);
    doc.text(entry.buyer, 14, 62);
    if (buyer) {
      doc.text(buyer.addressLine1 || '', 14, 67);
      doc.text(buyer.country, 14, 72);
      doc.text(`VAT: ${invoiceCompanyCode}`, 14, 77);
    }

    // Invoice Details
    doc.text(`Date: ${formatDate(entry.date, (userSettings?.dateFormat || 'ISO'))}`, 140, 30);
    doc.text(`Ref #: ${entry.id.toUpperCase()}`, 140, 35);
    if (entry.contractNumber) {
        doc.text(`Contract: ${entry.contractNumber}`, 140, 40);
    }

    // Table
    autoTable(doc, {
      startY: 90,
      head: [['Product', 'Packaging', 'Quantity (kg)', 'Unit Price', 'Total']],
      body: [
        [
          entry.productId, 
          entry.packagingString || entry.batchRefId, 
          entry.quantityKg.toLocaleString(), 
          `€${entry.salesPricePerKg.toFixed(2)}`, 
          `€${entry.totalRevenue.toLocaleString()}`
        ]
      ],
      theme: 'striped',
      headStyles: { fillColor: entry.status === 'planned' ? [245, 158, 11] : [37, 99, 235] }
    });

    doc.save(`${entry.status === 'planned' ? 'ProForma' : 'Invoice'}_${entry.id}.pdf`);
  };

  // Filter Helpers
  const setDatePreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setFilters(prev => ({
      ...prev,
      dateStart: start.toISOString().split('T')[0],
      dateEnd: end.toISOString().split('T')[0]
    }));
  };

  // Filtering Logic
  const displayedDispatches = useMemo(() => {
    let data = [...dispatchEntries].sort((a, b) => b.date - a.date);

    if (showFilter) {
      if (filters.status !== 'all') {
        data = data.filter(e => e.status === filters.status);
      }
      if (filters.buyer) {
        data = data.filter(e => e.buyer === filters.buyer);
      }
      if (filters.product) {
        data = data.filter(e => e.productId === filters.product);
      }
      if (filters.search) {
        const lowerQ = filters.search.toLowerCase();
        data = data.filter(e => 
          e.buyer.toLowerCase().includes(lowerQ) ||
          e.productId.toLowerCase().includes(lowerQ) ||
          e.quantityKg.toString().includes(lowerQ) ||
          (e.batchRefId && e.batchRefId.toLowerCase().includes(lowerQ)) ||
          (e.contractNumber && e.contractNumber.toLowerCase().includes(lowerQ))
        );
      }
      if (filters.dateStart) {
        const startTs = new Date(filters.dateStart).getTime();
        data = data.filter(e => e.date >= startTs);
      }
      if (filters.dateEnd) {
        const endTs = new Date(filters.dateEnd).setHours(23, 59, 59, 999);
        data = data.filter(e => e.date <= endTs);
      }
      return data;
    }

    return data.slice(0, 10); // Show 10 recent
  }, [dispatchEntries, showFilter, filters]);

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      
      <ConfirmationModal 
        isOpen={confirmState.isOpen}
        title={confirmState.type === 'override' ? "Stock Override Required" : (confirmState.type === 'delete' ? "Delete Entry" : "Confirm Action")}
        message={confirmState.message}
        onConfirm={handleConfirmModal}
        onClose={() => setConfirmState(prev => ({...prev, isOpen: false}))}
        requireAuth={confirmState.type === 'override'}
        isDanger={confirmState.type === 'delete' || confirmState.type === 'override'}
      />

      <PackagingWizard 
        isOpen={showWizard} 
        onClose={() => setShowWizard(false)} 
        onApply={(str) => {
          if (wizardTarget === 'dispatch') setPkgString(str);
          else setShipmentPkgString(str);
        }}
        defaultPallet={activeProduct?.defaultPalletWeight || 900}
        defaultBag={activeProduct?.defaultBagWeight || 850}
      />

      {isHydrating ? (
        <div className="p-6 text-center">Loading products…</div>
      ) : (
        <>

      {/* Investigate Modal */}
      {showInvestigateModal && investigateTarget && (() => {
        const item = stockLevels.find(s => s.id === investigateTarget);
        if (!item) return null;
        return (
          <div className="fixed inset-0 z-[120] bg-black/30 flex items-start justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-y-auto ring-1 ring-slate-900/10">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold">Investigate: {item.name}</div>
                  <div className="text-xs text-slate-500">Issues found: {item.fractionalOutputs.length + item.problematicShipments.length + item.unmappedDispatches.length}</div>
                </div>
                <div>
                  <button onClick={() => setShowInvestigateModal(false)} className="text-slate-400 hover:text-slate-700">Close</button>
                </div>
              </div>
              <div className="p-4 space-y-3">
                {item.fractionalOutputs.length > 0 && (
                  <div>
                    <div className="text-xs font-bold text-red-600">Output entries with fractional unit counts</div>
                    <div className="mt-2 space-y-1">
                      {item.fractionalOutputs.map((o:any) => (
                        <div key={o.id} className="flex items-center justify-between bg-slate-50 p-2 rounded text-sm">
                          <div>
                            <div className="font-medium">Output • {formatDate(o.timestamp, userSettings?.dateFormat || 'ISO')}</div>
                            <div className="text-xs text-slate-500">Packaging: {o.packagingString || '-'}</div>
                            <div className="text-xs text-slate-500">pallets:{o.parsed?.pallets} bb:{o.parsed?.bigBags} tanks:{o.parsed?.tanks} total:{o.parsed?.totalWeight}kg</div>
                          </div>
                          <div className="text-right">
                            <button onClick={() => { setActiveTab('input'); setEditingOutputId(o.id); }} className="text-xs text-blue-600 font-bold">Edit</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {item.problematicShipments.length > 0 && (
                  <div>
                    <div className="text-xs font-bold text-amber-600">Problematic shipments</div>
                    <div className="mt-2 space-y-1">
                      {item.problematicShipments.map((s:any, idx:number) => (
                        <div key={idx} className="flex items-center justify-between bg-slate-50 p-2 rounded text-sm">
                          <div>
                            <div className="font-medium">{s.type === 'shipment' ? 'Shipment' : 'Dispatch'} • {s.entry?.date ? formatDate(s.entry.date, userSettings?.dateFormat || 'ISO') : ''}</div>
                            <div className="text-xs text-slate-500">Packaging: {s.entry?.packagingString || '-'}</div>
                            <div className="text-xs text-slate-500">pallets:{s.entry?.parsed?.pallets} bb:{s.entry?.parsed?.bigBags} tanks:{s.entry?.parsed?.tanks} total:{s.entry?.parsed?.totalWeight || s.entry?.quantityKg}kg</div>
                          </div>
                          <div className="text-right">
                            {s.type === 'shipment' ? (
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex gap-2">
                                  <button onClick={() => { recomputeShipment(s.dispatchId, s.entry); }} className="text-xs text-slate-700 bg-slate-100 px-2 py-1 rounded">Recompute</button>
                                  <button onClick={() => { autoMapShipment(s.dispatchId, s.entry.id, s.entry.quantityKg); }} className="text-xs text-blue-600 font-bold">Auto-map</button>
                                </div>
                                <button onClick={() => { setInvestigateTarget(null); setShowInvestigateModal(false); setEditingDispatchId(s.dispatchId || s.entry?.dispatchEntryId); setShowDispatchForm(true); setActiveTab('inventory'); }} className="text-xs text-blue-600 font-bold">Edit Dispatch</button>
                              </div>
                            ) : (
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex gap-2">
                                  <button onClick={() => { recomputeDispatch(s.entry); }} className="text-xs text-slate-700 bg-slate-100 px-2 py-1 rounded">Recompute</button>
                                  <button onClick={() => { autoMapDispatch(s.entry.id, s.entry.quantityKg); }} className="text-xs text-blue-600 font-bold">Auto-map</button>
                                </div>
                                <button onClick={() => { setInvestigateTarget(null); setShowInvestigateModal(false); setEditingDispatchId(s.dispatchId || s.entry?.dispatchEntryId); setShowDispatchForm(true); setActiveTab('inventory'); }} className="text-xs text-blue-600 font-bold">Edit Dispatch</button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {item.unmappedDispatches.length > 0 && (
                  <div>
                    <div className="text-xs font-bold text-amber-600">Unmapped dispatches</div>
                    <div className="mt-2 space-y-1">
                      {item.unmappedDispatches.map((d:any) => (
                        <div key={d.id} className="flex items-center justify-between bg-slate-50 p-2 rounded text-sm">
                          <div>
                            <div className="font-medium">Dispatch • {formatDate(d.date, userSettings?.dateFormat || 'ISO')}</div>
                            <div className="text-xs text-slate-500">Packaging: {d.packagingString || '-'}</div>
                            <div className="text-xs text-slate-500">QuantityKg: {d.quantityKg}</div>
                          </div>
                          <div className="text-right">
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex gap-2">
                                <button onClick={() => { recomputeDispatch(d); }} className="text-xs text-slate-700 bg-slate-100 px-2 py-1 rounded">Recompute</button>
                                <button onClick={() => { autoMapDispatch(d.id, d.quantityKg); }} className="text-xs text-blue-600 font-bold">Auto-map</button>
                              </div>
                              <button onClick={() => { setInvestigateTarget(null); setShowInvestigateModal(false); setEditingDispatchId(d.id); setShowDispatchForm(true); setActiveTab('inventory'); }} className="text-xs text-blue-600 font-bold">Edit</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Header with Toggle */}
      <div className="flex items-center justify-between shrink-0">
         <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Package size={16}/> {t('inventory.stockOverview')}
         </h2>
         <div className="flex bg-slate-200 p-1 rounded-lg">
            <button 
               onClick={() => setShowPallets(false)}
               className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${!showPallets ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
            >
               {t('inventory.viewKg')}
            </button>
            <button 
               onClick={() => setShowPallets(true)}
               className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${showPallets ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
            >
               {t('inventory.viewPallets')}
            </button>
         </div>
      </div>

      {/* Stock Cards with Silo Aging */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 shrink-0">
        {stockLevels.map(item => (
          <GlassCard key={item.id} className={`p-4 flex flex-col justify-between min-h-[100px] border-b-4 ${
            item.ageStatus === 'red' ? 'border-b-red-500 bg-red-50/50' :
            item.ageStatus === 'yellow' ? 'border-b-amber-400' : 'border-b-emerald-500'
          }`}>
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{item.name}</span>
              {showPallets ? <Tag size={16} className="text-slate-300"/> : <Scale size={16} className="text-slate-300"/>}
            </div>
            <div>
              {showPallets ? (
                <div className="flex flex-col">
                   <div className={`text-xl font-mono font-bold ${item.hasFractionalInput ? 'text-red-600' : 'text-slate-800'}`}>
                     {Math.round(item.currentStockPallets).toLocaleString()} <span className="text-sm font-normal text-slate-400">pad</span>
                   </div>
                   <div className={`text-sm font-mono font-bold ${item.hasFractionalInput ? 'text-red-600' : 'text-slate-600'}`}>
                     {Math.round(item.currentStockBigBags).toLocaleString()} <span className="text-xs font-normal text-slate-400">bb</span>
                   </div>
                   {item.currentStockTanks > 0 && (
                     <div className={`text-sm font-mono font-bold ${item.hasFractionalInput ? 'text-red-600' : 'text-slate-600'}`}>
                       {Math.round(item.currentStockTanks).toLocaleString()} <span className="text-xs font-normal text-slate-400">tank</span>
                     </div>
                   )}
                   {item.hasFractionalInput && (
                     <div className="text-[9px] text-red-600 font-bold mt-1 leading-tight">{t('inventory.errorFractional')}</div>
                   )}
                   {!item.hasFractionalInput && item.looseWarning && (
                     <div className="text-[10px] text-amber-600 font-bold mt-1 leading-tight">{t('inventory.warningVariance')}</div>
                   )}
                   {item.unmappedKgForUnits > 0 && (
                     <div className="text-[11px] text-slate-600 mt-1">{t('inventory.unmappedShipped')}: {Math.round(item.unmappedKgForUnits).toLocaleString()} kg</div>
                   )}
                   {Math.abs(item.looseKgEstimate || 0) > 50 && (
                     <div className="text-[11px] text-slate-600 mt-1">{t('inventory.variance')}: {Math.round(item.looseKgEstimate).toLocaleString()} kg</div>
                   )}
                   {item.looseKgEstimate > 0 && item.defaultPalletWeight > 0 && item.looseKgEstimate >= item.defaultPalletWeight && (
                     <div className="text-[10px] text-emerald-600 font-bold mt-1">
                       ↑ {Math.floor(item.looseKgEstimate / item.defaultPalletWeight)} loose pallet(s) can be consolidated
                     </div>
                   )}
                   {(item.currentStockPallets > 0 || item.currentStockBigBags > 0) && (
                     <div className="text-[10px] text-slate-500 mt-1">
                       {item.currentStockPallets > 0 ? `Avg pad: ${item.defaultPalletWeight || 0} kg` : ''}
                       {item.currentStockBigBags > 0 && <span className="ml-2">Avg bb: {item.defaultBagWeight || 0} kg</span>}
                     </div>
                   )}
                   {(item.hasFractionalInput || item.looseWarning || item.unmappedKgForUnits > 0) && (
                     <button onClick={() => { setInvestigateTarget(item.id); setShowInvestigateModal(true); }} className="mt-2 text-xs text-blue-600 font-bold underline">{t('inventory.investigate')}</button>
                   )}
                </div>
              ) : (
                <div className={`text-2xl font-mono font-bold ${item.realStockKg < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                  {item.currentStockKg.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              )}
              
              <div className="text-[10px] text-slate-400 font-medium flex justify-between mt-1">
                <span>{showPallets ? t('inventory.stockMix') : t('inventory.kgInStock')}</span>
                {item.ageStatus === 'red' && <span className="text-red-600 font-bold animate-pulse">{t('inventory.aging')}</span>}
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Stock Adjustments Section */}
      <div className="flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Calculator size={16}/> {t('inventory.stockCorrection')}
          </h2>
          <div className="flex gap-2">
            <button onClick={() => setShowAdjustmentHistory(!showAdjustmentHistory)} className="px-3 py-1 text-xs font-bold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all">
              {showAdjustmentHistory ? t('inventory.hideHistory') : t('inventory.history')} ({stockAdjustments.length})
            </button>
            <button onClick={() => { setShowCorrectionForm(!showCorrectionForm); setCorrError(''); }} className="px-3 py-1 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all flex items-center gap-1">
              <Plus size={12}/> {t('inventory.newCorrection')}
            </button>
          </div>
        </div>

        {showCorrectionForm && (
          <GlassCard className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-bold text-slate-500 mb-1">{t('common.product')}</label>
                <select value={corrProductId} onChange={e => setCorrProductId(e.target.value)} className="w-full p-2 text-sm border rounded-lg bg-white">
                  <option value="">{t('inventory.selectProduct')}</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">{t('inventory.reason')}</label>
                <select value={corrReason} onChange={e => setCorrReason(e.target.value as any)} className="w-full p-2 text-sm border rounded-lg bg-white">
                  <option value="correction">{t('inventory.reasonCorrection')}</option>
                  <option value="audit">{t('inventory.reasonAudit')}</option>
                  <option value="initial_balance">{t('inventory.reasonInitialBalance')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">{t('inventory.palletsAdj')}</label>
                <input type="number" value={corrPallets} onChange={e => setCorrPallets(e.target.value)} placeholder="0" className="w-full p-2 text-sm border rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">{t('inventory.bigBagsAdj')}</label>
                <input type="number" value={corrBigBags} onChange={e => setCorrBigBags(e.target.value)} placeholder="0" className="w-full p-2 text-sm border rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">{t('inventory.tanksAdj')}</label>
                <input type="number" value={corrTanks} onChange={e => setCorrTanks(e.target.value)} placeholder="0" className="w-full p-2 text-sm border rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">{t('inventory.looseKgAdj')}</label>
                <input type="number" value={corrLooseKg} onChange={e => setCorrLooseKg(e.target.value)} placeholder="0" className="w-full p-2 text-sm border rounded-lg" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-1">{t('common.note')}</label>
                <input type="text" value={corrNote} onChange={e => setCorrNote(e.target.value)} placeholder={t('inventory.correctionReason')} className="w-full p-2 text-sm border rounded-lg" />
              </div>
            </div>
            {corrProductId && (
              <div className="mt-2 text-xs text-slate-500">
                {(() => {
                  const prod = products.find(p => p.id === corrProductId);
                  if (!prod) return null;
                  const pads = Number(corrPallets) || 0;
                  const bbs = Number(corrBigBags) || 0;
                  const tnks = Number(corrTanks) || 0;
                  const loose = Number(corrLooseKg) || 0;
                  const totalKg = (pads * (prod.defaultPalletWeight || 0)) + (bbs * (prod.defaultBagWeight || 0)) + (tnks * 25000) + loose;
                  return <span>{t('inventory.totalAdjustment')}: <strong>{totalKg >= 0 ? '+' : ''}{totalKg.toLocaleString()} kg</strong></span>;
                })()}
              </div>
            )}
            {corrError && <div className="mt-2 text-xs text-red-600 font-bold">{corrError}</div>}
            <div className="flex gap-2 mt-3">
              <button
                disabled={corrSubmitting || !corrProductId}
                onClick={async () => {
                  const prod = products.find(p => p.id === corrProductId);
                  if (!prod) return;
                  const pads = Number(corrPallets) || 0;
                  const bbs = Number(corrBigBags) || 0;
                  const tnks = Number(corrTanks) || 0;
                  const loose = Number(corrLooseKg) || 0;
                  const totalKg = (pads * (prod.defaultPalletWeight || 0)) + (bbs * (prod.defaultBagWeight || 0)) + (tnks * 25000) + loose;
                  if (totalKg === 0 && pads === 0 && bbs === 0 && tnks === 0) { setCorrError(t('inventory.enterAdjustment')); return; }
                  setCorrSubmitting(true);
                  setCorrError('');
                  try {
                    await addStockAdjustment({
                      productId: corrProductId,
                      adjustmentKg: totalKg,
                      pallets: pads,
                      bigBags: bbs,
                      tanks: tnks,
                      looseKg: loose,
                      reason: corrNote || corrReason,
                      type: corrReason,
                    });
                    setCorrProductId(''); setCorrPallets(''); setCorrBigBags(''); setCorrTanks(''); setCorrLooseKg(''); setCorrNote('');
                    setShowCorrectionForm(false);
                  } catch (err: any) {
                    setCorrError(err?.message || t('inventory.failedSaveCorrection'));
                  } finally {
                    setCorrSubmitting(false);
                  }
                }}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-all"
              >
                {corrSubmitting ? t('common.saving') : t('inventory.saveCorrection')}
              </button>
              <button onClick={() => setShowCorrectionForm(false)} className="px-4 py-2 text-xs font-bold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all">{t('common.cancel')}</button>
            </div>
          </GlassCard>
        )}

        {showAdjustmentHistory && stockAdjustments.length > 0 && (
          <GlassCard className="p-4 max-h-64 overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="p-1">{t('common.date')}</th>
                  <th className="p-1">{t('common.product')}</th>
                  <th className="p-1">{t('common.status')}</th>
                  <th className="p-1 text-right">{t('common.pallets')}</th>
                  <th className="p-1 text-right">{t('inventory.bigBags')}</th>
                  <th className="p-1 text-right">{t('inventory.looseKg')}</th>
                  <th className="p-1 text-right">{t('inventory.totalKg')}</th>
                  <th className="p-1">{t('common.note')}</th>
                  <th className="p-1 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stockAdjustments.map(adj => {
                  const prod = products.find(p => p.id === adj.productId);
                  return (
                    <tr key={adj.id} className="hover:bg-slate-50">
                      <td className="p-1">{adj.timestamp ? formatDate(adj.timestamp) : '—'}</td>
                      <td className="p-1 font-bold">{prod?.name || adj.productId}</td>
                      <td className="p-1"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${adj.type === 'initial_balance' ? 'bg-blue-100 text-blue-700' : adj.type === 'audit' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{adj.type.replace('_', ' ')}</span></td>
                      <td className="p-1 text-right font-mono">{adj.pallets !== 0 ? (adj.pallets > 0 ? '+' : '') + adj.pallets : '—'}</td>
                      <td className="p-1 text-right font-mono">{adj.bigBags !== 0 ? (adj.bigBags > 0 ? '+' : '') + adj.bigBags : '—'}</td>
                      <td className="p-1 text-right font-mono">{adj.looseKg !== 0 ? (adj.looseKg > 0 ? '+' : '') + adj.looseKg : '—'}</td>
                      <td className="p-1 text-right font-mono font-bold">{adj.adjustmentKg >= 0 ? '+' : ''}{adj.adjustmentKg.toLocaleString()}</td>
                      <td className="p-1 text-slate-500 truncate max-w-[120px]" title={adj.reason}>{adj.reason}</td>
                      <td className="p-1"><button onClick={() => { const a = adj; undoableDelete({ label: `${a.type.replace('_', ' ')} adjustment (${a.adjustmentKg.toLocaleString()} kg)`, removeFromState: () => useStore.setState((s) => ({ stockAdjustments: s.stockAdjustments.filter(sa => sa.id !== a.id) })), restoreToState: () => useStore.setState((s) => ({ stockAdjustments: [a, ...s.stockAdjustments] })), apiEndpoint: `/api/stock-adjustments/${a.id}` }); }} className="text-red-400 hover:text-red-600"><Trash2 size={12}/></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </GlassCard>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        
        {/* Left: Dispatch Actions & Recent Log */}
        <div className="flex-1 flex flex-col gap-4">
          <div className="flex items-center justify-between shrink-0">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
              <Truck size={16} /> {t('inventory.dispatchLog')}
            </h3>
            <button 
              onClick={() => {
                resetForm();
                setShowDispatchForm(!showDispatchForm);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg font-medium transition-all shadow-sm flex items-center gap-2"
            >
              <ArrowUpRight size={16} /> {t('inventory.newEntry')}
            </button>
          </div>

          {showDispatchForm && (
            <div className={`animate-slide-up bg-white border rounded-xl p-4 shadow-lg ring-4 z-10 shrink-0 ${dispatchStatus === 'confirmed' ? 'border-blue-200 ring-blue-50' : 'border-amber-200 ring-amber-50'}`}>
              {editingDispatchId && (
                 <div className="flex items-center gap-2 text-amber-700 text-xs font-bold uppercase tracking-wider mb-2">
                   <div className="bg-amber-100 p-1 rounded"><Pencil size={12} /></div> {t('inventory.editingEntry')}
                 </div>
              )}

              {/* Status Toggle & Date */}
              <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-100">
                 <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button onClick={() => setDispatchStatus('confirmed')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${dispatchStatus === 'confirmed' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}>
                       <CheckCircle2 size={14}/> {t('inventory.confirmedSale')}
                    </button>
                    <button onClick={() => setDispatchStatus('planned')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${dispatchStatus === 'planned' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500'}`}>
                       <Clock size={14}/> {t('inventory.plannedOrder')}
                    </button>
                 </div>
                 <input 
                    type="date"
                    value={dispatchDate}
                    onChange={e => setDispatchDate(e.target.value)}
                    className={`bg-white border rounded-md px-3 py-1.5 text-xs text-slate-700 font-medium outline-none focus:ring-2 focus:ring-blue-100 ${dispatchErrors.dispatchDate ? INVALID_FIELD_CLASS : 'border-slate-300'}`}
                 />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Buyer</label>
                  <select 
                    value={selectedBuyerId}
                    onChange={(e) => {
                         setSelectedBuyerId(e.target.value);
                         const nextBuyer = buyers.find(b => b.id === e.target.value);
                         setSelectedBuyerCompanyCode(getPrimaryCompanyCode(nextBuyer?.companyCode) || '');
                         setSelectedContractId(''); // Reset contract on buyer change
                         setPricePerKg('');
                    }}
                    className={`w-full bg-white border text-slate-900 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${dispatchErrors.buyerId ? INVALID_FIELD_CLASS : 'border-slate-300'}`}
                  >
                    {buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">{t('inventory.companyCodeInvoice')}</label>
                  <select
                    value={selectedBuyerCompanyCode}
                    onChange={(e) => setSelectedBuyerCompanyCode(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-900 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    disabled={currentBuyerCompanyCodes.length <= 1}
                  >
                    {currentBuyerCompanyCodes.length === 0 && <option value="">{t('inventory.noCodeAvailable')}</option>}
                    {currentBuyerCompanyCodes.map((code) => <option key={code} value={code}>{code}</option>)}
                  </select>
                  <div className="mt-1 text-[11px] text-slate-400">{t('inventory.usedOnInvoice')}</div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">{t('common.product')}</label>
                  <select 
                    value={selectedProduct}
                    onChange={(e) => {
                        setSelectedProduct(e.target.value);
                        setSelectedContractId('');
                        setPricePerKg('');
                        // Clear quantity as unit weights might change
                        setQuantity('');
                        setPkgString('');
                    }}
                    className={`w-full bg-white border text-slate-900 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${dispatchErrors.productId ? INVALID_FIELD_CLASS : 'border-slate-300'}`}
                  >
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                
                {/* Contract Selection */}
                <div className="md:col-span-2">
                   <div className="flex items-center justify-between mb-1">
                     <label className="text-xs font-semibold text-slate-500">{t('inventory.contractOptional')}</label>
                     {archivedContracts.length > 0 && (
                       <button
                         type="button"
                         onClick={() => setShowArchivedContracts(!showArchivedContracts)}
                         className="text-[10px] text-slate-400 hover:text-blue-600 font-medium"
                       >
                         {showArchivedContracts ? t('inventory.hideExpired') : t('inventory.showExpired')} ({archivedContracts.length})
                       </button>
                     )}
                   </div>
                   <div className="flex gap-1">
                     <select
                        value={selectedContractId}
                        onChange={(e) => setSelectedContractId(e.target.value)}
                        className="flex-1 bg-white border border-slate-300 text-slate-900 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                     >
                        <option value="">-- {t('inventory.noContract')} --</option>
                        {activeContracts.length > 0 && (
                          <optgroup label={t('inventory.active')}>
                            {activeContracts.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.contractNumber} — €{c.pricePerKg}/kg{c.agreedAmountKg ? ` (${c.agreedAmountKg.toLocaleString()} kg)` : ''}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {showArchivedContracts && archivedContracts.length > 0 && (
                          <optgroup label={t('inventory.expiredFulfilled')}>
                            {archivedContracts.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.contractNumber} — €{c.pricePerKg}/kg (archived)
                              </option>
                            ))}
                          </optgroup>
                        )}
                     </select>
                     <button
                       type="button"
                       onClick={() => { setShowInlineContract(!showInlineContract); setInlineContractError(''); }}
                       className={`p-2 rounded-md border text-sm font-bold transition-colors ${showInlineContract ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-white border-slate-300 text-slate-500 hover:text-blue-600 hover:border-blue-300'}`}
                       title="Quick-add contract"
                     >
                       <Plus size={14} />
                     </button>
                   </div>
                   {showInlineContract && (
                     <div className="mt-2 p-2.5 bg-blue-50/60 border border-blue-200 rounded-lg space-y-2">
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                         <input className="bg-white border border-slate-300 rounded p-1.5 text-xs" placeholder="Contract No.*" value={inlineContractNumber} onChange={e => setInlineContractNumber(e.target.value)} />
                         <input type="number" className="bg-white border border-slate-300 rounded p-1.5 text-xs" placeholder="Price €/kg*" value={inlineContractPrice} onChange={e => setInlineContractPrice(e.target.value)} step="0.01" />
                         <input type="number" className="bg-white border border-slate-300 rounded p-1.5 text-xs" placeholder="Amount (kg)" value={inlineContractAmount} onChange={e => setInlineContractAmount(e.target.value)} />
                         <div className="flex gap-1">
                           <input type="date" className="flex-1 bg-white border border-slate-300 rounded p-1.5 text-[10px]" value={inlineContractStart} onChange={e => setInlineContractStart(e.target.value)} title="Start date" />
                           <input type="date" className="flex-1 bg-white border border-slate-300 rounded p-1.5 text-[10px]" value={inlineContractEnd} onChange={e => setInlineContractEnd(e.target.value)} title="End date" />
                         </div>
                       </div>
                       {inlineContractError && <div className="text-xs text-red-600">{inlineContractError}</div>}
                       <div className="flex gap-2">
                         <button
                           type="button"
                           disabled={inlineContractSubmitting || !inlineContractNumber.trim() || !inlineContractPrice}
                           onClick={async () => {
                             if (!selectedBuyerId || !selectedProduct) return;
                             setInlineContractSubmitting(true);
                             setInlineContractError('');
                             try {
                               await addContract(selectedBuyerId, {
                                 contractNumber: inlineContractNumber.trim(),
                                 productId: selectedProduct,
                                 pricePerKg: parseFloat(inlineContractPrice) || 0,
                                 agreedAmountKg: parseFloat(inlineContractAmount) || 0,
                                 startDate: new Date(inlineContractStart).getTime(),
                                 endDate: new Date(inlineContractEnd).getTime(),
                               });
                               setInlineContractNumber(''); setInlineContractPrice(''); setInlineContractAmount('');
                               setShowInlineContract(false);
                             } catch (err: any) {
                               setInlineContractError(err?.message || t('inventory.failedCreateContract'));
                             } finally {
                               setInlineContractSubmitting(false);
                             }
                           }}
                           className="px-3 py-1 text-xs font-bold rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-all"
                         >
                           {inlineContractSubmitting ? t('common.saving') : t('inventory.addContract')}
                         </button>
                         <button type="button" onClick={() => setShowInlineContract(false)} className="px-3 py-1 text-xs font-bold rounded bg-slate-100 text-slate-600 hover:bg-slate-200">{t('common.cancel')}</button>
                       </div>
                     </div>
                   )}
                </div>

                <div className="relative">
                  <label className="text-xs font-semibold text-slate-500 block mb-1 flex items-center gap-2">
                    {t('common.quantity')} <span className="text-slate-400 font-normal italic text-[10px] md:text-xs">(e.g. "10 pad")</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                       <input 
                          type="text" 
                          value={pkgString}
                          onChange={(e) => setPkgString(e.target.value)}
                          placeholder="e.g. 10 pad"
                          className={`w-full bg-white border text-slate-900 rounded-md pl-3 pr-10 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${dispatchErrors.packagingString || dispatchErrors.quantity ? INVALID_FIELD_CLASS : 'border-slate-300'}`}
                        />
                        <button 
                           onClick={() => {
                             setWizardTarget('dispatch');
                             setShowWizard(true);
                           }}
                           className="absolute right-2 top-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded p-1"
                           title="Open Packaging Wizard"
                        >
                           <Calculator size={16} />
                        </button>
                    </div>
                  </div>
                  {/* Manual Override hidden if parsed is active, or shown as readonly result */}
                  <div className="mt-1 flex justify-end text-xs font-bold text-slate-500">
                     {t('inventory.result')}: {quantity ? `${parseFloat(quantity).toLocaleString()} kg` : '0 kg'}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                     {dispatchStatus === 'planned' ? t('inventory.estPrice') : t('inventory.salesPrice')}
                  </label>
                  <input 
                    type="number"
                    value={pricePerKg}
                    onChange={(e) => setPricePerKg(e.target.value)}
                    className={`w-full bg-white border text-emerald-900 rounded-md p-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 ${dispatchErrors.pricePerKg ? INVALID_FIELD_CLASS : 'border-emerald-300'}`}
                    placeholder="e.g. 5.50"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">{t('inventory.batchRefOptional')}</label>
                  <input 
                    type="text"
                    value={batchRef}
                    onChange={(e) => setBatchRef(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-900 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    placeholder="Batch ID..."
                  />
                </div>
              </div>

              {/* Shipments Management Section */}
              {editingDispatchId && (dispatchStatus === 'confirmed' || dispatchEntries.find(e => e.id === editingDispatchId)?.status === 'completed') && (
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Box size={14} /> {t('inventory.shipmentsTracking')}
                  </h4>
                  <div className="mb-3 text-xs text-slate-600 flex items-center gap-4">
                    <div><span className="font-bold">{t('inventory.ordered')}:</span> {editingOrderLimit.toLocaleString()} kg</div>
                    <div><span className="font-bold">{t('inventory.shipped')}:</span> {editingShippedSoFar.toLocaleString()} kg</div>
                    <div className={`${editingRemaining < 0 ? 'text-red-600 font-bold' : ''}`}><span className="font-bold">{t('inventory.remaining')}:</span> {(editingRemaining).toLocaleString()} kg {editingRemaining < 0 && <span className="ml-2 text-red-600 font-bold">{t('inventory.overShipped')}</span>}</div>
                  </div>
                  
                  <div className="bg-slate-50 rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t('inventory.shipmentDate')}</label>
                        <input 
                          type="date"
                          value={shipmentDate}
                          onChange={e => setShipmentDate(e.target.value)}
                          className={`w-full bg-white border rounded p-1.5 text-xs ${shipmentErrors.shipmentDate ? INVALID_FIELD_CLASS : 'border-slate-200'}`}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Packaging / Quantity</label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <input 
                              type="text"
                              value={shipmentPkgString}
                              onChange={e => {
                                setShipmentPkgString(e.target.value);
                                const p = products.find(prod => prod.id === dispatchEntries.find(ent => ent.id === editingDispatchId)?.productId);
                                if (p) {
                                  const parsed = parsePackagingString(e.target.value, p.defaultPalletWeight, p.defaultBagWeight);
                                  if (parsed.isValid) setShipmentQty(parsed.totalWeight.toString());
                                }
                              }}
                              placeholder="e.g. 2 pad; 1 bb"
                              className={`w-full bg-white border rounded p-1.5 text-xs font-mono pr-8 ${shipmentErrors.shipmentPkgString ? INVALID_FIELD_CLASS : 'border-slate-200'}`}
                            />
                            <button 
                               onClick={() => {
                                 setWizardTarget('shipment');
                                 setShowWizard(true);
                               }}
                               className="absolute right-1 top-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded p-1"
                            >
                               <Calculator size={14} />
                            </button>
                          </div>
                          <div className="w-24">
                            <input 
                              type="number"
                              value={shipmentQty}
                              onChange={e => setShipmentQty(e.target.value)}
                              placeholder="kg"
                              className={`w-full bg-white border rounded p-1.5 text-xs font-mono ${shipmentErrors.shipmentQty ? INVALID_FIELD_CLASS : 'border-slate-200'}`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={shipmentNote}
                        onChange={e => setShipmentNote(e.target.value)}
                        placeholder="Note (e.g. Truck plate, Driver name)"
                        className="flex-1 bg-white border border-slate-200 rounded p-1.5 text-xs"
                      />
                      <button 
                        onClick={handleAddShipment}
                        disabled={(editingOrderLimit > 0 && editingRemaining <= 0) || Object.keys(shipmentErrors).length > 0}
                        className={`${(editingOrderLimit > 0 && editingRemaining <= 0) || Object.keys(shipmentErrors).length > 0 ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'} px-4 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1`}
                      >
                        <Plus size={14} /> {t('common.add')}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                    {dispatchEntries.find(e => e.id === editingDispatchId)?.shipments?.map(ship => (
                      <div key={ship.id} className="flex items-center justify-between bg-white border border-slate-100 p-2 rounded text-xs">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-slate-400">{formatDate(ship.date, userSettings?.dateFormat || 'ISO')}</span>
                          <span className="font-bold text-slate-700">{ship.quantityKg.toLocaleString()} kg</span>
                          {ship.note && <span className="text-slate-400 italic">"{ship.note}"</span>}
                        </div>
                        <button 
                          onClick={() => handleRemoveShipment(ship.id)}
                          className="text-slate-300 hover:text-red-500"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    {(!dispatchEntries.find(e => e.id === editingDispatchId)?.shipments || dispatchEntries.find(e => e.id === editingDispatchId)?.shipments?.length === 0) && (
                      <div className="text-center py-4 text-slate-400 italic text-xs">{t('inventory.noShipments')}</div>
                    )}
                  </div>

                  {/* Completion Toggle */}
                  <div className="mt-4 flex items-center justify-between bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="text-xs">
                      <div className="font-bold text-blue-800">{t('inventory.orderStatus')}</div>
                      <div className="text-blue-600">
                        {dispatchEntries.find(e => e.id === editingDispatchId)?.status === 'completed' 
                          ? t('inventory.orderCompleted') 
                          : t('inventory.markCompletedHint')}
                      </div>
                    </div>
                    <button 
                      onClick={() => toggleComplete(editingDispatchId!, dispatchEntries.find(e => e.id === editingDispatchId)!.status)}
                      className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                        dispatchEntries.find(e => e.id === editingDispatchId)?.status === 'completed'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-blue-600 border border-blue-200'
                      }`}
                    >
                      {dispatchEntries.find(e => e.id === editingDispatchId)?.status === 'completed' ? t('inventory.reopenOrder') : t('inventory.markCompleted')}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button 
                  id="dispatch-submit-btn"
                  onClick={initiateDispatch}
                  disabled={Object.keys(dispatchErrors).length > 0}
                  className={`flex-1 text-white py-2 rounded-md text-sm font-bold shadow-md ${Object.keys(dispatchErrors).length > 0 ? 'bg-slate-300 cursor-not-allowed' : dispatchStatus === 'confirmed' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' : 'bg-amber-500 hover:bg-amber-600 shadow-amber-200'}`}
                >
                  {dispatchStatus === 'confirmed' ? t('inventory.confirmSale') : t('inventory.savePlan')}
                </button>
                <button 
                  onClick={() => setShowDispatchForm(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-2 rounded-md text-sm font-bold"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}

          {/* Filter Bar */}
          <div className="flex flex-col gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2 shrink-0">
            <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowFilter(!showFilter)}>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                <Filter size={14} className={showFilter ? 'text-blue-600' : 'text-slate-400'} />
                <span>{t('inventory.filterLog')}</span>
                <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-[10px]">{dispatchEntries.length}</span>
              </div>
              <button className="text-slate-400 hover:text-blue-600">
                {showFilter ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
            
            {showFilter && (
              <div className="grid grid-cols-12 gap-2 pt-2 border-t border-slate-200 animate-slide-up">
                {/* Status Toggle in Filter */}
                <div className="col-span-12 flex bg-white p-1 rounded border border-slate-200">
                   {['all', 'confirmed', 'planned'].map(s => (
                      <button 
                        key={s}
                        onClick={() => setFilters(prev => ({...prev, status: s as any}))}
                        className={`flex-1 text-[10px] uppercase font-bold py-1 rounded ${filters.status === s ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                         {s}
                      </button>
                   ))}
                </div>

                <div className="col-span-12 relative">
                  <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder={t('inventory.searchPlaceholder')} 
                    className="w-full bg-white text-slate-900 pl-8 pr-2 py-1.5 text-xs border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-100 outline-none placeholder:text-slate-400"
                    value={localFilterSearch}
                    onChange={(e) => {
                      setLocalFilterSearch(e.target.value);
                      if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
                      filterDebounceRef.current = setTimeout(() => {
                        setFilters(prev => ({ ...prev, search: e.target.value }));
                      }, 300);
                    }}
                  />
                </div>

                <div className="col-span-6">
                  <select
                    value={filters.buyer}
                    onChange={(e) => setFilters(prev => ({ ...prev, buyer: e.target.value }))}
                    className="w-full bg-white text-slate-700 text-[11px] border border-slate-200 rounded-md px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">{t('inventory.allBuyers')}</option>
                    {[...new Set(dispatchEntries.map(e => e.buyer))].sort().map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-6">
                  <select
                    value={filters.product}
                    onChange={(e) => setFilters(prev => ({ ...prev, product: e.target.value }))}
                    className="w-full bg-white text-slate-700 text-[11px] border border-slate-200 rounded-md px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">{t('inventory.allProducts')}</option>
                    {[...new Set(dispatchEntries.map(e => e.productId))].sort().map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                
                <div className="col-span-12 flex gap-2 items-center bg-white p-1.5 rounded border border-slate-200">
                   <Calendar size={14} className="text-slate-400 ml-1" />
                   <div className="flex gap-2 flex-1">
                     <input 
                        type="date" 
                        className="w-full bg-white text-slate-700 text-xs outline-none"
                        value={filters.dateStart}
                        onChange={(e) => setFilters(prev => ({ ...prev, dateStart: e.target.value }))}
                      />
                      <span className="text-slate-300">-</span>
                      <input 
                        type="date" 
                        className="w-full bg-white text-slate-700 text-xs outline-none"
                        value={filters.dateEnd}
                        onChange={(e) => setFilters(prev => ({ ...prev, dateEnd: e.target.value }))}
                      />
                   </div>
                </div>

                <div className="col-span-12 flex gap-1 justify-between">
                   {[
                     { l: t('common.today'), d: 0 }, { l: t('common.week'), d: 7 }, { l: t('common.month'), d: 30 }, { l: t('common.qtr'), d: 90 }, { l: t('common.year'), d: 365 }
                   ].map(p => (
                     <button 
                        key={p.l}
                        onClick={() => setDatePreset(p.d)}
                        className="flex-1 bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-200 text-[10px] py-1 rounded transition-colors uppercase font-semibold"
                      >
                        {p.l}
                     </button>
                   ))}
                </div>
              </div>
            )}
            {!showFilter && <div className="text-[10px] text-slate-400 pl-6">{t('inventory.showingRecentDispatches')}</div>}
          </div>

          {showBulkDispatch && selectedDispatchIds.size > 0 && (
            <div className="flex items-center gap-3 mb-2 px-2">
              <button
                onClick={bulkDeleteDispatches}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 transition-colors"
              >
                <Trash2 size={13}/> {t('common.deleteSelected')} ({selectedDispatchIds.size})
              </button>
              <button onClick={() => setSelectedDispatchIds(new Set())} className="text-xs text-slate-500 hover:text-slate-700">{t('common.clearSelection')}</button>
            </div>
          )}

          <div className="w-full overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-sm" onDoubleClick={() => { setShowBulkDispatch(prev => !prev); if (showBulkDispatch) { setSelectedDispatchIds(new Set()); } }}>
            <table className="w-full text-left text-sm relative">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold sticky top-0 z-10 shadow-sm">
                <tr>
                  {showBulkDispatch && <th className="p-3 w-8">
                    <input
                      type="checkbox"
                      checked={displayedDispatches.length > 0 && displayedDispatches.every(e => selectedDispatchIds.has(e.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedDispatchIds(new Set(displayedDispatches.map(d => d.id)));
                        } else {
                          setSelectedDispatchIds(new Set());
                        }
                      }}
                      className="rounded border-slate-300"
                    />
                  </th>}
                  <th className="p-3">{t('common.date')}</th>
                  <th className="p-3">{t('common.buyer')}</th>
                  <th className="p-3">{t('common.details')}</th>
                  <th className="p-3 text-right">{t('common.revenue')}</th>
                  <th className="p-3 text-center">{t('common.status')}</th>
                  <th className="p-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedDispatches.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 italic">{t('inventory.noDispatches')}</td>
                  </tr>
                ) : (
                  displayedDispatches.map(entry => (
                    <tr key={entry.id} className={`hover:bg-slate-50 transition-colors ${entry.status === 'planned' ? 'bg-amber-50/30' : ''} ${selectedDispatchIds.has(entry.id) ? 'bg-blue-50' : ''}`}>
                      {showBulkDispatch && <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedDispatchIds.has(entry.id)}
                          onChange={() => {
                            setSelectedDispatchIds(prev => {
                              const next = new Set(prev);
                              if (next.has(entry.id)) next.delete(entry.id);
                              else next.add(entry.id);
                              return next;
                            });
                          }}
                          className="rounded border-slate-300"
                        />
                      </td>}
                      <td className="p-3 text-slate-500 font-mono text-xs whitespace-nowrap">{new Date(entry.date).toLocaleDateString()}</td>
                      <td className="p-3 font-medium text-slate-700">{entry.buyer}</td>
                      <td className="p-3 text-slate-600">
                        <div className="flex flex-col">
                           <span className="font-bold flex items-center gap-2">
                             {entry.productId}
                             {entry.contractNumber && (
                                <span className="bg-blue-100 text-blue-700 text-[9px] px-1 rounded border border-blue-200">{entry.contractNumber}</span>
                             )}
                           </span>
                           <span className="text-[10px] text-slate-400">
                              {entry.packagingString ? entry.packagingString : `${(entry.orderedQuantityKg || entry.quantityKg).toLocaleString()}kg`} @ €{entry.salesPricePerKg.toFixed(2)}/kg
                           </span>
                           {entry.shipments && entry.shipments.length > 0 && (
                             <div className="mt-1 w-full max-w-[120px]">
                               <div className="flex justify-between text-[9px] font-bold text-slate-500 mb-0.5">
                                 {(() => {
                                   const shipped = entry.quantityKg ?? 0;
                                   const total = entry.orderedQuantityKg ?? entry.quantityKg ?? 0;
                                   const remaining = total - shipped;
                                   return (
                                     <span>Shipped: {shipped.toLocaleString()} / {total.toLocaleString()} kg • Remaining: {remaining.toLocaleString()} kg {remaining < 0 && <span className="ml-2 text-red-600 font-bold">OVER-SHIPPED</span>}</span>
                                   );
                                 })()}
                               </div>
                               <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                 <div 
                                   className={`h-full transition-all ${((entry.quantityKg ?? 0) > (entry.orderedQuantityKg ?? entry.quantityKg ?? 0)) ? 'bg-red-500' : (entry.status === 'completed' ? 'bg-emerald-500' : 'bg-blue-500')}`}
                                   style={{ width: `${Math.min(100, ((entry.quantityKg ?? 0) / Math.max(1, (entry.orderedQuantityKg ?? entry.quantityKg ?? 1))) * 100)}%` }}
                                 />
                               </div>
                             </div>
                           )}
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-700 whitespace-nowrap">
                         {entry.status === 'confirmed' ? (
                            <span className="text-emerald-600">€{entry.totalRevenue.toLocaleString()}</span>
                         ) : (
                            <span className="text-amber-600 italic">~€{entry.totalRevenue.toLocaleString()}</span>
                         )}
                      </td>
                      <td className="p-3 text-center">
                         {entry.status === 'completed' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
                               <CheckCircle2 size={10}/> {t('inventory.completed')}
                            </span>
                         ) : entry.status === 'confirmed' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                               <CheckCircle2 size={10}/> {entry.shipments && entry.shipments.length > 0 ? t('inventory.shipping') : t('inventory.done')}
                            </span>
                         ) : (
                            <div className="flex flex-col items-center gap-1">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                                  <Clock size={10}/> {t('inventory.plan')}
                                </span>
                                <button 
                                  onClick={() => convertToConfirmed(entry)}
                                  className="text-[10px] text-blue-600 hover:underline font-bold"
                                >
                                  {t('inventory.markDone')}
                                </button>
                            </div>
                         )}
                      </td>
                      <td className="p-3 text-center">
                         <div className="flex gap-2 justify-center">
                            <button 
                              onClick={() => handleEditDispatch(entry)}
                              className="text-slate-400 hover:text-blue-600 transition-colors"
                              title="Edit / Manage Shipments"
                            >
                              <Pencil size={16} />
                            </button>
                            <button 
                              onClick={() => generateInvoice(entry)}
                              className="text-slate-400 hover:text-blue-600 transition-colors"
                              title="Download Invoice"
                            >
                              <FileText size={16} />
                            </button>
                            <button 
                              onClick={() => handleDeleteEntry(entry.id)}
                              className="text-slate-400 hover:text-red-500 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                         </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
        </>
      )}
      </div>
  );
};
