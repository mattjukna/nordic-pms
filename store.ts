
import { create } from 'zustand';
import { apiFetch, AuthError } from './services/apiFetch';
import { IntakeEntry, OutputEntry, Alert, DispatchEntry, Supplier, Buyer, GlobalConfig, Product, BuyerContract, StockAdjustment, SupplierQuota } from './types';
import { DEFAULT_CONFIG } from './constants';
import { getEffectiveIntakeQuantityKg } from './utils/intakeCoefficient';

type IntakeEntryPayload = Omit<IntakeEntry, 'id' | 'calculatedCost' | 'effectiveQuantityKg' | 'labCoefficient'> & {
  tags?: string[];
  applyLabCoefficient?: boolean;
  manualLabCoefficient?: number | null;
  invoiceTotalEur?: number | null;
};

type IntakeEntryUpdatePayload = Partial<IntakeEntryPayload> & { tags?: string[] };

interface AppState {
  activeTab: 'input' | 'preview' | 'trends' | 'ai' | 'inventory' | 'settings';
  setActiveTab: (tab: 'input' | 'preview' | 'trends' | 'ai' | 'inventory' | 'settings') => void;

  // Config
  globalConfig: GlobalConfig;
  updateGlobalConfig: (config: Partial<GlobalConfig>) => void;

  // Hydration state
  isHydrating: boolean;
  hydrateError: string | null;
  hydrateRetryCount: number;
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
  stockAdjustments: StockAdjustment[];
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
  analyticsLoading?: boolean;
  // Last requested range for milk spend (ISO strings)
  lastMilkSpendFrom?: string | null;
  lastMilkSpendTo?: string | null;
  analyticsError?: string | null;

  // Edit Mode
  editingIntakeId: string | null;
  setEditingIntakeId: (id: string | null) => void;
  editingOutputId: string | null;
  setEditingOutputId: (id: string | null) => void;

  // User settings
  userSettings: UserSettings | any;
  setUserSettings: (patch: Partial<UserSettings>) => void;
  resetUserSettings: () => void;

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

  addSupplierQuota: (supplierId: string, quota: Omit<SupplierQuota, 'id' | 'supplierId'>) => Promise<void>;
  updateSupplierQuota: (id: string, updates: Partial<SupplierQuota>) => Promise<void>;
  removeSupplierQuota: (id: string) => Promise<void>;
  bulkUpsertSupplierQuotas: (supplierId: string, quotas: Omit<SupplierQuota, 'id' | 'supplierId'>[]) => Promise<void>;

  addProduct: (product: Product) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  removeProduct: (id: string) => Promise<void>;
  reorderProducts: (orderedIds: string[]) => Promise<void>;

  addMilkType: (type: string) => Promise<void>;
  removeMilkType: (type: string) => Promise<void>;
  reorderMilkTypes: (orderedNames: string[]) => Promise<void>;

  addIntakeEntry: (entry: IntakeEntryPayload) => Promise<void>;
  updateIntakeEntry: (id: string, updates: IntakeEntryUpdatePayload) => Promise<void>;
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
  updateDispatchShipment: (dispatchId: string, shipmentId: string, payload: any) => Promise<void>;

  // Stock Adjustments
  addStockAdjustment: (adjustment: Omit<StockAdjustment, 'id' | 'timestamp'>) => Promise<void>;
  updateStockAdjustment: (id: string, updates: Partial<StockAdjustment>) => Promise<void>;
  removeStockAdjustment: (id: string) => Promise<void>;

  generateAIInsights: () => Promise<string>;
}

// Parsers: handle incoming data (could be ISO string or number) safely
const parseDate = (d: any): number | null => {
  if (d === null || typeof d === 'undefined') return null;
  const date = new Date(d);
  return isNaN(date.getTime()) ? null : date.getTime();
};

const parseSupplierQuota = (q: any): SupplierQuota => ({
  id: q.id,
  supplierId: q.supplierId,
  year: q.year,
  month: q.month,
  quotaKg: q.quotaKg,
  actualKg: q.actualKg ?? null,
});

