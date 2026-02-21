
import { create } from 'zustand';
import { IntakeEntry, OutputEntry, Alert, DispatchEntry, Supplier, Buyer, GlobalConfig, Product } from './types';
import { INITIAL_INTAKE, INITIAL_OUTPUT, PRODUCTS, INITIAL_SUPPLIERS, INITIAL_BUYERS, DEFAULT_CONFIG } from './constants';
import { parsePackagingString } from './utils/parser';

interface AppState {
  activeTab: 'input' | 'preview' | 'trends' | 'ai' | 'inventory' | 'settings';
  setActiveTab: (tab: 'input' | 'preview' | 'trends' | 'ai' | 'inventory' | 'settings') => void;
  
  // Configuration
  globalConfig: GlobalConfig;
  updateGlobalConfig: (config: Partial<GlobalConfig>) => void;

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
  
  // Edit Mode State
  editingIntakeId: string | null;
  setEditingIntakeId: (id: string | null) => void;

  editingOutputId: string | null;
  setEditingOutputId: (id: string | null) => void;

  // Actions
  addSupplier: (supplier: Omit<Supplier, 'id'>) => void;
  updateSupplier: (id: string, updates: Partial<Supplier>) => void;
  removeSupplier: (id: string) => void;

  addBuyer: (buyer: Omit<Buyer, 'id'>) => void;
  updateBuyer: (id: string, updates: Partial<Buyer>) => void;
  removeBuyer: (id: string) => void;

  addProduct: (product: Product) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  removeProduct: (id: string) => void;

  addMilkType: (type: string) => void;
  removeMilkType: (type: string) => void;

  // Updated: Removed 'timestamp' from Omit to allow passing it
  addIntakeEntry: (entry: Omit<IntakeEntry, 'id' | 'calculatedCost'>) => void;
  updateIntakeEntry: (id: string, updates: Partial<IntakeEntry>) => void;
  toggleIntakeDiscard: (id: string) => void;
  dismissTempAlert: (id: string) => void;
  removeIntakeEntry: (id: string) => void;
  
  addOutputEntry: (productId: string, batchId: string, packagingString: string) => void;
  updateOutputEntry: (id: string, packagingString: string) => void;
  removeOutputEntry: (id: string) => void;

  addDispatchEntry: (entry: Omit<DispatchEntry, 'id'>) => void;
  updateDispatchEntry: (id: string, updates: Partial<DispatchEntry>) => void;
  removeDispatchEntry: (id: string) => void;
  
  generateAIInsights: () => Promise<string>;
}

const calculateMilkCost = (quantity: number, fat: number, protein: number, supplier: Supplier | undefined, defaultConfig: GlobalConfig) => {
  if (!supplier) return quantity * defaultConfig.defaultMilkBasePrice;

  const fatDiff = fat - 4.0; // Standard Fat 4.0%
  const protDiff = protein - 3.2; // Standard Protein 3.2%

  let price = supplier.basePricePerKg;
  price += (fatDiff * 10) * supplier.fatBonusPerPct; // *10 because bonus is per 0.1%
  price += (protDiff * 10) * supplier.proteinBonusPerPct;
  
  // Ensure price doesn't go negative in extreme cases
  price = Math.max(0, price);

  return quantity * price;
};

