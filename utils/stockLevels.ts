import { parsePackagingSegments } from './packagingNormalize';

export type StockUnit = 'pad' | 'bb' | 'tank';

export type StockLotGroup = {
  unit: StockUnit;
  weight: number;
  count: number;
};

export type StockIssueRef = {
  type: 'output' | 'shipment' | 'dispatch';
  entry: any;
  dispatchId?: string;
};

export type StockLevel = {
  id: string;
  name: string;
  details?: string;
  sortOrder?: number;
  defaultPalletWeight: number;
  defaultBagWeight: number;
  proteinTargetPct?: number;
  yieldFactor?: number;
  currentStockKg: number;
  realStockKg: number;
  currentStockPallets: number;
  currentStockBigBags: number;
  currentStockTanks: number;
  currentLots: StockLotGroup[];
  looseKg: number;
  expectedKgFromUnits: number;
  looseKgEstimate: number;
  unmappedKgForUnits: number;
  fractionalOutputs: any[];
  problematicShipments: StockIssueRef[];
  unmappedDispatches: any[];
  ageStatus: 'green' | 'yellow' | 'red';
  hasFractionalInput: boolean;
  looseWarning: boolean;
  hasLegacyUnmappedData: boolean;
};

type ProductLike = {
  id: string;
  name?: string;
  details?: string | null;
  sortOrder?: number | null;
  defaultPalletWeight?: number | null;
  defaultBagWeight?: number | null;
  proteinTargetPct?: number | null;
  yieldFactor?: number | null;
};

type BuildStockLevelsArgs = {
  products: ProductLike[];
  outputEntries: any[];
  dispatchEntries: any[];
  stockAdjustments: any[];
  varianceCutoffDate?: string;
  now?: number;
};

const DEFAULT_VARIANCE_CUTOFF_DATE = '2026-04-02';

