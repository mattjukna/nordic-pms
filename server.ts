import express from 'express';
import cors from 'cors';
import prisma from './services/prisma';
import { createServer as createViteServer } from 'vite';
import { parsePackagingString } from './utils/parser';

async function startServer() {
    const app = express();
    const PORT = 3000;

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

            const mapDate = (d: Date | string | null | undefined) => d ? new Date(d).getTime() : null;

            const mapSuppliers = suppliers.map(s => ({ ...s, createdOn: mapDate(s.createdOn) }));
            const mapBuyers = buyers.map(b => ({ ...b, createdOn: mapDate(b.createdOn), contracts: b.contracts.map(c => ({ ...c, startDate: mapDate(c.startDate), endDate: mapDate(c.endDate) })) }));
            const mapProducts = products;
            const mapMilkTypes = milkTypes.map(m => m.name);
            const mapIntakes = intakeEntries.map(i => ({ ...i, timestamp: mapDate(i.timestamp), tags: i.tags.map(t => t.tag) }));
            const mapOutputs = outputEntries.map(o => ({ ...o, timestamp: mapDate(o.timestamp), destination: o.destination === 'PienoZvaigzde' ? 'Pieno Žvaigždė' : o.destination }));
            const mapDispatches = dispatchEntries.map(d => ({ ...d, date: mapDate(d.date), shipments: d.shipments.map(s => ({ ...s, date: mapDate(s.date) })) }));

            res.json({ suppliers: mapSuppliers, buyers: mapBuyers, products: mapProducts, milkTypes: mapMilkTypes, intakeEntries: mapIntakes, outputEntries: mapOutputs, dispatchEntries: mapDispatches });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
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
                fatBonusPerPct: body.fatBonusPerPct ?? null,
                proteinBonusPerPct: body.proteinBonusPerPct ?? null,
                isEco: body.isEco ?? false,
                defaultMilkType: body.defaultMilkType ?? null
            }});
            res.json(created);
        } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    app.put('/api/suppliers/:id', async (req, res) => {
        const id = req.params.id;
        try {
            const updated = await prisma.supplier.update({ where: { id }, data: req.body });
            res.json(updated);
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
            res.json(created);
        } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    app.put('/api/buyers/:id', async (req, res) => {
        try {
            const updated = await prisma.buyer.update({ where: { id: req.params.id }, data: req.body });
            res.json(updated);
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
            res.json(created);
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

    // Intake entries (handle tags)
    app.post('/api/intake-entries', async (req, res) => {
        const body = req.body;
        if (!body.supplierId || !body.timestamp) return res.status(400).json({ error: 'Missing supplierId or timestamp' });
        try {
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
                timestamp: new Date(body.timestamp),
                calculatedCost: body.calculatedCost ?? 0,
                isTempAlertDismissed: body.isTempAlertDismissed ?? false,
                isDiscarded: body.isDiscarded ?? false
            }});

            // Tags
            if (Array.isArray(body.tags)) {
                for (const t of body.tags) {
                    await prisma.intakeTag.create({ data: { intakeEntryId: created.id, tag: t } });
                }
            }

            res.json(created);
        } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    app.put('/api/intake-entries/:id', async (req, res) => {
        const id = req.params.id;
        try {
            const data = { ...req.body };
            if (data.timestamp) data.timestamp = new Date(data.timestamp);
            const updated = await prisma.intakeEntry.update({ where: { id }, data });

            // Replace tags if provided
            if (Array.isArray(req.body.tags)) {
                await prisma.intakeTag.deleteMany({ where: { intakeEntryId: id } });
                for (const t of req.body.tags) {
                    await prisma.intakeTag.create({ data: { intakeEntryId: id, tag: t } });
                }
            }

            res.json(updated);
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
            res.json(created);
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
            res.json(updated);
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
            res.json(created);
        } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    app.put('/api/dispatch-entries/:id', async (req, res) => {
        try {
            const data = { ...req.body };
            if (data.date) data.date = new Date(data.date);
            const updated = await prisma.dispatchEntry.update({ where: { id: req.params.id }, data });
            res.json(updated);
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
            await prisma.dispatchEntry.update({ where: { id: dispatchId }, data: { quantityKg: total } });

            res.json(created);
        } catch (err: any) { res.status(500).json({ error: err.message }); }
    });

    app.delete('/api/dispatch-entries/:id/shipments/:shipmentId', async (req, res) => {
        const { id, shipmentId } = req.params as any;
        try {
            await prisma.dispatchShipment.delete({ where: { id: shipmentId } });
            const shipments = await prisma.dispatchShipment.findMany({ where: { dispatchEntryId: id } });
            const total = shipments.reduce((acc, cur) => acc + cur.quantityKg, 0);
            await prisma.dispatchEntry.update({ where: { id }, data: { quantityKg: total } });
            res.json({ ok: true });
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
