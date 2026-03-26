export interface IntakeRuleInput {
  tempCelsius: number;
  ph: number;
}

export function buildIntakeTags(input: IntakeRuleInput, existingTags: string[] = []): string[] {
  const next = new Set(existingTags.filter(Boolean));

  if (input.tempCelsius > 8) {
    next.add('#HighTemp');
  }

  if (input.ph > 6.74 || input.ph < 6.55) {
    next.add('#BadAcidity');
  }

  return [...next];
}

export function getIntakeWarnings(input: IntakeRuleInput): string[] {
  const warnings: string[] = [];

  if (input.tempCelsius > 8) {
    warnings.push('Temperature is above the accepted limit of 8°C.');
  }

  if (input.ph > 6.74 || input.ph < 6.55) {
    warnings.push('pH is outside the normal milk range.');
  }

  return warnings;
}
