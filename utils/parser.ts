import { ParsedOutput } from '../types';
import { parsePackagingSegments } from './packagingNormalize';

const emptyParsed = (isValid = false): ParsedOutput => ({
  pallets: 0,
  bigBags: 0,
  tanks: 0,
  looseKg: 0,
  loosePalletKg: 0,
  looseBigBagKg: 0,
  looseLegacyKg: 0,
  totalWeight: 0,
  isValid,
});

export function parsePackagingString(
  rawInput: string,
  defaultPalletWeight: number,
  defaultBBWeight: number
): ParsedOutput {
  if (!rawInput || rawInput.trim() === '') {
    return emptyParsed(false);
  }

  let totalPallets = 0;
  let totalBigBags = 0;
  let totalTanks = 0;
  let loosePalletKg = 0;
  let looseBigBagKg = 0;
  let looseLegacyKg = 0;
  let totalWeight = 0;

  const segments = parsePackagingSegments(rawInput, defaultPalletWeight, defaultBBWeight);
  for (const segment of segments) {
    if (segment.unit === 'kg') {
      totalWeight += segment.count;
      if (segment.looseTarget === 'pad') loosePalletKg += segment.count;
      else if (segment.looseTarget === 'bb') looseBigBagKg += segment.count;
      else looseLegacyKg += segment.count;
      continue;
    }

    const weight = segment.unitWeight ?? (segment.unit === 'pad' ? defaultPalletWeight : segment.unit === 'bb' ? defaultBBWeight : 25000);
    if (segment.unit === 'pad') totalPallets += segment.count;
    if (segment.unit === 'bb') totalBigBags += segment.count;
    if (segment.unit === 'tank') totalTanks += segment.count;
    totalWeight += segment.count * weight;
  }

  return {
    pallets: parseFloat(totalPallets.toFixed(2)),
    bigBags: parseFloat(totalBigBags.toFixed(2)),
    tanks: parseFloat(totalTanks.toFixed(2)),
    looseKg: parseFloat((loosePalletKg + looseBigBagKg + looseLegacyKg).toFixed(2)),
    loosePalletKg: parseFloat(loosePalletKg.toFixed(2)),
    looseBigBagKg: parseFloat(looseBigBagKg.toFixed(2)),
    looseLegacyKg: parseFloat(looseLegacyKg.toFixed(2)),
    totalWeight: parseFloat(totalWeight.toFixed(2)),
    isValid: totalWeight > 0,
  };
}

export { normalizePackagingString, parsePackagingSegments, isWhole } from './packagingNormalize';