const asNumber = (value: unknown, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const positiveWeight = (value: unknown, fallback: number) => {
  const next = asNumber(value);
  return next > 0 ? next : fallback;
};

const toMillis = (value: unknown) => {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const getParsed = (row: any) => ({
  pallets: asNumber(row?.parsed?.pallets ?? row?.pallets),
  bigBags: asNumber(row?.parsed?.bigBags ?? row?.bigBags),
  tanks: asNumber(row?.parsed?.tanks ?? row?.tanks),
  totalWeight: asNumber(row?.parsed?.totalWeight ?? row?.totalWeight),
});

const addLot = (lots: StockLotGroup[], unit: StockUnit, weight: number, count: number) => {
  if (!Number.isFinite(count) || Math.abs(count) <= 1e-9) return;
  const existing = lots.find((lot) => lot.unit === unit && lot.weight === weight);
  if (existing) existing.count += count;
  else lots.push({ unit, weight, count });
};

const addSegmentsToLots = (
  packagingString: string | null | undefined,
  defPad: number,
  defBb: number,
  lots: StockLotGroup[],
) => {
  let looseKg = 0;
  let totalKg = 0;
  const segs = packagingString ? parsePackagingSegments(packagingString, defPad, defBb) : [];

  for (const seg of segs) {
    if (seg.unit === 'kg') {
      looseKg += seg.count;
      totalKg += seg.count;
      continue;
    }

    const weight = seg.unitWeight || (seg.unit === 'pad' ? defPad : seg.unit === 'bb' ? defBb : 25000);
    addLot(lots, seg.unit, weight, seg.count);
    totalKg += seg.count * weight;
  }

  return { segs, looseKg, totalKg };
};

const addParsedFallbackToLots = (
  row: any,
  defPad: number,
  defBb: number,
  lots: StockLotGroup[],
) => {
  const parsed = getParsed(row);
  let totalKg = 0;
  let hasFractional = false;

  const addWholeAndPartial = (unit: StockUnit, count: number, defaultWeight: number) => {
    const whole = Math.floor(count || 0);
    const frac = (count || 0) - whole;
    if (whole > 0) {
      addLot(lots, unit, defaultWeight, whole);
      totalKg += whole * defaultWeight;
    }
    if (frac > 1e-6) {
      const partialKg = Math.round(frac * defaultWeight);
      addLot(lots, unit, partialKg, 1);
      totalKg += partialKg;
      hasFractional = true;
    }
  };

  addWholeAndPartial('pad', parsed.pallets || 0, defPad);
  addWholeAndPartial('bb', parsed.bigBags || 0, defBb);
  addWholeAndPartial('tank', parsed.tanks || 0, 25000);

  return { parsed, totalKg, hasFractional };
};

const getAdjustmentKg = (row: any, defPad: number, defBb: number) => {
  const explicitKg = asNumber(row?.adjustmentKg);
  if (Math.abs(explicitKg) > 1e-9) return explicitKg;

  return (
    asNumber(row?.pallets) * defPad
    + asNumber(row?.bigBags) * defBb
    + asNumber(row?.tanks) * 25000
    + asNumber(row?.looseKg)
  );
};

export function buildStockLevels({
  products,
  outputEntries,
  dispatchEntries,
  stockAdjustments,
  varianceCutoffDate = DEFAULT_VARIANCE_CUTOFF_DATE,
  now = Date.now(),
}: BuildStockLevelsArgs): StockLevel[] {
  const varianceCutoffTs = new Date(varianceCutoffDate).getTime();

  return products.map((product) => {
    const productId = product.id;
    const productOutputs = outputEntries.filter((entry) => entry.productId === productId);
    const productAdjustments = stockAdjustments.filter((entry) => entry.productId === productId);
    const defPad = positiveWeight(product.defaultPalletWeight, 900);
    const defBb = positiveWeight(product.defaultBagWeight, 850);

    const initialBalances = productAdjustments.filter((entry) => entry.type === 'initial_balance');
    const latestIB = initialBalances.length > 0
      ? initialBalances.reduce((latest, entry) => (toMillis(entry.timestamp) > toMillis(latest.timestamp) ? entry : latest))
      : null;
    const resetTs = latestIB ? toMillis(latestIB.timestamp) : 0;

    const producedLots: StockLotGroup[] = [];
    let producedLooseKg = 0;
    let producedKg = 0;
    const batchKgs: { timestamp: number; kg: number }[] = [];
    const fractionalOutputs: any[] = [];

    const activeOutputs = resetTs > 0 ? productOutputs.filter((entry) => toMillis(entry.timestamp) > resetTs) : productOutputs;
    for (const output of activeOutputs) {
      const prevProducedKg = producedKg;
      const fromSegments = addSegmentsToLots(output.packagingString, defPad, defBb, producedLots);

      if (fromSegments.segs.length > 0) {
        producedLooseKg += fromSegments.looseKg;
        producedKg += fromSegments.totalKg;
      } else {
        const fallback = addParsedFallbackToLots(output, defPad, defBb, producedLots);
        producedKg += fallback.totalKg || fallback.parsed.totalWeight || 0;
        if (fallback.hasFractional) fractionalOutputs.push(output);
      }

      const timestamp = toMillis(output.timestamp);
      if (timestamp) batchKgs.push({ timestamp, kg: producedKg - prevProducedKg });
    }

    const shippedLots: StockLotGroup[] = [];
    let shippedLooseKg = 0;
    let shippedKg = 0;
    let unmappedKgForUnits = 0;
    let unmappedKgForLotConsumption = 0;
    let hasLegacyUnmappedData = false;
    const problematicShipments: StockIssueRef[] = [];
    const unmappedDispatches: any[] = [];

    const relevantDispatches = dispatchEntries.filter((entry) => (
      entry.productId === productId
      && entry.status !== 'planned'
      && (!resetTs || toMillis(entry.date) > resetTs)
    ));

    for (const dispatch of relevantDispatches) {
      const isAfterCutoff = toMillis(dispatch.date) >= varianceCutoffTs;
      const shipments = Array.isArray(dispatch.shipments) ? dispatch.shipments : [];

      if (shipments.length > 0) {
        for (const shipment of shipments) {
          const shipmentQty = asNumber(shipment.quantityKg);
          shippedKg += shipmentQty;
          const fromSegments = addSegmentsToLots(shipment.packagingString, defPad, defBb, shippedLots);

          if (fromSegments.segs.length > 0) {
            shippedLooseKg += fromSegments.looseKg;
            const parsed = getParsed(shipment);
            if (isAfterCutoff && parsed.totalWeight && Math.abs(parsed.totalWeight - shipmentQty) > 25) {
              problematicShipments.push({ type: 'shipment', entry: shipment, dispatchId: dispatch.id });
            }
          } else {
            const fallback = addParsedFallbackToLots(shipment, defPad, defBb, shippedLots);
            if (fallback.parsed.totalWeight > 0) {
              if (fallback.hasFractional && isAfterCutoff) {
                unmappedKgForUnits += fallback.parsed.totalWeight;
                problematicShipments.push({ type: 'shipment', entry: shipment, dispatchId: dispatch.id });
              } else if (fallback.hasFractional) {
                hasLegacyUnmappedData = true;
              }
            } else if (isAfterCutoff) {
              unmappedKgForUnits += shipmentQty;
              unmappedKgForLotConsumption += shipmentQty;
              problematicShipments.push({ type: 'shipment', entry: shipment, dispatchId: dispatch.id });
            } else {
              unmappedKgForLotConsumption += shipmentQty;
              hasLegacyUnmappedData = true;
            }
          }
        }

        continue;
      }

      const dispatchParsed = getParsed(dispatch);
      const dispatchQty = asNumber(dispatch.quantityKg)
        || dispatchParsed.totalWeight
        || asNumber(dispatch.orderedQuantityKg);
      shippedKg += dispatchQty;

      const fromSegments = addSegmentsToLots(dispatch.packagingString, defPad, defBb, shippedLots);
      if (fromSegments.segs.length > 0) {
        shippedLooseKg += fromSegments.looseKg;
        if (isAfterCutoff && Math.abs(fromSegments.totalKg - dispatchQty) > 25) {
          problematicShipments.push({ type: 'dispatch', entry: dispatch });
        }
      } else if (isAfterCutoff) {
        unmappedDispatches.push(dispatch);
        unmappedKgForUnits += dispatchQty;
        unmappedKgForLotConsumption += dispatchQty;
      } else {
        unmappedKgForLotConsumption += dispatchQty;
        hasLegacyUnmappedData = true;
      }
    }

    let adjKg = 0;
    let adjLooseKg = 0;
    const adjLots: StockLotGroup[] = [];

    if (latestIB) {
      adjKg += getAdjustmentKg(latestIB, defPad, defBb);
      adjLooseKg += asNumber(latestIB.looseKg);
      addLot(adjLots, 'pad', defPad, asNumber(latestIB.pallets));
      addLot(adjLots, 'bb', defBb, asNumber(latestIB.bigBags));
      addLot(adjLots, 'tank', 25000, asNumber(latestIB.tanks));
    }

    for (const adjustment of productAdjustments) {
      if (adjustment.type === 'initial_balance') continue;
      if (resetTs && toMillis(adjustment.timestamp) <= resetTs) continue;
      adjKg += getAdjustmentKg(adjustment, defPad, defBb);
      adjLooseKg += asNumber(adjustment.looseKg);
      addLot(adjLots, 'pad', defPad, asNumber(adjustment.pallets));
      addLot(adjLots, 'bb', defBb, asNumber(adjustment.bigBags));
      addLot(adjLots, 'tank', 25000, asNumber(adjustment.tanks));
    }

    const lotMap = new Map<string, StockLotGroup>();
    const lotKey = (unit: string, weight: number) => `${unit}:${weight}`;

    for (const lot of [...producedLots, ...adjLots]) {
      const key = lotKey(lot.unit, lot.weight);
      const existing = lotMap.get(key);
      lotMap.set(key, existing ? { ...existing, count: existing.count + lot.count } : { ...lot });
    }

    for (const shippedLot of shippedLots) {
      let remaining = shippedLot.count;
      const exact = lotMap.get(lotKey(shippedLot.unit, shippedLot.weight));
      if (exact && exact.count > 0) {
        const take = Math.min(exact.count, remaining);
        exact.count -= take;
        remaining -= take;
      }

      if (remaining > 0) {
        const sameUnit = [...lotMap.values()]
          .filter((lot) => lot.unit === shippedLot.unit && lot.count > 0)
          .sort((a, b) => Math.abs(a.weight - shippedLot.weight) - Math.abs(b.weight - shippedLot.weight));

        for (const lot of sameUnit) {
          if (remaining <= 0) break;
          const take = Math.min(lot.count, remaining);
          lot.count -= take;
          remaining -= take;
        }
      }
    }

    let netLooseKg = producedLooseKg - shippedLooseKg + adjLooseKg;

    let unknownKgToConsume = Math.max(0, unmappedKgForLotConsumption);
    if (unknownKgToConsume > 0 && netLooseKg > 0) {
      const takeLoose = Math.min(netLooseKg, unknownKgToConsume);
      netLooseKg -= takeLoose;
      unknownKgToConsume -= takeLoose;
    }

    if (unknownKgToConsume > 0) {
      const lotEntries = () => [...lotMap.entries()]
        .filter(([, lot]) => lot.count > 0 && lot.weight > 0)
        .sort(([, a], [, b]) => b.weight - a.weight);

      while (unknownKgToConsume > 1e-6) {
        const fullMatch = lotEntries().find(([, lot]) => lot.weight <= unknownKgToConsume + 1e-6);

        if (fullMatch) {
          const [, lot] = fullMatch;
          const countToTake = Math.min(lot.count, Math.floor((unknownKgToConsume + 1e-6) / lot.weight));
          if (countToTake <= 0) break;
          lot.count -= countToTake;
          unknownKgToConsume -= countToTake * lot.weight;
          continue;
        }

        const partialMatch = lotEntries()[0];
        if (!partialMatch) break;

        const [, lot] = partialMatch;
        const consumedKg = Math.min(unknownKgToConsume, lot.weight);
        const remainingWeight = lot.weight - consumedKg;
        lot.count -= 1;
        unknownKgToConsume -= consumedKg;

        if (remainingWeight > 1e-6) {
          const roundedWeight = Math.round(remainingWeight * 100) / 100;
          const partialKey = lotKey(lot.unit, roundedWeight);
          const existing = lotMap.get(partialKey);
          lotMap.set(
            partialKey,
            existing
              ? { ...existing, count: existing.count + 1 }
              : { unit: lot.unit, weight: roundedWeight, count: 1 },
          );
        }
      }
    }

    const ledgerStockKg = producedKg - shippedKg + adjKg;

    if (defPad > 0 && netLooseKg >= defPad) {
      const newPallets = Math.floor(netLooseKg / defPad);
      netLooseKg -= newPallets * defPad;
      const key = lotKey('pad', defPad);
      const existing = lotMap.get(key);
      lotMap.set(key, existing ? { ...existing, count: existing.count + newPallets } : { unit: 'pad', weight: defPad, count: newPallets });
    }

    const currentLots: StockLotGroup[] = [...lotMap.values()]
      .filter((lot) => lot.count > 0)
      .sort((a, b) => {
        const unitOrder = { pad: 0, bb: 1, tank: 2 };
        if (unitOrder[a.unit] !== unitOrder[b.unit]) return unitOrder[a.unit] - unitOrder[b.unit];
        return b.weight - a.weight;
      });

    const currentStockPallets = currentLots.filter((lot) => lot.unit === 'pad').reduce((sum, lot) => sum + lot.count, 0);
    const currentStockBigBags = currentLots.filter((lot) => lot.unit === 'bb').reduce((sum, lot) => sum + lot.count, 0);
    const currentStockTanks = currentLots.filter((lot) => lot.unit === 'tank').reduce((sum, lot) => sum + lot.count, 0);
    const looseKg = Math.max(0, Math.round(netLooseKg));
    const expectedKgFromLots = currentLots.reduce((sum, lot) => sum + lot.count * lot.weight, 0) + looseKg;
    const currentStockKg = Math.max(0, expectedKgFromLots > 0 ? expectedKgFromLots : ledgerStockKg);
    const realStockKg = currentStockKg;
    const looseKgEstimate = currentStockKg - expectedKgFromLots;

    const hasFractionalInput = fractionalOutputs.length > 0 || problematicShipments.some((issue) => (
      (issue.entry?.pallets && !Number.isInteger(issue.entry.pallets))
      || (issue.entry?.bigBags && !Number.isInteger(issue.entry.bigBags))
      || (issue.entry?.tanks && !Number.isInteger(issue.entry.tanks))
    ));

    const looseWarning = unmappedKgForUnits > 0
      || (!hasLegacyUnmappedData && Math.abs(looseKgEstimate) > 50)
      || unmappedDispatches.length > 0
      || problematicShipments.length > 0;

    let ageStatus: 'green' | 'yellow' | 'red' = 'green';
    if (currentStockKg > 50) {
      const recentBatches = batchKgs
        .filter((batch) => batch.timestamp > resetTs)
        .sort((a, b) => a.timestamp - b.timestamp);

      if (recentBatches.length > 0) {
        const postResetProducedKg = recentBatches.reduce((sum, batch) => sum + batch.kg, 0);
        let consumed = Math.max(0, postResetProducedKg - currentStockKg);

        for (const batch of recentBatches) {
          if (consumed >= batch.kg) {
            consumed -= batch.kg;
            continue;
          }

          const ageDays = (now - batch.timestamp) / (1000 * 60 * 60 * 24);
          if (ageDays > 60) ageStatus = 'red';
          else if (ageDays > 30) ageStatus = 'yellow';
          break;
        }
      }
    }

    return {
      ...product,
      id: productId,
      name: product.name || productId,
      details: product.details ?? undefined,
      sortOrder: product.sortOrder ?? undefined,
      defaultPalletWeight: defPad,
      defaultBagWeight: defBb,
      proteinTargetPct: product.proteinTargetPct ?? undefined,
      yieldFactor: product.yieldFactor ?? undefined,
      currentStockKg,
      realStockKg,
      currentStockPallets,
      currentStockBigBags,
      currentStockTanks,
      currentLots,
      looseKg,
      expectedKgFromUnits: expectedKgFromLots,
      looseKgEstimate,
      unmappedKgForUnits,
      fractionalOutputs,
      problematicShipments,
      unmappedDispatches,
      ageStatus,
      hasFractionalInput,
      looseWarning,
      hasLegacyUnmappedData,
    };
  });
}