export const useStore = create<AppState>((set, get) => ({
  activeTab: 'input',
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  globalConfig: DEFAULT_CONFIG,
  updateGlobalConfig: (config) => set((state) => ({ globalConfig: { ...state.globalConfig, ...config } })),

  suppliers: INITIAL_SUPPLIERS,
  buyers: INITIAL_BUYERS,
  products: PRODUCTS,
  milkTypes: [
    'Skim milk concentrate',
    'Skim milk',
    'Milk protein concentrate',
    'Permeate concentrate',
    'Raw milk',
    'Cream'
  ],
  
  intakeEntries: INITIAL_INTAKE,
  outputEntries: INITIAL_OUTPUT,
  dispatchEntries: [],
  alerts: [
    { id: 'a1', type: 'info', message: 'Shift started: Morning Shift (Supervisor: J. Jonaitis)', timestamp: Date.now() }
  ],

  editingIntakeId: null,
  setEditingIntakeId: (id) => set({ editingIntakeId: id }),

  editingOutputId: null,
  setEditingOutputId: (id) => set({ editingOutputId: id }),

  // --- Database Actions ---
  addSupplier: (supplier) => set((state) => ({
    suppliers: [...state.suppliers, { ...supplier, id: Math.random().toString(36).substr(2, 9) }]
  })),

  updateSupplier: (id, updates) => set((state) => ({
    suppliers: state.suppliers.map(s => s.id === id ? { ...s, ...updates } : s)
  })),

  removeSupplier: (id) => set((state) => ({
    suppliers: state.suppliers.filter(s => s.id !== id)
  })),

  addBuyer: (buyer) => set((state) => ({
    buyers: [...state.buyers, { ...buyer, id: Math.random().toString(36).substr(2, 9) }]
  })),

  updateBuyer: (id, updates) => set((state) => ({
    buyers: state.buyers.map(b => b.id === id ? { ...b, ...updates } : b)
  })),

  removeBuyer: (id) => set((state) => ({
    buyers: state.buyers.filter(b => b.id !== id)
  })),

  addProduct: (product) => set((state) => ({
    products: [...state.products, product]
  })),

  updateProduct: (id, updates) => set((state) => ({
    products: state.products.map(p => p.id === id ? { ...p, ...updates } : p)
  })),

  removeProduct: (id) => set((state) => ({
    products: state.products.filter(p => p.id !== id)
  })),

  addMilkType: (type) => set((state) => ({
    milkTypes: [...state.milkTypes, type]
  })),

  removeMilkType: (type) => set((state) => ({
    milkTypes: state.milkTypes.filter(t => t !== type)
  })),

  // --- Log Actions ---
  addIntakeEntry: (entry) => set((state) => {
    const newAlerts = [...state.alerts];
    if (entry.tempCelsius > 8) {
      newAlerts.push({
        id: Date.now().toString(),
        type: 'danger',
        message: `High temp alert (${entry.tempCelsius}°C) from ${entry.supplierName}`,
        timestamp: Date.now()
      });
    }

    if (entry.ph > 6.74 || entry.ph < 6.55) {
      newAlerts.push({
        id: (Date.now() + 1).toString(),
        type: 'danger',
        message: `Bad acidity alert (pH ${entry.ph}) from ${entry.supplierName}. Not suitable for use.`,
        timestamp: Date.now()
      });
    } else if (entry.ph < 6.60) {
      newAlerts.push({
        id: (Date.now() + 1).toString(),
        type: 'warning',
        message: `Borderline acidity (pH ${entry.ph}) from ${entry.supplierName}.`,
        timestamp: Date.now()
      });
    }
    
    const supplier = state.suppliers.find(s => s.id === entry.supplierId);
    const cost = calculateMilkCost(entry.quantityKg, entry.fatPct, entry.proteinPct, supplier, state.globalConfig);

    return {
      intakeEntries: [
        { 
          ...entry, 
          id: Math.random().toString(36).substr(2, 9), 
          // Use provided timestamp or fallback to now
          timestamp: entry.timestamp || Date.now(), 
          calculatedCost: cost 
        },
        ...state.intakeEntries
      ],
      alerts: newAlerts
    };
  }),

  updateIntakeEntry: (id, updates) => set((state) => ({
    intakeEntries: state.intakeEntries.map(e => {
      if (e.id !== id) return e;
      const updatedEntry = { ...e, ...updates };
      // Recalculate cost if quantity/fat/protein changed
      const supplier = state.suppliers.find(s => s.id === updatedEntry.supplierId);
      updatedEntry.calculatedCost = calculateMilkCost(updatedEntry.quantityKg, updatedEntry.fatPct, updatedEntry.proteinPct, supplier, state.globalConfig);
      return updatedEntry;
    }),
    editingIntakeId: null
  })),

  dismissTempAlert: (id) => set((state) => ({
    intakeEntries: state.intakeEntries.map(e => e.id === id ? { ...e, isTempAlertDismissed: true } : e)
  })),

  toggleIntakeDiscard: (id) => set((state) => ({
    intakeEntries: state.intakeEntries.map(e => e.id === id ? { ...e, isDiscarded: !e.isDiscarded } : e)
  })),

  removeIntakeEntry: (id) => set((state) => ({
    intakeEntries: state.intakeEntries.filter(e => e.id !== id)
  })),

  addOutputEntry: (productId, batchId, packagingString) => set((state) => {
    const product = PRODUCTS.find(p => p.id === productId);
    if (!product) return {};

    const parsed = parsePackagingString(packagingString, product.defaultPalletWeight, product.defaultBagWeight);

    return {
      outputEntries: [
        {
          id: Math.random().toString(36).substr(2, 9),
          productId,
          batchId,
          packagingString,
          parsed,
          destination: 'Warehouse',
          timestamp: Date.now()
        },
        ...state.outputEntries
      ]
    };
  }),

  updateOutputEntry: (id, packagingString) => set((state) => {
    return {
      outputEntries: state.outputEntries.map(entry => {
        if (entry.id !== id) return entry;
        const product = PRODUCTS.find(p => p.id === entry.productId);
        const parsed = product 
          ? parsePackagingString(packagingString, product.defaultPalletWeight, product.defaultBagWeight)
          : entry.parsed;
        return { ...entry, packagingString, parsed };
      }),
      editingOutputId: null
    };
  }),

  removeOutputEntry: (id) => set((state) => ({
    outputEntries: state.outputEntries.filter(e => e.id !== id)
  })),

  addDispatchEntry: (entry) => set((state) => ({
    dispatchEntries: [
      {
        ...entry,
        id: Math.random().toString(36).substr(2, 9),
        // Use provided date or default to now
        date: entry.date || Date.now()
      },
      ...state.dispatchEntries
    ]
  })),

  updateDispatchEntry: (id, updates) => set((state) => ({
    dispatchEntries: state.dispatchEntries.map(e => e.id === id ? { ...e, ...updates } : e)
  })),

  removeDispatchEntry: (id) => set((state) => ({
    dispatchEntries: state.dispatchEntries.filter(e => e.id !== id)
  })),

  generateAIInsights: async () => {
    const state = get();
    
    // 1. Gather Context
    const totalIntake = state.intakeEntries.reduce((acc, curr) => acc + curr.quantityKg, 0);
    const mpc85Produced = state.outputEntries
        .filter(e => e.productId === 'MPC85')
        .reduce((acc, curr) => acc + curr.parsed.totalWeight, 0);
    
    // Only count CONFIRMED dispatches for current stock calculation
    const mpc85Dispatched = state.dispatchEntries
        .filter(e => e.productId === 'MPC85' && e.status === 'confirmed')
        .reduce((acc, curr) => acc + curr.quantityKg, 0);
        
    // Look at PLANNED dispatches for future risk
    const mpc85Planned = state.dispatchEntries
        .filter(e => e.productId === 'MPC85' && e.status === 'planned')
        .reduce((acc, curr) => acc + curr.quantityKg, 0);

    const stockMPC85 = mpc85Produced - mpc85Dispatched;
    const isLowStock = stockMPC85 < 20000; 
    const futureStockRisk = (stockMPC85 - mpc85Planned) < 0;

    // Financial Context (Only confirmed)
    const totalRevenue = state.dispatchEntries
      .filter(e => e.status === 'confirmed')
      .reduce((acc, curr) => acc + curr.totalRevenue, 0);
      
    const totalMilkCost = state.intakeEntries.reduce((acc, curr) => acc + curr.calculatedCost, 0);

    // 2. Mock AI Reasoning
    return new Promise((resolve) => {
      setTimeout(() => {
        let text = `### AI Operational & Financial Analysis\n\n`;
        
        // Mass Balance Insight
        text += `**Mass Balance**: Intake is **${totalIntake.toLocaleString()}kg**. `;
        if (totalIntake > 0) {
            text += `Efficiency looks stable.\n\n`;
        }

        // Financial Insight
        text += `**Financial Snapshot**: \n`;
        text += `- Confirmed Revenue: **€${totalRevenue.toLocaleString()}**\n`;
        text += `- Raw Material Cost: **€${totalMilkCost.toLocaleString()}**\n`;
        if (totalRevenue > totalMilkCost) {
          text += `> Gross margin is positive. Continue prioritizing high-protein intake.\n\n`;
        }

        // Inventory Insight
        text += `**Inventory Status**: \n`;
        text += `- MPC 85 Physical Stock: **${stockMPC85.toLocaleString()} kg**.\n`;
        
        if (futureStockRisk) {
           text += `> ⚠️ **Planning Alert**: You have planned sales of **${mpc85Planned.toLocaleString()} kg** which exceeds current stock. Schedule MPC85 production immediately.\n\n`;
        } else if (isLowStock) {
            text += `> ⚠️ **Warning**: Stock is insufficient for large spot orders. Prioritize MPC85 production for the next 12h.\n\n`;
        } else {
            text += `- Stock levels are healthy for confirmed and planned dispatches.\n\n`;
        }

        resolve(text);
      }, 1500);
    });
  }
}));
