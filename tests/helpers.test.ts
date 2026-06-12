import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePackagingString, parsePackagingString, parsePackagingSegments } from '../utils/parser';
import { getShippedKg, getShippedRevenue, isShippedStatus } from '../utils/dispatchMath';
import { buildIntakeTags, getIntakeWarnings } from '../utils/intakeRules';
import { calculateLabCoefficient, getEffectiveIntakeQuantityKg, resolveEffectiveQuantityKg } from '../utils/intakeCoefficient';
import { resolveIntakeCost } from '../utils/intakePricing';
import { validateDispatchForm, validateIntakeForm, validateProductForm } from '../utils/validation';
import { buildStockLevels } from '../utils/stockLevels';

test('calculateLabCoefficient follows the raw milk formula', () => {
  const coefficient = calculateLabCoefficient(4.2, 3.4);
  assert.ok(Math.abs(coefficient - (1 + (4.2 - 3.4) * 0.178 + (3.4 - 3.0) * 0.267)) < 0.0001);
});

test('resolveEffectiveQuantityKg applies the coefficient only when enabled', () => {
  const adjusted = resolveEffectiveQuantityKg({ quantityKg: 1000, applyCoefficient: true, fatPct: 4.2, proteinPct: 3.4 });
  const plain = resolveEffectiveQuantityKg({ quantityKg: 1000, applyCoefficient: false, fatPct: 4.2, proteinPct: 3.4 });

  assert.ok(adjusted.labCoefficient > 1);
  assert.ok(adjusted.effectiveQuantityKg > 1000);
  assert.equal(plain.labCoefficient, 1);
  assert.equal(plain.effectiveQuantityKg, 1000);
});

test('resolveIntakeCost supports invoice total and unit price modes', () => {
  const invoice = resolveIntakeCost({ pricingMode: 'invoice_total', invoiceTotalEur: 412.5, quantityKg: 1000, effectiveQuantityKg: 1040 });
  const unitReceived = resolveIntakeCost({ pricingMode: 'unit_price', unitPricePerKg: 0.42, unitPriceBasis: 'received_kg', quantityKg: 1000, effectiveQuantityKg: 1040 });
  const unitEffective = resolveIntakeCost({ pricingMode: 'unit_price', unitPricePerKg: 0.42, unitPriceBasis: 'effective_kg', quantityKg: 1000, effectiveQuantityKg: 1040 });

  assert.equal(invoice.calculatedCost, 412.5);
  assert.equal(unitReceived.calculatedCost, 420);
  assert.equal(unitEffective.calculatedCost, 436.8);
});

test('effective quantity helper falls back to physical quantity for legacy rows', () => {
  assert.equal(getEffectiveIntakeQuantityKg({ quantityKg: 1250, effectiveQuantityKg: undefined } as any), 1250);
});

test('parsePackagingString resolves weighted units', () => {
  const parsed = parsePackagingString('2 pad*750; 1 bb*900; 100 kg', 750, 900);
  assert.equal(parsed.isValid, true);
  assert.equal(parsed.totalWeight, 2500);
});

test('parsePackagingString does not double count kg suffixes on unit weights', () => {
  const parsed = parsePackagingString('1 pad*750kg', 900, 850);
  assert.equal(parsed.isValid, true);
  assert.equal(parsed.pallets, 1);
  assert.equal(parsed.totalWeight, 750);

  const segments = parsePackagingSegments('1 pad*750kg; 20 kg', 900, 850);
  assert.deepEqual(segments, [
    { unit: 'pad', count: 1, unitWeight: 750 },
    { unit: 'kg', count: 20, looseTarget: 'legacy' },
  ]);
});

test('parsePackagingString tracks typed loose pallet and big bag pools', () => {
  const parsed = parsePackagingString('1 pad; 300 kg loose pad; 200 kg loose bb', 900, 850);

  assert.equal(parsed.isValid, true);
  assert.equal(parsed.pallets, 1);
  assert.equal(parsed.looseKg, 500);
  assert.equal(parsed.loosePalletKg, 300);
  assert.equal(parsed.looseBigBagKg, 200);
  assert.equal(parsed.looseLegacyKg, 0);
  assert.equal(parsed.totalWeight, 1400);
});

test('normalizePackagingString preserves typed loose target weights', () => {
  const normalized = normalizePackagingString('300 kg loose pallet*750; 200 kg loose big bag', 900, 850);

  assert.equal(normalized.normalized, '300 kg loose pad *750; 200 kg loose bb *850');
  assert.equal(normalized.loosePalletKgAdded, 300);
  assert.equal(normalized.looseBigBagKgAdded, 200);
});

