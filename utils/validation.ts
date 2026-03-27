import type { ParsedOutput, Supplier, Buyer, IntakePricingMode, IntakeUnitPriceBasis } from '../types';

export type ValidationErrors = Record<string, string>;

const PHONE_REGEX = /^[+()\d\s-]{5,25}$/;
const COMPANY_CODE_REGEX = /^[A-Za-z0-9][A-Za-z0-9\s,;./_-]*$/;

const isBlank = (value: string | null | undefined) => !(value ?? '').trim();

function parseNumericInput(raw: string): number | null {
  if (isBlank(raw)) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function addError(errors: ValidationErrors, key: string, message: string) {
  if (!errors[key]) {
    errors[key] = message;
  }
}

export function isPhoneNumberValid(value: string) {
  return isBlank(value) || PHONE_REGEX.test(value.trim());
}

export function isCompanyCodeValid(value: string) {
  return !isBlank(value) && COMPANY_CODE_REGEX.test(value.trim());
}

export function validateIntakeForm(input: {
  supplierId: string;
  milkType: string;
  intakeDate: string;
  intakeKg: string;
  fat: string;
  protein: string;
  ph: string;
  temp: string;
  pricingMode: IntakePricingMode;
  invoiceTotalEur: string;
  unitPricePerKg: string;
  unitPriceBasis: IntakeUnitPriceBasis | '';
}): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!input.supplierId) addError(errors, 'supplierId', 'Select a supplier.');
  if (!input.milkType) addError(errors, 'milkType', 'Select a milk type.');
  if (!input.intakeDate) addError(errors, 'intakeDate', 'Select an intake date.');

  const quantity = parseNumericInput(input.intakeKg);
  if (quantity === null) addError(errors, 'intakeKg', 'Enter the received quantity.');
  else if (quantity <= 0) addError(errors, 'intakeKg', 'Quantity must be greater than zero.');

  const fat = parseNumericInput(input.fat);
  if (fat === null) addError(errors, 'fat', 'Enter the fat percentage.');
  else if (fat < 0 || fat > 100) addError(errors, 'fat', 'Fat percentage must be between 0 and 100.');

  const protein = parseNumericInput(input.protein);
  if (protein === null) addError(errors, 'protein', 'Enter the protein percentage.');
  else if (protein < 0 || protein > 100) addError(errors, 'protein', 'Protein percentage must be between 0 and 100.');

  const ph = parseNumericInput(input.ph);
  if (ph === null) addError(errors, 'ph', 'Enter the measured pH.');
  else if (ph < 0 || ph > 14) addError(errors, 'ph', 'pH must be between 0 and 14.');

  const temp = parseNumericInput(input.temp);
  if (temp === null) addError(errors, 'temp', 'Enter the delivery temperature.');
  else if (temp < -10 || temp > 60) addError(errors, 'temp', 'Temperature must be between -10°C and 60°C.');

  if (input.pricingMode === 'invoice_total') {
    const invoiceTotal = parseNumericInput(input.invoiceTotalEur);
    if (invoiceTotal === null) addError(errors, 'invoiceTotalEur', 'Enter the invoice total.');
    else if (invoiceTotal <= 0) addError(errors, 'invoiceTotalEur', 'Invoice total must be greater than zero.');
  } else {
    const unitPrice = parseNumericInput(input.unitPricePerKg);
    if (unitPrice === null) addError(errors, 'unitPricePerKg', 'Enter the unit price.');
    else if (unitPrice < 0) addError(errors, 'unitPricePerKg', 'Unit price cannot be negative.');

    if (!input.unitPriceBasis) addError(errors, 'unitPriceBasis', 'Select the pricing basis.');
  }

  return errors;
}

export function validateOutputForm(input: {
  productId: string;
  batchId: string;
  packagingString: string;
  parserPreview: ParsedOutput | null;
}): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!input.productId) addError(errors, 'productId', 'Select a product.');
  if (isBlank(input.batchId)) addError(errors, 'batchId', 'Enter a batch reference.');
  if (isBlank(input.packagingString)) addError(errors, 'packagingString', 'Enter packaging details.');
  if (!input.parserPreview || !input.parserPreview.isValid || input.parserPreview.totalWeight <= 0) {
    addError(errors, 'packagingString', 'Packaging must resolve to a positive quantity.');
  }

  return errors;
}

