
import { Product, Supplier, IntakeEntry, OutputEntry, Buyer, GlobalConfig } from './types';

/**
 * Dispatches before this date were imported from a legacy system that did not
 * track pallet / big-bag numbers.  Exclude them from variance & unmapped-
 * shipment warnings so only new, app-entered data is validated.
 */
export const VARIANCE_CUTOFF_DATE = '2026-04-02';

export const DEFAULT_CONFIG: GlobalConfig = {
  processingCostPerTon: 45.00, // EUR per ton of wet milk
  defaultMilkBasePrice: 0.35, // EUR per kg
  preferredUnit: 'kg'
};

export const PRODUCTS: Product[] = [
  { id: 'MPC85', name: 'MPC 85', details: 'Milk protein concentrate with 85% protein on dry basis. Primary high-value product for sports nutrition and clinical applications.', defaultPalletWeight: 900, defaultBagWeight: 850, proteinTargetPct: 85, yieldFactor: 0.125 }, 
  { id: 'MPC88', name: 'MPC 88', details: 'Premium milk protein concentrate at 88% protein. Used in high-protein bars, RTD beverages, and infant formula fortification.', defaultPalletWeight: 900, defaultBagWeight: 850, proteinTargetPct: 88, yieldFactor: 0.12 },
  { id: 'MPC83', name: 'MPC 83', details: 'Milk protein concentrate with 83% protein. Cost-effective alternative to MPC 85 for processed cheese and bakery enrichment.', defaultPalletWeight: 900, defaultBagWeight: 850, proteinTargetPct: 83, yieldFactor: 0.13 },
  { id: 'MPC70', name: 'MPC 70', details: 'Mid-range milk protein concentrate at 70% protein. Versatile ingredient for yoghurt, ice cream, and nutritional supplements.', defaultPalletWeight: 900, defaultBagWeight: 850, proteinTargetPct: 70, yieldFactor: 0.14 },
  { id: 'MPC70W', name: 'MPC 70W', details: 'Wet-process milk protein concentrate at 70% protein. Liquid format for direct use in fresh dairy blends and UHT beverages.', defaultPalletWeight: 900, defaultBagWeight: 850, proteinTargetPct: 70, yieldFactor: 0.14 },
  { id: 'MPI', name: 'MPI', details: 'Milk protein isolate with ≥90% protein purity. Ultra-filtered for premium sports nutrition, medical foods, and clear protein drinks.', defaultPalletWeight: 900, defaultBagWeight: 850, proteinTargetPct: 90, yieldFactor: 0.09 },
  { id: 'MCC', name: 'MCC', details: 'Micellar casein concentrate derived from cold microfiltration. Slow-release protein used in meal replacements and overnight recovery products.', defaultPalletWeight: 900, defaultBagWeight: 850, proteinTargetPct: 85, yieldFactor: 0.11 },
  { id: 'SMP', name: 'SMP', details: 'Skim milk powder produced by spray drying pasteurised skim milk. Staple ingredient for recombined dairy, confectionery, and baked goods.', defaultPalletWeight: 1000, defaultBagWeight: 1000, proteinTargetPct: 34, yieldFactor: 0.09 },
  { id: 'WMP26', name: 'WMP 26/26', details: 'Whole milk powder with 26% protein and 26% fat. Used in chocolate manufacturing, infant formula, and reconstituted milk products.', defaultPalletWeight: 1000, defaultBagWeight: 1000, proteinTargetPct: 26, yieldFactor: 0.11 },
  { id: 'PERM015', name: 'Permeate powder 015', details: 'Dairy permeate powder from UF processing with ~0.15% protein. Lactose-rich ingredient for animal feed, fermentation substrates, and cost-effective fillers.', defaultPalletWeight: 1000, defaultBagWeight: 1000, proteinTargetPct: 4, yieldFactor: 0.05 },
  { id: 'PM12', name: 'PM12', details: 'Protein mix standardised to 12% protein. Economical blend of MPC and permeate for mass-market dairy beverages and commodity powders.', defaultPalletWeight: 1000, defaultBagWeight: 1000, proteinTargetPct: 12, yieldFactor: 0.10 },
  { id: 'CREAM', name: 'Cream', details: 'Fresh cream at 40% milkfat content, separated during intake processing. Sold as bulk liquid for butter production, confectionery, and food service.', defaultPalletWeight: 1000, defaultBagWeight: 1000, proteinTargetPct: 2, yieldFactor: 0.10 },
];