const parseSupplier = (s: any): Supplier => ({
  ...s,
  createdOn: parseDate(s?.createdOn),
  quotas: Array.isArray(s?.quotas) ? s.quotas.map(parseSupplierQuota) : [],
});

const parseBuyerContract = (c: any): BuyerContract => ({
  ...c,
  startDate: parseDate(c?.startDate),
  endDate: parseDate(c?.endDate),
});

const parseBuyer = (b: any): Buyer => ({
  ...b,
  createdOn: parseDate(b?.createdOn),
  contracts: Array.isArray(b.contracts) ? b.contracts.map(parseBuyerContract) : []
});

const parseIntakeEntry = (i: any): IntakeEntry => ({
  ...i,
  timestamp: parseDate(i?.timestamp),
  effectiveQuantityKg: Number.isFinite(Number(i?.effectiveQuantityKg)) ? Number(i.effectiveQuantityKg) : (Number.isFinite(Number(i?.quantityKg)) ? Number(i.quantityKg) : 0),
  labCoefficient: Number.isFinite(Number(i?.labCoefficient)) ? Number(i.labCoefficient) : 1,
  pricingMode: i?.pricingMode ?? null,
  unitPricePerKg: Number.isFinite(Number(i?.unitPricePerKg)) ? Number(i.unitPricePerKg) : null,
  unitPriceBasis: i?.unitPriceBasis ?? null,
  invoiceNumber: i?.invoiceNumber ?? null,
  tags: Array.isArray(i.tags) ? i.tags : []
});

const parseOutputEntry = (o: any): OutputEntry => ({
  ...o,
  timestamp: parseDate(o?.timestamp),
  parsed: o?.parsed ? { ...o.parsed } : { pallets: 0, bigBags: 0, tanks: 0, totalWeight: 0 }
});

const parseDispatchShipment = (s: any): any => ({
  ...s,
  date: parseDate(s?.date),
});

const parseDispatchEntry = (d: any): DispatchEntry => ({
  ...d,
  date: parseDate(d?.date),
  shipments: Array.isArray(d.shipments) ? d.shipments.map(parseDispatchShipment) : []
});

const parseStockAdjustment = (a: any): StockAdjustment => ({
  ...a,
  timestamp: parseDate(a?.timestamp),
});

const reorderByIds = <T extends { id: string }>(items: T[], orderedIds: string[]) => {
  const positionMap = new Map(orderedIds.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const aPos = positionMap.get(a.id);
    const bPos = positionMap.get(b.id);
    if (typeof aPos === 'number' && typeof bPos === 'number') return aPos - bPos;
    if (typeof aPos === 'number') return -1;
    if (typeof bPos === 'number') return 1;
    return 0;
  });
};

const reorderStrings = (items: string[], orderedNames: string[]) => {
  const positionMap = new Map(orderedNames.map((name, index) => [name, index]));
  return [...items].sort((a, b) => {
    const aPos = positionMap.get(a);
    const bPos = positionMap.get(b);
    if (typeof aPos === 'number' && typeof bPos === 'number') return aPos - bPos;
    if (typeof aPos === 'number') return -1;
    if (typeof bPos === 'number') return 1;
    return a.localeCompare(b);
  });
};


async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  return apiFetch(url, opts) as Promise<T>;
}

type UserSettings = {
  plantLabel: string;
  shiftLabel: string;
  defaultStockView: 'kg' | 'pallets';
  defaultAnalyticsRange: 'week' | 'month' | 'quarter' | 'year' | 'all';
  dateFormat: 'ISO' | 'US';
  compactMode: boolean;
  darkMode: boolean;
  language: 'en' | 'lt';
};

