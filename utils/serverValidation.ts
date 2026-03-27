type ValidationResult<T> =
  | { ok: true; value: T; errors?: never }
  | { ok: false; errors: string[]; value?: never };

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isNullableFiniteNumber = (value: unknown) => value == null || isFiniteNumber(value);

function fail<T>(...errors: string[]): ValidationResult<T> {
  return { ok: false, errors };
}

function succeed<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

export function validateIntakePayload(body: any): ValidationResult<any> {
  const errors: string[] = [];

  if (!isNonEmptyString(body?.supplierId)) errors.push('supplierId is required.');
  if (!isNonEmptyString(body?.supplierName)) errors.push('supplierName is required.');
  if (!isNonEmptyString(body?.routeGroup)) errors.push('routeGroup is required.');
  if (!isNonEmptyString(body?.milkType)) errors.push('milkType is required.');
  if (!isFiniteNumber(body?.quantityKg) || body.quantityKg <= 0) errors.push('quantityKg must be greater than zero.');
  if (!isFiniteNumber(body?.fatPct) || body.fatPct < 0 || body.fatPct > 100) errors.push('fatPct must be between 0 and 100.');
  if (!isFiniteNumber(body?.proteinPct) || body.proteinPct < 0 || body.proteinPct > 100) errors.push('proteinPct must be between 0 and 100.');
  if (!isFiniteNumber(body?.ph) || body.ph < 0 || body.ph > 14) errors.push('ph must be between 0 and 14.');
  if (!isFiniteNumber(body?.tempCelsius) || body.tempCelsius < -10 || body.tempCelsius > 60) errors.push('tempCelsius must be between -10 and 60.');
  if (!isFiniteNumber(body?.timestamp)) errors.push('timestamp must be a valid epoch millisecond value.');

  if (body?.pricingMode != null && body.pricingMode !== 'invoice_total' && body.pricingMode !== 'unit_price') {
    errors.push('pricingMode must be invoice_total or unit_price.');
  }

  if (body?.unitPriceBasis != null && body.unitPriceBasis !== 'received_kg' && body.unitPriceBasis !== 'effective_kg') {
    errors.push('unitPriceBasis must be received_kg or effective_kg.');
  }

  if (body?.pricingMode === 'invoice_total') {
    if (!isFiniteNumber(body?.invoiceTotalEur) || body.invoiceTotalEur <= 0) errors.push('invoiceTotalEur must be greater than zero for invoice_total pricing.');
  }

  if (body?.pricingMode === 'unit_price') {
    if (!isFiniteNumber(body?.unitPricePerKg) || body.unitPricePerKg < 0) errors.push('unitPricePerKg must be zero or higher for unit_price pricing.');
    if (body?.unitPriceBasis !== 'received_kg' && body?.unitPriceBasis !== 'effective_kg') errors.push('unitPriceBasis is required for unit_price pricing.');
  }

  if (body?.applyLabCoefficient != null && typeof body.applyLabCoefficient !== 'boolean') {
    errors.push('applyLabCoefficient must be boolean when provided.');
  }

  if (!isNullableFiniteNumber(body?.manualLabCoefficient) || (isFiniteNumber(body?.manualLabCoefficient) && body.manualLabCoefficient <= 0)) {
    errors.push('manualLabCoefficient must be greater than zero when provided.');
  }

  return errors.length > 0 ? fail(...errors) : succeed(body);
}

export function validateOutputPayload(body: any): ValidationResult<any> {
  const errors: string[] = [];

  if (!isNonEmptyString(body?.productId)) errors.push('productId is required.');
  if (!isNonEmptyString(body?.batchId)) errors.push('batchId is required.');
  if (!isNonEmptyString(body?.packagingString)) errors.push('packagingString is required.');
  if (!isFiniteNumber(body?.timestamp)) errors.push('timestamp must be a valid epoch millisecond value.');

  return errors.length > 0 ? fail(...errors) : succeed(body);
}

export function validateDispatchPayload(body: any): ValidationResult<any> {
  const errors: string[] = [];

  if (!isNonEmptyString(body?.productId)) errors.push('productId is required.');
  if (!isNonEmptyString(body?.buyerName ?? body?.buyer)) errors.push('buyerName is required.');
  if (!isFiniteNumber(body?.orderedQuantityKg) || body.orderedQuantityKg <= 0) errors.push('orderedQuantityKg must be greater than zero.');
  if (!isFiniteNumber(body?.salesPricePerKg) || body.salesPricePerKg < 0) errors.push('salesPricePerKg must be zero or higher.');
  if (!isFiniteNumber(body?.date)) errors.push('date must be a valid epoch millisecond value.');

  return errors.length > 0 ? fail(...errors) : succeed(body);
}

export function validateShipmentPayload(body: any): ValidationResult<any> {
  const errors: string[] = [];

  if (!isFiniteNumber(body?.quantityKg) || body.quantityKg <= 0) errors.push('quantityKg must be greater than zero.');
  if (!isFiniteNumber(body?.date)) errors.push('date must be a valid epoch millisecond value.');

  return errors.length > 0 ? fail(...errors) : succeed(body);
}
