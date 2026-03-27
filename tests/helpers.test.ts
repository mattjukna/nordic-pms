import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePackagingString } from '../utils/parser';
import { getShippedKg, getShippedRevenue, isShippedStatus } from '../utils/dispatchMath';
import { buildIntakeTags, getIntakeWarnings } from '../utils/intakeRules';
import { calculateLabCoefficient, getEffectiveIntakeQuantityKg, resolveEffectiveQuantityKg } from '../utils/intakeCoefficient';
import { resolveIntakeCost } from '../utils/intakePricing';
import { validateDispatchForm, validateIntakeForm, validateProductForm } from '../utils/validation';

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
