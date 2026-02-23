import type { DispatchEntry } from "../types";

export const isShippedStatus = (s: string | undefined | null) => {
  return s === "confirmed" || s === "completed";
};

export const getShippedKg = (d: DispatchEntry): number => {
  try {
    if (Array.isArray((d as any).shipments) && (d as any).shipments.length > 0) {
      return (d as any).shipments.reduce((s: number, sh: any) => s + (Number.isFinite(Number(sh.quantityKg)) ? Number(sh.quantityKg) : 0), 0);
    }
    // legacy: if orderedQuantityKg is missing, treat quantityKg as shipped
    if ((d as any).orderedQuantityKg === undefined || (d as any).orderedQuantityKg === null) return Number.isFinite(Number(d.quantityKg)) ? Number(d.quantityKg) : 0;
    // otherwise return quantityKg as shipped-so-far (represents shipped amount)
    return Number.isFinite(Number(d.quantityKg)) ? Number(d.quantityKg) : 0;
  } catch (err) {
    return 0;
  }
};

export const getShippedRevenue = (d: DispatchEntry): number => {
  try {
    const price = Number.isFinite(Number(d.salesPricePerKg)) ? Number(d.salesPricePerKg) : 0;
    if (Array.isArray((d as any).shipments) && (d as any).shipments.length > 0) {
      return (d as any).shipments.reduce((s: number, sh: any) => s + ((Number.isFinite(Number(sh.quantityKg)) ? Number(sh.quantityKg) : 0) * price), 0);
    }
    const kg = getShippedKg(d);
    return kg * price;
  } catch (err) {
    return 0;
  }
};

export const getShipmentsByDate = (d: DispatchEntry) => {
  if (!Array.isArray((d as any).shipments) || (d as any).shipments.length === 0) return [];
  return (d as any).shipments.map((s: any) => ({ date: s.date, quantityKg: Number.isFinite(Number(s.quantityKg)) ? Number(s.quantityKg) : 0 }));
};