export function validateDispatchForm(input: {
  buyerId: string;
  productId: string;
  dispatchDate: string;
  quantity: string;
  pricePerKg: string;
  parserPreview: ParsedOutput | null;
}): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!input.buyerId) addError(errors, 'buyerId', 'Select a buyer.');
  if (!input.productId) addError(errors, 'productId', 'Select a product.');
  if (!input.dispatchDate) addError(errors, 'dispatchDate', 'Select a dispatch date.');

  const quantity = parseNumericInput(input.quantity);
  if (quantity === null) addError(errors, 'quantity', 'Enter the ordered quantity.');
  else if (quantity <= 0) addError(errors, 'quantity', 'Quantity must be greater than zero.');

  const price = parseNumericInput(input.pricePerKg);
  if (price === null) addError(errors, 'pricePerKg', 'Enter the sales price.');
  else if (price < 0) addError(errors, 'pricePerKg', 'Price cannot be negative.');

  if (!input.parserPreview || !input.parserPreview.isValid || input.parserPreview.totalWeight <= 0) {
    addError(errors, 'packagingString', 'Packaging must resolve to a positive quantity.');
  }

  return errors;
}

export function validateShipmentForm(input: {
  shipmentDate: string;
  shipmentQty: string;
  shipmentPkgString: string;
  parserPreview: ParsedOutput | null;
}): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!input.shipmentDate) addError(errors, 'shipmentDate', 'Select a shipment date.');

  const quantity = parseNumericInput(input.shipmentQty);
  if (quantity === null) addError(errors, 'shipmentQty', 'Enter the shipped quantity.');
  else if (quantity <= 0) addError(errors, 'shipmentQty', 'Shipment quantity must be greater than zero.');

  if (!isBlank(input.shipmentPkgString) && (!input.parserPreview || !input.parserPreview.isValid)) {
    addError(errors, 'shipmentPkgString', 'Shipment packaging could not be parsed.');
  }

  return errors;
}

export function validateSupplierForm(input: {
  name: string;
  routeGroup: string;
  companyCode: string;
  phoneNumber: string;
  country: string;
  addressLine1: string;
  createdOn: string;
  contractQuota: string;
}): ValidationErrors {
  const errors: ValidationErrors = {};

  if (isBlank(input.name)) addError(errors, 'name', 'Enter the supplier name.');
  if (isBlank(input.routeGroup)) addError(errors, 'routeGroup', 'Enter the route group.');
  if (!isCompanyCodeValid(input.companyCode)) addError(errors, 'companyCode', 'Enter a valid company code.');
  if (!isPhoneNumberValid(input.phoneNumber)) addError(errors, 'phoneNumber', 'Enter a valid phone number.');
  if (isBlank(input.country)) addError(errors, 'country', 'Enter the country.');
  if (isBlank(input.addressLine1)) addError(errors, 'addressLine1', 'Enter the main address line.');
  if (isBlank(input.createdOn)) addError(errors, 'createdOn', 'Select the creation date.');

  const numericChecks: Array<[keyof ValidationErrors, string, string, boolean]> = [
    ['contractQuota', input.contractQuota, 'Quota cannot be negative.', true],
  ];

  for (const [key, raw, negativeMessage] of numericChecks) {
    if (isBlank(raw)) {
      continue;
    }
    const parsed = parseNumericInput(raw);
    if (parsed === null) addError(errors, key, 'Enter a valid number.');
    else if (parsed < 0) addError(errors, key, negativeMessage);
  }

  return errors;
}

export function validateBuyerForm(input: {
  name: string;
  companyCode: string;
  phoneNumber: string;
  country: string;
  addressLine1: string;
  createdOn: string;
}): ValidationErrors {
  const errors: ValidationErrors = {};

  if (isBlank(input.name)) addError(errors, 'name', 'Enter the buyer name.');
  if (!isCompanyCodeValid(input.companyCode)) addError(errors, 'companyCode', 'Enter a valid company code.');
  if (!isPhoneNumberValid(input.phoneNumber)) addError(errors, 'phoneNumber', 'Enter a valid phone number.');
  if (isBlank(input.country)) addError(errors, 'country', 'Enter the country.');
  if (isBlank(input.addressLine1)) addError(errors, 'addressLine1', 'Enter the main address line.');
  if (isBlank(input.createdOn)) addError(errors, 'createdOn', 'Select the creation date.');

  return errors;
}

