import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMilkCost } from '../utils/milkCost';
import { parsePackagingString } from '../utils/parser';
import { getShippedKg, getShippedRevenue, isShippedStatus } from '../utils/dispatchMath';
import { buildIntakeTags, getIntakeWarnings } from '../utils/intakeRules';
import { validateDispatchForm, validateIntakeForm } from '../utils/validation';

test('calculateMilkCost applies supplier bonuses', () => {
  const total = calculateMilkCost(
    1000,
    4.2,
    3.4,
    {
      id: 's1',
      name: 'Supplier',
      routeGroup: 'North',
      contractQuota: 0,
      companyCode: 'LT123',
      phoneNumber: '',
      country: 'LT',
      addressLine1: 'Addr',
      addressLine2: '',
      createdOn: Date.now(),
      basePricePerKg: 0.34,
      fatBonusPerPct: 0.003,
      proteinBonusPerPct: 0.004,
      isEco: false,
      defaultMilkType: 'Skim milk',
    },
    { defaultMilkBasePrice: 0.32 } as any,
  );

  assert.ok(Math.abs(total - 354) < 0.0001);
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
