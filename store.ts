
import { create } from 'zustand';
import { IntakeEntry, OutputEntry, Alert, DispatchEntry, Supplier, Buyer, GlobalConfig, Product, BuyerContract } from './types';
import { DEFAULT_CONFIG } from './constants';

interface AppState {
  activeTab: 'input' | 'preview' | 'trends' | 'ai' | 'inventory' | 'settings';
  setActiveTab: (tab: 'input' | 'preview' | 'trends' | 'ai' | 'inventory' | 'settings') => void;

  // Config
  globalConfig: GlobalConfig;
  updateGlobalConfig: (config: Partial<GlobalConfig>) => void;

  // Hydration state
  isHydrating: boolean;
  hydrateError: string | null;
  hydrateFromApi: () => Promise<void>;

  // Database State
  suppliers: Supplier[];
  buyers: Buyer[];
  products: Product[];
  milkTypes: string[];

  // Logs State
  intakeEntries: IntakeEntry[];
  outputEntries: OutputEntry[];
  dispatchEntries: DispatchEntry[];
  alerts: Alert[];
  // Analytics cache
  analytics: {
    milkSpend?: {
      from: number;
      to: number;
      totalCost: number;
      totalKg: number;
      avgPricePerKg: number;
      bySupplier: Array<{ supplierId: string; supplierName: string; totalCost: number; totalKg: number; avgPricePerKg: number; }>;
    } | null;
  };
  fetchMilkSpendRange: (from: string, to: string) => Promise<void>;
  // Last requested range for milk spend (ISO strings)
  lastMilkSpendFrom?: string | null;
  lastMilkSpendTo?: string | null;
  analyticsError?: string | null;

  // Edit Mode
  editingIntakeId: string | null;
  setEditingIntakeId: (id: string | null) => void;
  editingOutputId: string | null;
  setEditingOutputId: (id: string | null) => void;

  // Actions (async)
  addSupplier: (supplier: Omit<Supplier, 'id'>) => Promise<void>;
  updateSupplier: (id: string, updates: Partial<Supplier>) => Promise<void>;
  removeSupplier: (id: string) => Promise<void>;

  addBuyer: (buyer: Omit<Buyer, 'id'>) => Promise<void>;
  updateBuyer: (id: string, updates: Partial<Buyer>) => Promise<void>;
  removeBuyer: (id: string) => Promise<void>;

  addContract: (buyerId: string, contract: Omit<BuyerContract, 'id'>) => Promise<void>;
  updateContract: (id: string, updates: Partial<BuyerContract>) => Promise<void>;
  removeContract: (id: string) => Promise<void>;

  addProduct: (product: Product) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  removeProduct: (id: string) => Promise<void>;

  addMilkType: (type: string) => Promise<void>;
  removeMilkType: (type: string) => Promise<void>;

  addIntakeEntry: (entry: Omit<IntakeEntry, 'id' | 'calculatedCost'> & { tags?: string[] }) => Promise<void>;
  updateIntakeEntry: (id: string, updates: Partial<IntakeEntry> & { tags?: string[] }) => Promise<void>;
  toggleIntakeDiscard: (id: string) => void;
  dismissTempAlert: (id: string) => void;
  removeIntakeEntry: (id: string) => Promise<void>;

  addOutputEntry: (payload: { productId: string; batchId?: string; packagingString?: string; destination?: string }) => Promise<void>;
  updateOutputEntry: (id: string, packagingString: string) => Promise<void>;
  removeOutputEntry: (id: string) => Promise<void>;

  addDispatchEntry: (entry: Omit<DispatchEntry, 'id'>) => Promise<void>;
  updateDispatchEntry: (id: string, updates: Partial<DispatchEntry>) => Promise<void>;
  removeDispatchEntry: (id: string) => Promise<void>;

  // Shipments
  addDispatchShipment: (dispatchId: string, payload: any) => Promise<void>;
  removeDispatchShipment: (dispatchId: string, shipmentId: string) => Promise<void>;

  generateAIInsights: () => Promise<string>;
}

const calculateMilkCost = (quantity: number, fat: number, protein: number, supplier: Supplier | undefined, defaultConfig: GlobalConfig) => {
  if (!supplier) return quantity * defaultConfig.defaultMilkBasePrice;

  const fatDiff = fat - 4.0;
  const protDiff = protein - 3.2;

  let price = supplier.basePricePerKg ?? defaultConfig.defaultMilkBasePrice;
  price += (fatDiff * 10) * (supplier.fatBonusPerPct ?? 0);
  price += (protDiff * 10) * (supplier.proteinBonusPerPct ?? 0);
  price = Math.max(0, price);
  return quantity * price;
};

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) }, ...opts });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