// Initial Data to load into Store
export const INITIAL_SUPPLIERS: Supplier[] = [
  // Group A: Major Cooperatives & Partners
  { 
    id: 'S01', name: 'UAB "Šalva"', routeGroup: 'Kupiškio grupė', contractQuota: 300000,
    companyCode: '155294538', phoneNumber: '+370 699 93847', country: 'Lithuania', addressLine1: 'Ateities g. 2, Kirdonių k., Biržų r.', addressLine2: '', createdOn: 1672531200000,
    basePricePerKg: 0.34, normalMilkPricePerKg: 0.34, fatBonusPerPct: 0.003, proteinBonusPerPct: 0.004,
    isEco: false, defaultMilkType: 'Skim milk'
  },
  { 
    id: 'S02', name: 'UAB "Pieno partneriai"', routeGroup: 'Kooperatyvai', contractQuota: 650000,
    companyCode: '304968385', phoneNumber: '+370 685 00000', country: 'Lithuania', addressLine1: 'Birutės g. 49A, Plungė', addressLine2: '', createdOn: 1672531200000,
    basePricePerKg: 0.35, normalMilkPricePerKg: 0.35, fatBonusPerPct: 0.003, proteinBonusPerPct: 0.005,
    isEco: false, defaultMilkType: 'Skim milk concentrate'
  },
  { 
    id: 'S03', name: 'UAB "AUGA trade"', routeGroup: 'EKO Auga', contractQuota: 450000,
    companyCode: '302753875', phoneNumber: '+370 5 233 5340', country: 'Lithuania', addressLine1: 'Konstitucijos pr. 21C, Vilnius', addressLine2: '', createdOn: 1672531200000,
    basePricePerKg: 0.38, normalMilkPricePerKg: 0.38, fatBonusPerPct: 0.003, proteinBonusPerPct: 0.004,
    isEco: true, defaultMilkType: 'Skim milk'
  },
  { 
    id: 'S04', name: 'AB "Pieno žvaigždės"', routeGroup: 'Dideli ūkiai', contractQuota: 1000000,
    companyCode: '124665536', phoneNumber: '+370 5 246 1414', country: 'Lithuania', addressLine1: 'Perkūnkiemio g. 3, Vilnius', addressLine2: '', createdOn: 1672531200000,
    basePricePerKg: 0.34, normalMilkPricePerKg: 0.34, fatBonusPerPct: 0.003, proteinBonusPerPct: 0.004,
    isEco: false, defaultMilkType: 'Skim milk concentrate'
  },
  { 
    id: 'S05', name: 'ŽŪK "Rešketėnai"', routeGroup: 'Kooperatyvai', contractQuota: 375000,
    companyCode: '280768590', phoneNumber: '+370 699 50900', country: 'Lithuania', addressLine1: 'Alytaus g. 7, Žarėnai, Telšių r.', addressLine2: '', createdOn: 1672531200000,
    basePricePerKg: 0.33, normalMilkPricePerKg: 0.33, fatBonusPerPct: 0.002, proteinBonusPerPct: 0.003,
    isEco: false, defaultMilkType: 'Skim milk'
  },
  { 
    id: 'S06', name: 'UAB "Biržų pienas"', routeGroup: 'Biržų pienas', contractQuota: 200000,
    companyCode: '304600547', phoneNumber: '+370 687 77735', country: 'Lithuania', addressLine1: 'J. Basanavičiaus g. 16-1, Biržai', addressLine2: '', createdOn: 1672531200000,
    basePricePerKg: 0.34, normalMilkPricePerKg: 0.34, fatBonusPerPct: 0.003, proteinBonusPerPct: 0.004,
    isEco: false, defaultMilkType: 'Skim milk'
  },

  // Group B: Agricultural Companies (ŽŪB)
  { 
    id: 'S07', name: 'ŽŪB "Draugystė agro"', routeGroup: 'Rokiškio kryptis', contractQuota: 150000,
    companyCode: '169164978', phoneNumber: '+370 451 42131', country: 'Lithuania', addressLine1: 'Šunkiškių g. 15B, Puodžių k., Pasvalio r.', addressLine2: '', createdOn: 1672531200000,
    basePricePerKg: 0.33, normalMilkPricePerKg: 0.33, fatBonusPerPct: 0.003, proteinBonusPerPct: 0.004,
    isEco: false, defaultMilkType: 'Skim milk'
  },
  { 
    id: 'S08', name: 'Biržų r. Kirdonių ŽŪB', routeGroup: 'Rokiškio kryptis', contractQuota: 120000,
    companyCode: '154780537', phoneNumber: '+370 450 50216', country: 'Lithuania', addressLine1: 'Aplinkkelio g. 2, Kirdonių k., Biržų r.', addressLine2: '', createdOn: 1672531200000,
    basePricePerKg: 0.33, normalMilkPricePerKg: 0.33, fatBonusPerPct: 0.003, proteinBonusPerPct: 0.004,
    isEco: false, defaultMilkType: 'Skim milk'
  },
  { 
    id: 'S09', name: 'Tetirvinų ŽŪB', routeGroup: 'Rokiškio kryptis', contractQuota: 90000,
    companyCode: '123456789', phoneNumber: '+370 600 12345', country: 'Lithuania', addressLine1: 'Tetirvinų k., Pasvalio r.', addressLine2: '', createdOn: 1672531200000,
    basePricePerKg: 0.33, fatBonusPerPct: 0.003, proteinBonusPerPct: 0.004,
    isEco: false, defaultMilkType: 'Skim milk'
  },

  // Group C: Individual Farmers (Small Suppliers)
  { 
    id: 'S10', name: 'Labakojienė I.Į.', routeGroup: 'Individualūs', contractQuota: 5000,
    companyCode: '900085412', phoneNumber: '+370 611 11111', country: 'Lithuania', addressLine1: 'Liepų g. 5, Rokiškis', addressLine2: '', createdOn: 1672531200000,
    basePricePerKg: 0.32, normalMilkPricePerKg: 0.32, fatBonusPerPct: 0.001, proteinBonusPerPct: 0.002,
    isEco: false, defaultMilkType: 'Skim milk'
  },
  { 
    id: 'S11', name: 'Zigmantienė Ūkis', routeGroup: 'Individualūs', contractQuota: 3500,
    companyCode: '900085413', phoneNumber: '+370 611 22222', country: 'Lithuania', addressLine1: 'Sodų g. 12, Biržai', addressLine2: '', createdOn: 1672531200000,
    basePricePerKg: 0.32, normalMilkPricePerKg: 0.32, fatBonusPerPct: 0.001, proteinBonusPerPct: 0.002,
    isEco: false, defaultMilkType: 'Skim milk'
  },
  { 
    id: 'S12', name: 'Ragauskas Ūkis', routeGroup: 'Kupiškio grupė', contractQuota: 8000,
    companyCode: '900085414', phoneNumber: '+370 611 33333', country: 'Lithuania', addressLine1: 'Miško g. 8, Kupiškis', addressLine2: '', createdOn: 1672531200000,
    basePricePerKg: 0.33, normalMilkPricePerKg: 0.33, fatBonusPerPct: 0.002, proteinBonusPerPct: 0.003,
    isEco: false, defaultMilkType: 'Skim milk'
  },
  { 
    id: 'S13', name: 'Aukštikalnis P.', routeGroup: 'Individualūs', contractQuota: 2000,
    companyCode: '900085415', phoneNumber: '+370 611 44444', country: 'Lithuania', addressLine1: 'Kalno g. 1, Biržai', addressLine2: '', createdOn: 1672531200000,
    basePricePerKg: 0.32, normalMilkPricePerKg: 0.32, fatBonusPerPct: 0.001, proteinBonusPerPct: 0.002,
    isEco: false, defaultMilkType: 'Skim milk'
  },
  { 
    id: 'S14', name: 'Adomonis J.', routeGroup: 'Individualūs', contractQuota: 4200,
    companyCode: '900085416', phoneNumber: '+370 611 55555', country: 'Lithuania', addressLine1: 'Upės g. 9, Pasvalys', addressLine2: '', createdOn: 1672531200000,
    basePricePerKg: 0.32, normalMilkPricePerKg: 0.32, fatBonusPerPct: 0.001, proteinBonusPerPct: 0.002,
    isEco: false, defaultMilkType: 'Skim milk'
  }
];

