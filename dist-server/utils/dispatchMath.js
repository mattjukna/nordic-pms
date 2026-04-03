export const isShippedStatus = (s) => {
    return s === "confirmed" || s === "completed";
};
export const getShippedKg = (d) => {
    try {
        if (Array.isArray(d.shipments) && d.shipments.length > 0) {
            return d.shipments.reduce((s, sh) => s + (Number.isFinite(Number(sh.quantityKg)) ? Number(sh.quantityKg) : 0), 0);
        }
        // legacy: if orderedQuantityKg is missing, treat quantityKg as shipped
        if (d.orderedQuantityKg === undefined || d.orderedQuantityKg === null)
            return Number.isFinite(Number(d.quantityKg)) ? Number(d.quantityKg) : 0;
        // otherwise return quantityKg as shipped-so-far (represents shipped amount)
        return Number.isFinite(Number(d.quantityKg)) ? Number(d.quantityKg) : 0;
    }
    catch (err) {
        return 0;
    }
};
export const getShippedRevenue = (d) => {
    try {
        const price = Number.isFinite(Number(d.salesPricePerKg)) ? Number(d.salesPricePerKg) : 0;
        if (Array.isArray(d.shipments) && d.shipments.length > 0) {
            return d.shipments.reduce((s, sh) => s + ((Number.isFinite(Number(sh.quantityKg)) ? Number(sh.quantityKg) : 0) * price), 0);
        }
        const kg = getShippedKg(d);
        return kg * price;
    }
    catch (err) {
        return 0;
    }
};
export const getShipmentsByDate = (d) => {
    if (!Array.isArray(d.shipments) || d.shipments.length === 0)
        return [];
    return d.shipments.map((s) => ({ date: s.date, quantityKg: Number.isFinite(Number(s.quantityKg)) ? Number(s.quantityKg) : 0 }));
};