export const useStore = create<AppState>((set, get) => ({
  activeTab: 'input',
  setActiveTab: (tab) => set({ activeTab: tab }),

  globalConfig: DEFAULT_CONFIG,
  updateGlobalConfig: (config) => set((state) => ({ globalConfig: { ...state.globalConfig, ...config } })),

  isHydrating: false,
  hydrateError: null,
  hydrateFromApi: async () => {
    set({ isHydrating: true, hydrateError: null });
    try {
      const data = await api<any>('/api/bootstrap');
      set(() => ({
        suppliers: (data.suppliers || []).map((s: any) => ({ ...s })),
        buyers: (data.buyers || []).map((b: any) => ({ ...b, contracts: b.contracts?.map((c: any) => ({ ...c })) || [] })),
        products: data.products || [],
        milkTypes: data.milkTypes || [],
        intakeEntries: (data.intakeEntries || []).map((i: any) => ({ ...i })),
        outputEntries: (data.outputEntries || []).map((o: any) => ({ ...o })),
        dispatchEntries: (data.dispatchEntries || []).map((d: any) => ({ ...d })),
        isHydrating: false
      }));
    } catch (err: any) {
      set({ hydrateError: err.message || String(err), isHydrating: false });
    }
  },

  suppliers: [],
  buyers: [],
  products: [],
  milkTypes: [],

  intakeEntries: [],
  outputEntries: [],
  dispatchEntries: [],
  alerts: [],

  analytics: { milkSpend: null },

  lastMilkSpendFrom: null,
  lastMilkSpendTo: null,
  analyticsError: null,

  fetchMilkSpendRange: async (from, to) => {
    try {
      const data = await api<any>(`/api/milk-spend-range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      set((s) => ({ analytics: { milkSpend: { from: data.from, to: data.to, totalCost: data.totalCost, totalKg: data.totalKg, avgPricePerKg: data.avgPricePerKg, bySupplier: data.bySupplier.map((b: any) => ({ supplierId: b.supplierId, supplierName: b.supplierName, totalCost: b.totalCost, totalKg: b.totalKg, avgPricePerKg: b.avgPricePerKg })) } }, lastMilkSpendFrom: from, lastMilkSpendTo: to, analyticsError: null }));
    } catch (err: any) {
      console.error('Failed to fetch milk spend range', err);
      set((s) => ({ analytics: { milkSpend: null }, analyticsError: err?.message ?? String(err) }));
    }
  },

  editingIntakeId: null,
  setEditingIntakeId: (id) => set({ editingIntakeId: id }),
  editingOutputId: null,
  setEditingOutputId: (id) => set({ editingOutputId: id }),

  addSupplier: async (supplier) => {
    const created = await api<Supplier>('/api/suppliers', { method: 'POST', body: JSON.stringify(supplier) });
    set((state) => ({ suppliers: [created, ...state.suppliers] }));
  },

  updateSupplier: async (id, updates) => {
    const updated = await api<Supplier>(`/api/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
    set((state) => ({ suppliers: state.suppliers.map(s => s.id === id ? { ...s, ...updated } : s) }));
  },

  removeSupplier: async (id) => {
    await api('/api/suppliers/' + id, { method: 'DELETE' });
    set((state) => ({ suppliers: state.suppliers.filter(s => s.id !== id) }));
  },

  addBuyer: async (buyer) => {
    const created = await api<Buyer>('/api/buyers', { method: 'POST', body: JSON.stringify(buyer) });
    set((state) => ({ buyers: [created, ...state.buyers] }));
  },

  updateBuyer: async (id, updates) => {
    const updated = await api<Buyer>(`/api/buyers/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
    set((state) => ({ buyers: state.buyers.map(b => b.id === id ? { ...b, ...updated } : b) }));
  },

  removeBuyer: async (id) => {
    await api('/api/buyers/' + id, { method: 'DELETE' });
    set((state) => ({ buyers: state.buyers.filter(b => b.id !== id) }));
  },

  addContract: async (buyerId, contract) => {
    const created = await api<BuyerContract>(`/api/buyers/${buyerId}/contracts`, { method: 'POST', body: JSON.stringify(contract) });
    set((state) => ({ buyers: state.buyers.map(b => b.id === buyerId ? { ...b, contracts: [...(b.contracts || []), created] } : b) }));
  },

  updateContract: async (id, updates) => {
    const updated = await api<BuyerContract>(`/api/contracts/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
    set((state) => ({ buyers: state.buyers.map(b => ({ ...b, contracts: b.contracts?.map(c => c.id === id ? { ...c, ...updated } : c) || [] })) }));
  },

  removeContract: async (id) => {
    await api(`/api/contracts/${id}`, { method: 'DELETE' });
    set((state) => ({ buyers: state.buyers.map(b => ({ ...b, contracts: b.contracts?.filter(c => c.id !== id) || [] })) }));
  },

  addProduct: async (product) => {
    const created = await api<Product>('/api/products', { method: 'POST', body: JSON.stringify(product) });
    set((state) => ({ products: [created, ...state.products] }));
  },

  updateProduct: async (id, updates) => {
    const updated = await api<Product>(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
    set((state) => ({ products: state.products.map(p => p.id === id ? { ...p, ...updated } : p) }));
  },

  removeProduct: async (id) => {
    await api(`/api/products/${id}`, { method: 'DELETE' });
    set((state) => ({ products: state.products.filter(p => p.id !== id) }));
  },

  addMilkType: async (type) => {
    await api('/api/milk-types', { method: 'POST', body: JSON.stringify({ name: type }) });
    set((state) => ({ milkTypes: [...state.milkTypes, type] }));
  },

  removeMilkType: async (type) => {
    await api(`/api/milk-types/${encodeURIComponent(type)}`, { method: 'DELETE' });
    set((state) => ({ milkTypes: state.milkTypes.filter(t => t !== type) }));
  },

  addIntakeEntry: async (entry) => {
    const state = get();
    const supplier = state.suppliers.find(s => s.id === entry.supplierId);
    const calculatedCost = calculateMilkCost(entry.quantityKg, entry.fatPct, entry.proteinPct, supplier, state.globalConfig);
    const payload = { ...entry, calculatedCost, tags: entry.tags || [] };
    const created = await api<IntakeEntry>('/api/intake-entries', { method: 'POST', body: JSON.stringify(payload) });
    set((s) => ({ intakeEntries: [{ ...created }, ...s.intakeEntries] }));
  },

  updateIntakeEntry: async (id, updates) => {
    const state = get();
    const existing = state.intakeEntries.find(i => i.id === id);
    const supplier = state.suppliers.find(s => s.id === (updates.supplierId || existing?.supplierId));
    const calculatedCost = calculateMilkCost((updates.quantityKg ?? existing?.quantityKg) || 0, (updates.fatPct ?? existing?.fatPct) || 0, (updates.proteinPct ?? existing?.proteinPct) || 0, supplier, state.globalConfig);
    const payload = { ...updates, calculatedCost, tags: (updates as any).tags ?? undefined };
    const updated = await api<IntakeEntry>(`/api/intake-entries/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    set((s) => ({ intakeEntries: s.intakeEntries.map(i => i.id === id ? { ...i, ...updated } : i), editingIntakeId: null }));
  },

  toggleIntakeDiscard: async (id) => {
    const state = get();
    const current = state.intakeEntries.find(i => i.id === id);
    if (!current) return;
    const newDiscard = !current.isDiscarded;
    try {
      // Use existing updateIntakeEntry which performs the PUT and replaces the entry in state
      await get().updateIntakeEntry(id, { isDiscarded: newDiscard });
      // If we have a last fetched milk-spend range, refresh it so KPIs update
      const from = get().lastMilkSpendFrom;
      const to = get().lastMilkSpendTo;
      if (from && to) {
        await get().fetchMilkSpendRange(from, to);
      }
    } catch (err: any) {
      console.error('toggleIntakeDiscard failed', err);
      set(() => ({ analyticsError: err?.message ?? String(err) }));
    }
  },

  dismissTempAlert: (id) => set((state) => ({ intakeEntries: state.intakeEntries.map(e => e.id === id ? { ...e, isTempAlertDismissed: true } : e) })),

  removeIntakeEntry: async (id) => {
    await api(`/api/intake-entries/${id}`, { method: 'DELETE' });
    set((state) => ({ intakeEntries: state.intakeEntries.filter(e => e.id !== id) }));
  },

  addOutputEntry: async (payload) => {
    const created = await api<OutputEntry>('/api/output-entries', { method: 'POST', body: JSON.stringify({ ...payload, timestamp: Date.now() }) });
    set((s) => ({ outputEntries: [{ ...created }, ...s.outputEntries] }));
  },

  updateOutputEntry: async (id, packagingString) => {
    const updated = await api<OutputEntry>(`/api/output-entries/${id}`, { method: 'PUT', body: JSON.stringify({ packagingString }) });
    set((s) => ({ outputEntries: s.outputEntries.map(e => e.id === id ? { ...e, ...updated } : e), editingOutputId: null }));
  },

  removeOutputEntry: async (id) => {
    await api(`/api/output-entries/${id}`, { method: 'DELETE' });
    set((s) => ({ outputEntries: s.outputEntries.filter(e => e.id !== id) }));
  },

  addDispatchEntry: async (entry) => {
    const created = await api<DispatchEntry>('/api/dispatch-entries', { method: 'POST', body: JSON.stringify(entry) });
    set((s) => ({ dispatchEntries: [{ ...created }, ...s.dispatchEntries] }));
  },

  updateDispatchEntry: async (id, updates) => {
    const updated = await api<DispatchEntry>(`/api/dispatch-entries/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
    set((s) => ({ dispatchEntries: s.dispatchEntries.map(d => d.id === id ? { ...d, ...updated } : d) }));
  },

  removeDispatchEntry: async (id) => {
    await api(`/api/dispatch-entries/${id}`, { method: 'DELETE' });
    set((s) => ({ dispatchEntries: s.dispatchEntries.filter(d => d.id !== id) }));
  },

  addDispatchShipment: async (dispatchId, payload) => {
    const updated = await api<DispatchEntry>(`/api/dispatch-entries/${dispatchId}/shipments`, { method: 'POST', body: JSON.stringify(payload) });
    set((s) => ({ dispatchEntries: s.dispatchEntries.map(d => d.id === dispatchId ? { ...updated } : d) }));
  },

  removeDispatchShipment: async (dispatchId, shipmentId) => {
    const updated = await api<DispatchEntry>(`/api/dispatch-entries/${dispatchId}/shipments/${shipmentId}`, { method: 'DELETE' });
    set((s) => ({ dispatchEntries: s.dispatchEntries.map(d => d.id === dispatchId ? { ...updated } : d) }));
  },

  generateAIInsights: async () => {
    const state = get();
    const totalIntake = state.intakeEntries.reduce((acc, curr) => acc + curr.quantityKg, 0);
    const mpc85Produced = state.outputEntries
      .filter(e => e.productId === 'MPC85')
      .reduce((acc, curr) => acc + (curr.parsed?.totalWeight || 0), 0);
    const mpc85Dispatched = state.dispatchEntries
      .filter(e => e.productId === 'MPC85' && e.status === 'confirmed')
      .reduce((acc, curr) => acc + curr.quantityKg, 0);
    const mpc85Planned = state.dispatchEntries
      .filter(e => e.productId === 'MPC85' && e.status === 'planned')
      .reduce((acc, curr) => acc + curr.quantityKg, 0);

    const stockMPC85 = mpc85Produced - mpc85Dispatched;
    const isLowStock = stockMPC85 < 20000;
    const futureStockRisk = (stockMPC85 - mpc85Planned) < 0;

    const totalRevenue = state.dispatchEntries
      .filter(e => e.status === 'confirmed')
      .reduce((acc, curr) => acc + curr.totalRevenue, 0);
    const totalMilkCost = state.intakeEntries.reduce((acc, curr) => acc + curr.calculatedCost, 0);

    return new Promise((resolve) => {
      setTimeout(() => {
        let text = `### AI Operational & Financial Analysis\n\n`;
        text += `**Mass Balance**: Intake is **${totalIntake.toLocaleString()}kg**. `;
        if (totalIntake > 0) text += `Efficiency looks stable.\n\n`;
        text += `**Financial Snapshot**: \n`;
        text += `- Confirmed Revenue: **€${totalRevenue.toLocaleString()}**\n`;
        text += `- Raw Material Cost: **€${totalMilkCost.toLocaleString()}**\n`;
        if (totalRevenue > totalMilkCost) text += `> Gross margin is positive. Continue prioritizing high-protein intake.\n\n`;
        text += `**Inventory Status**: \n`;
        text += `- MPC 85 Physical Stock: **${stockMPC85.toLocaleString()} kg**.\n`;
        if (futureStockRisk) text += `> ⚠️ **Planning Alert**: You have planned sales of **${mpc85Planned.toLocaleString()} kg** which exceeds current stock. Schedule MPC85 production immediately.\n\n`;
        else if (isLowStock) text += `> ⚠️ **Warning**: Stock is insufficient for large spot orders. Prioritize MPC85 production for the next 12h.\n\n`;
        else text += `- Stock levels are healthy for confirmed and planned dispatches.\n\n`;
        resolve(text);
      }, 1500);
    });
  }
}));