export const INITIAL_BUYERS: Buyer[] = [
  { 
    id: 'B01', name: 'Pieno Žvaigždės', 
    companyCode: '123456789', phoneNumber: '+37052525252', country: 'Lithuania', addressLine1: 'Perkūnkiemio g. 3', addressLine2: 'Vilnius', createdOn: 1672531200000,
    contracts: [
      { id: 'c1', contractNumber: 'PZ-2025-Q1', productId: 'MPC85', pricePerKg: 5.50, agreedAmountKg: 50000, startDate: 1704067200000, endDate: 1711843200000 },
      { id: 'c2', contractNumber: 'PZ-2025-Q1-SMP', productId: 'SMP', pricePerKg: 2.10, agreedAmountKg: 20000, startDate: 1704067200000, endDate: 1711843200000 }
    ]
  },
  { 
    id: 'B02', name: 'Litamilk', 
    companyCode: '987654321', phoneNumber: '+37052626262', country: 'Lithuania', addressLine1: 'Kirtimų g. 47', addressLine2: 'Vilnius', createdOn: 1675209600000,
    contracts: [
      { id: 'c3', contractNumber: 'LM-LONG-01', productId: 'MPC85', pricePerKg: 5.35, agreedAmountKg: 100000, startDate: 1704067200000, endDate: 1735689600000 }
    ]
  },
  { 
    id: 'B03', name: 'Vilkyškių Pieninė', 
    companyCode: '111222333', phoneNumber: '', country: 'Lithuania', addressLine1: 'Vilkyškiai', addressLine2: 'Pagėgių sav.', createdOn: 1677801600000,
    contracts: []
  },
  { 
    id: 'B04', name: 'Export (Poland)', 
    companyCode: 'PL555666777', phoneNumber: '', country: 'Poland', addressLine1: 'Warsaw Logistics Hub', addressLine2: '', createdOn: 1680307200000,
    contracts: []
  },
  { 
    id: 'B05', name: 'Export (Germany)', 
    companyCode: 'DE999888777', phoneNumber: '', country: 'Germany', addressLine1: 'Hamburg Port', addressLine2: '', createdOn: 1682899200000,
    contracts: []
  }
];

