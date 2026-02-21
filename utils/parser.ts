import { ParsedOutput } from '../types';

export function parsePackagingString(
  rawInput: string, 
  defaultPalletWeight: number, 
  defaultBBWeight: number
): ParsedOutput {
  if (!rawInput || rawInput.trim() === '') {
    return { pallets: 0, bigBags: 0, tanks: 0, totalWeight: 0, isValid: false };
  }

  // 1. Normalize Input: Replace Lithuanian decimal comma with dot, lowercase
  const normalized = rawInput.toLowerCase().replace(/,/g, '.');
  
  let totalPallets = 0;
  let totalBigBags = 0;
  let totalTanks = 0;
  let totalWeight = 0;

  // 2. Define Regex for segments
  const segmentRegex = /(\d+(?:\.\d+)?)\s*(pad|pal|pl|bb|big\s*bag|tank|t)(?:\s*\*\s*(\d+))?/g;
  
  // Match simple loose weight: "500 kg" or "500 loose"
  const looseRegex = /(\d+(?:\.\d+)?)\s*(kg|loose)/g;

  // 3. Parse Standard Units (Pallets, BBs, Tanks)
  let match;
  while ((match = segmentRegex.exec(normalized)) !== null) {
    const quantity = parseFloat(match[1]);
    const type = match[2];
    const override = match[3] ? parseFloat(match[3]) : null;

    if (type.startsWith('bb') || type.includes('big')) {
      // Big Bags
      totalBigBags += quantity;
      totalWeight += quantity * (override || defaultBBWeight);
    } else if (type === 'tank' || type === 't') {
      // Tanks
      totalTanks += quantity;
      totalWeight += quantity * (override || 25000);
    } else {
      // Pallets
      totalPallets += quantity;
      totalWeight += quantity * (override || defaultPalletWeight);
    }
  }

  // 4. Parse Loose Weight
  while ((match = looseRegex.exec(normalized)) !== null) {
    totalWeight += parseFloat(match[1]);
  }

  return {
    pallets: parseFloat(totalPallets.toFixed(2)),
    bigBags: parseFloat(totalBigBags.toFixed(2)),
    tanks: parseFloat(totalTanks.toFixed(2)),
    totalWeight: parseFloat(totalWeight.toFixed(2)),
    isValid: totalWeight > 0
  };
}