test('parsePackagingString falls back when product default unit weights are missing', () => {
  const parsed = parsePackagingString('1 pad; 1 bb', 0, 0);

  assert.equal(parsed.isValid, true);
  assert.equal(parsed.pallets, 1);
  assert.equal(parsed.bigBags, 1);
  assert.equal(parsed.totalWeight, 1750);
});

test('dispatch helpers compute shipped totals from shipments', () => {
  const dispatch = {
    quantityKg: 0,
    salesPricePerKg: 5,
    shipments: [{ quantityKg: 100 }, { quantityKg: 250 }],
  } as any;

  assert.equal(isShippedStatus('confirmed'), true);
  assert.equal(getShippedKg(dispatch), 350);
  assert.equal(getShippedRevenue(dispatch), 1750);
});

test('stock levels deduct direct confirmed dispatches without shipment rows', () => {
  const [stock] = buildStockLevels({
    products: [{ id: 'MPC85', name: 'MPC 85', defaultPalletWeight: 900, defaultBagWeight: 850 }],
    outputEntries: [{
      id: 'out-1',
      productId: 'MPC85',
      packagingString: '2 pad*900',
      timestamp: new Date('2026-04-03T12:00:00Z').getTime(),
    }],
    dispatchEntries: [{
      id: 'disp-1',
      productId: 'MPC85',
      status: 'confirmed',
      quantityKg: 900,
      packagingString: '1 pad*900',
      date: new Date('2026-04-04T12:00:00Z').getTime(),
      shipments: [],
    }],
    stockAdjustments: [],
  });

  assert.equal(stock.currentStockKg, 900);
  assert.equal(stock.currentStockPallets, 1);
});

test('stock levels keep kg and pallet views aligned for unmapped direct dispatches', () => {
  const [stock] = buildStockLevels({
    products: [{ id: 'MPC80', name: 'MPC 80', defaultPalletWeight: 900, defaultBagWeight: 850 }],
    outputEntries: [{
      id: 'out-1',
      productId: 'MPC80',
      packagingString: '2 pad',
      timestamp: new Date('2026-04-03T12:00:00Z').getTime(),
    }],
    dispatchEntries: [{
      id: 'disp-1',
      productId: 'MPC80',
      status: 'confirmed',
      quantityKg: 1800,
      date: new Date('2026-04-04T12:00:00Z').getTime(),
      shipments: [],
    }],
    stockAdjustments: [],
  });

  assert.equal(stock.currentStockKg, 0);
  assert.equal(stock.currentStockPallets, 0);
  assert.deepEqual(stock.currentLots, []);
});

test('stock levels consume legacy kg-only dispatches from the unit ledger', () => {
  const [stock] = buildStockLevels({
    products: [{ id: 'MPC80', name: 'MPC 80', defaultPalletWeight: 900, defaultBagWeight: 850 }],
    outputEntries: [{
      id: 'out-1',
      productId: 'MPC80',
      packagingString: '2 pad',
      timestamp: new Date('2026-03-30T12:00:00Z').getTime(),
    }],
    dispatchEntries: [{
      id: 'disp-1',
      productId: 'MPC80',
      status: 'confirmed',
      quantityKg: 900,
      date: new Date('2026-04-01T12:00:00Z').getTime(),
      shipments: [],
    }],
    stockAdjustments: [],
  });

  assert.equal(stock.currentStockKg, 900);
  assert.equal(stock.currentStockPallets, 1);
  assert.equal(stock.looseKgEstimate, 0);
});

test('stock levels preserve partial unit weight after unmapped kg dispatches', () => {
  const [stock] = buildStockLevels({
    products: [{ id: 'MPC80', name: 'MPC 80', defaultPalletWeight: 900, defaultBagWeight: 850 }],
    outputEntries: [{
      id: 'out-1',
      productId: 'MPC80',
      packagingString: '1 pad',
      timestamp: new Date('2026-04-03T12:00:00Z').getTime(),
    }],
    dispatchEntries: [{
      id: 'disp-1',
      productId: 'MPC80',
      status: 'confirmed',
      quantityKg: 500,
      date: new Date('2026-04-04T12:00:00Z').getTime(),
      shipments: [],
    }],
    stockAdjustments: [],
  });

  assert.equal(stock.currentStockKg, 400);
  assert.equal(stock.currentStockPallets, 1);
  assert.deepEqual(stock.currentLots, [{ unit: 'pad', weight: 400, count: 1 }]);
  assert.equal(stock.expectedKgFromUnits, 400);
});

