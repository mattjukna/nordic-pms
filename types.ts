
export type PackagingString = string;

export type MassUnit = 'kg' | 'pallets' | 'bigbags';

export interface GlobalConfig {
  processingCostPerTon: number; // e.g., 45 EUR/ton
  defaultMilkBasePrice: number; // e.g., 0.35 EUR/kg
  preferredUnit: MassUnit; // Global preference for displaying weight
}

export interface Supplier {
  id: string;
  name: string;
  routeGroup: string; // e.g. "Kupiškio grupė"
  contractQuota: number;
  // Extended Fields
  companyCode: string;
  phoneNumber: string;
  country: string;
  addressLine1: string;
  addressLine2: string;
  createdOn: number | null;
  
  // Financial Fields
  basePricePerKg: number; // Base price per kg of raw milk (e.g. 0.32)
  normalMilkPricePerKg?: number; // Optional normal milk price per kg
  fatBonusPerPct: number; // Bonus per 0.1% fat (e.g. 0.003)
  proteinBonusPerPct: number; // Bonus per 0.1% protein (e.g. 0.004)
  // Milk Characteristics
  isEco: boolean;
  defaultMilkType: string;
}

export interface BuyerContract {
  id: string;
  contractNumber: string;
  productId: string; // Contracts are usually specific to a product
  pricePerKg: number;
  agreedAmountKg: number; // New field: Agreed amount in kg
  startDate: number | null;
  endDate: number | null;
}

export interface Buyer {
  id: string;
  name: string;
  // Extended Fields
  companyCode: string;
  phoneNumber: string;
  country: string;
  addressLine1: string;
  addressLine2: string;
  createdOn: number | null;
  contracts: BuyerContract[];
}

export interface Product {
  id: string;
  name: string;
  details: string;
  defaultPalletWeight: number;
  defaultBagWeight: number;
  proteinTargetPct: number;
  yieldFactor: number; // e.g., 0.125 for 12.5% yield from milk
}

export interface IntakeEntry {
  id: string;
  supplierId: string;
  supplierName: string;
  routeGroup: string;
  milkType: string; // e.g., "Skim milk", "Skim milk concentrate"
  quantityKg: number;
  ph: number; // New field for acidity
  fatPct: number;
  proteinPct: number;
  tempCelsius: number;
  isEcological: boolean; // New field for Red/Black font distinction
  tags: string[]; // e.g., #HighAcid
  note: string;
  timestamp: number | null;
  
  // Financials
  calculatedCost: number; // Total cost of this load in EUR
  isTempAlertDismissed?: boolean; // New field to track if alert was dismissed
  isDiscarded?: boolean; // New field to track if milk was thrown out
}

export interface OutputEntry {
  id: string;
  productId: string;
  batchId: string; // e.g. "MPC85-2025-09-01-A"
  packagingString: string; // Raw string: "34,96 pad.*750kg"
  parsed: {
    pallets: number;
    bigBags: number;
    tanks: number;
    totalWeight: number;
  };
  destination: 'Warehouse' | 'Pieno Žvaigždė' | 'Export';
  timestamp: number | null;
}

export interface DispatchShipment {
  id: string;
  date: number | null;
  quantityKg: number;
  batchId?: string;
  note?: string;
  packagingString?: string;
  parsed?: {
    pallets: number;
    bigBags: number;
    tanks: number;
    totalWeight: number;
  };
}

export interface DispatchEntry {
  id: string;
  date: number | null;
  buyer: string;
  contractNumber?: string; // Track which contract was used
  productId: string;
  quantityKg: number; // This will now represent the TOTAL SHIPPED amount if shipments exist, or the single amount if legacy.
  orderedQuantityKg?: number; // The total agreed amount for the order
  shipments?: DispatchShipment[]; // List of partial shipments
  batchRefId: string; // Optional reference to specific batch (legacy or default)
  packagingString?: string; // Optional: "10 pad"
  parsed?: {
    pallets: number;
    bigBags: number;
    tanks: number;
    totalWeight: number;
  };
  // Financials
  salesPricePerKg: number; // e.g., 5.50 EUR
  totalRevenue: number; // Quantity * Price
  // Status
  status: 'planned' | 'confirmed' | 'completed'; 
}

export interface ParsedOutput {
  pallets: number;
  bigBags: number;
  tanks: number;
  totalWeight: number;
  isValid: boolean;
}

export interface Alert {
  id: string;
  type: 'warning' | 'danger' | 'info';
  message: string;
  timestamp: number | null;
}

export interface ProductionLogEntry {
  id: string;
  timestamp: number | null;
  batchId?: string;
  productId: string;
  productName: string;
  palletsCount: number;
  palletUnitWeight: number;
  bigBagsCount: number;
  bigBagUnitWeight: number;
  looseKg: number;
  totalKg: number;
}
