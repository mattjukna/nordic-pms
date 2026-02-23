import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import prisma from './services/prisma';
import { createServer as createViteServer } from 'vite';
import { parsePackagingString } from './utils/parser';

// --- Mapping helpers: convert Prisma rows into frontend DTO shapes defined in types.ts
const mapDate = (d: Date | string | null | undefined): number => {
    if (!d) return 0;
    try { return new Date(d as any).getTime(); } catch { return 0; }
};

const toParsed = (row: any) => ({
    pallets: typeof row?.pallets === 'number' ? row.pallets : 0,
    bigBags: typeof row?.bigBags === 'number' ? row.bigBags : 0,
    tanks: typeof row?.tanks === 'number' ? row.tanks : 0,
    totalWeight: typeof row?.totalWeight === 'number' ? row.totalWeight : 0,
});

const toClientDestination = (d: string | null | undefined) => {
    if (!d) return 'Warehouse';
    if (d === 'PienoZvaigzde') return 'Pieno Žvaigždė';
    return d;
};

const fromClientDestination = (d: string | null | undefined) => {
    if (!d) return 'Warehouse';
    if (d === 'Pieno Žvaigždė') return 'PienoZvaigzde';
    return d;
};

const toClientOutput = (o: any) => ({
    id: o.id,
    productId: o.productId,
    batchId: o.batchId,
    packagingString: o.packagingString,
    parsed: toParsed(o),
    destination: toClientDestination(o.destination),
    timestamp: mapDate(o.timestamp),
});

const toClientIntake = (i: any) => ({
    id: i.id,
    supplierId: i.supplierId,
    supplierName: i.supplierName,
    routeGroup: i.routeGroup,
    milkType: i.milkType,
    quantityKg: i.quantityKg,
    ph: i.ph,
    fatPct: i.fatPct,
    proteinPct: i.proteinPct,
    tempCelsius: i.tempCelsius,
    isEcological: Boolean(i.isEcological),
    note: i.note ?? '',
    timestamp: mapDate(i.timestamp),
    calculatedCost: typeof i.calculatedCost === 'number' ? i.calculatedCost : 0,
    isTempAlertDismissed: Boolean(i.isTempAlertDismissed),
    isDiscarded: Boolean(i.isDiscarded),
    tags: Array.isArray(i.tags) ? i.tags.map((t: any) => t.tag) : [],
});

const toClientShipment = (s: any) => {
    const base: any = {
        id: s.id,
        date: mapDate(s.date),
        quantityKg: s.quantityKg,
    };
    if (s.batchId) base.batchId = s.batchId;
    if (s.note) base.note = s.note;
    if (s.packagingString) {
        base.packagingString = s.packagingString;
        base.parsed = toParsed(s);
    }
    return base;
};

const toClientDispatch = (d: any) => ({
    id: d.id,
    date: mapDate(d.date),
    buyer: d.buyerName || '',
    contractNumber: d.contractNumber ?? undefined,
    productId: d.productId,
    quantityKg: d.quantityKg,
    orderedQuantityKg: d.orderedQuantityKg ?? undefined,
    batchRefId: d.batchRefId ?? 'MIXED',
    packagingString: d.packagingString ?? undefined,
    parsed: d.packagingString ? toParsed(d) : undefined,
    salesPricePerKg: d.salesPricePerKg ?? 0,
    totalRevenue: d.totalRevenue ?? 0,
    status: d.status,
    shipments: Array.isArray(d.shipments) ? d.shipments.map((s: any) => toClientShipment(s)) : [],
});

const toClientSupplier = (s: any) => ({
    ...s,
    contractQuota: typeof s.contractQuota === 'number' ? s.contractQuota : 0,
    createdOn: mapDate(s.createdOn),
    basePricePerKg: typeof s.basePricePerKg === 'number' ? s.basePricePerKg : 0,
    normalMilkPricePerKg: typeof s.normalMilkPricePerKg === 'number' ? s.normalMilkPricePerKg : null,
    fatBonusPerPct: typeof s.fatBonusPerPct === 'number' ? s.fatBonusPerPct : 0,
    proteinBonusPerPct: typeof s.proteinBonusPerPct === 'number' ? s.proteinBonusPerPct : 0,
});