export const useStore = create<AppState>((set, get) => ({
  activeTab: ((): AppState['activeTab'] => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('activeTab') : null;
      if (saved && ['input', 'preview', 'trends', 'ai', 'inventory', 'settings'].includes(saved)) return saved as AppState['activeTab'];
    } catch (e) {}
    return 'input';
  })(),
  setActiveTab: (tab) => {
    try { localStorage.setItem('activeTab', tab); } catch (e) {}
    set({ activeTab: tab });
  },

  globalConfig: DEFAULT_CONFIG,
  updateGlobalConfig: (config) => set((state) => ({ globalConfig: { ...state.globalConfig, ...config } })),

  // User settings persisted in localStorage
  userSettings: ((): any => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('userSettings') : null;
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      plantLabel: 'Fractionation Plant 01',
      shiftLabel: 'Shift A',
      defaultStockView: 'kg',
      defaultAnalyticsRange: 'month',
      dateFormat: 'ISO',
      compactMode: false,
      darkMode: false,
      language: 'en'
    };
  })(),
  setUserSettings: (patch) => {
    set((state:any) => {
      const next = { ...state.userSettings, ...(patch as any) };
      try { localStorage.setItem('userSettings', JSON.stringify(next)); } catch (e) {}
      return { userSettings: next } as any;
    });
  },
  resetUserSettings: () => {
    const defaults = { plantLabel: 'Fractionation Plant 01', shiftLabel: 'Shift A', defaultStockView: 'kg', defaultAnalyticsRange: 'month', dateFormat: 'ISO', compactMode: false, darkMode: false, language: 'en' };
    try { localStorage.setItem('userSettings', JSON.stringify(defaults)); } catch (e) {}
    set(() => ({ userSettings: defaults } as any));
  },

  isHydrating: false,
  hydrateError: null,
  hydrateRetryCount: 0,
  hydrateFromApi: async () => {
    const MAX_RETRIES = 20;
    const RETRY_DELAY_MS = 5000;
    const MAX_AUTH_RETRIES = 4;
    const AUTH_RETRY_DELAY_MS = 2000;
    let authFailures = 0;
    set({ isHydrating: true, hydrateError: null, hydrateRetryCount: 0 });
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const data = await api<any>('/api/bootstrap');
        set(() => ({
          suppliers: (data.suppliers || []).map((s: any) => parseSupplier(s)),
          buyers: (data.buyers || []).map((b: any) => parseBuyer(b)),
          products: data.products || [],
          milkTypes: data.milkTypes || [],
          intakeEntries: (data.intakeEntries || []).map((i: any) => parseIntakeEntry(i)),
          outputEntries: (data.outputEntries || []).map((o: any) => parseOutputEntry(o)),
          dispatchEntries: (data.dispatchEntries || []).map((d: any) => parseDispatchEntry(d)),
          stockAdjustments: (data.stockAdjustments || []).map((a: any) => parseStockAdjustment(a)),
          isHydrating: false,
          hydrateRetryCount: 0,
        }));
        return;
      } catch (err: any) {
        if (err instanceof AuthError) {
          authFailures++;
          if (authFailures > MAX_AUTH_RETRIES) {
            set({ hydrateError: 'Authentication failed. Please sign in again.', isHydrating: false });
            return;
          }
          set({ hydrateRetryCount: attempt + 1 });
          await new Promise((r) => setTimeout(r, AUTH_RETRY_DELAY_MS));
        } else if (attempt < MAX_RETRIES) {
          set({ hydrateRetryCount: attempt + 1 });
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        } else {
          set({ hydrateError: err.message || String(err), isHydrating: false });
        }
      }
    }
  },

  suppliers: [],
  buyers: [],
  products: [],
  milkTypes: [],

  intakeEntries: [],
  outputEntries: [],
  dispatchEntries: [],
  stockAdjustments: [],
  alerts: [],

  analytics: { milkSpend: null },

  lastMilkSpendFrom: null,
  lastMilkSpendTo: null,
  analyticsError: null,
  analyticsLoading: false,

  fetchMilkSpendRange: async (from, to) => {
    set(() => ({ analyticsLoading: true, analyticsError: null }));
    try {
      const data = await api<any>(`/api/milk-spend-range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      set((s) => ({ analytics: { milkSpend: { from: data.from, to: data.to, totalCost: data.totalCost, totalKg: data.totalKg, avgPricePerKg: data.avgPricePerKg, bySupplier: data.bySupplier.map((b: any) => ({ supplierId: b.supplierId, supplierName: b.supplierName, totalCost: b.totalCost, totalKg: b.totalKg, avgPricePerKg: b.avgPricePerKg })) } }, lastMilkSpendFrom: from, lastMilkSpendTo: to, analyticsError: null, analyticsLoading: false }));
    } catch (err: any) {
      console.error('Failed to fetch milk spend range', err);
      set((s) => ({ analytics: { milkSpend: null }, analyticsError: err?.message ?? String(err), analyticsLoading: false }));
    }
  },

  editingIntakeId: null,
  setEditingIntakeId: (id) => set({ editingIntakeId: id }),
  editingOutputId: null,
  setEditingOutputId: (id) => set({ editingOutputId: id }),

  addSupplier: async (supplier) => {
    const created = await api<Supplier>('/api/suppliers', { method: 'POST', body: JSON.stringify(supplier) });
    set((state) => ({ suppliers: [parseSupplier(created), ...state.suppliers] }));
  },

  updateSupplier: async (id, updates) => {
    const updated = await api<Supplier>(`/api/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
    const parsed = parseSupplier(updated);
    set((state) => ({ suppliers: state.suppliers.map(s => s.id === id ? { ...s, ...parsed } : s) }));
  },

  removeSupplier: async (id) => {
    await api('/api/suppliers/' + id, { method: 'DELETE' });
    set((state) => ({ suppliers: state.suppliers.filter(s => s.id !== id) }));
  },

  addBuyer: async (buyer) => {
    const created = await api<Buyer>('/api/buyers', { method: 'POST', body: JSON.stringify(buyer) });
    set((state) => ({ buyers: [parseBuyer(created), ...state.buyers] }));
  },

  updateBuyer: async (id, updates) => {
    const updated = await api<Buyer>(`/api/buyers/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
    set((state) => ({ buyers: state.buyers.map(b => b.id === id ? { ...b, ...parseBuyer(updated) } : b) }));
  },

  removeBuyer: async (id) => {
    await api('/api/buyers/' + id, { method: 'DELETE' });
    set((state) => ({ buyers: state.buyers.filter(b => b.id !== id) }));
  },

  addContract: async (buyerId, contract) => {
    const created = await api<BuyerContract>(`/api/buyers/${buyerId}/contracts`, { method: 'POST', body: JSON.stringify(contract) });
    const parsed = parseBuyerContract(created as any);
    set((state) => ({ buyers: state.buyers.map(b => b.id === buyerId ? { ...b, contracts: [...(b.contracts || []), parsed] } : b) }));
  },

  updateContract: async (id, updates) => {
    const updated = await api<BuyerContract>(`/api/contracts/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
    const parsed = parseBuyerContract(updated as any);
    set((state) => ({ buyers: state.buyers.map(b => ({ ...b, contracts: b.contracts?.map(c => c.id === id ? { ...c, ...parsed } : c) || [] })) }));
  },

  removeContract: async (id) => {
    await api(`/api/contracts/${id}`, { method: 'DELETE' });
    set((state) => ({ buyers: state.buyers.map(b => ({ ...b, contracts: b.contracts?.filter(c => c.id !== id) || [] })) }));
  },

  addSupplierQuota: async (supplierId, quota) => {
    const created = await api<SupplierQuota>(`/api/suppliers/${supplierId}/quotas`, { method: 'POST', body: JSON.stringify(quota) });
    const parsed = parseSupplierQuota(created);
    set((state) => ({ suppliers: state.suppliers.map(s => s.id === supplierId ? { ...s, quotas: [...(s.quotas || []), parsed] } : s) }));
  },

  updateSupplierQuota: async (id, updates) => {
    const updated = await api<SupplierQuota>(`/api/supplier-quotas/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
    const parsed = parseSupplierQuota(updated);
    set((state) => ({ suppliers: state.suppliers.map(s => ({ ...s, quotas: (s.quotas || []).map(q => q.id === id ? { ...q, ...parsed } : q) })) }));
  },

  removeSupplierQuota: async (id) => {
    await api(`/api/supplier-quotas/${id}`, { method: 'DELETE' });
    set((state) => ({ suppliers: state.suppliers.map(s => ({ ...s, quotas: (s.quotas || []).filter(q => q.id !== id) })) }));
  },

  bulkUpsertSupplierQuotas: async (supplierId, quotas) => {
    const results = await api<SupplierQuota[]>(`/api/suppliers/${supplierId}/quotas/bulk`, { method: 'POST', body: JSON.stringify({ quotas }) });
    const parsed = results.map(parseSupplierQuota);
    set((state) => ({
      suppliers: state.suppliers.map(s => {
        if (s.id !== supplierId) return s;
        const existing = (s.quotas || []).filter(q => !parsed.some(p => p.year === q.year && p.month === q.month));
        return { ...s, quotas: [...existing, ...parsed] };
      })
    }));
  },

  addProduct: async (product) => {
    const created = await api<Product>('/api/products', { method: 'POST', body: JSON.stringify(product) });
    set((state) => ({ products: [...state.products, created] }));
  },

  updateProduct: async (id, updates) => {
    const updated = await api<Product>(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
    set((state) => {
      const nextProductId = updated.id;
      const productIdChanged = nextProductId !== id;

      return {
        products: state.products.map((product) => product.id === id ? { ...product, ...updated } : product),
        buyers: productIdChanged
          ? state.buyers.map((buyer) => ({
              ...buyer,
              contracts: (buyer.contracts || []).map((contract) => contract.productId === id ? { ...contract, productId: nextProductId } : contract),
            }))
          : state.buyers,
        outputEntries: productIdChanged
          ? state.outputEntries.map((entry) => entry.productId === id ? { ...entry, productId: nextProductId } : entry)
          : state.outputEntries,
        dispatchEntries: productIdChanged
          ? state.dispatchEntries.map((entry) => entry.productId === id ? { ...entry, productId: nextProductId } : entry)
          : state.dispatchEntries,
      };
    });
  },

  removeProduct: async (id) => {
    await api(`/api/products/${id}`, { method: 'DELETE' });
    set((state) => ({ products: state.products.filter(p => p.id !== id) }));
  },

  reorderProducts: async (orderedIds) => {
    await api('/api/products/reorder', { method: 'POST', body: JSON.stringify({ orderedIds }) });
    set((state) => ({ products: reorderByIds(state.products, orderedIds).map((product, index) => ({ ...product, sortOrder: index })) }));
  },

  addMilkType: async (type) => {
    await api('/api/milk-types', { method: 'POST', body: JSON.stringify({ name: type }) });
    set((state) => ({ milkTypes: [...state.milkTypes, type] }));
  },

  removeMilkType: async (type) => {
    await api(`/api/milk-types/${encodeURIComponent(type)}`, { method: 'DELETE' });
    set((state) => ({ milkTypes: state.milkTypes.filter(t => t !== type) }));
  },

  reorderMilkTypes: async (orderedNames) => {
    await api('/api/milk-types/reorder', { method: 'POST', body: JSON.stringify({ orderedNames }) });
    set((state) => ({ milkTypes: reorderStrings(state.milkTypes, orderedNames) }));
  },

  addIntakeEntry: async (entry) => {
    const payload = { ...entry, tags: entry.tags || [] };
    const created = await api<IntakeEntry>('/api/intake-entries', { method: 'POST', body: JSON.stringify(payload) });
    set((s) => ({ intakeEntries: [parseIntakeEntry(created), ...s.intakeEntries] }));
  },

  updateIntakeEntry: async (id, updates) => {
    const payload = { ...updates, tags: (updates as any).tags ?? undefined };
    const updated = await api<IntakeEntry>(`/api/intake-entries/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    set((s) => ({ intakeEntries: s.intakeEntries.map(i => i.id === id ? { ...i, ...parseIntakeEntry(updated) } : i), editingIntakeId: null }));
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
    set((s) => ({ outputEntries: [parseOutputEntry(created), ...s.outputEntries] }));
  },

  updateOutputEntry: async (id, packagingString) => {
    const updated = await api<OutputEntry>(`/api/output-entries/${id}`, { method: 'PUT', body: JSON.stringify({ packagingString }) });
    set((s) => ({ outputEntries: s.outputEntries.map(e => e.id === id ? { ...e, ...parseOutputEntry(updated) } : e), editingOutputId: null }));
  },

  removeOutputEntry: async (id) => {
    await api(`/api/output-entries/${id}`, { method: 'DELETE' });
    set((s) => ({ outputEntries: s.outputEntries.filter(e => e.id !== id) }));
  },

  addDispatchEntry: async (entry) => {
    const created = await api<DispatchEntry>('/api/dispatch-entries', { method: 'POST', body: JSON.stringify(entry) });
    set((s) => ({ dispatchEntries: [parseDispatchEntry(created), ...s.dispatchEntries] }));
  },

  updateDispatchEntry: async (id, updates) => {
    const updated = await api<DispatchEntry>(`/api/dispatch-entries/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
    set((s) => ({ dispatchEntries: s.dispatchEntries.map(d => d.id === id ? { ...d, ...parseDispatchEntry(updated) } : d) }));
  },

  removeDispatchEntry: async (id) => {
    await api(`/api/dispatch-entries/${id}`, { method: 'DELETE' });
    set((s) => ({ dispatchEntries: s.dispatchEntries.filter(d => d.id !== id) }));
  },

  addDispatchShipment: async (dispatchId, payload) => {
    const updated = await api<DispatchEntry>(`/api/dispatch-entries/${dispatchId}/shipments`, { method: 'POST', body: JSON.stringify(payload) });
    set((s) => ({ dispatchEntries: s.dispatchEntries.map(d => d.id === dispatchId ? parseDispatchEntry(updated) : d) }));
  },

  removeDispatchShipment: async (dispatchId, shipmentId) => {
    const updated = await api<DispatchEntry>(`/api/dispatch-entries/${dispatchId}/shipments/${shipmentId}`, { method: 'DELETE' });
    set((s) => ({ dispatchEntries: s.dispatchEntries.map(d => d.id === dispatchId ? parseDispatchEntry(updated) : d) }));
  },

  updateDispatchShipment: async (dispatchId, shipmentId, payload) => {
    const updated = await api<DispatchEntry>(`/api/dispatch-entries/${dispatchId}/shipments/${shipmentId}`, { method: 'PUT', body: JSON.stringify(payload) });
    set((s) => ({ dispatchEntries: s.dispatchEntries.map(d => d.id === dispatchId ? parseDispatchEntry(updated) : d) }));
  },

  addStockAdjustment: async (adjustment) => {
    const created = await api<StockAdjustment>('/api/stock-adjustments', { method: 'POST', body: JSON.stringify(adjustment) });
    set((s) => ({ stockAdjustments: [parseStockAdjustment(created), ...s.stockAdjustments] }));
  },

  updateStockAdjustment: async (id, updates) => {
    const updated = await api<StockAdjustment>(`/api/stock-adjustments/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
    set((s) => ({ stockAdjustments: s.stockAdjustments.map(a => a.id === id ? { ...a, ...parseStockAdjustment(updated) } : a) }));
  },

  removeStockAdjustment: async (id) => {
    await api(`/api/stock-adjustments/${id}`, { method: 'DELETE' });
    set((s) => ({ stockAdjustments: s.stockAdjustments.filter(a => a.id !== id) }));
  },

  generateAIInsights: async () => {
    const state = get();
    const totalIntake = state.intakeEntries.reduce((acc, curr) => acc + curr.quantityKg, 0);
    const totalEffectiveIntake = state.intakeEntries.reduce((acc, curr) => acc + getEffectiveIntakeQuantityKg(curr), 0);
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
        text += `**Mass Balance**: Physical intake is **${totalIntake.toLocaleString()}kg** and yield-basis intake is **${Math.round(totalEffectiveIntake).toLocaleString()}kg**. `;
        if (totalEffectiveIntake > 0) text += `Efficiency looks stable.\n\n`;
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