export function validateProductForm(input: {
  id: string;
  name: string;
  defaultPalletWeight: string;
  defaultBagWeight: string;
  proteinTargetPct: string;
  yieldFactor: string;
}): ValidationErrors {
  const errors: ValidationErrors = {};

  if (isBlank(input.id)) addError(errors, 'id', 'Enter the product ID.');
  if (isBlank(input.name)) addError(errors, 'name', 'Enter the product name.');

  if (!isBlank(input.defaultPalletWeight)) {
    const palletWeight = parseNumericInput(input.defaultPalletWeight);
    if (palletWeight === null || palletWeight <= 0) addError(errors, 'defaultPalletWeight', 'Pallet weight must be greater than zero.');
  }

  if (!isBlank(input.defaultBagWeight)) {
    const bagWeight = parseNumericInput(input.defaultBagWeight);
    if (bagWeight === null || bagWeight <= 0) addError(errors, 'defaultBagWeight', 'Bag weight must be greater than zero.');
  }

  if (!isBlank(input.proteinTargetPct)) {
    const proteinTarget = parseNumericInput(input.proteinTargetPct);
    if (proteinTarget === null || proteinTarget < 0 || proteinTarget > 100) addError(errors, 'proteinTargetPct', 'Protein target must be between 0 and 100.');
  }

  if (!isBlank(input.yieldFactor)) {
    const yieldFactor = parseNumericInput(input.yieldFactor);
    if (yieldFactor === null || yieldFactor <= 0 || yieldFactor > 1) addError(errors, 'yieldFactor', 'Yield factor must be greater than 0 and no more than 1.');
  }

  return errors;
}

export function validateContractForm(input: {
  contractNumber: string;
  productId: string;
  pricePerKg: string;
  agreedAmountKg: string;
  startDate: string;
  endDate: string;
}): ValidationErrors {
  const errors: ValidationErrors = {};

  if (isBlank(input.contractNumber)) addError(errors, 'contractNumber', 'Enter the contract number.');
  if (isBlank(input.productId)) addError(errors, 'productId', 'Select a product.');

  const price = parseNumericInput(input.pricePerKg);
  if (price === null || price < 0) addError(errors, 'pricePerKg', 'Price must be zero or higher.');

  if (!isBlank(input.agreedAmountKg)) {
    const amount = parseNumericInput(input.agreedAmountKg);
    if (amount === null || amount < 0) addError(errors, 'agreedAmountKg', 'Agreed amount must be zero or higher.');
  }

  if (isBlank(input.startDate)) addError(errors, 'startDate', 'Select a start date.');
  if (isBlank(input.endDate)) addError(errors, 'endDate', 'Select an end date.');
  if (!errors.startDate && !errors.endDate && input.startDate > input.endDate) {
    addError(errors, 'endDate', 'End date must be on or after the start date.');
  }

  return errors;
}

export function validateMilkTypeName(name: string): string | null {
  if (isBlank(name)) {
    return 'Enter a milk type name.';
  }
  return null;
}

function compareCodes(raw: string) {
  return raw
    .split(/[;,]/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');
}

export function findSupplierDuplicateWarning(
  form: { name: string; companyCode: string },
  suppliers: Supplier[],
  editingId?: string | null,
): string | null {
  const name = form.name.trim().toLowerCase();
  const code = compareCodes(form.companyCode);
  const duplicate = suppliers.find((supplier) => {
    if (editingId && supplier.id === editingId) return false;
    return supplier.name.trim().toLowerCase() === name || compareCodes(supplier.companyCode || '') === code;
  });

  return duplicate ? `Potential duplicate supplier found: ${duplicate.name} (${duplicate.companyCode}).` : null;
}

export function findBuyerDuplicateWarning(
  form: { name: string; companyCode: string },
  buyers: Buyer[],
  editingId?: string | null,
): string | null {
  const name = form.name.trim().toLowerCase();
  const code = compareCodes(form.companyCode);
  const duplicate = buyers.find((buyer) => {
    if (editingId && buyer.id === editingId) return false;
    return buyer.name.trim().toLowerCase() === name || compareCodes(buyer.companyCode || '') === code;
  });

  return duplicate ? `Potential duplicate buyer found: ${duplicate.name} (${duplicate.companyCode}).` : null;
}