test('stock levels auto-close typed loose pools into their own package types', () => {
  const [stock] = buildStockLevels({
    products: [{ id: 'MPC80', name: 'MPC 80', defaultPalletWeight: 900, defaultBagWeight: 850 }],
    outputEntries: [
      {
        id: 'out-1',
        productId: 'MPC80',
        packagingString: '500 kg loose pad; 500 kg loose pad',
        timestamp: new Date('2026-04-03T12:00:00Z').getTime(),
      },
      {
        id: 'out-2',
        productId: 'MPC80',
        packagingString: '500 kg loose bb; 400 kg loose bb',
        timestamp: new Date('2026-04-04T12:00:00Z').getTime(),
      },
    ],
    dispatchEntries: [],
    stockAdjustments: [],
  });

  assert.equal(stock.currentStockPallets, 1);
  assert.equal(stock.currentStockBigBags, 1);
  assert.equal(stock.loosePalletKg, 100);
  assert.equal(stock.looseBigBagKg, 50);
  assert.equal(stock.currentStockKg, 1900);
});

test('stock levels keep loose pools separate when target weights differ', () => {
  const [stock] = buildStockLevels({
    products: [{ id: 'MPC80', name: 'MPC 80', defaultPalletWeight: 900, defaultBagWeight: 850 }],
    outputEntries: [{
      id: 'out-1',
      productId: 'MPC80',
      packagingString: '600 kg loose pad*750; 200 kg loose pad*750; 500 kg loose pad',
      timestamp: new Date('2026-04-03T12:00:00Z').getTime(),
    }],
    dispatchEntries: [],
    stockAdjustments: [],
  });

  assert.deepEqual(stock.currentLots, [{ unit: 'pad', weight: 750, count: 1 }]);
  assert.deepEqual(stock.looseGroups, [
    { target: 'pad', targetWeight: 900, kg: 500 },
    { target: 'pad', targetWeight: 750, kg: 50 },
  ]);
  assert.equal(stock.currentStockKg, 1300);
});

test('stock levels deduct typed loose shipments from matching loose pools', () => {
  const [stock] = buildStockLevels({
    products: [{ id: 'MPC80', name: 'MPC 80', defaultPalletWeight: 900, defaultBagWeight: 850 }],
    outputEntries: [{
      id: 'out-1',
      productId: 'MPC80',
      packagingString: '500 kg loose bb',
      timestamp: new Date('2026-04-03T12:00:00Z').getTime(),
    }],
    dispatchEntries: [{
      id: 'disp-1',
      productId: 'MPC80',
      status: 'confirmed',
      quantityKg: 200,
      date: new Date('2026-04-04T12:00:00Z').getTime(),
      packagingString: '200 kg loose bb',
      shipments: [],
    }],
    stockAdjustments: [],
  });

  assert.equal(stock.looseBigBagKg, 300);
  assert.equal(stock.loosePalletKg, 0);
  assert.equal(stock.currentStockKg, 300);
});

test('stock levels create partial lots when typed loose shipments exceed loose pool', () => {
  const [stock] = buildStockLevels({
    products: [{ id: 'MPC80', name: 'MPC 80', defaultPalletWeight: 900, defaultBagWeight: 850 }],
    outputEntries: [{
      id: 'out-1',
      productId: 'MPC80',
      packagingString: '1 bb',
      timestamp: new Date('2026-04-03T12:00:00Z').getTime(),
    }],
    dispatchEntries: [{
      id: 'disp-1',
      productId: 'MPC80',
      status: 'confirmed',
      quantityKg: 300,
      date: new Date('2026-04-04T12:00:00Z').getTime(),
      packagingString: '300 kg loose bb',
      shipments: [],
    }],
    stockAdjustments: [],
  });

  assert.equal(stock.currentStockKg, 550);
  assert.deepEqual(stock.currentLots, [{ unit: 'bb', weight: 550, count: 1 }]);
});

test('stock levels fall back to any lot when typed loose shipment has no matching unit', () => {
  const [stock] = buildStockLevels({
    products: [{ id: 'MPC80', name: 'MPC 80', defaultPalletWeight: 900, defaultBagWeight: 850 }],
    outputEntries: [{
      id: 'out-1',
      productId: 'MPC80',
      packagingString: '1 pad',
      timestamp: new Date('2026-04-03T12:00:00Z').getTime(),
    }],
    dispatchEntries: [{
      id: 'disp-1',
      productId: 'MPC80',
      status: 'confirmed',
      quantityKg: 300,
      date: new Date('2026-04-04T12:00:00Z').getTime(),
      packagingString: '300 kg loose bb',
      shipments: [],
    }],
    stockAdjustments: [],
  });

  assert.equal(stock.currentStockKg, 600);
  assert.deepEqual(stock.currentLots, [{ unit: 'pad', weight: 600, count: 1 }]);
});

