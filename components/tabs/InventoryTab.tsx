
import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '../../store';
import { GlassCard } from '../ui/GlassCard';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import { PackagingWizard } from '../ui/PackagingWizard';
import { parsePackagingString } from '../../utils/parser';
import { Package, Truck, ArrowUpRight, Box, Filter, Search, Calendar, ChevronDown, ChevronUp, FileText, Download, Scale, Layers, Tag, Calculator, CheckCircle2, Clock, Trash2, Check, Pencil, Plus, X } from 'lucide-react';
// @ts-ignore
import jsPDF from 'jspdf';
// @ts-ignore
import autoTable from 'jspdf-autotable';

export const InventoryTab: React.FC = () => {
  const { outputEntries, dispatchEntries, addDispatchEntry, updateDispatchEntry, removeDispatchEntry, buyers, products } = useStore();
  const [showDispatchForm, setShowDispatchForm] = useState(false);
  const [showPallets, setShowPallets] = useState(false);
  const [editingDispatchId, setEditingDispatchId] = useState<string | null>(null);
  const [shipmentQty, setShipmentQty] = useState('');
  const [shipmentPkgString, setShipmentPkgString] = useState('');
  const [shipmentDate, setShipmentDate] = useState(new Date().toISOString().split('T')[0]);
  const [shipmentNote, setShipmentNote] = useState('');
  const [wizardTarget, setWizardTarget] = useState<'dispatch' | 'shipment'>('dispatch');

  // Form State
  const [dispatchStatus, setDispatchStatus] = useState<'confirmed' | 'planned'>('confirmed');
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedBuyerId, setSelectedBuyerId] = useState('');
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

  // Filter State
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState({ search: '', dateStart: '', dateEnd: '', status: 'all' as 'all' | 'confirmed' | 'planned' });

  // Init buyer selection
  useMemo(() => {
    if (buyers.length > 0 && !selectedBuyerId) {
      setSelectedBuyerId(buyers[0].id); 
    }
  }, [buyers, selectedBuyerId]);

  // Derived: Current Buyer Object
  const currentBuyer = useMemo(() => buyers.find(b => b.id === selectedBuyerId), [buyers, selectedBuyerId]);
  
  // Derived: Active Product Object
  const activeProduct = useMemo(() => products.find(p => p.id === selectedProduct), [selectedProduct, products]);

  // Derived: Available Contracts for selected Buyer & Product
  const availableContracts = useMemo(() => {
    if (!currentBuyer || !currentBuyer.contracts) return [];
    return currentBuyer.contracts.filter(c => c.productId === selectedProduct);
  }, [currentBuyer, selectedProduct]);

  // Auto-fill price when contract changes
  useEffect(() => {
    if (selectedContractId) {
       const contract = availableContracts.find(c => c.id === selectedContractId);
       if (contract) {
         setPricePerKg(contract.pricePerKg.toString());
       }
    }
  }, [selectedContractId, availableContracts]);

  // Parse Packaging String automatically
  const parserPreview = useMemo(() => {
    if (!activeProduct) return null;
    return parsePackagingString(pkgString, activeProduct.defaultPalletWeight, activeProduct.defaultBagWeight);
  }, [pkgString, activeProduct]);

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

  // Calculate current stock and Aging
  const stockLevels = useMemo(() => {
    return products.map(product => {
      const productOutputs = outputEntries.filter(e => e.productId === product.id);
      
      const producedKg = productOutputs.reduce((sum, e) => sum + e.parsed.totalWeight, 0);
      const producedPallets = productOutputs.reduce((sum, e) => sum + e.parsed.pallets, 0);
      const producedBigBags = productOutputs.reduce((sum, e) => sum + e.parsed.bigBags, 0);
      const producedTanks = productOutputs.reduce((sum, e) => sum + e.parsed.tanks, 0);
      
      // CRITICAL: Only SHIPPED amounts deduct from physical stock
      const dispatchedKg = dispatchEntries
        .filter(e => e.productId === product.id)
        .reduce((sum, e) => {
           const shippedAmount = e.shipments?.reduce((s, ship) => s + ship.quantityKg, 0) || 0;
           if (e.shipments && e.shipments.length > 0) return sum + shippedAmount;
           
           // Fallback for legacy confirmed entries (no shipments and no orderedQuantityKg)
           if (e.status !== 'planned' && !e.orderedQuantityKg) return sum + e.quantityKg;
           
           return sum + shippedAmount;
        }, 0);

      const oldestBatch = productOutputs.sort((a,b) => a.timestamp - b.timestamp)[0];
      
      let ageStatus = 'green';
      if (oldestBatch) {
        const ageDays = (Date.now() - oldestBatch.timestamp) / (1000 * 60 * 60 * 24);
        if (ageDays > 60) ageStatus = 'red';
        else if (ageDays > 30) ageStatus = 'yellow';
      }

      const currentStockKg = Math.max(0, producedKg - dispatchedKg); 
      const realStockKg = producedKg - dispatchedKg; 

      const stockRatio = producedKg > 0 ? currentStockKg / producedKg : 0;
      
      const currentStockPallets = producedPallets * stockRatio;
      const currentStockBigBags = producedBigBags * stockRatio;
      const currentStockTanks = producedTanks * stockRatio;

      // Global Rule: Stock must be whole numbers
      const isFractionalError = Math.abs(currentStockPallets - Math.round(currentStockPallets)) > 0.05 || 
                                Math.abs(currentStockBigBags - Math.round(currentStockBigBags)) > 0.05 ||
                                Math.abs(currentStockTanks - Math.round(currentStockTanks)) > 0.05;

      return {
        ...product,
        currentStockKg,
        realStockKg,
        currentStockPallets,
        currentStockBigBags,
        currentStockTanks,
        ageStatus,
        isFractionalError
      };
    });
  }, [outputEntries, dispatchEntries]);

  const initiateDispatch = () => {
    if (!quantity || !selectedBuyerId || !pricePerKg || !dispatchDate) return;
    
    const qty = parseFloat(quantity);
    const price = parseFloat(pricePerKg);
    const buyerName = buyers.find(b => b.id === selectedBuyerId)?.name || 'Unknown';
    const contractNum = availableContracts.find(c => c.id === selectedContractId)?.contractNumber;

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
    setConfirmState({
      isOpen: true,
      type: 'delete',
      message: "Are you sure you want to delete this log entry?",
      pendingAction: () => removeDispatchEntry(id)
    });
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
    
    const buyer = buyers.find(b => b.name === entry.buyer);
    setSelectedBuyerId(buyer ? buyer.id : '');
    
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

  const handleAddShipment = () => {
    if (!editingDispatchId || !shipmentQty) return;
    const qty = parseFloat(shipmentQty);
    const entry = dispatchEntries.find(e => e.id === editingDispatchId);
    if (!entry) return;

    const product = PRODUCTS.find(p => p.id === entry.productId);
    const parsed = product && shipmentPkgString 
      ? parsePackagingString(shipmentPkgString, product.defaultPalletWeight, product.defaultBagWeight)
      : undefined;

    const newShipment = {
      id: Math.random().toString(36).substr(2, 9),
      date: new Date(shipmentDate).getTime(),
      quantityKg: qty,
      note: shipmentNote,
      packagingString: shipmentPkgString,
      parsed: parsed ? {
        pallets: parsed.pallets,
        bigBags: parsed.bigBags,
        tanks: parsed.tanks,
        totalWeight: parsed.totalWeight
      } : undefined
    };

    const updatedShipments = [...(entry.shipments || []), newShipment];
    const totalShipped = updatedShipments.reduce((sum, s) => sum + s.quantityKg, 0);
    
    updateDispatchEntry(editingDispatchId, { 
      shipments: updatedShipments,
      quantityKg: totalShipped, // Update total shipped
      totalRevenue: totalShipped * entry.salesPricePerKg
    });

    setShipmentQty('');
    setShipmentPkgString('');
    setShipmentNote('');
  };

  const handleRemoveShipment = (shipmentId: string) => {
    if (!editingDispatchId) return;
    const entry = dispatchEntries.find(e => e.id === editingDispatchId);
    if (!entry || !entry.shipments) return;

    const updatedShipments = entry.shipments.filter(s => s.id !== shipmentId);
    const totalShipped = updatedShipments.reduce((sum, s) => sum + s.quantityKg, 0);

    updateDispatchEntry(editingDispatchId, { 
      shipments: updatedShipments,
      quantityKg: totalShipped,
      totalRevenue: totalShipped * entry.salesPricePerKg
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
    setShipmentQty('');
    setShipmentPkgString('');
    setShipmentNote('');
  };

  const generateInvoice = (entry: typeof dispatchEntries[0]) => {
    const doc = new jsPDF();
    const buyer = buyers.find(b => b.name === entry.buyer);

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
      doc.text(`VAT: ${buyer.companyCode}`, 14, 77);
    }

    // Invoice Details
    doc.text(`Date: ${new Date(entry.date).toLocaleDateString()}`, 140, 30);
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
      if (filters.search) {
        const lowerQ = filters.search.toLowerCase();
        data = data.filter(e => 
          e.buyer.toLowerCase().includes(lowerQ) ||
          e.productId.toLowerCase().includes(lowerQ) ||
          e.quantityKg.toString().includes(lowerQ) ||
          (e.batchRefId && e.batchRefId.toLowerCase().includes(lowerQ))
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

      {/* Header with Toggle */}
      <div className="flex items-center justify-between shrink-0">
         <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Package size={16}/> Warehouse Status
         </h2>
         <div className="flex bg-slate-200 p-1 rounded-lg">
            <button 
               onClick={() => setShowPallets(false)}
               className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${!showPallets ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
            >
               KG
            </button>
            <button 
               onClick={() => setShowPallets(true)}
               className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${showPallets ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
            >
               Pallets
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
                   <div className={`text-xl font-mono font-bold ${item.isFractionalError ? 'text-red-600' : 'text-slate-800'}`}>
                     {item.currentStockPallets.toFixed(1)} <span className="text-sm font-normal text-slate-400">pad</span>
                   </div>
                   <div className={`text-sm font-mono font-bold ${item.isFractionalError ? 'text-red-600' : 'text-slate-600'}`}>
                     {item.currentStockBigBags.toFixed(1)} <span className="text-xs font-normal text-slate-400">bb</span>
                   </div>
                   {item.currentStockTanks > 0 && (
                     <div className={`text-sm font-mono font-bold ${item.isFractionalError ? 'text-red-600' : 'text-slate-600'}`}>
                       {item.currentStockTanks.toFixed(1)} <span className="text-xs font-normal text-slate-400">tank</span>
                     </div>
                   )}
                   {item.isFractionalError && (
                     <div className="text-[9px] text-red-600 font-bold mt-1 leading-tight">
                       ERROR: Fractional Stock
                     </div>
                   )}
                </div>
              ) : (
                <div className={`text-2xl font-mono font-bold ${item.realStockKg < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                  {item.currentStockKg.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              )}
              
              <div className="text-[10px] text-slate-400 font-medium flex justify-between mt-1">
                <span>{showPallets ? 'stock mix' : 'kg in stock'}</span>
                {item.ageStatus === 'red' && <span className="text-red-600 font-bold animate-pulse">AGING</span>}
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        
        {/* Left: Dispatch Actions & Recent Log */}
        <div className="flex-1 flex flex-col gap-4">
          <div className="flex items-center justify-between shrink-0">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
              <Truck size={16} /> Dispatch Log & Plans
            </h3>
            <button 
              onClick={() => {
                resetForm();
                setShowDispatchForm(!showDispatchForm);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg font-medium transition-all shadow-sm flex items-center gap-2"
            >
              <ArrowUpRight size={16} /> New Entry
            </button>
          </div>

          {showDispatchForm && (
            <div className={`animate-slide-up bg-white border rounded-xl p-4 shadow-lg ring-4 z-10 shrink-0 ${dispatchStatus === 'confirmed' ? 'border-blue-200 ring-blue-50' : 'border-amber-200 ring-amber-50'}`}>
              
              {editingDispatchId && (
                 <div className="flex items-center gap-2 text-amber-700 text-xs font-bold uppercase tracking-wider mb-2">
                   <div className="bg-amber-100 p-1 rounded"><Pencil size={12} /></div> Editing Entry
                 </div>
              )}

              {/* Status Toggle & Date */}
              <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-100">
                 <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button onClick={() => setDispatchStatus('confirmed')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${dispatchStatus === 'confirmed' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}>
                       <CheckCircle2 size={14}/> Confirmed Sale
                    </button>
                    <button onClick={() => setDispatchStatus('planned')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${dispatchStatus === 'planned' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500'}`}>
                       <Clock size={14}/> Planned Order
                    </button>
                 </div>
                 <input 
                    type="date"
                    value={dispatchDate}
                    onChange={e => setDispatchDate(e.target.value)}
                    className="bg-white border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-700 font-medium outline-none focus:ring-2 focus:ring-blue-100"
                 />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Buyer</label>
                  <select 
                    value={selectedBuyerId}
                    onChange={(e) => {
                         setSelectedBuyerId(e.target.value);
                         setSelectedContractId(''); // Reset contract on buyer change
                         setPricePerKg('');
                    }}
                    className="w-full bg-white border border-slate-300 text-slate-900 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Product</label>
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
                    className="w-full bg-white border border-slate-300 text-slate-900 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                
                {/* Contract Selection */}
                <div className="md:col-span-2">
                   <label className="block text-xs font-semibold text-slate-500 mb-1">Active Contract (Optional)</label>
                   <select
                      value={selectedContractId}
                      onChange={(e) => setSelectedContractId(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                   >
                      <option value="">-- No Contract (Manual Price) --</option>
                      {availableContracts.map(c => (
                         <option key={c.id} value={c.id}>
                            {c.contractNumber} (Rate: €{c.pricePerKg})
                         </option>
                      ))}
                   </select>
                </div>

                <div className="relative">
                  <label className="text-xs font-semibold text-slate-500 block mb-1 flex items-center gap-2">
                    Quantity <span className="text-slate-400 font-normal italic text-[10px] md:text-xs">(e.g. "10 pad")</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                       <input 
                          type="text" 
                          value={pkgString}
                          onChange={(e) => setPkgString(e.target.value)}
                          placeholder="e.g. 10 pad"
                          className="w-full bg-white border border-slate-300 text-slate-900 rounded-md pl-3 pr-10 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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
                     Result: {quantity ? `${parseFloat(quantity).toLocaleString()} kg` : '0 kg'}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                     {dispatchStatus === 'planned' ? 'Est. Price (€/kg)' : 'Sales Price (€/kg)'}
                  </label>
                  <input 
                    type="number"
                    value={pricePerKg}
                    onChange={(e) => setPricePerKg(e.target.value)}
                    className="w-full bg-white border border-emerald-300 text-emerald-900 rounded-md p-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    placeholder="e.g. 5.50"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Batch Ref (Optional)</label>
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
                    <Box size={14} /> Shipments Tracking
                  </h4>
                  
                  <div className="bg-slate-50 rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Ship Date</label>
                        <input 
                          type="date"
                          value={shipmentDate}
                          onChange={e => setShipmentDate(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs"
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
                                const p = PRODUCTS.find(prod => prod.id === dispatchEntries.find(ent => ent.id === editingDispatchId)?.productId);
                                if (p) {
                                  const parsed = parsePackagingString(e.target.value, p.defaultPalletWeight, p.defaultBagWeight);
                                  if (parsed.isValid) setShipmentQty(parsed.totalWeight.toString());
                                }
                              }}
                              placeholder="e.g. 2 pad; 1 bb"
                              className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs font-mono pr-8"
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
                              className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs font-mono"
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
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1"
                      >
                        <Plus size={14} /> Add
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                    {dispatchEntries.find(e => e.id === editingDispatchId)?.shipments?.map(ship => (
                      <div key={ship.id} className="flex items-center justify-between bg-white border border-slate-100 p-2 rounded text-xs">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-slate-400">{new Date(ship.date).toLocaleDateString()}</span>
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
                      <div className="text-center py-4 text-slate-400 italic text-xs">No shipments recorded yet.</div>
                    )}
                  </div>

                  {/* Completion Toggle */}
                  <div className="mt-4 flex items-center justify-between bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="text-xs">
                      <div className="font-bold text-blue-800">Order Status</div>
                      <div className="text-blue-600">
                        {dispatchEntries.find(e => e.id === editingDispatchId)?.status === 'completed' 
                          ? 'This order is marked as FULLY COMPLETED.' 
                          : 'Mark as completed when all items are shipped.'}
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
                      {dispatchEntries.find(e => e.id === editingDispatchId)?.status === 'completed' ? 'Re-open Order' : 'Mark Completed'}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button 
                  onClick={initiateDispatch}
                  className={`flex-1 text-white py-2 rounded-md text-sm font-bold shadow-md ${dispatchStatus === 'confirmed' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' : 'bg-amber-500 hover:bg-amber-600 shadow-amber-200'}`}
                >
                  {dispatchStatus === 'confirmed' ? 'Confirm Sale & Deduct Stock' : 'Save Plan'}
                </button>
                <button 
                  onClick={() => setShowDispatchForm(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-2 rounded-md text-sm font-bold"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Filter Bar */}
          <div className="flex flex-col gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2 shrink-0">
            <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowFilter(!showFilter)}>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                <Filter size={14} className={showFilter ? 'text-blue-600' : 'text-slate-400'} />
                <span>Filter Log</span>
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
                    placeholder="Search buyer, product..." 
                    className="w-full bg-white text-slate-900 pl-8 pr-2 py-1.5 text-xs border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-100 outline-none placeholder:text-slate-400"
                    value={filters.search}
                    onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  />
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
                     { l: 'Today', d: 0 }, { l: 'Week', d: 7 }, { l: 'Month', d: 30 }, { l: 'Qtr', d: 90 }, { l: 'Year', d: 365 }
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
            {!showFilter && <div className="text-[10px] text-slate-400 pl-6">Showing recent 10 entries</div>}
          </div>

          <div className="w-full overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-sm">
            <table className="w-full text-left text-sm relative">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Buyer</th>
                  <th className="p-3">Details</th>
                  <th className="p-3 text-right">Revenue</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedDispatches.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 italic">No dispatches found matching filters.</td>
                  </tr>
                ) : (
                  displayedDispatches.map(entry => (
                    <tr key={entry.id} className={`hover:bg-slate-50 transition-colors ${entry.status === 'planned' ? 'bg-amber-50/30' : ''}`}>
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
                                 <span>Shipped: {entry.quantityKg.toLocaleString()}kg</span>
                                 <span>{Math.round((entry.quantityKg / (entry.orderedQuantityKg || entry.quantityKg)) * 100)}%</span>
                               </div>
                               <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                 <div 
                                   className={`h-full transition-all ${entry.status === 'completed' ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                   style={{ width: `${Math.min(100, (entry.quantityKg / (entry.orderedQuantityKg || entry.quantityKg)) * 100)}%` }}
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
                               <CheckCircle2 size={10}/> COMPLETED
                            </span>
                         ) : entry.status === 'confirmed' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                               <CheckCircle2 size={10}/> {entry.shipments && entry.shipments.length > 0 ? 'SHIPPING' : 'DONE'}
                            </span>
                         ) : (
                            <div className="flex flex-col items-center gap-1">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                                  <Clock size={10}/> PLAN
                                </span>
                                <button 
                                  onClick={() => convertToConfirmed(entry)}
                                  className="text-[10px] text-blue-600 hover:underline font-bold"
                                >
                                  Mark Done
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
    </div>
  );
};