// Initial Mock Data for Demo
export const INITIAL_INTAKE: IntakeEntry[] = [
  {
    id: 'in-1',
    supplierId: 'S01',
    supplierName: 'UAB "Šalva"',
    routeGroup: 'Kupiškio grupė',
    milkType: 'Skim milk',
    quantityKg: 24500,
    ph: 6.65,
    fatPct: 4.2,
    proteinPct: 3.4,
    tempCelsius: 4.1,
    isEcological: false,
    tags: [],
    note: '',
    timestamp: Date.now() - 3600000,
    calculatedCost: 24500 * (0.34 + ((4.2-4.0)*10*0.003) + ((3.4-3.2)*10*0.004))
  },
  {
    id: 'in-2',
    supplierId: 'S10',
    supplierName: 'Labakojienė I.Į.',
    routeGroup: 'Individualūs',
    milkType: 'Skim milk',
    quantityKg: 2100,
    ph: 6.75,
    fatPct: 3.9,
    proteinPct: 3.2,
    tempCelsius: 8.5,
    isEcological: false,
    tags: ['#HighTemp'],
    note: 'Driver reported cooling failure',
    timestamp: Date.now() - 3500000,
    calculatedCost: 2100 * (0.32 + ((3.9-4.0)*10*0.001) + ((3.2-3.2)*10*0.002))
  },
  {
    id: 'in-3',
    supplierId: 'S03',
    supplierName: 'UAB "AUGA trade"',
    routeGroup: 'EKO Auga',
    milkType: 'Skim milk',
    quantityKg: 15400,
    ph: 6.60,
    fatPct: 4.0,
    proteinPct: 3.5,
    tempCelsius: 4.2,
    isEcological: true, // Example Ecological
    tags: [],
    note: '',
    timestamp: Date.now() - 3000000,
    calculatedCost: 15400 * (0.38 + ((4.0-4.0)*10*0.003) + ((3.5-3.2)*10*0.004))
  }
];

export const INITIAL_OUTPUT: OutputEntry[] = [
  {
    id: 'out-1',
    productId: 'MPC85',
    batchId: 'MPC85-240520-A',
    packagingString: '10 pad; 2 bb',
    parsed: { pallets: 10, bigBags: 2, tanks: 0, totalWeight: 10700 }, 
    destination: 'Warehouse',
    timestamp: Date.now() - 1800000
  }
];
