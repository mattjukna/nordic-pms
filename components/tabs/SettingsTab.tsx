
import React, { useState, useMemo } from 'react';
import { useStore } from '../../store';
import { GlassCard } from '../ui/GlassCard';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import { Users, Trash2, Plus, Briefcase, Save, X, Search, Phone, MapPin, Calendar, Globe, ChevronDown, ChevronUp, Pencil, Building2, Coins, FileText, CheckCircle, RotateCcw, Package, Droplets } from 'lucide-react';
import { Supplier, Buyer, BuyerContract, Product } from '../../types';

const InputField = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input 
    {...props}
    className={`w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400 ${props.className || ''}`}
  />
);

export const SettingsTab: React.FC = () => {
  const { 
    suppliers, addSupplier, updateSupplier, removeSupplier, 
    buyers, addBuyer, updateBuyer, removeBuyer,
    products, addProduct, updateProduct, removeProduct,
    milkTypes, addMilkType, removeMilkType
  } = useStore();

  // Search State
  const [supplierSearch, setSupplierSearch] = useState('');
  const [buyerSearch, setBuyerSearch] = useState('');

  // Expansion State
  const [expandedSupplierId, setExpandedSupplierId] = useState<string | null>(null);
  const [expandedBuyerId, setExpandedBuyerId] = useState<string | null>(null);

  // Edit Mode State
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [editingBuyerId, setEditingBuyerId] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  // Supplier Form State
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    routeGroup: '',
    contractQuota: '',
    companyCode: '',
    phoneNumber: '',
    country: 'Lithuania',
    addressLine1: '',
    addressLine2: '',
    createdOn: new Date().toISOString().split('T')[0],
    basePricePerKg: '0.34',
    normalMilkPricePerKg: '0.34',
    fatBonusPerPct: '0.003',
    proteinBonusPerPct: '0.004',
    isEco: false,
    defaultMilkType: ''
  });

  // Buyer Form State
  const [showBuyerForm, setShowBuyerForm] = useState(false);
  const [newBuyer, setNewBuyer] = useState<{
    name: string;
    companyCode: string;
    phoneNumber: string;
    country: string;
    addressLine1: string;
    addressLine2: string;
    createdOn: string;
    contracts: BuyerContract[];
  }>({
    name: '',
    companyCode: '',
    phoneNumber: '',
    country: 'Lithuania',
    addressLine1: '',
    addressLine2: '',
    createdOn: new Date().toISOString().split('T')[0],
    contracts: []
  });

  // Product Form State
  const [showProductForm, setShowProductForm] = useState(false);
  const [newProduct, setNewProduct] = useState<Product>({
    id: '',
    name: '',
    details: '',
    defaultPalletWeight: 750,
    defaultBagWeight: 1000,
    proteinTargetPct: 0,
    yieldFactor: 0
  });

  // Milk Type Form State
  const [newMilkType, setNewMilkType] = useState('');

  // Contract Form State (Inside Buyer Form)
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [contractForm, setContractForm] = useState({
    contractNumber: '',
    productId: products[0]?.id || '',
    pricePerKg: '',
    agreedAmountKg: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0]
  });

  // Confirmation Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
    isDanger?: boolean;
  }>({ isOpen: false, title: '', message: '', action: () => {} });

  // --- Logic for Products ---
  const confirmProductSubmit = () => {
    if (!newProduct.id || !newProduct.name) return;
    setConfirmModal({
      isOpen: true,
      title: editingProductId ? "Update Product" : "Add New Product",
      message: `Are you sure you want to ${editingProductId ? 'update' : 'add'} ${newProduct.name}?`,
      action: executeProductSubmit,
      isDanger: false
    });
  };

  const executeProductSubmit = () => {
    if (editingProductId) {
      updateProduct(editingProductId, newProduct);
    } else {
      addProduct(newProduct);
    }
    resetProductForm();
  };

  const confirmProductDelete = (id: string, name: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Product",
      message: `Are you sure you want to delete ${name}?`,
      action: () => removeProduct(id),
      isDanger: true
    });
  };

  const resetProductForm = () => {
    setNewProduct({
      id: '', name: '', details: '', defaultPalletWeight: 750, defaultBagWeight: 1000, proteinTargetPct: 0, yieldFactor: 0
    });
    setShowProductForm(false);
    setEditingProductId(null);
  };

  const startEditProduct = (p: Product) => {
    setEditingProductId(p.id);
    setNewProduct(p);
    setShowProductForm(true);
  };

  // --- Logic for Milk Types ---
  const handleAddMilkType = () => {
    if (newMilkType && !milkTypes.includes(newMilkType)) {
      addMilkType(newMilkType);
      setNewMilkType('');
    }
  };

  const confirmMilkTypeDelete = (type: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Milk Type",
      message: `Are you sure you want to delete ${type}?`,
      action: () => removeMilkType(type),
      isDanger: true
    });
  };

  // --- Logic for Suppliers ---

  const confirmSupplierSubmit = () => {
    if (!newSupplier.name || !newSupplier.routeGroup) return;
    setConfirmModal({
       isOpen: true,
       title: editingSupplierId ? "Update Supplier" : "Add New Supplier",
       message: `Are you sure you want to ${editingSupplierId ? 'update' : 'add'} ${newSupplier.name}?`,
       action: executeSupplierSubmit,
       isDanger: false
    });
  };

  const executeSupplierSubmit = () => {
    if (!newSupplier.name || !newSupplier.routeGroup || !newSupplier.companyCode || !newSupplier.addressLine1 || !newSupplier.country || !newSupplier.createdOn) return;
    
    const supplierData = {
      name: newSupplier.name,
      routeGroup: newSupplier.routeGroup,
      contractQuota: parseFloat(newSupplier.contractQuota) || 0,
      companyCode: newSupplier.companyCode,
      phoneNumber: newSupplier.phoneNumber,
      country: newSupplier.country,
      addressLine1: newSupplier.addressLine1,
      addressLine2: newSupplier.addressLine2,
      createdOn: new Date(newSupplier.createdOn).getTime(),
      basePricePerKg: parseFloat(newSupplier.basePricePerKg) || 0,
      normalMilkPricePerKg: parseFloat(newSupplier.normalMilkPricePerKg) || parseFloat(newSupplier.basePricePerKg) || 0,
      fatBonusPerPct: parseFloat(newSupplier.fatBonusPerPct) || 0,
      proteinBonusPerPct: parseFloat(newSupplier.proteinBonusPerPct) || 0,
      isEco: newSupplier.isEco,
      defaultMilkType: newSupplier.defaultMilkType
    };

    if (editingSupplierId) {
      updateSupplier(editingSupplierId, supplierData);
    } else {
      addSupplier(supplierData);
    }
    
    resetSupplierForm();
  };

  const confirmSupplierDelete = (id: string, name: string) => {
     setConfirmModal({
        isOpen: true,
        title: "Delete Supplier",
        message: `Are you sure you want to permanently delete ${name}? This action cannot be undone.`,
        action: () => removeSupplier(id),
        isDanger: true
     });
  };

  const resetSupplierForm = () => {
    setNewSupplier({
      name: '', routeGroup: '', contractQuota: '', companyCode: '', phoneNumber: '', 
      country: 'Lithuania', addressLine1: '', addressLine2: '', createdOn: new Date().toISOString().split('T')[0],
      basePricePerKg: '0.34', normalMilkPricePerKg: '0.34', fatBonusPerPct: '0.003', proteinBonusPerPct: '0.004',
      isEco: false, defaultMilkType: 'Skim milk'
    });
    setShowSupplierForm(false);
    setEditingSupplierId(null);
  };

  const startEditSupplier = (s: Supplier, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSupplierId(s.id);
    setNewSupplier({
      name: s.name,
      routeGroup: s.routeGroup,
      contractQuota: s.contractQuota.toString(),
      companyCode: s.companyCode,
      phoneNumber: s.phoneNumber,
      country: s.country,
      addressLine1: s.addressLine1,
      addressLine2: s.addressLine2,
      createdOn: new Date(s.createdOn).toISOString().split('T')[0],
      basePricePerKg: s.basePricePerKg?.toString() || '0.34',
      normalMilkPricePerKg: (s as any).normalMilkPricePerKg?.toString() || s.basePricePerKg?.toString() || '0.34',
      fatBonusPerPct: s.fatBonusPerPct?.toString() || '0.003',
      proteinBonusPerPct: s.proteinBonusPerPct?.toString() || '0.004',
      isEco: s.isEco || false,
      defaultMilkType: s.defaultMilkType || 'Skim milk'
    });
    setShowSupplierForm(true);
    setExpandedSupplierId(null); // Close detail view when editing
  };

  const toggleSupplierExpand = (id: string) => {
    if (expandedSupplierId === id) setExpandedSupplierId(null);
    else setExpandedSupplierId(id);
  };

  // --- Logic for Buyers ---

  const confirmBuyerSubmit = () => {
    if (!newBuyer.name) return;
    setConfirmModal({
       isOpen: true,
       title: editingBuyerId ? "Update Buyer" : "Add New Buyer",
       message: `Are you sure you want to ${editingBuyerId ? 'update' : 'add'} ${newBuyer.name}?`,
       action: executeBuyerSubmit,
       isDanger: false
    });
  };

  const executeBuyerSubmit = () => {
    if (!newBuyer.name || !newBuyer.companyCode || !newBuyer.addressLine1 || !newBuyer.country || !newBuyer.createdOn) return;
    
    const buyerData = {
      name: newBuyer.name,
      companyCode: newBuyer.companyCode,
      phoneNumber: newBuyer.phoneNumber,
      country: newBuyer.country,
      addressLine1: newBuyer.addressLine1,
      addressLine2: newBuyer.addressLine2,
      createdOn: new Date(newBuyer.createdOn).getTime(),
      contracts: newBuyer.contracts
    };

    if (editingBuyerId) {
      updateBuyer(editingBuyerId, buyerData);
    } else {
      addBuyer(buyerData);
    }

    resetBuyerForm();
  };

  const confirmBuyerDelete = (id: string, name: string) => {
     setConfirmModal({
        isOpen: true,
        title: "Delete Buyer",
        message: `Are you sure you want to permanently delete ${name}? This action cannot be undone.`,
        action: () => removeBuyer(id),
        isDanger: true
     });
  };

  const resetBuyerForm = () => {
    setNewBuyer({
      name: '', companyCode: '', phoneNumber: '', 
      country: 'Lithuania', addressLine1: '', addressLine2: '', createdOn: new Date().toISOString().split('T')[0],
      contracts: []
    });
    setContractForm({
      contractNumber: '', productId: products[0]?.id || '', pricePerKg: '', agreedAmountKg: '',
      startDate: new Date().toISOString().split('T')[0], 
      endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0]
    });
    setEditingContractId(null);
    setShowBuyerForm(false);
    setEditingBuyerId(null);
  };

  const startEditBuyer = (b: Buyer, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBuyerId(b.id);
    setNewBuyer({
      name: b.name,
      companyCode: b.companyCode,
      phoneNumber: b.phoneNumber,
      country: b.country,
      addressLine1: b.addressLine1,
      addressLine2: b.addressLine2,
      createdOn: new Date(b.createdOn).toISOString().split('T')[0],
      contracts: b.contracts || []
    });
    setShowBuyerForm(true);
    setExpandedBuyerId(null);
  };

  const toggleBuyerExpand = (id: string) => {
    if (expandedBuyerId === id) setExpandedBuyerId(null);
    else setExpandedBuyerId(id);
  };

  // Contract Logic
  const handleContractSubmit = () => {
    if (!contractForm.contractNumber || !contractForm.pricePerKg) return;

    if (editingContractId) {
       // Update existing
       setNewBuyer(prev => ({
         ...prev,
         contracts: prev.contracts.map(c => c.id === editingContractId ? {
            ...c,
            contractNumber: contractForm.contractNumber,
            productId: contractForm.productId,
            pricePerKg: parseFloat(contractForm.pricePerKg),
            agreedAmountKg: parseFloat(contractForm.agreedAmountKg) || 0,
            startDate: new Date(contractForm.startDate).getTime(),
            endDate: new Date(contractForm.endDate).getTime()
         } : c)
       }));
       setEditingContractId(null);
    } else {
       // Add new
       const newContract: BuyerContract = {
          id: Math.random().toString(36).substr(2, 9),
          contractNumber: contractForm.contractNumber,
          productId: contractForm.productId,
          pricePerKg: parseFloat(contractForm.pricePerKg),
          agreedAmountKg: parseFloat(contractForm.agreedAmountKg) || 0,
          startDate: new Date(contractForm.startDate).getTime(),
          endDate: new Date(contractForm.endDate).getTime()
       };

       setNewBuyer(prev => ({
         ...prev,
         contracts: [...prev.contracts, newContract]
       }));
    }

    setContractForm({ 
        contractNumber: '', 
        productId: products[0]?.id || '', 
        pricePerKg: '', 
        agreedAmountKg: '',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0]
    });
  };

  const startEditContract = (c: BuyerContract) => {
    setEditingContractId(c.id);
    setContractForm({
        contractNumber: c.contractNumber,
        productId: c.productId,
        pricePerKg: c.pricePerKg.toString(),
        agreedAmountKg: c.agreedAmountKg?.toString() || '',
        startDate: new Date(c.startDate).toISOString().split('T')[0],
        endDate: new Date(c.endDate).toISOString().split('T')[0]
    });
  };

  const cancelContractEdit = () => {
    setEditingContractId(null);
    setContractForm({
        contractNumber: '', 
        productId: products[0]?.id || '', 
        pricePerKg: '', 
        agreedAmountKg: '',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0]
    });
  };

  const removeContractFromBuyer = (contractId: string) => {
    setNewBuyer(prev => ({
      ...prev,
      contracts: prev.contracts.filter(c => c.id !== contractId)
    }));
    if (editingContractId === contractId) {
      cancelContractEdit();
    }
  };

  // --- Filtering ---

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch) return suppliers;
    const lower = supplierSearch.toLowerCase();
    return suppliers.filter(s => 
      s.name.toLowerCase().includes(lower) || 
      s.companyCode.includes(lower) || 
      s.routeGroup.toLowerCase().includes(lower)
    );
  }, [suppliers, supplierSearch]);

  const filteredBuyers = useMemo(() => {
    if (!buyerSearch) return buyers;
    const lower = buyerSearch.toLowerCase();
    return buyers.filter(b => 
      b.name.toLowerCase().includes(lower) || 
      b.companyCode.includes(lower) || 
      b.country.toLowerCase().includes(lower)
    );
  }, [buyers, buyerSearch]);

  // Sub-Tab State
  const [activeSubTab, setActiveSubTab] = useState<'suppliers' | 'products' | 'buyers'>('suppliers');

  return (
    <div className="flex flex-col gap-6 animate-fade-in h-full">
      
      <ConfirmationModal 
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.action}
        onClose={() => setConfirmModal(prev => ({...prev, isOpen: false}))}
        isDanger={confirmModal.isDanger}
      />

      {/* Sub-Navigation */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button 
          onClick={() => setActiveSubTab('suppliers')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeSubTab === 'suppliers' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          <div className="flex items-center gap-2">
            <Users size={16} /> Suppliers
          </div>
        </button>
        <button 
          onClick={() => setActiveSubTab('products')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeSubTab === 'products' ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          <div className="flex items-center gap-2">
            <Package size={16} /> Products & Milk Types
          </div>
        </button>
        <button 
          onClick={() => setActiveSubTab('buyers')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeSubTab === 'buyers' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          <div className="flex items-center gap-2">
            <Briefcase size={16} /> Buyers
          </div>
        </button>
      </div>

      {/* --- Suppliers Section --- */}
      {activeSubTab === 'suppliers' && (
      <div className="flex-1 flex flex-col gap-4 animate-fade-in">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
              <Users size={16} /> Suppliers Database
            </h3>
            <button 
              onClick={() => { resetSupplierForm(); setShowSupplierForm(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-all shadow-sm flex items-center gap-1"
            >
              <Plus size={14} /> Add New
            </button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search suppliers..." 
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
        </div>

        {showSupplierForm && (
          <GlassCard className={`p-4 border-blue-200 animate-slide-up ${editingSupplierId ? 'bg-amber-50/50' : 'bg-blue-50/50'}`}>
             <div className="flex justify-between items-center mb-2">
               <h4 className="text-xs font-bold uppercase text-slate-500">{editingSupplierId ? 'Edit Supplier' : 'New Supplier'}</h4>
               <button onClick={resetSupplierForm}><X size={14} className="text-slate-400 hover:text-red-500"/></button>
             </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <InputField placeholder="Supplier Name*" value={newSupplier.name} onChange={e => setNewSupplier({...newSupplier, name: e.target.value})} />
              <InputField placeholder="Route Group (e.g. Kupiškio)*" value={newSupplier.routeGroup} onChange={e => setNewSupplier({...newSupplier, routeGroup: e.target.value})} />
              <InputField placeholder="Company Code*" value={newSupplier.companyCode} onChange={e => setNewSupplier({...newSupplier, companyCode: e.target.value})} />
              <InputField placeholder="Phone Number" value={newSupplier.phoneNumber} onChange={e => setNewSupplier({...newSupplier, phoneNumber: e.target.value})} />
              <InputField placeholder="Country*" value={newSupplier.country} onChange={e => setNewSupplier({...newSupplier, country: e.target.value})} />
              <InputField placeholder="Address Line 1*" value={newSupplier.addressLine1} onChange={e => setNewSupplier({...newSupplier, addressLine1: e.target.value})} />
              <InputField placeholder="Address Line 2" value={newSupplier.addressLine2} onChange={e => setNewSupplier({...newSupplier, addressLine2: e.target.value})} />
              <InputField type="number" placeholder="Quota (kg)" value={newSupplier.contractQuota} onChange={e => setNewSupplier({...newSupplier, contractQuota: e.target.value})} />
              <div className="col-span-2">
                 <label className="text-xs text-slate-500 font-bold ml-1">Created On*</label>
                 <InputField type="date" value={newSupplier.createdOn} onChange={e => setNewSupplier({...newSupplier, createdOn: e.target.value})} />
              </div>
              
              <div className="col-span-2 grid grid-cols-2 gap-3">
                 <div>
                    <label className="text-xs text-slate-500 font-bold ml-1">Default Milk Type</label>
                    <select 
                      className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      value={newSupplier.defaultMilkType}
                      onChange={e => setNewSupplier({...newSupplier, defaultMilkType: e.target.value})}
                    >
                       <option value="Skim milk">Skim milk</option>
                       <option value="Skim milk concentrate">Skim milk concentrate</option>
                       <option value="Milk protein concentrate">Milk protein concentrate</option>
                       <option value="Permeate concentrate">Permeate concentrate</option>
                    </select>
                 </div>
                 <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                       <input 
                         type="checkbox" 
                         checked={newSupplier.isEco} 
                         onChange={e => setNewSupplier({...newSupplier, isEco: e.target.checked})}
                         className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                       />
                       <span className="text-sm font-medium text-slate-700">Ecological Supplier</span>
                    </label>
                 </div>
              </div>

              {/* Pricing Section */}
              <div className="col-span-2 border-t border-blue-200 mt-2 pt-2">
                <label className="text-xs text-blue-700 font-bold uppercase tracking-wider flex items-center gap-1 mb-2">
                  <Coins size={12}/> Financial Terms
                </label>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <span className="text-[10px] text-slate-500">Base Price (€/kg)</span>
                    <InputField type="number" step="0.01" value={newSupplier.basePricePerKg} onChange={e => setNewSupplier({...newSupplier, basePricePerKg: e.target.value})} />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500">Normal Milk Price (€/kg)</span>
                    <InputField type="number" step="0.01" value={newSupplier.normalMilkPricePerKg} onChange={e => setNewSupplier({...newSupplier, normalMilkPricePerKg: e.target.value})} />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500">Fat Bonus (€/0.1%)</span>
                    <InputField type="number" step="0.001" value={newSupplier.fatBonusPerPct} onChange={e => setNewSupplier({...newSupplier, fatBonusPerPct: e.target.value})} />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500">Prot Bonus (€/0.1%)</span>
                    <InputField type="number" step="0.001" value={newSupplier.proteinBonusPerPct} onChange={e => setNewSupplier({...newSupplier, proteinBonusPerPct: e.target.value})} />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={confirmSupplierSubmit} className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium flex items-center gap-2">
                <Save size={14}/> {editingSupplierId ? 'Update' : 'Save'}
              </button>
              <button onClick={resetSupplierForm} className="bg-slate-200 text-slate-600 px-4 py-1.5 rounded text-sm font-medium">Cancel</button>
            </div>
          </GlassCard>
        )}

        <div className="w-full overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3 hidden md:table-cell">Code</th>
                <th className="p-3 text-right">Route/Info</th>
                <th className="p-3 text-center w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSuppliers.map(s => {
                const isExpanded = expandedSupplierId === s.id;
                return (
                  <React.Fragment key={s.id}>
                    <tr 
                      className={`hover:bg-slate-50 cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/50' : ''}`}
                      onClick={() => toggleSupplierExpand(s.id)}
                    >
                      <td className="p-3">
                        <div className="font-medium text-slate-800 flex items-center gap-2">
                          {isExpanded ? <ChevronUp size={14} className="text-blue-500" /> : <ChevronDown size={14} className="text-slate-400" />}
                          {s.name}
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5 md:hidden">
                           <MapPin size={10} /> {s.addressLine1}
                        </div>
                      </td>
                      <td className="p-3 text-slate-600 font-mono text-xs hidden md:table-cell">{s.companyCode}</td>
                      <td className="p-3 text-right">
                        <div className="text-slate-700 text-xs font-semibold">{s.routeGroup}</div>
                        <div className="text-[10px] text-slate-400">Quota: {s.contractQuota.toLocaleString()}</div>
                      </td>
                      <td className="p-3 text-center">
                        <button 
                          onClick={(e) => { e.stopPropagation(); confirmSupplierDelete(s.id, s.name); }} 
                          className="text-slate-300 hover:text-red-500 transition-colors p-1"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/50 animate-slide-up">
                        <td colSpan={4} className="p-0">
                          <div className="p-4 border-b border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div className="space-y-2">
                               <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Company Details</h5>
                               <div className="flex gap-2">
                                  <Building2 size={16} className="text-slate-400 shrink-0"/>
                                  <div>
                                    <div className="font-semibold text-slate-700">{s.name}</div>
                                    <div className="text-slate-500 text-xs">Code: {s.companyCode}</div>
                                  </div>
                               </div>
                               <div className="flex gap-2">
                                  <Phone size={16} className="text-slate-400 shrink-0"/>
                                  <div className="text-slate-600">{s.phoneNumber || 'N/A'}</div>
                               </div>
                               
                               <div className="bg-white rounded-md p-2 border border-slate-200 mt-2">
                                <h6 className="text-[10px] font-bold uppercase text-slate-400 mb-1">Financial Terms</h6>
                                <div className="grid grid-cols-4 gap-2 text-xs">
                                  <div>
                                    <span className="block text-[10px] text-slate-400">Base</span>
                                    €{s.basePricePerKg?.toFixed(2)}
                                  </div>
                                  <div>
                                    <span className="block text-[10px] text-slate-400">Normal</span>
                                    €{(s as any).normalMilkPricePerKg ? (s as any).normalMilkPricePerKg.toFixed(2) : (s.basePricePerKg?.toFixed(2) ?? '0.00')}
                                  </div>
                                  <div>
                                    <span className="block text-[10px] text-slate-400">Fat+</span>
                                    €{s.fatBonusPerPct}
                                  </div>
                                  <div>
                                    <span className="block text-[10px] text-slate-400">Prot+</span>
                                    €{s.proteinBonusPerPct}
                                  </div>
                                </div>
                               </div>
                            </div>

                            <div className="space-y-2">
                               <div className="flex justify-between items-start">
                                  <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Location & Date</h5>
                                  <button 
                                    onClick={(e) => startEditSupplier(s, e)}
                                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs font-bold border border-blue-200 bg-white px-3 py-1.5 rounded-md hover:bg-blue-50 transition-colors shadow-sm"
                                  >
                                    <Pencil size={12} /> Edit
                                  </button>
                               </div>
                               <div className="flex gap-2">
                                  <MapPin size={16} className="text-slate-400 shrink-0"/>
                                  <div className="text-slate-600 text-xs">
                                    <div>{s.addressLine1}</div>
                                    {s.addressLine2 && <div>{s.addressLine2}</div>}
                                    <div>{s.country}</div>
                                  </div>
                               </div>
                               <div className="flex gap-2 items-center">
                                  <Calendar size={16} className="text-slate-400 shrink-0"/>
                                  <div className="text-slate-500 text-xs">Created: {new Date(s.createdOn).toLocaleDateString()}</div>
                               </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* --- Products & Milk Types Section --- */}
      {activeSubTab === 'products' && (
      <div className="flex-1 flex flex-col gap-4 animate-fade-in">
        
        {/* Products */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
              <Package size={16} /> Products Database
            </h3>
            <button 
              onClick={() => { resetProductForm(); setShowProductForm(true); }}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-all shadow-sm flex items-center gap-1"
            >
              <Plus size={14} /> Add Product
            </button>
          </div>
        </div>

        {showProductForm && (
          <GlassCard className={`p-4 border-amber-200 animate-slide-up ${editingProductId ? 'bg-amber-50/50' : 'bg-amber-50/50'}`}>
             <div className="flex justify-between items-center mb-2">
               <h4 className="text-xs font-bold uppercase text-slate-500">{editingProductId ? 'Edit Product' : 'New Product'}</h4>
               <button onClick={resetProductForm}><X size={14} className="text-slate-400 hover:text-red-500"/></button>
             </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <InputField placeholder="Product ID (e.g. MPC85)*" value={newProduct.id} onChange={e => setNewProduct({...newProduct, id: e.target.value})} disabled={!!editingProductId} />
              <InputField placeholder="Product Name*" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} />
              <div className="col-span-2">
                 <InputField placeholder="Details / Description" value={newProduct.details} onChange={e => setNewProduct({...newProduct, details: e.target.value})} />
              </div>
              <InputField type="number" placeholder="Pallet Weight (kg)" value={newProduct.defaultPalletWeight} onChange={e => setNewProduct({...newProduct, defaultPalletWeight: parseFloat(e.target.value) || 0})} />
              <InputField type="number" placeholder="Bag Weight (kg)" value={newProduct.defaultBagWeight} onChange={e => setNewProduct({...newProduct, defaultBagWeight: parseFloat(e.target.value) || 0})} />
              <InputField type="number" placeholder="Target Protein %" value={newProduct.proteinTargetPct} onChange={e => setNewProduct({...newProduct, proteinTargetPct: parseFloat(e.target.value) || 0})} />
              <InputField type="number" step="0.001" placeholder="Yield Factor" value={newProduct.yieldFactor} onChange={e => setNewProduct({...newProduct, yieldFactor: parseFloat(e.target.value) || 0})} />
            </div>
            <div className="flex gap-2">
              <button onClick={confirmProductSubmit} className="bg-amber-600 text-white px-4 py-1.5 rounded text-sm font-medium flex items-center gap-2">
                <Save size={14}/> {editingProductId ? 'Update' : 'Save'}
              </button>
              <button onClick={resetProductForm} className="bg-slate-200 text-slate-600 px-4 py-1.5 rounded text-sm font-medium">Cancel</button>
            </div>
          </GlassCard>
        )}

        <div className="w-full overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-sm mb-4">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
              <tr>
                <th className="p-3">ID</th>
                <th className="p-3">Name</th>
                <th className="p-3 text-right">Specs</th>
                <th className="p-3 text-center w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 font-mono text-xs text-slate-600">{p.id}</td>
                  <td className="p-3 font-medium text-slate-800">
                    {p.name}
                    <div className="text-[10px] text-slate-400 font-normal">{p.details}</div>
                  </td>
                  <td className="p-3 text-right text-xs text-slate-500">
                    <div>Prot: {p.proteinTargetPct}%</div>
                    <div>Yield: {p.yieldFactor}</div>
                  </td>
                  <td className="p-3 text-center flex justify-end gap-1">
                    <button onClick={() => startEditProduct(p)} className="text-slate-300 hover:text-blue-500 p-1"><Pencil size={14}/></button>
                    <button onClick={() => confirmProductDelete(p.id, p.name)} className="text-slate-300 hover:text-red-500 p-1"><Trash2 size={14}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Milk Types */}
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
            <Droplets size={16} /> Milk Types
          </h3>
          
          <GlassCard className="p-3 bg-slate-50 border-slate-200">
             <div className="flex gap-2 mb-3">
               <input 
                 className="flex-1 bg-white border border-slate-300 rounded-md px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                 placeholder="New Milk Type..."
                 value={newMilkType}
                 onChange={e => setNewMilkType(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && handleAddMilkType()}
               />
               <button onClick={handleAddMilkType} className="bg-blue-600 text-white px-3 py-1.5 rounded-md text-xs font-bold hover:bg-blue-700 transition-colors">
                 Add
               </button>
             </div>
             <div className="flex flex-wrap gap-2">
               {milkTypes.map(type => (
                 <div key={type} className="bg-white border border-slate-200 rounded-full px-3 py-1 text-xs text-slate-600 flex items-center gap-2 shadow-sm">
                   {type}
                   <button onClick={() => confirmMilkTypeDelete(type)} className="text-slate-300 hover:text-red-500"><X size={12}/></button>
                 </div>
               ))}
             </div>
          </GlassCard>
        </div>

      </div>
      )}

      {/* --- Buyers Section --- */}
      {activeSubTab === 'buyers' && (
      <div className="flex-1 flex flex-col gap-4 animate-fade-in">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
              <Briefcase size={16} /> Buyers Database
            </h3>
            <button 
              onClick={() => { resetBuyerForm(); setShowBuyerForm(true); }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-all shadow-sm flex items-center gap-1"
            >
              <Plus size={14} /> Add New
            </button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search buyers..." 
              value={buyerSearch}
              onChange={(e) => setBuyerSearch(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs focus:ring-2 focus:ring-emerald-100 outline-none"
            />
          </div>
        </div>

        {showBuyerForm && (
          <GlassCard className={`p-4 border-emerald-200 animate-slide-up ${editingBuyerId ? 'bg-amber-50/50' : 'bg-emerald-50/50'}`}>
             <div className="flex justify-between items-center mb-2">
               <h4 className="text-xs font-bold uppercase text-slate-500">{editingBuyerId ? 'Edit Buyer' : 'New Buyer'}</h4>
               <button onClick={resetBuyerForm}><X size={14} className="text-slate-400 hover:text-red-500"/></button>
             </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div className="col-span-2">
                <InputField placeholder="Buyer Name*" value={newBuyer.name} onChange={e => setNewBuyer({...newBuyer, name: e.target.value})} />
              </div>
              <InputField placeholder="Company Code*" value={newBuyer.companyCode} onChange={e => setNewBuyer({...newBuyer, companyCode: e.target.value})} />
              <InputField placeholder="Phone Number" value={newBuyer.phoneNumber} onChange={e => setNewBuyer({...newBuyer, phoneNumber: e.target.value})} />
              <InputField placeholder="Country*" value={newBuyer.country} onChange={e => setNewBuyer({...newBuyer, country: e.target.value})} />
              <InputField placeholder="Address Line 1*" value={newBuyer.addressLine1} onChange={e => setNewBuyer({...newBuyer, addressLine1: e.target.value})} />
              <InputField placeholder="Address Line 2" value={newBuyer.addressLine2} onChange={e => setNewBuyer({...newBuyer, addressLine2: e.target.value})} />
              <div>
                 <label className="text-xs text-slate-500 font-bold ml-1">Created On*</label>
                 <InputField type="date" value={newBuyer.createdOn} onChange={e => setNewBuyer({...newBuyer, createdOn: e.target.value})} />
              </div>
            </div>

            {/* Contracts Management Section */}
            <div className="mt-4 pt-3 border-t border-emerald-200/50">
               <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-emerald-700 font-bold uppercase tracking-wider flex items-center gap-1">
                      <FileText size={12}/> Contracts
                  </label>
                  {editingContractId && (
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 animate-pulse">
                      <Pencil size={10}/> Editing Mode
                    </span>
                  )}
               </div>
               
               {/* Add/Edit Contract Row */}
               <div className={`p-2 rounded-lg border mb-2 transition-colors ${editingContractId ? 'bg-amber-50 border-amber-200' : 'bg-white/50 border-emerald-100'}`}>
                 <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-2">
                    <input 
                      className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs" 
                      placeholder="Contract No." 
                      value={contractForm.contractNumber}
                      onChange={e => setContractForm({...contractForm, contractNumber: e.target.value})}
                    />
                     <select 
                      className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs"
                      value={contractForm.productId}
                      onChange={e => setContractForm({...contractForm, productId: e.target.value})}
                    >
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <input 
                      type="number" className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs" 
                      placeholder="Price €/kg" 
                      value={contractForm.pricePerKg}
                      onChange={e => setContractForm({...contractForm, pricePerKg: e.target.value})}
                    />
                    <input 
                      type="number" className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs" 
                      placeholder="Amount (kg)" 
                      value={contractForm.agreedAmountKg}
                      onChange={e => setContractForm({...contractForm, agreedAmountKg: e.target.value})}
                    />
                    <div className="flex gap-1">
                      <button 
                        onClick={handleContractSubmit} 
                        className={`flex-1 text-white rounded text-xs font-bold shadow-sm flex items-center justify-center gap-1 ${editingContractId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
                      >
                        {editingContractId ? <Save size={12}/> : <Plus size={12}/>}
                        {editingContractId ? 'Update' : 'Add'}
                      </button>
                      {editingContractId && (
                        <button onClick={cancelContractEdit} className="px-2 bg-slate-200 text-slate-500 hover:text-slate-700 rounded text-xs font-bold">
                           <X size={12}/>
                        </button>
                      )}
                    </div>
                 </div>
                 <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[9px] text-slate-400 font-bold uppercase">Start Date</label>
                      <input type="date" className="w-full bg-white border border-slate-300 rounded p-1 text-xs" value={contractForm.startDate} onChange={e => setContractForm({...contractForm, startDate: e.target.value})} />
                    </div>
                    <div className="flex-1">
                      <label className="text-[9px] text-slate-400 font-bold uppercase">End Date</label>
                      <input type="date" className="w-full bg-white border border-slate-300 rounded p-1 text-xs" value={contractForm.endDate} onChange={e => setContractForm({...contractForm, endDate: e.target.value})} />
                    </div>
                 </div>
               </div>

               {/* Contracts List */}
               {newBuyer.contracts.length > 0 && (
                 <div className="max-h-24 overflow-y-auto space-y-1">
                   {newBuyer.contracts.map(c => (
                     <div key={c.id} className={`flex justify-between items-center p-1.5 rounded border text-xs transition-colors ${editingContractId === c.id ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-200' : 'bg-white border-slate-200'}`}>
                        <div className="flex flex-col">
                           <span className="font-bold text-slate-700">{c.contractNumber} ({c.productId})</span>
                           <span className="text-[10px] text-slate-400">
                             €{c.pricePerKg}/kg • {c.agreedAmountKg ? `${c.agreedAmountKg.toLocaleString()}kg • ` : ''}{new Date(c.startDate).toLocaleDateString()} - {new Date(c.endDate).toLocaleDateString()}
                           </span>
                        </div>
                        <div className="flex gap-1">
                           <button onClick={() => startEditContract(c)} className="text-slate-400 hover:text-blue-500 p-1" title="Edit Contract"><Pencil size={12}/></button>
                           <button onClick={() => removeContractFromBuyer(c.id)} className="text-slate-400 hover:text-red-500 p-1" title="Remove Contract"><Trash2 size={12}/></button>
                        </div>
                     </div>
                   ))}
                 </div>
               )}
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={confirmBuyerSubmit} className="bg-emerald-600 text-white px-4 py-1.5 rounded text-sm font-medium flex items-center gap-2">
                <Save size={14} /> {editingBuyerId ? 'Update' : 'Save'}
              </button>
              <button onClick={resetBuyerForm} className="bg-slate-200 text-slate-600 px-4 py-1.5 rounded text-sm font-medium">Cancel</button>
            </div>
          </GlassCard>
        )}

        <div className="w-full overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Country</th>
                <th className="p-3 text-right hidden md:table-cell">Contracts</th>
                <th className="p-3 text-center w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBuyers.map(b => {
                const isExpanded = expandedBuyerId === b.id;
                return (
                  <React.Fragment key={b.id}>
                    <tr 
                      className={`hover:bg-slate-50 cursor-pointer transition-colors ${isExpanded ? 'bg-emerald-50/50' : ''}`}
                      onClick={() => toggleBuyerExpand(b.id)}
                    >
                      <td className="p-3">
                        <div className="font-medium text-slate-800 flex items-center gap-2">
                          {isExpanded ? <ChevronUp size={14} className="text-emerald-500" /> : <ChevronDown size={14} className="text-slate-400" />}
                          {b.name}
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                           <Phone size={10} /> {b.phoneNumber || '-'}
                        </div>
                      </td>
                      <td className="p-3 text-slate-600">
                        <div className="flex items-center gap-1"><Globe size={12}/> {b.country}</div>
                      </td>
                      <td className="p-3 text-right font-mono text-xs text-slate-500 hidden md:table-cell">
                        {b.contracts?.length || 0} active
                      </td>
                      <td className="p-3 text-center w-16">
                        <button 
                          onClick={(e) => { e.stopPropagation(); confirmBuyerDelete(b.id, b.name); }} 
                          className="text-slate-300 hover:text-red-500 transition-colors p-1"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/50 animate-slide-up">
                         <td colSpan={4} className="p-0">
                           <div className="p-4 border-b border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                             <div className="space-y-2">
                                <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Company Details</h5>
                                <div className="flex gap-2">
                                   <Building2 size={16} className="text-slate-400 shrink-0"/>
                                   <div>
                                     <div className="font-semibold text-slate-700">{b.name}</div>
                                     <div className="text-slate-500 text-xs">Code: {b.companyCode}</div>
                                   </div>
                                </div>
                                <div className="flex gap-2">
                                   <Phone size={16} className="text-slate-400 shrink-0"/>
                                   <div className="text-slate-600">{b.phoneNumber || 'N/A'}</div>
                                </div>
                             </div>

                             <div className="space-y-2">
                                <div className="flex justify-between items-start">
                                  <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Contracts</h5>
                                  <button 
                                    onClick={(e) => startEditBuyer(b, e)}
                                    className="text-emerald-600 hover:text-emerald-800 flex items-center gap-1 text-xs font-bold border border-emerald-200 bg-white px-3 py-1.5 rounded-md hover:bg-emerald-50 transition-colors shadow-sm"
                                  >
                                    <Pencil size={12} /> Edit
                                  </button>
                                </div>
                                {b.contracts && b.contracts.length > 0 ? (
                                  <div className="space-y-1">
                                    {b.contracts.map(c => (
                                      <div key={c.id} className="bg-white p-2 rounded border border-slate-200 text-xs flex justify-between">
                                         <div>
                                            <span className="font-bold text-slate-700">{c.contractNumber}</span>
                                            <span className="mx-1 text-slate-300">|</span>
                                            <span className="text-slate-600">{c.productId}</span>
                                         </div>
                                         <div className="font-mono text-emerald-600 font-bold">€{c.pricePerKg}</div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-xs text-slate-400 italic">No active contracts.</div>
                                )}
                             </div>
                           </div>
                         </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

    </div>
  );
};
