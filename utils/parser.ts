import { ParsedOutput } from '../types';
import { parsePackagingSegments } from './packagingNormalize';

export function parsePackagingString(
  rawInput: string, 
  defaultPalletWeight: number, 
  defaultBBWeight: number
): ParsedOutput {
  if (!rawInput || rawInput.trim() === '') {
    return { pallets: 0, bigBags: 0, tanks: 0, totalWeight: 0, isValid: false };
  }

  let totalPallets = 0;
  let totalBigBags = 0;
  let totalTanks = 0;
  let totalWeight = 0;

  const segments = parsePackagingSegments(rawInput, defaultPalletWeight, defaultBBWeight);
  for (const segment of segments) {
    if (segment.unit === 'kg') {
      totalWeight += segment.count;
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
    totalWeight: parseFloat(totalWeight.toFixed(2)),
    // parser does not itself enforce whole-unit policy — callers may validate
    isValid: totalWeight > 0
  };
}

// Re-export normalization helpers
export { normalizePackagingString, parsePackagingSegments, isWhole } from './packagingNormalize';