test('stock levels add typed loose stock adjustments to the correct pool', () => {
  const [stock] = buildStockLevels({
    products: [{ id: 'MPC80', name: 'MPC 80', defaultPalletWeight: 900, defaultBagWeight: 850 }],
    outputEntries: [],
    dispatchEntries: [],
    stockAdjustments: [{
      id: 'adj-1',
      productId: 'MPC80',
      type: 'initial_balance',
      adjustmentKg: 500,
      pallets: 0,
      bigBags: 0,
      tanks: 0,
      looseKg: 0,
      loosePalletKg: 100,
      looseBigBagKg: 400,
      timestamp: new Date('2026-04-02T12:00:00Z').getTime(),
    }],
  });

  assert.equal(stock.loosePalletKg, 100);
  assert.equal(stock.looseBigBagKg, 400);
  assert.equal(stock.currentStockKg, 500);
});

test('stock levels derive kg from adjustment unit counts when adjustmentKg is missing', () => {
  const [stock] = buildStockLevels({
    products: [{ id: 'MPC80', name: 'MPC 80', defaultPalletWeight: 900, defaultBagWeight: 850 }],
    outputEntries: [],
    dispatchEntries: [],
    stockAdjustments: [{
      id: 'adj-1',
      productId: 'MPC80',
      type: 'initial_balance',
      adjustmentKg: 0,
      pallets: 2,
      bigBags: 1,
      tanks: 0,
      looseKg: 25,
      timestamp: new Date('2026-04-02T12:00:00Z').getTime(),
    }],
  });

  assert.equal(stock.currentStockKg, 2675);
  assert.equal(stock.currentStockPallets, 2);
  assert.equal(stock.currentStockBigBags, 1);
  assert.equal(stock.looseKg, 25);
});

test('stock levels use unit ledger kg when stored adjustmentKg disagrees with units', () => {
  const [stock] = buildStockLevels({
    products: [{ id: 'MPC80', name: 'MPC 80', defaultPalletWeight: 900, defaultBagWeight: 850 }],
    outputEntries: [],
    dispatchEntries: [],
    stockAdjustments: [{
      id: 'adj-1',
      productId: 'MPC80',
      type: 'initial_balance',
      adjustmentKg: 100,
      pallets: 2,
      bigBags: 0,
      tanks: 0,
      looseKg: 0,
      timestamp: new Date('2026-04-02T12:00:00Z').getTime(),
    }],
  });

  assert.equal(stock.currentStockKg, 1800);
  assert.equal(stock.currentStockPallets, 2);
  assert.equal(stock.looseKgEstimate, 0);
});

test('intake rules add warnings and tags for out-of-range values', () => {
  const tags = buildIntakeTags({ tempCelsius: 9.5, ph: 6.8 }, ['#Manual']);
  const warnings = getIntakeWarnings({ tempCelsius: 9.5, ph: 6.8 });

  assert.deepEqual(tags.sort(), ['#BadAcidity', '#HighTemp', '#Manual'].sort());
  assert.equal(warnings.length, 2);
});

test('validation helpers reject incomplete intake and dispatch forms', () => {
  const intakeErrors = validateIntakeForm({
    supplierId: '',
    milkType: '',
    intakeDate: '',
    intakeKg: '0',
    fat: '101',
    protein: '-1',
    ph: '18',
    temp: '80',
    pricingMode: 'invoice_total',
    invoiceTotalEur: '',
    unitPricePerKg: '',
    unitPriceBasis: '',
  });
  const dispatchErrors = validateDispatchForm({
    buyerId: '',
    productId: '',
    dispatchDate: '',
    quantity: '0',
    pricePerKg: '-5',
    parserPreview: null,
  });

  assert.ok(Object.keys(intakeErrors).length >= 6);
  assert.ok(Object.keys(dispatchErrors).length >= 5);
});

test('product validation allows blank optional fields but rejects invalid provided values', () => {
  const relaxed = validateProductForm({
    id: 'MPC90',
    name: 'MPC 90',
    defaultPalletWeight: '',
    defaultBagWeight: '',
    proteinTargetPct: '',
    yieldFactor: '',
  });

  const invalidProvided = validateProductForm({
    id: 'MPC90',
    name: 'MPC 90',
    defaultPalletWeight: '0',
    defaultBagWeight: '-1',
    proteinTargetPct: '120',
    yieldFactor: '2',
  });

  assert.equal(Object.keys(relaxed).length, 0);
  assert.ok(invalidProvided.defaultPalletWeight);
  assert.ok(invalidProvided.defaultBagWeight);
  assert.ok(invalidProvided.proteinTargetPct);
  assert.ok(invalidProvided.yieldFactor);
});