async function startServer() {
    const app = express();
    const PORT = 3000;
    let prismaAvailable = true;
    app.use(cors());
    app.use(express.json());

    // API Routes
    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: Date.now() });
    });

    // Bootstrap: load all domain data needed by frontend
    app.get('/api/bootstrap', async (req, res) => {
        try {
            const [suppliers, buyers, products, milkTypes, intakeEntries, outputEntries, dispatchEntries] = await Promise.all([
                prisma.supplier.findMany(),
                prisma.buyer.findMany({ include: { contracts: true } }),
                prisma.product.findMany(),
                prisma.milkType.findMany(),
                prisma.intakeEntry.findMany({ include: { tags: true }, orderBy: { timestamp: 'desc' } }),
                prisma.outputEntry.findMany({ orderBy: { timestamp: 'desc' } }),
                prisma.dispatchEntry.findMany({ include: { shipments: true }, orderBy: { date: 'desc' } })
            ]);

            const mapSuppliers = suppliers.map(s => toClientSupplier(s));
            const mapBuyers = buyers.map(b => ({
                ...b,
                createdOn: mapDate(b.createdOn),
                contracts: Array.isArray(b.contracts) ? b.contracts.map((c: any) => ({ ...c, startDate: mapDate(c.startDate), endDate: mapDate(c.endDate) })) : []
            }));
            const mapProducts = products;
            const mapMilkTypes = milkTypes.map(m => m.name);
            const mapIntakes = intakeEntries.map(i => toClientIntake(i));
            const mapOutputs = outputEntries.map(o => toClientOutput(o));
            const mapDispatches = dispatchEntries.map(d => toClientDispatch(d));

            res.json({ suppliers: mapSuppliers, buyers: mapBuyers, products: mapProducts, milkTypes: mapMilkTypes, intakeEntries: mapIntakes, outputEntries: mapOutputs, dispatchEntries: mapDispatches });
               } catch (err: any) {
            console.error('DB bootstrap error:', err?.message ?? err);
            res.status(500).json({ error: err?.message ?? 'Database error', hint: 'Check DATABASE_URL / firewall / db paused' });
        }
    });

    // Suppliers
    app.post('/api/suppliers', async (req, res) => {
        const body = req.body;
        if (!body.name || !body.routeGroup) return res.status(400).json({ error: 'Missing name or routeGroup' });
        try {
            const created = await prisma.supplier.create({ data: {
                name: body.name,
                routeGroup: body.routeGroup,
                contractQuota: body.contractQuota ?? null,
                companyCode: body.companyCode ?? null,
                phoneNumber: body.phoneNumber ?? null,
                country: body.country ?? null,
                addressLine1: body.addressLine1 ?? null,
                addressLine2: body.addressLine2 ?? null,
                createdOn: body.createdOn ? new Date(body.createdOn) : null,
                basePricePerKg: body.basePricePerKg ?? null,
                normalMilkPricePerKg: body.normalMilkPricePerKg ?? null,
                fatBonusPerPct: body.fatBonusPerPct ?? null,
                proteinBonusPerPct: body.proteinBonusPerPct ?? null,
                isEco: body.isEco ?? false,
                defaultMilkType: body.defaultMilkType ?? null
            }});
            res.json(toClientSupplier(created));
        } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    app.put('/api/suppliers/:id', async (req, res) => {
        const id = req.params.id;
        try {
            const data = { ...req.body };
            // ensure proper types
            if (data.createdOn) data.createdOn = new Date(data.createdOn);
            const updated = await prisma.supplier.update({ where: { id }, data });
            res.json(toClientSupplier(updated));
        } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    app.delete('/api/suppliers/:id', async (req, res) => {
        const id = req.params.id;
        try {
            await prisma.supplier.delete({ where: { id } });
            res.json({ ok: true });
        } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Buyers + Contracts
    app.post('/api/buyers', async (req, res) => {
        const b = req.body;
        if (!b.name) return res.status(400).json({ error: 'Missing buyer name' });
        try {
            const created = await prisma.buyer.create({ data: {
                name: b.name,
                companyCode: b.companyCode ?? null,
                phoneNumber: b.phoneNumber ?? null,
                country: b.country ?? null,
                addressLine1: b.addressLine1 ?? null,
                addressLine2: b.addressLine2 ?? null,
                createdOn: b.createdOn ? new Date(b.createdOn) : null
            }});
            const fetched = await prisma.buyer.findUnique({ where: { id: created.id }, include: { contracts: true } });
            res.json({ ...fetched, createdOn: mapDate(fetched?.createdOn) });
        } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    app.put('/api/buyers/:id', async (req, res) => {
        try {
            await prisma.buyer.update({ where: { id: req.params.id }, data: req.body });
            const fetched = await prisma.buyer.findUnique({ where: { id: req.params.id }, include: { contracts: true } });
            res.json({ ...fetched, createdOn: mapDate(fetched?.createdOn), contracts: fetched?.contracts?.map((c: any) => ({ ...c, startDate: mapDate(c.startDate), endDate: mapDate(c.endDate) })) });
        } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    app.delete('/api/buyers/:id', async (req, res) => {
        try {
            await prisma.buyer.delete({ where: { id: req.params.id } });
            res.json({ ok: true });
        } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Buyer contracts
    app.post('/api/buyers/:id/contracts', async (req, res) => {
        const buyerId = req.params.id;
        const c = req.body;
        if (!c.contractNumber || !c.productId || c.pricePerKg == null || !c.startDate || !c.endDate) return res.status(400).json({ error: 'Invalid contract body' });
        try {
            const created = await prisma.buyerContract.create({ data: {
                contractNumber: c.contractNumber,
                pricePerKg: c.pricePerKg,
                agreedAmountKg: c.agreedAmountKg ?? null,
                startDate: new Date(c.startDate),
                endDate: new Date(c.endDate),
                buyerId,
                productId: c.productId
            }});
            res.json({ ...created, startDate: mapDate(created.startDate), endDate: mapDate(created.endDate) });
        } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    app.put('/api/contracts/:id', async (req, res) => {
        try {
            const data = { ...req.body };
            if (data.startDate) data.startDate = new Date(data.startDate);
            if (data.endDate) data.endDate = new Date(data.endDate);
            const updated = await prisma.buyerContract.update({ where: { id: req.params.id }, data });
            res.json(updated);
        } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    app.delete('/api/contracts/:id', async (req, res) => {
        try {
            await prisma.buyerContract.delete({ where: { id: req.params.id } });
            res.json({ ok: true });
        } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Products
    app.post('/api/products', async (req, res) => {
        const p = req.body;
        if (!p.id || !p.name) return res.status(400).json({ error: 'Missing product id or name' });
        try {
            const created = await prisma.product.create({ data: p });
            res.json(created);
        } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    app.put('/api/products/:id', async (req, res) => {
        try {
            const updated = await prisma.product.update({ where: { id: req.params.id }, data: req.body });
            res.json(updated);
        } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    app.delete('/api/products/:id', async (req, res) => {
        try {
            await prisma.product.delete({ where: { id: req.params.id } });
            res.json({ ok: true });
        } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Milk types
    app.post('/api/milk-types', async (req, res) => {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Missing milk type name' });
        try {
            const created = await prisma.milkType.upsert({ where: { name }, update: {}, create: { name } });
            res.json(created);
        } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    app.delete('/api/milk-types/:name', async (req, res) => {
        try {
            await prisma.milkType.delete({ where: { name: req.params.name } });
            res.json({ ok: true });
        } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Supplier pricing periods
    app.get('/api/supplier-pricing', async (req, res) => {
        try {
            const month = req.query.month as string | undefined; // YYYY-MM
            const now = new Date();
            let periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
            if (month) {
                const [y, m] = month.split('-').map(Number);
                if (!isNaN(y) && !isNaN(m)) periodStart = new Date(y, m - 1, 1);
            }
            const periods = await prisma.supplierPricingPeriod.findMany({ where: { periodStart } , include: { supplier: true } });
            res.json(periods.map(p => ({ id: p.id, supplierId: p.supplierId, supplierName: p.supplier?.name ?? '', periodStart: mapDate(p.periodStart), basePricePerKg: p.basePricePerKg ?? null, normalMilkPricePerKg: p.normalMilkPricePerKg ?? null, fatBonusPerPct: p.fatBonusPerPct ?? null, proteinBonusPerPct: p.proteinBonusPerPct ?? null })));
        } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    app.put('/api/supplier-pricing', async (req, res) => {
        const body = req.body;
        if (!body.supplierId || !body.periodStart) return res.status(400).json({ error: 'Missing supplierId or periodStart' });
        try {
            const periodStart = typeof body.periodStart === 'string' && body.periodStart.match(/^\d{4}-\d{2}$/) ? ((): Date => { const [y,m]=body.periodStart.split('-').map(Number); return new Date(y,m-1,1); })() : new Date(body.periodStart);
            const existing = await prisma.supplierPricingPeriod.findFirst({ where: { supplierId: body.supplierId, periodStart } });
            if (existing) {
                const updated = await prisma.supplierPricingPeriod.update({ where: { id: existing.id }, data: {
                    basePricePerKg: body.basePricePerKg ?? null,
                    normalMilkPricePerKg: body.normalMilkPricePerKg ?? null,
                    fatBonusPerPct: body.fatBonusPerPct ?? null,
                    proteinBonusPerPct: body.proteinBonusPerPct ?? null
                }});
                res.json(updated);
            } else {
                const created = await prisma.supplierPricingPeriod.create({ data: {
                    supplierId: body.supplierId,
                    periodStart,
                    basePricePerKg: body.basePricePerKg ?? null,
                    normalMilkPricePerKg: body.normalMilkPricePerKg ?? null,
                    fatBonusPerPct: body.fatBonusPerPct ?? null,
                    proteinBonusPerPct: body.proteinBonusPerPct ?? null
                }});
                res.json(created);
            }
        } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    // Monthly milk spend (exclude discarded)
    app.get('/api/milk-spend', async (req, res) => {
        try {
            const month = req.query.month as string | undefined; // YYYY-MM
            const now = new Date();
            let start = new Date(now.getFullYear(), now.getMonth(), 1);
            if (month) {
                const [y, m] = month.split('-').map(Number);
                if (!isNaN(y) && !isNaN(m)) start = new Date(y, m - 1, 1);
            }
            const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);

            const entries = await prisma.intakeEntry.findMany({ where: { timestamp: { gte: start, lt: end }, isDiscarded: false } });
            const totalCost = entries.reduce((s, e) => s + (e.calculatedCost ?? 0), 0);
            const totalKg = entries.reduce((s, e) => s + (e.quantityKg ?? 0), 0);
            const bySupplierMap: Record<string, { supplierId: string, supplierName: string, cost: number, kg: number }> = {};
            for (const e of entries) {
                const key = e.supplierId;
                if (!bySupplierMap[key]) bySupplierMap[key] = { supplierId: e.supplierId, supplierName: e.supplierName, cost: 0, kg: 0 };
                bySupplierMap[key].cost += (e.calculatedCost ?? 0);
                bySupplierMap[key].kg += (e.quantityKg ?? 0);
            }
            const bySupplier = Object.values(bySupplierMap).sort((a, b) => b.cost - a.cost);
            res.json({ periodStart: mapDate(start), periodEnd: mapDate(end), totalCost, totalKg, bySupplier });
        } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    // Range milk spend (from, to) - inclusive start, exclusive end
    app.get('/api/milk-spend-range', async (req, res) => {
        try {
            const from = req.query.from as string | undefined;
            const to = req.query.to as string | undefined;
            if (!from || !to) return res.status(400).json({ error: 'Missing from or to query parameters (ISO strings expected)' });
            const start = new Date(from);
            const end = new Date(to);
            if (isNaN(start.getTime()) || isNaN(end.getTime())) return res.status(400).json({ error: 'Invalid date format for from/to' });

            const entries = await prisma.intakeEntry.findMany({ where: { timestamp: { gte: start, lt: end }, isDiscarded: false } });
            const totalCost = entries.reduce((s, e) => s + (e.calculatedCost ?? 0), 0);
            const totalKg = entries.reduce((s, e) => s + (e.quantityKg ?? 0), 0);
            const avgPricePerKg = totalKg > 0 ? totalCost / totalKg : 0;

            const bySupplierMap: Record<string, { supplierId: string, supplierName: string, totalCost: number, totalKg: number }> = {};
            for (const e of entries) {
                const key = e.supplierId;
                if (!bySupplierMap[key]) bySupplierMap[key] = { supplierId: e.supplierId, supplierName: e.supplierName, totalCost: 0, totalKg: 0 };
                bySupplierMap[key].totalCost += (e.calculatedCost ?? 0);
                bySupplierMap[key].totalKg += (e.quantityKg ?? 0);
            }
            const bySupplier = Object.values(bySupplierMap).map(s => ({ ...s, avgPricePerKg: s.totalKg > 0 ? s.totalCost / s.totalKg : 0 })).sort((a, b) => b.totalCost - a.totalCost);

            res.json({ from: mapDate(start), to: mapDate(end), totalCost, totalKg, avgPricePerKg, bySupplier });
        } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    // Intake entries (handle tags)
    app.post('/api/intake-entries', async (req, res) => {
        const body = req.body;
        if (!body.supplierId || !body.timestamp) return res.status(400).json({ error: 'Missing supplierId or timestamp' });
        try {
                // Calculate cost based on supplier pricing period or supplier defaults
                const ts = new Date(body.timestamp);
                const year = ts.getFullYear();
                const month = ts.getMonth();
                const periodStart = new Date(year, month, 1);

                const supplier = await prisma.supplier.findUnique({ where: { id: body.supplierId } });
                const pricing = await prisma.supplierPricingPeriod.findFirst({ where: { supplierId: body.supplierId, periodStart } });

                const basePrice = pricing?.normalMilkPricePerKg ?? pricing?.basePricePerKg ?? supplier?.normalMilkPricePerKg ?? supplier?.basePricePerKg ?? 0;
                const fatBonus = pricing?.fatBonusPerPct ?? supplier?.fatBonusPerPct ?? 0;
                const proteinBonus = pricing?.proteinBonusPerPct ?? supplier?.proteinBonusPerPct ?? 0;

                const unitAdjust = ((body.fatPct - 4.0) * 10 * fatBonus) + ((body.proteinPct - 3.2) * 10 * proteinBonus);
                const unitPrice = basePrice + unitAdjust;
                const calculatedCost = (body.quantityKg || 0) * unitPrice;

                const created = await prisma.intakeEntry.create({ data: {
                    supplierId: body.supplierId,
                    supplierName: body.supplierName,
                    routeGroup: body.routeGroup,
                    milkType: body.milkType,
                    quantityKg: body.quantityKg,
                    ph: body.ph,
                    fatPct: body.fatPct,
                    proteinPct: body.proteinPct,
                    tempCelsius: body.tempCelsius,
                    isEcological: body.isEcological ?? false,
                    note: body.note ?? null,
                    timestamp: ts,
                    calculatedCost,
                    isTempAlertDismissed: body.isTempAlertDismissed ?? false,
                    isDiscarded: body.isDiscarded ?? false
                }});

            // Tags
            if (Array.isArray(body.tags)) {
                for (const t of body.tags) {
                    await prisma.intakeTag.create({ data: { intakeEntryId: created.id, tag: t } });
                }
            }

            const fetched = await prisma.intakeEntry.findUnique({ where: { id: created.id }, include: { tags: true } });
            res.json(toClientIntake(fetched));
        } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    app.put('/api/intake-entries/:id', async (req, res) => {
        const id = req.params.id;
        try {
            const data = { ...req.body };
            if (data.timestamp) data.timestamp = new Date(data.timestamp);

            // Recompute calculatedCost when intake is updated
            const ts = data.timestamp ? new Date(data.timestamp) : null;
            if (data.supplierId && ts) {
                const year = ts.getFullYear();
                const month = ts.getMonth();
                const periodStart = new Date(year, month, 1);
                const supplier = await prisma.supplier.findUnique({ where: { id: data.supplierId } });
                const pricing = await prisma.supplierPricingPeriod.findFirst({ where: { supplierId: data.supplierId, periodStart } });
                const basePrice = pricing?.normalMilkPricePerKg ?? pricing?.basePricePerKg ?? supplier?.normalMilkPricePerKg ?? supplier?.basePricePerKg ?? 0;
                const fatBonus = pricing?.fatBonusPerPct ?? supplier?.fatBonusPerPct ?? 0;
                const proteinBonus = pricing?.proteinBonusPerPct ?? supplier?.proteinBonusPerPct ?? 0;
                const fatPct = data.fatPct ?? 4.0;
                const proteinPct = data.proteinPct ?? 3.2;
                const unitAdjust = ((fatPct - 4.0) * 10 * fatBonus) + ((proteinPct - 3.2) * 10 * proteinBonus);
                const unitPrice = basePrice + unitAdjust;
                data.calculatedCost = (data.quantityKg ?? 0) * unitPrice;
            }
            const updated = await prisma.intakeEntry.update({ where: { id }, data });

            // Replace tags if provided
            if (Array.isArray(req.body.tags)) {
                await prisma.intakeTag.deleteMany({ where: { intakeEntryId: id } });
                for (const t of req.body.tags) {
                    await prisma.intakeTag.create({ data: { intakeEntryId: id, tag: t } });
                }
            }

            const fetched = await prisma.intakeEntry.findUnique({ where: { id }, include: { tags: true } });
            res.json(toClientIntake(fetched));
        } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    app.delete('/api/intake-entries/:id', async (req, res) => {
        try {
            await prisma.intakeEntry.delete({ where: { id: req.params.id } });
            res.json({ ok: true });
        } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Output entries (compute parsed fields)
    app.post('/api/output-entries', async (req, res) => {
        const body = req.body;
        if (!body.productId || !body.timestamp) return res.status(400).json({ error: 'Missing productId or timestamp' });
        try {
            const product = await prisma.product.findUnique({ where: { id: body.productId } });
            const parsed = parsePackagingString(body.packagingString || '', product?.defaultPalletWeight ?? 900, product?.defaultBagWeight ?? 850);
            const created = await prisma.outputEntry.create({ data: {
                productId: body.productId,
                batchId: body.batchId || '',
                packagingString: body.packagingString || '',
                destination: body.destination === 'Pieno Žvaigždė' ? 'PienoZvaigzde' : (body.destination || 'Warehouse'),
                timestamp: new Date(body.timestamp),
                pallets: parsed.pallets,
                bigBags: parsed.bigBags,
                tanks: parsed.tanks,
                totalWeight: parsed.totalWeight
            }});
            res.json(toClientOutput(created));
        } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    app.put('/api/output-entries/:id', async (req, res) => {
        const id = req.params.id;
        try {
            const existing = await prisma.outputEntry.findUnique({ where: { id } });
            if (!existing) return res.status(404).json({ error: 'Not found' });
            const product = await prisma.product.findUnique({ where: { id: existing.productId } });
            const parsed = parsePackagingString(req.body.packagingString || existing.packagingString, product?.defaultPalletWeight ?? 900, product?.defaultBagWeight ?? 850);
            const updated = await prisma.outputEntry.update({ where: { id }, data: {
                packagingString: req.body.packagingString ?? existing.packagingString,
                pallets: parsed.pallets,
                bigBags: parsed.bigBags,
                tanks: parsed.tanks,
                totalWeight: parsed.totalWeight
            }});
            res.json(toClientOutput(updated));
        } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    app.delete('/api/output-entries/:id', async (req, res) => {
        try {
            await prisma.outputEntry.delete({ where: { id: req.params.id } });
            res.json({ ok: true });
        } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Dispatch entries
    app.post('/api/dispatch-entries', async (req, res) => {
        const b = req.body;
        if (!b.productId || b.quantityKg == null) return res.status(400).json({ error: 'Missing productId or quantityKg' });
        try {
            const created = await prisma.dispatchEntry.create({ data: {
                date: b.date ? new Date(b.date) : new Date(),
                buyerId: b.buyerId ?? null,
                buyerName: b.buyerName || '',
                contractNumber: b.contractNumber ?? null,
                productId: b.productId,
                quantityKg: b.quantityKg,
                orderedQuantityKg: b.orderedQuantityKg ?? null,
                batchRefId: b.batchRefId ?? null,
                packagingString: b.packagingString ?? null,
                pallets: b.pallets ?? null,
                bigBags: b.bigBags ?? null,
                tanks: b.tanks ?? null,
                totalWeight: b.totalWeight ?? null,
                salesPricePerKg: b.salesPricePerKg ?? 0,
                totalRevenue: b.totalRevenue ?? 0,
                status: b.status ?? 'planned'
            }});
            const fetched = await prisma.dispatchEntry.findUnique({ where: { id: created.id }, include: { shipments: true } });
            res.json(toClientDispatch(fetched));
        } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    app.put('/api/dispatch-entries/:id', async (req, res) => {
        try {
            const data = { ...req.body };
            if (data.date) data.date = new Date(data.date);
            await prisma.dispatchEntry.update({ where: { id: req.params.id }, data });
            const fetched = await prisma.dispatchEntry.findUnique({ where: { id: req.params.id }, include: { shipments: true } });
            res.json(toClientDispatch(fetched));
        } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    app.delete('/api/dispatch-entries/:id', async (req, res) => {
        try {
            await prisma.dispatchEntry.delete({ where: { id: req.params.id } });
            res.json({ ok: true });
        } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Shipments
    app.post('/api/dispatch-entries/:id/shipments', async (req, res) => {
        const dispatchId = req.params.id;
        const s = req.body;
        if (!s.quantityKg) return res.status(400).json({ error: 'Missing quantityKg' });
        try {
            const product = await prisma.product.findUnique({ where: { id: s.productId ?? undefined } });
            const parsed = s.packagingString ? parsePackagingString(s.packagingString, product?.defaultPalletWeight ?? 900, product?.defaultBagWeight ?? 850) : { pallets: 0, bigBags: 0, tanks: 0, totalWeight: 0, isValid: false };
            const created = await prisma.dispatchShipment.create({ data: {
                dispatchEntryId: dispatchId,
                date: s.date ? new Date(s.date) : new Date(),
                quantityKg: s.quantityKg,
                batchId: s.batchId ?? null,
                note: s.note ?? null,
                packagingString: s.packagingString ?? null,
                pallets: parsed.pallets || null,
                bigBags: parsed.bigBags || null,
                tanks: parsed.tanks || null,
                totalWeight: parsed.totalWeight || null
            }});

            // Recalculate summed quantity
            const shipments = await prisma.dispatchShipment.findMany({ where: { dispatchEntryId: dispatchId } });
            const total = shipments.reduce((acc, cur) => acc + cur.quantityKg, 0);
            const dispatch = await prisma.dispatchEntry.findUnique({ where: { id: dispatchId } });
            const totalRevenue = (dispatch?.salesPricePerKg ?? 0) * total;
            await prisma.dispatchEntry.update({ where: { id: dispatchId }, data: { quantityKg: total, totalRevenue } });

            const fetched = await prisma.dispatchEntry.findUnique({ where: { id: dispatchId }, include: { shipments: true } });
            res.json(toClientDispatch(fetched));
        } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    app.delete('/api/dispatch-entries/:id/shipments/:shipmentId', async (req, res) => {
        const { id, shipmentId } = req.params as any;
        try {
            await prisma.dispatchShipment.delete({ where: { id: shipmentId } });
            const shipments = await prisma.dispatchShipment.findMany({ where: { dispatchEntryId: id } });
            const total = shipments.reduce((acc, cur) => acc + cur.quantityKg, 0);
            const dispatch = await prisma.dispatchEntry.findUnique({ where: { id } });
            const totalRevenue = (dispatch?.salesPricePerKg ?? 0) * total;
            await prisma.dispatchEntry.update({ where: { id }, data: { quantityKg: total, totalRevenue } });
            const fetched = await prisma.dispatchEntry.findUnique({ where: { id }, include: { shipments: true } });
            res.json(toClientDispatch(fetched));
        } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Vite integration for development
    if (process.env.NODE_ENV !== 'production') {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    } else {
        // Serve static files in production
        app.use(express.static('dist'));
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
}

startServer().catch(err => {
    console.error('Failed to start server:', err);
});
