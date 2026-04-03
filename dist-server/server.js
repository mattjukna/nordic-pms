import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import prisma from './services/prisma';
import { logAudit } from './services/audit';
import { parsePackagingString } from './utils/parser';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { anyFractional } from './utils/wholeUnits';
import { buildMonthlyWorkbook, buildExportWorkbook } from './services/reportExcel';
import { getPrimaryCompanyCode, normalizeCompanyCodes } from './utils/companyCodes';
import { resolveEffectiveQuantityKg } from './utils/intakeCoefficient';
import { resolveIntakeCost } from './utils/intakePricing';
import { validateDispatchPayload, validateIntakePayload, validateOutputPayload, validateShipmentPayload } from './utils/serverValidation';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// --- Mapping helpers: convert Prisma rows into frontend DTO shapes defined in types.ts ---
const mapDate = (d) => {
    if (!d && d !== 0)
        return null;
    const date = new Date(d);
    return isNaN(date.getTime()) ? null : date.getTime();
};
const toParsed = (row) => ({
    pallets: typeof row?.pallets === 'number' ? row.pallets : 0,
    bigBags: typeof row?.bigBags === 'number' ? row.bigBags : 0,
    tanks: typeof row?.tanks === 'number' ? row.tanks : 0,
    totalWeight: typeof row?.totalWeight === 'number' ? row.totalWeight : 0,
});
const toClientDestination = (d) => {
    if (!d)
        return 'Warehouse';
    if (d === 'PienoZvaigzde')
        return 'Pieno Žvaigždė';
    return d;
};
const fromClientDestination = (d) => {
    if (!d)
        return 'Warehouse';
    if (d === 'Pieno Žvaigždė')
        return 'PienoZvaigzde';
    return d;
};
const toClientOutput = (o) => ({
    id: o.id,
    productId: o.productId,
    batchId: o.batchId,
    packagingString: o.packagingString,
    parsed: toParsed(o),
    destination: toClientDestination(o.destination),
    timestamp: mapDate(o.timestamp),
});
const toClientIntake = (i) => ({
    id: i.id,
    supplierId: i.supplierId,
    supplierName: i.supplierName,
    routeGroup: i.routeGroup,
    milkType: i.milkType,
    quantityKg: i.quantityKg,
    effectiveQuantityKg: typeof i.effectiveQuantityKg === 'number' ? i.effectiveQuantityKg : i.quantityKg,
    labCoefficient: typeof i.labCoefficient === 'number' ? i.labCoefficient : 1,
    ph: i.ph,
    fatPct: i.fatPct,
    proteinPct: i.proteinPct,
    tempCelsius: i.tempCelsius,
    isEcological: Boolean(i.isEcological),
    pricingMode: i.pricingMode ?? null,
    unitPricePerKg: typeof i.unitPricePerKg === 'number' ? i.unitPricePerKg : null,
    unitPriceBasis: i.unitPriceBasis ?? null,
    invoiceNumber: i.invoiceNumber ?? null,
    note: i.note ?? '',
    timestamp: mapDate(i.timestamp),
    calculatedCost: typeof i.calculatedCost === 'number' ? i.calculatedCost : 0,
    isTempAlertDismissed: Boolean(i.isTempAlertDismissed),
    isDiscarded: Boolean(i.isDiscarded),
    tags: Array.isArray(i.tags) ? i.tags.map((t) => t.tag) : [],
});
const toClientShipment = (s) => {
    const base = {
        id: s.id,
        date: mapDate(s.date),
        quantityKg: s.quantityKg,
    };
    if (s.batchId)
        base.batchId = s.batchId;
    if (s.note)
        base.note = s.note;
    if (s.packagingString) {
        base.packagingString = s.packagingString;
        base.parsed = toParsed(s);
    }
    return base;
};
const toClientDispatch = (d) => ({
    id: d.id,
    date: mapDate(d.date),
    createdAt: mapDate(d.createdAt),
    buyer: d.buyerName || '',
    buyerId: d.buyerId ?? undefined,
    buyerCompanyCode: d.buyerCompanyCode ?? undefined,
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
    shipments: Array.isArray(d.shipments) ? d.shipments.map((s) => toClientShipment(s)) : [],
});
const toClientSupplier = (s) => ({
    ...s,
    contractQuota: typeof s.contractQuota === 'number' ? s.contractQuota : 0,
    createdOn: mapDate(s.createdOn),
    basePricePerKg: typeof s.basePricePerKg === 'number' ? s.basePricePerKg : 0,
    normalMilkPricePerKg: typeof s.normalMilkPricePerKg === 'number' ? s.normalMilkPricePerKg : null,
    fatBonusPerPct: typeof s.fatBonusPerPct === 'number' ? s.fatBonusPerPct : 0,
    proteinBonusPerPct: typeof s.proteinBonusPerPct === 'number' ? s.proteinBonusPerPct : 0,
    quotas: Array.isArray(s.quotas) ? s.quotas : [],
});
const classifyBootstrapError = (err) => {
    const message = String(err?.message || 'Unknown database error');
    const code = typeof err?.code === 'string' ? err.code : null;
    const lowerMessage = message.toLowerCase();
    if (code === 'P2022'
        || lowerMessage.includes('the column')
        || lowerMessage.includes('does not exist in the current database')) {
        return {
            category: 'schema-mismatch',
            error: 'Database schema mismatch',
            hint: 'Apply the pending IntakeEntry migration before starting this build.',
        };
    }
    if (code === 'P1001'
        || lowerMessage.includes('can\'t reach database server')
        || lowerMessage.includes('cannot reach database server')
        || lowerMessage.includes('timed out')
        || lowerMessage.includes('econnrefused')
        || lowerMessage.includes('etimedout')
        || lowerMessage.includes('server was not found')) {
        return {
            category: 'database-unreachable',
            error: 'Database unreachable',
            hint: 'Check Azure SQL availability, firewall rules, and transient connectivity.',
        };
    }
    if (code === 'P1000'
        || code === 'P1010'
        || lowerMessage.includes('authentication failed')
        || lowerMessage.includes('login failed')
        || lowerMessage.includes('permission was denied')) {
        return {
            category: 'database-auth-config',
            error: 'Database auth/config issue',
            hint: 'Check database credentials, permissions, and runtime configuration.',
        };
    }
    return {
        category: 'database-error',
        error: message,
        hint: 'Check DATABASE_URL, firewall access, and database migration state.',
    };
};
const DEFAULT_PRODUCT_PALLET_WEIGHT = 1000;
const DEFAULT_PRODUCT_BAG_WEIGHT = 850;
const DEFAULT_PRODUCT_PROTEIN_TARGET = 0;
const DEFAULT_PRODUCT_YIELD_FACTOR = 0;
const toOptionalFiniteNumber = (value) => {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed)
            return null;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};
const normalizeProductPayload = (body, existing) => ({
    id: typeof body?.id === 'string' && body.id.trim().length > 0 ? body.id.trim() : (existing?.id ?? ''),
    name: typeof body?.name === 'string' && body.name.trim().length > 0 ? body.name.trim() : (existing?.name ?? ''),
    details: typeof body?.details === 'string' ? body.details.trim() : (existing?.details ?? ''),
    defaultPalletWeight: toOptionalFiniteNumber(body?.defaultPalletWeight) ?? existing?.defaultPalletWeight ?? DEFAULT_PRODUCT_PALLET_WEIGHT,
    defaultBagWeight: toOptionalFiniteNumber(body?.defaultBagWeight) ?? existing?.defaultBagWeight ?? DEFAULT_PRODUCT_BAG_WEIGHT,
    proteinTargetPct: toOptionalFiniteNumber(body?.proteinTargetPct) ?? existing?.proteinTargetPct ?? DEFAULT_PRODUCT_PROTEIN_TARGET,
    yieldFactor: toOptionalFiniteNumber(body?.yieldFactor) ?? existing?.yieldFactor ?? DEFAULT_PRODUCT_YIELD_FACTOR,
    sortOrder: toOptionalFiniteNumber(body?.sortOrder) ?? existing?.sortOrder ?? 0,
});
const toNullableString = (value) => typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
const resolveLegacySupplierIntakeCost = async (input) => {
    const year = input.timestamp.getFullYear();
    const month = input.timestamp.getMonth();
    const periodStart = new Date(year, month, 1);
    const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
    const pricing = await prisma.supplierPricingPeriod.findFirst({ where: { supplierId: input.supplierId, periodStart } });
    const basePrice = pricing?.normalMilkPricePerKg ?? pricing?.basePricePerKg ?? supplier?.normalMilkPricePerKg ?? supplier?.basePricePerKg ?? 0;
    const fatBonus = pricing?.fatBonusPerPct ?? supplier?.fatBonusPerPct ?? 0;
    const proteinBonus = pricing?.proteinBonusPerPct ?? supplier?.proteinBonusPerPct ?? 0;
    const unitAdjust = ((input.fatPct - 4.0) * 10 * fatBonus) + ((input.proteinPct - 3.2) * 10 * proteinBonus);
    const unitPrice = basePrice + unitAdjust;
    return Math.max(0, (input.quantityKg || 0) * unitPrice);
};
const resolvePersistedIntakeValues = async (input) => {
    const body = input.body || {};
    const existing = input.existing || null;
    const quantityKg = Number(body.quantityKg ?? existing?.quantityKg ?? 0);
    const fatPct = Number(body.fatPct ?? existing?.fatPct ?? 0);
    const proteinPct = Number(body.proteinPct ?? existing?.proteinPct ?? 0);
    const ph = Number(body.ph ?? existing?.ph ?? 0);
    const tempCelsius = Number(body.tempCelsius ?? existing?.tempCelsius ?? 0);
    const timestamp = body.timestamp ? new Date(body.timestamp) : new Date(existing?.timestamp);
    const pricingMode = body.pricingMode ?? existing?.pricingMode ?? null;
    const shouldApplyCoefficient = typeof body.applyLabCoefficient === 'boolean'
        ? body.applyLabCoefficient
        : (existing?.labCoefficient != null
            ? Number(existing.labCoefficient) !== 1 || Number(existing?.effectiveQuantityKg ?? existing?.quantityKg ?? 0) !== Number(existing?.quantityKg ?? 0)
            : false);
    const effective = resolveEffectiveQuantityKg({
        quantityKg,
        applyCoefficient: shouldApplyCoefficient,
        fatPct,
        proteinPct,
        manualCoefficient: body.manualLabCoefficient ?? null,
    });
    if (!(effective.labCoefficient > 0) || !(effective.effectiveQuantityKg > 0)) {
        throw new Error('Resolved intake coefficient or effective quantity is invalid.');
    }
    let calculatedCost;
    let unitPricePerKg = null;
    let unitPriceBasis = null;
    if (pricingMode === 'invoice_total' || pricingMode === 'unit_price') {
        unitPricePerKg = pricingMode === 'unit_price' ? Number(body.unitPricePerKg ?? existing?.unitPricePerKg ?? 0) : null;
        unitPriceBasis = pricingMode === 'unit_price' ? (body.unitPriceBasis ?? existing?.unitPriceBasis ?? null) : null;
        const pricing = resolveIntakeCost({
            pricingMode,
            invoiceTotalEur: pricingMode === 'invoice_total' ? Number(body.invoiceTotalEur ?? existing?.calculatedCost ?? 0) : null,
            unitPricePerKg,
            unitPriceBasis: unitPriceBasis,
            quantityKg,
            effectiveQuantityKg: effective.effectiveQuantityKg,
        });
        calculatedCost = pricing.calculatedCost;
    }
    else {
        // No pricing mode specified — entry awaits invoice assignment later
        calculatedCost = 0;
    }
    return {
        supplierId: body.supplierId ?? existing?.supplierId,
        supplierName: body.supplierName ?? existing?.supplierName,
        routeGroup: body.routeGroup ?? existing?.routeGroup,
        milkType: body.milkType ?? existing?.milkType,
        quantityKg,
        effectiveQuantityKg: effective.effectiveQuantityKg,
        labCoefficient: effective.labCoefficient,
        ph,
        fatPct,
        proteinPct,
        tempCelsius,
        isEcological: body.isEcological ?? existing?.isEcological ?? false,
        pricingMode,
        unitPricePerKg: pricingMode === 'unit_price' ? unitPricePerKg : null,
        unitPriceBasis: pricingMode === 'unit_price' ? unitPriceBasis : null,
        invoiceNumber: toNullableString(body.invoiceNumber ?? existing?.invoiceNumber ?? null),
        note: body.note ?? existing?.note ?? null,
        timestamp,
        calculatedCost,
        isTempAlertDismissed: body.isTempAlertDismissed ?? existing?.isTempAlertDismissed ?? false,
        isDiscarded: body.isDiscarded ?? existing?.isDiscarded ?? false,
    };
};
const DEFAULT_AZURE_FRONTEND_ORIGIN = 'https://nordic-pms-prod-2026-bxh5f7bcc6ccfgfg.polandcentral-01.azurewebsites.net';
const normalizeOrigin = (value) => {
    if (!value)
        return null;
    try {
        return new URL(value).origin.toLowerCase();
    }
    catch {
        return value.trim().replace(/\/+$/, '').toLowerCase() || null;
    }
};
const getRequestOrigin = (req) => {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    const hostHeader = String(req.headers.host || '').trim();
    const protocol = forwardedProto || req.protocol || 'http';
    const host = forwardedHost || hostHeader;
    if (!host)
        return null;
    return normalizeOrigin(`${protocol}://${host}`);
};
const parseCorsOrigins = () => {
    const raw = process.env.CORS_ALLOWED_ORIGINS || process.env.APP_ALLOWED_ORIGINS || 'http://localhost:3000;http://127.0.0.1:3000';
    const configuredOrigins = raw
        .split(/[;,]/)
        .map((value) => normalizeOrigin(value))
        .filter(Boolean);
    const azureWebsiteOrigin = process.env.WEBSITE_HOSTNAME
        ? normalizeOrigin(`https://${process.env.WEBSITE_HOSTNAME}`)
        : null;
    return Array.from(new Set([
        ...configuredOrigins,
        DEFAULT_AZURE_FRONTEND_ORIGIN,
        azureWebsiteOrigin,
    ].filter((value) => Boolean(value))));
};
async function startServer() {
    // Load dotenv only when running locally / in development so production Node
    // does not require the `dotenv` package to be installed.
    if (typeof process.env.WEBSITE_INSTANCE_ID === 'undefined' || process.env.NODE_ENV !== 'production') {
        try {
            const dotenv = await import('dotenv');
            dotenv.config({ path: '.env' });
            dotenv.config({ path: '.env.local' }); // load VITE_* for dev too
        }
        catch (err) {
            // Do not treat missing dotenv as fatal in local runs, just warn
            console.warn('[BOOT] dotenv not available or failed to load:', err?.message ?? err);
        }
    }
    const app = express();
    const port = Number(process.env.PORT || 3000);
    const host = '0.0.0.0';
    let prismaAvailable = true;
    const allowedOrigins = parseCorsOrigins();
    app.use(cors((req, callback) => {
        const incomingOrigin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
        const requestOrigin = normalizeOrigin(incomingOrigin);
        const serverOrigin = getRequestOrigin(req);
        const sameOrigin = requestOrigin ? requestOrigin === serverOrigin : false;
        const configuredOrigin = requestOrigin ? allowedOrigins.includes(requestOrigin) : false;
        const branch = !requestOrigin
            ? 'allow-no-origin'
            : sameOrigin
                ? 'allow-same-origin'
                : configuredOrigin
                    ? 'allow-configured-origin'
                    : 'reject-unauthorized-origin';
        console.log('[CORS]', {
            incomingOrigin: incomingOrigin || null,
            normalizedOrigin: requestOrigin,
            allowedOrigins,
            requestOriginHost: serverOrigin,
            branch,
        });
        if (!requestOrigin || sameOrigin || configuredOrigin) {
            callback(null, { origin: true, credentials: true });
            return;
        }
        callback(new Error('Origin not allowed by CORS'));
    }));
    app.use((err, req, res, next) => {
        if (err?.message === 'Origin not allowed by CORS') {
            return res.status(403).json({ error: 'Origin not allowed by CORS' });
        }
        return next(err);
    });
    app.use(express.json());
    // Auth middleware for /api routes
    const AUTH_DISABLED = (process.env.AUTH_DISABLED || '').toLowerCase() === 'true';
    const AAD_TENANT = process.env.AAD_TENANT_ID || process.env.AAD_TENANT || process.env.AAD_TENANTID || '';
    const AAD_CLIENT = process.env.AAD_CLIENT_ID || process.env.AAD_CLIENT || '';
    const AAD_ALLOWED = process.env.AAD_ALLOWED_DOMAIN || process.env.AAD_ALLOWED || '';
    const jwksUri = AAD_TENANT ? `https://login.microsoftonline.com/${AAD_TENANT}/discovery/v2.0/keys` : null;
    const JWKS = jwksUri ? createRemoteJWKSet(new URL(jwksUri)) : null;
    // Public runtime config for the SPA (no auth, no token required)
    app.get('/config', (req, res) => {
        const clientId = process.env.MSAL_CLIENT_ID || process.env.AAD_CLIENT_ID || '';
        const tenantId = process.env.MSAL_TENANT_ID || process.env.AAD_TENANT_ID || '';
        const allowedDomain = process.env.MSAL_ALLOWED_DOMAIN || process.env.AAD_ALLOWED_DOMAIN || '';
        const apiScope = process.env.MSAL_API_SCOPE || process.env.VITE_AAD_API_SCOPE || '';
        res.json({ clientId, tenantId, allowedDomain, apiScope });
    });
    app.use('/api', async (req, res, next) => {
        if (AUTH_DISABLED)
            return next();
        if (req.path === '/health')
            return next();
        const auth = req.headers?.authorization || '';
        if (!auth.startsWith('Bearer '))
            return res.status(401).json({ error: 'Missing Authorization Bearer token' });
        const token = auth.split(' ')[1];
        if (!JWKS)
            return res.status(500).json({ error: 'JWKS not configured on server' });
        try {
            // Tenant id used for issuer validation
            const tid = process.env.AAD_TENANT_ID || process.env.AAD_TENANT || '';
            const allowedIssuers = tid ? [
                `https://login.microsoftonline.com/${tid}/v2.0`,
                `https://login.microsoftonline.com/${tid}/v2.0/`,
                `https://sts.windows.net/${tid}/`,
            ] : [];
            const apiScope = process.env.MSAL_API_SCOPE || process.env.AAD_API_SCOPE || process.env.VITE_AAD_API_SCOPE || '';
            // Derive API audience (aud) from explicit env or from the configured scope
            let apiAudience = (process.env.MSAL_API_AUDIENCE || process.env.AAD_API_AUDIENCE || '').trim();
            if (!apiAudience && apiScope) {
                const s = apiScope.trim();
                if (s.startsWith('api://')) {
                    // keep first three segments to form 'api://<id>' (e.g. api://<id>/access_as_user)
                    const parts = s.split('/').slice(0, 3);
                    apiAudience = parts.join('/');
                }
                else {
                    // fallback: take the left-hand part before the first '/'
                    apiAudience = s.split('/')[0] || '';
                }
            }
            const audienceOptions = [];
            if (apiAudience) {
                audienceOptions.push(apiAudience);
                // if apiAudience is an api:// URI, also accept the raw id portion as fallback
                if (apiAudience.startsWith('api://')) {
                    const raw = apiAudience.replace(/^api:\/\//, '').split('/')[0];
                    if (raw)
                        audienceOptions.push(raw);
                }
            }
            console.log('[BOOT] audienceOptions =', audienceOptions);
            const { payload } = await jwtVerify(token, JWKS, {
                issuer: allowedIssuers.length ? allowedIssuers : undefined,
                audience: audienceOptions.length ? audienceOptions : undefined
            });
            // Post-verification sanity checks
            const payloadAny = payload;
            if (payloadAny.tid && tid && payloadAny.tid !== tid) {
                return res.status(401).json({ error: 'Invalid token', detail: 'tid mismatch' });
            }
            const email = payloadAny.preferred_username || payloadAny.upn || payloadAny.email || '';
            if (AAD_ALLOWED && email && !email.toLowerCase().endsWith(`@${AAD_ALLOWED}`)) {
                return res.status(403).json({ error: 'Email domain not allowed' });
            }
            req.user = { email, name: payloadAny.name || '', oid: payloadAny.oid, tid: payloadAny.tid };
            return next();
        }
        catch (err) {
            return res.status(401).json({ error: 'Invalid token', detail: err?.message, hint: 'Check token aud/scp/iss. Paste token into jwt.ms' });
        }
    });
    // API Routes
    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: Date.now() });
    });
    // ── SSE: real-time data sync across clients ──────────────────────────
    const sseClients = new Set();
    app.get('/api/events', (req, res) => {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        });
        res.write(':\n\n'); // initial keep-alive comment
        sseClients.add(res);
        req.on('close', () => { sseClients.delete(res); });
    });
    /** Broadcast a data-changed event to all connected SSE clients. */
    const broadcastChange = () => {
        const payload = `data: ${JSON.stringify({ type: 'data-changed', ts: Date.now() })}\n\n`;
        for (const client of sseClients) {
            try {
                client.write(payload);
            }
            catch {
                sseClients.delete(client);
            }
        }
    };
    // Middleware: after any successful mutation, notify all SSE clients
    app.use((req, res, next) => {
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && req.path.startsWith('/api/')) {
            res.on('finish', () => {
                if (res.statusCode >= 200 && res.statusCode < 300)
                    broadcastChange();
            });
        }
        next();
    });
    // (removed /api/config — public runtime /config used instead)
    // Monthly Excel report export
    app.get('/api/reports/monthly', async (req, res) => {
        try {
            const month = String(req.query.month || '');
            const report = String(req.query.report || 'full');
            if (!/^\d{4}-\d{2}$/.test(month))
                return res.status(400).json({ error: 'Invalid month. Expected YYYY-MM' });
            const [y, m] = month.split('-').map(Number);
            const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
            const nextMonth = new Date(Date.UTC(y, m, 1, 0, 0, 0));
            const now = new Date();
            const todayUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
            const endExclusive = (y === now.getUTCFullYear() && (m - 1) === now.getUTCMonth()) ? new Date(todayUtcMidnight.getTime() + 24 * 60 * 60 * 1000) : nextMonth;
            const buf = await buildMonthlyWorkbook({ report, startDate: start, endDateExclusive: endExclusive });
            const filename = `NordicPMS_${report}_${month}.xlsx`;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            return res.send(buf);
        }
        catch (err) {
            console.error('report export failed', err);
            return res.status(500).json({ error: 'Failed to generate report', detail: err?.message });
        }
    });
    // Advanced Excel export with arbitrary date range and sheet selection
    app.get('/api/reports/export', async (req, res) => {
        try {
            const from = String(req.query.from || '');
            const to = String(req.query.to || '');
            const sheetsParam = String(req.query.sheets || '');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
                return res.status(400).json({ error: 'Invalid date. Expected YYYY-MM-DD for from and to' });
            }
            const validSheets = new Set(['intake', 'production', 'dispatch', 'quality', 'accounting', 'suppliers', 'buyers', 'products', 'stock', 'quotas']);
            const sheets = sheetsParam.split(',').filter(s => validSheets.has(s));
            if (sheets.length === 0)
                return res.status(400).json({ error: 'No valid sheets selected' });
            const startDate = new Date(`${from}T00:00:00.000Z`);
            const endDate = new Date(`${to}T00:00:00.000Z`);
            const endDateExclusive = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
            const buf = await buildExportWorkbook({ sheets, startDate, endDateExclusive });
            const filename = `NordicPMS_export_${from}_${to}.xlsx`;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            return res.send(buf);
        }
        catch (err) {
            console.error('export failed', err);
            return res.status(500).json({ error: 'Failed to generate export', detail: err?.message });
        }
    });
    // Debugging endpoint: return authenticated user info
    app.get('/api/whoami', (req, res) => {
        if (AUTH_DISABLED)
            return res.json({ email: 'AUTH_DISABLED' });
        return res.json({ email: req.user?.email ?? null, name: req.user?.name ?? null, oid: req.user?.oid ?? null, tid: req.user?.tid ?? null });
    });
    // Bootstrap: load all domain data needed by frontend
    app.get('/api/bootstrap', async (req, res) => {
        try {
            const [suppliers, buyers, products, milkTypes, intakeEntries, outputEntries, dispatchEntries, stockAdjustments] = await Promise.all([
                prisma.supplier.findMany({ include: { quotas: true } }),
                prisma.buyer.findMany({ include: { contracts: true } }),
                prisma.product.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
                prisma.milkType.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
                prisma.intakeEntry.findMany({ include: { tags: true }, orderBy: { timestamp: 'desc' } }),
                prisma.outputEntry.findMany({ orderBy: { timestamp: 'desc' } }),
                prisma.dispatchEntry.findMany({ include: { shipments: true }, orderBy: { date: 'desc' } }),
                prisma.stockAdjustment.findMany({ orderBy: { timestamp: 'desc' } })
            ]);
            const mapSuppliers = suppliers.map(s => toClientSupplier(s));
            const mapBuyers = buyers.map(b => ({
                ...b,
                createdOn: mapDate(b.createdOn),
                contracts: Array.isArray(b.contracts) ? b.contracts.map((c) => ({ ...c, startDate: mapDate(c.startDate), endDate: mapDate(c.endDate) })) : []
            }));
            const mapProducts = products;
            const mapMilkTypes = milkTypes.map(m => m.name);
            const mapIntakes = intakeEntries.map(i => toClientIntake(i));
            const mapOutputs = outputEntries.map(o => toClientOutput(o));
            const mapDispatches = dispatchEntries.map(d => toClientDispatch(d));
            const mapStockAdj = stockAdjustments.map(a => ({ ...a, timestamp: mapDate(a.timestamp) }));
            res.json({ suppliers: mapSuppliers, buyers: mapBuyers, products: mapProducts, milkTypes: mapMilkTypes, intakeEntries: mapIntakes, outputEntries: mapOutputs, dispatchEntries: mapDispatches, stockAdjustments: mapStockAdj });
        }
        catch (err) {
            const diagnostic = classifyBootstrapError(err);
            console.error('[BOOTSTRAP] database failure', {
                category: diagnostic.category,
                code: err?.code ?? null,
                message: err?.message ?? String(err),
                meta: err?.meta ?? null,
            });
            res.status(500).json({ error: diagnostic.error, hint: diagnostic.hint });
        }
    });
    // Suppliers
    app.post('/api/suppliers', async (req, res) => {
        const body = req.body;
        if (!body.name || !body.routeGroup)
            return res.status(400).json({ error: 'Missing name or routeGroup' });
        try {
            const created = await prisma.supplier.create({ data: {
                    name: body.name,
                    routeGroup: body.routeGroup,
                    contractQuota: body.contractQuota ?? null,
                    companyCode: normalizeCompanyCodes(body.companyCode),
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
                } });
            void logAudit(req, { action: 'CREATE', tableName: 'Supplier', recordId: created.id, details: JSON.stringify(toClientSupplier(created)) });
            res.json(toClientSupplier(created));
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.put('/api/suppliers/:id', async (req, res) => {
        const id = req.params.id;
        try {
            const allowedKeys = ['name', 'routeGroup', 'contractQuota', 'companyCode', 'phoneNumber', 'country', 'addressLine1', 'addressLine2', 'createdOn', 'basePricePerKg', 'normalMilkPricePerKg', 'fatBonusPerPct', 'proteinBonusPerPct', 'isEco', 'defaultMilkType'];
            const data = {};
            for (const k of allowedKeys) {
                if (Object.prototype.hasOwnProperty.call(req.body, k))
                    data[k] = req.body[k];
            }
            // ensure proper types
            if (data.createdOn)
                data.createdOn = new Date(data.createdOn);
            if (Object.prototype.hasOwnProperty.call(data, 'companyCode'))
                data.companyCode = normalizeCompanyCodes(data.companyCode);
            const updated = await prisma.supplier.update({ where: { id }, data });
            void logAudit(req, { action: 'UPDATE', tableName: 'Supplier', recordId: updated.id, details: JSON.stringify(toClientSupplier(updated)) });
            res.json(toClientSupplier(updated));
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    app.delete('/api/suppliers/:id', async (req, res) => {
        const id = req.params.id;
        try {
            await prisma.supplier.delete({ where: { id } });
            void logAudit(req, { action: 'DELETE', tableName: 'Supplier', recordId: id, details: JSON.stringify({ id }) });
            res.json({ ok: true });
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    // Supplier Quotas
    app.post('/api/suppliers/:id/quotas', async (req, res) => {
        const supplierId = req.params.id;
        const { year, month, quotaKg, actualKg } = req.body;
        if (!year || !month || quotaKg == null)
            return res.status(400).json({ error: 'Missing year, month, or quotaKg' });
        try {
            const created = await prisma.supplierQuota.create({ data: { supplierId, year: Number(year), month: Number(month), quotaKg: Number(quotaKg), actualKg: actualKg != null ? Number(actualKg) : null } });
            void logAudit(req, { action: 'CREATE', tableName: 'SupplierQuota', recordId: created.id, details: JSON.stringify(created) });
            res.json(created);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.put('/api/supplier-quotas/:id', async (req, res) => {
        try {
            const allowedKeys = ['year', 'month', 'quotaKg', 'actualKg'];
            const data = {};
            for (const k of allowedKeys) {
                if (Object.prototype.hasOwnProperty.call(req.body, k))
                    data[k] = req.body[k] != null ? Number(req.body[k]) : null;
            }
            if (data.year != null)
                data.year = Number(data.year);
            if (data.month != null)
                data.month = Number(data.month);
            const updated = await prisma.supplierQuota.update({ where: { id: req.params.id }, data });
            void logAudit(req, { action: 'UPDATE', tableName: 'SupplierQuota', recordId: updated.id, details: JSON.stringify(updated) });
            res.json(updated);
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    app.delete('/api/supplier-quotas/:id', async (req, res) => {
        try {
            await prisma.supplierQuota.delete({ where: { id: req.params.id } });
            void logAudit(req, { action: 'DELETE', tableName: 'SupplierQuota', recordId: req.params.id, details: JSON.stringify({ id: req.params.id }) });
            res.json({ ok: true });
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    // Bulk upsert quotas for a supplier (used by import)
    app.post('/api/suppliers/:id/quotas/bulk', async (req, res) => {
        const supplierId = req.params.id;
        const { quotas } = req.body;
        if (!Array.isArray(quotas))
            return res.status(400).json({ error: 'quotas must be an array' });
        try {
            const results = [];
            for (const q of quotas) {
                const result = await prisma.supplierQuota.upsert({
                    where: { supplierId_year_month: { supplierId, year: Number(q.year), month: Number(q.month) } },
                    create: { supplierId, year: Number(q.year), month: Number(q.month), quotaKg: Number(q.quotaKg), actualKg: q.actualKg != null ? Number(q.actualKg) : null },
                    update: { quotaKg: Number(q.quotaKg), actualKg: q.actualKg != null ? Number(q.actualKg) : null },
                });
                results.push(result);
            }
            void logAudit(req, { action: 'BULK_UPSERT', tableName: 'SupplierQuota', recordId: supplierId, details: JSON.stringify({ count: results.length }) });
            res.json(results);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // Buyers + Contracts
    app.post('/api/buyers', async (req, res) => {
        const b = req.body;
        if (!b.name)
            return res.status(400).json({ error: 'Missing buyer name' });
        try {
            const created = await prisma.buyer.create({ data: {
                    name: b.name,
                    companyCode: normalizeCompanyCodes(b.companyCode),
                    phoneNumber: b.phoneNumber ?? null,
                    country: b.country ?? null,
                    addressLine1: b.addressLine1 ?? null,
                    addressLine2: b.addressLine2 ?? null,
                    createdOn: b.createdOn ? new Date(b.createdOn) : null
                } });
            const fetched = await prisma.buyer.findUnique({ where: { id: created.id }, include: { contracts: true } });
            res.json({ ...fetched, createdOn: mapDate(fetched?.createdOn) });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.put('/api/buyers/:id', async (req, res) => {
        try {
            const allowedKeys = ['name', 'companyCode', 'phoneNumber', 'country', 'addressLine1', 'addressLine2', 'createdOn'];
            const data = {};
            for (const k of allowedKeys) {
                if (Object.prototype.hasOwnProperty.call(req.body, k))
                    data[k] = req.body[k];
            }
            if (Object.prototype.hasOwnProperty.call(data, 'companyCode'))
                data.companyCode = normalizeCompanyCodes(data.companyCode);
            if (Object.prototype.hasOwnProperty.call(data, 'createdOn'))
                data.createdOn = data.createdOn != null ? new Date(data.createdOn) : null;
            await prisma.buyer.update({ where: { id: req.params.id }, data });
            const fetched = await prisma.buyer.findUnique({ where: { id: req.params.id }, include: { contracts: true } });
            res.json({ ...fetched, createdOn: mapDate(fetched?.createdOn), contracts: fetched?.contracts?.map((c) => ({ ...c, startDate: mapDate(c.startDate), endDate: mapDate(c.endDate) })) });
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    app.delete('/api/buyers/:id', async (req, res) => {
        try {
            await prisma.buyer.delete({ where: { id: req.params.id } });
            res.json({ ok: true });
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    // Buyer contracts
    app.post('/api/buyers/:id/contracts', async (req, res) => {
        const buyerId = req.params.id;
        const c = req.body;
        if (!c.contractNumber || !c.productId || c.pricePerKg == null || !c.startDate || !c.endDate)
            return res.status(400).json({ error: 'Invalid contract body' });
        try {
            const created = await prisma.buyerContract.create({ data: {
                    contractNumber: c.contractNumber,
                    pricePerKg: c.pricePerKg,
                    agreedAmountKg: c.agreedAmountKg ?? null,
                    startDate: new Date(c.startDate),
                    endDate: new Date(c.endDate),
                    buyerId,
                    productId: c.productId
                } });
            res.json({ ...created, startDate: mapDate(created.startDate), endDate: mapDate(created.endDate) });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.put('/api/contracts/:id', async (req, res) => {
        try {
            const allowedKeys = ['contractNumber', 'pricePerKg', 'agreedAmountKg', 'startDate', 'endDate', 'buyerId', 'productId'];
            const data = {};
            for (const k of allowedKeys) {
                if (Object.prototype.hasOwnProperty.call(req.body, k))
                    data[k] = req.body[k];
            }
            if (data.startDate)
                data.startDate = new Date(data.startDate);
            if (data.endDate)
                data.endDate = new Date(data.endDate);
            const updated = await prisma.buyerContract.update({ where: { id: req.params.id }, data });
            res.json({ ...updated, startDate: mapDate(updated.startDate), endDate: mapDate(updated.endDate) });
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    app.delete('/api/contracts/:id', async (req, res) => {
        try {
            await prisma.buyerContract.delete({ where: { id: req.params.id } });
            res.json({ ok: true });
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    // Products
    app.post('/api/products', async (req, res) => {
        const product = normalizeProductPayload(req.body);
        if (!product.id || !product.name)
            return res.status(400).json({ error: 'Missing product id or name' });
        try {
            const existing = await prisma.product.findUnique({ where: { id: product.id } });
            if (existing)
                return res.status(409).json({ error: `Product "${product.id}" already exists. Refresh the page to see it.` });
            const maxSortOrder = await prisma.product.aggregate({ _max: { sortOrder: true } });
            const created = await prisma.product.create({ data: { ...product, sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1 } });
            res.json(created);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.put('/api/products/:id', async (req, res) => {
        try {
            const currentId = req.params.id;
            const existing = await prisma.product.findUnique({ where: { id: currentId } });
            if (!existing)
                return res.status(404).json({ error: 'Not found' });
            const normalized = normalizeProductPayload(req.body, existing);
            if (!normalized.id || !normalized.name)
                return res.status(400).json({ error: 'Missing product id or name' });
            const { id: nextId, ...productData } = normalized;
            let updated;
            if (nextId === currentId) {
                updated = await prisma.product.update({ where: { id: currentId }, data: productData });
            }
            else {
                const conflict = await prisma.product.findUnique({ where: { id: nextId } });
                if (conflict)
                    return res.status(409).json({ error: 'Product ID already exists' });
                updated = await prisma.$transaction(async (tx) => {
                    const created = await tx.product.create({ data: { id: nextId, ...productData } });
                    await tx.outputEntry.updateMany({ where: { productId: currentId }, data: { productId: nextId } });
                    await tx.dispatchEntry.updateMany({ where: { productId: currentId }, data: { productId: nextId } });
                    await tx.buyerContract.updateMany({ where: { productId: currentId }, data: { productId: nextId } });
                    await tx.stockAdjustment.updateMany({ where: { productId: currentId }, data: { productId: nextId } });
                    await tx.product.delete({ where: { id: currentId } });
                    return created;
                });
            }
            res.json(updated);
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    app.delete('/api/products/:id', async (req, res) => {
        try {
            await prisma.product.delete({ where: { id: req.params.id } });
            res.json({ ok: true });
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    app.post('/api/products/reorder', async (req, res) => {
        const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.filter((id) => typeof id === 'string' && id.trim().length > 0) : [];
        if (orderedIds.length === 0)
            return res.status(400).json({ error: 'Missing orderedIds' });
        try {
            await prisma.$transaction(orderedIds.map((id, index) => prisma.product.update({ where: { id }, data: { sortOrder: index } })));
            res.json({ ok: true });
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    // Milk types
    app.post('/api/milk-types', async (req, res) => {
        const { name } = req.body;
        if (!name)
            return res.status(400).json({ error: 'Missing milk type name' });
        try {
            const existing = await prisma.milkType.findUnique({ where: { name } });
            if (existing)
                return res.json(existing);
            const maxSortOrder = await prisma.milkType.aggregate({ _max: { sortOrder: true } });
            const created = await prisma.milkType.create({ data: { name, sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1 } });
            res.json(created);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.delete('/api/milk-types/:name', async (req, res) => {
        try {
            await prisma.milkType.delete({ where: { name: req.params.name } });
            res.json({ ok: true });
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    app.post('/api/milk-types/reorder', async (req, res) => {
        const orderedNames = Array.isArray(req.body?.orderedNames) ? req.body.orderedNames.filter((name) => typeof name === 'string' && name.trim().length > 0) : [];
        if (orderedNames.length === 0)
            return res.status(400).json({ error: 'Missing orderedNames' });
        try {
            await prisma.$transaction(orderedNames.map((name, index) => prisma.milkType.update({ where: { name }, data: { sortOrder: index } })));
            res.json({ ok: true });
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    // Supplier pricing periods
    app.get('/api/supplier-pricing', async (req, res) => {
        try {
            const month = req.query.month; // YYYY-MM
            const now = new Date();
            let periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
            if (month) {
                const [y, m] = month.split('-').map(Number);
                if (!isNaN(y) && !isNaN(m))
                    periodStart = new Date(y, m - 1, 1);
            }
            const periods = await prisma.supplierPricingPeriod.findMany({ where: { periodStart }, include: { supplier: true } });
            res.json(periods.map(p => ({ id: p.id, supplierId: p.supplierId, supplierName: p.supplier?.name ?? '', periodStart: mapDate(p.periodStart), basePricePerKg: p.basePricePerKg ?? null, normalMilkPricePerKg: p.normalMilkPricePerKg ?? null, fatBonusPerPct: p.fatBonusPerPct ?? null, proteinBonusPerPct: p.proteinBonusPerPct ?? null })));
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.put('/api/supplier-pricing', async (req, res) => {
        const body = req.body;
        if (!body.supplierId || !body.periodStart)
            return res.status(400).json({ error: 'Missing supplierId or periodStart' });
        try {
            const periodStart = typeof body.periodStart === 'string' && body.periodStart.match(/^\d{4}-\d{2}$/) ? (() => { const [y, m] = body.periodStart.split('-').map(Number); return new Date(y, m - 1, 1); })() : new Date(body.periodStart);
            const existing = await prisma.supplierPricingPeriod.findFirst({ where: { supplierId: body.supplierId, periodStart } });
            if (existing) {
                const updated = await prisma.supplierPricingPeriod.update({ where: { id: existing.id }, data: {
                        basePricePerKg: body.basePricePerKg ?? null,
                        normalMilkPricePerKg: body.normalMilkPricePerKg ?? null,
                        fatBonusPerPct: body.fatBonusPerPct ?? null,
                        proteinBonusPerPct: body.proteinBonusPerPct ?? null
                    } });
                res.json(updated);
            }
            else {
                const created = await prisma.supplierPricingPeriod.create({ data: {
                        supplierId: body.supplierId,
                        periodStart,
                        basePricePerKg: body.basePricePerKg ?? null,
                        normalMilkPricePerKg: body.normalMilkPricePerKg ?? null,
                        fatBonusPerPct: body.fatBonusPerPct ?? null,
                        proteinBonusPerPct: body.proteinBonusPerPct ?? null
                    } });
                res.json(created);
            }
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // Monthly milk spend (exclude discarded)
    app.get('/api/milk-spend', async (req, res) => {
        try {
            const month = req.query.month; // YYYY-MM
            const now = new Date();
            let start = new Date(now.getFullYear(), now.getMonth(), 1);
            if (month) {
                const [y, m] = month.split('-').map(Number);
                if (!isNaN(y) && !isNaN(m))
                    start = new Date(y, m - 1, 1);
            }
            const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
            const entries = await prisma.intakeEntry.findMany({ where: { timestamp: { gte: start, lt: end }, isDiscarded: false } });
            const totalCost = entries.reduce((s, e) => s + (e.calculatedCost ?? 0), 0);
            const totalKg = entries.reduce((s, e) => s + (e.quantityKg ?? 0), 0);
            const bySupplierMap = {};
            for (const e of entries) {
                const key = e.supplierId;
                if (!bySupplierMap[key])
                    bySupplierMap[key] = { supplierId: e.supplierId, supplierName: e.supplierName, cost: 0, kg: 0 };
                bySupplierMap[key].cost += (e.calculatedCost ?? 0);
                bySupplierMap[key].kg += (e.quantityKg ?? 0);
            }
            const bySupplier = Object.values(bySupplierMap).sort((a, b) => b.cost - a.cost);
            res.json({ periodStart: mapDate(start), periodEnd: mapDate(end), totalCost, totalKg, bySupplier });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // Range milk spend (from, to) - inclusive start, exclusive end
    app.get('/api/milk-spend-range', async (req, res) => {
        try {
            const from = req.query.from;
            const to = req.query.to;
            if (!from || !to)
                return res.status(400).json({ error: 'Missing from or to query parameters (ISO strings expected)' });
            const start = new Date(from);
            const end = new Date(to);
            if (isNaN(start.getTime()) || isNaN(end.getTime()))
                return res.status(400).json({ error: 'Invalid date format for from/to' });
            const entries = await prisma.intakeEntry.findMany({ where: { timestamp: { gte: start, lt: end }, isDiscarded: false } });
            const totalCost = entries.reduce((s, e) => s + (e.calculatedCost ?? 0), 0);
            const totalKg = entries.reduce((s, e) => s + (e.quantityKg ?? 0), 0);
            const avgPricePerKg = totalKg > 0 ? totalCost / totalKg : 0;
            const bySupplierMap = {};
            for (const e of entries) {
                const key = e.supplierId;
                if (!bySupplierMap[key])
                    bySupplierMap[key] = { supplierId: e.supplierId, supplierName: e.supplierName, totalCost: 0, totalKg: 0 };
                bySupplierMap[key].totalCost += (e.calculatedCost ?? 0);
                bySupplierMap[key].totalKg += (e.quantityKg ?? 0);
            }
            const bySupplier = Object.values(bySupplierMap).map(s => ({ ...s, avgPricePerKg: s.totalKg > 0 ? s.totalCost / s.totalKg : 0 })).sort((a, b) => b.totalCost - a.totalCost);
            res.json({ from: mapDate(start), to: mapDate(end), totalCost, totalKg, avgPricePerKg, bySupplier });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // Intake entries (handle tags)
    app.post('/api/intake-entries', async (req, res) => {
        const body = req.body;
        const validation = validateIntakePayload(body);
        if (!validation.ok)
            return res.status(400).json({ error: 'Invalid intake payload', details: validation.errors });
        try {
            const intakeData = await resolvePersistedIntakeValues({ body });
            const created = await prisma.intakeEntry.create({ data: intakeData });
            // Tags
            if (Array.isArray(body.tags)) {
                for (const t of body.tags) {
                    await prisma.intakeTag.create({ data: { intakeEntryId: created.id, tag: t } });
                }
            }
            const fetched = await prisma.intakeEntry.findUnique({ where: { id: created.id }, include: { tags: true } });
            void logAudit(req, { action: 'CREATE', tableName: 'IntakeEntry', recordId: created.id, details: JSON.stringify(toClientIntake(fetched)) });
            res.json(toClientIntake(fetched));
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.put('/api/intake-entries/:id', async (req, res) => {
        const id = req.params.id;
        try {
            const data = { ...req.body };
            if (data.timestamp)
                data.timestamp = new Date(data.timestamp);
            const existingEntry = await prisma.intakeEntry.findUnique({ where: { id } });
            if (!existingEntry)
                return res.status(404).json({ error: 'Not found' });
            const mergedValidation = validateIntakePayload({
                supplierId: data.supplierId ?? existingEntry.supplierId,
                supplierName: data.supplierName ?? existingEntry.supplierName,
                routeGroup: data.routeGroup ?? existingEntry.routeGroup,
                milkType: data.milkType ?? existingEntry.milkType,
                quantityKg: data.quantityKg ?? existingEntry.quantityKg,
                ph: data.ph ?? existingEntry.ph,
                fatPct: data.fatPct ?? existingEntry.fatPct,
                proteinPct: data.proteinPct ?? existingEntry.proteinPct,
                tempCelsius: data.tempCelsius ?? existingEntry.tempCelsius,
                timestamp: data.timestamp ? data.timestamp.getTime() : existingEntry.timestamp.getTime(),
                pricingMode: req.body.pricingMode ?? existingEntry.pricingMode ?? null,
                invoiceTotalEur: req.body.invoiceTotalEur ?? (existingEntry.pricingMode === 'invoice_total' ? existingEntry.calculatedCost : null),
                unitPricePerKg: req.body.unitPricePerKg ?? existingEntry.unitPricePerKg ?? null,
                unitPriceBasis: req.body.unitPriceBasis ?? existingEntry.unitPriceBasis ?? null,
                applyLabCoefficient: typeof req.body.applyLabCoefficient === 'boolean'
                    ? req.body.applyLabCoefficient
                    : ((existingEntry.labCoefficient ?? 1) !== 1),
                manualLabCoefficient: req.body.manualLabCoefficient ?? null,
            });
            if (!mergedValidation.ok)
                return res.status(400).json({ error: 'Invalid intake payload', details: mergedValidation.errors });
            const persisted = await resolvePersistedIntakeValues({ body: req.body, existing: existingEntry });
            const updated = await prisma.intakeEntry.update({ where: { id }, data: persisted });
            // Replace tags if provided
            if (Array.isArray(req.body.tags)) {
                await prisma.intakeTag.deleteMany({ where: { intakeEntryId: id } });
                for (const t of req.body.tags) {
                    await prisma.intakeTag.create({ data: { intakeEntryId: id, tag: t } });
                }
            }
            const fetched = await prisma.intakeEntry.findUnique({ where: { id }, include: { tags: true } });
            void logAudit(req, { action: 'UPDATE', tableName: 'IntakeEntry', recordId: id, details: JSON.stringify(toClientIntake(fetched)) });
            res.json(toClientIntake(fetched));
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    app.delete('/api/intake-entries/:id', async (req, res) => {
        try {
            await prisma.intakeEntry.delete({ where: { id: req.params.id } });
            void logAudit(req, { action: 'DELETE', tableName: 'IntakeEntry', recordId: req.params.id, details: JSON.stringify({ id: req.params.id }) });
            res.json({ ok: true });
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    // Output entries (compute parsed fields)
    app.post('/api/output-entries', async (req, res) => {
        const body = req.body;
        const validation = validateOutputPayload(body);
        if (!validation.ok)
            return res.status(400).json({ error: 'Invalid output payload', details: validation.errors });
        try {
            const product = await prisma.product.findUnique({ where: { id: body.productId } });
            const parsed = parsePackagingString(body.packagingString || '', product?.defaultPalletWeight ?? 900, product?.defaultBagWeight ?? 850);
            // Reject fractional unit counts in outputs — insist on discrete units or explicit kg
            if (anyFractional(parsed))
                return res.status(400).json({ error: 'Fractional unit counts in output packaging are not allowed. Use partial unit weights (e.g. 1 pad*700) or add an explicit kg segment if truly loose.' });
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
                } });
            void logAudit(req, { action: 'CREATE', tableName: 'OutputEntry', recordId: created.id, details: JSON.stringify(toClientOutput(created)) });
            res.json(toClientOutput(created));
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.put('/api/output-entries/:id', async (req, res) => {
        const id = req.params.id;
        try {
            const existing = await prisma.outputEntry.findUnique({ where: { id } });
            if (!existing)
                return res.status(404).json({ error: 'Not found' });
            const validation = validateOutputPayload({
                productId: existing.productId,
                batchId: req.body.batchId ?? existing.batchId,
                packagingString: req.body.packagingString ?? existing.packagingString,
                timestamp: existing.timestamp.getTime(),
            });
            if (!validation.ok)
                return res.status(400).json({ error: 'Invalid output payload', details: validation.errors });
            const product = await prisma.product.findUnique({ where: { id: existing.productId } });
            const parsed = parsePackagingString(req.body.packagingString || existing.packagingString, product?.defaultPalletWeight ?? 900, product?.defaultBagWeight ?? 850);
            if (anyFractional(parsed))
                return res.status(400).json({ error: 'Fractional unit counts in output packaging are not allowed. Use partial unit weights (e.g. 1 pad*700) or add an explicit kg segment if truly loose.' });
            const updated = await prisma.outputEntry.update({ where: { id }, data: {
                    packagingString: req.body.packagingString ?? existing.packagingString,
                    batchId: req.body.batchId ?? existing.batchId,
                    pallets: parsed.pallets,
                    bigBags: parsed.bigBags,
                    tanks: parsed.tanks,
                    totalWeight: parsed.totalWeight
                } });
            void logAudit(req, { action: 'UPDATE', tableName: 'OutputEntry', recordId: updated.id, details: JSON.stringify(toClientOutput(updated)) });
            res.json(toClientOutput(updated));
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    app.delete('/api/output-entries/:id', async (req, res) => {
        try {
            await prisma.outputEntry.delete({ where: { id: req.params.id } });
            void logAudit(req, { action: 'DELETE', tableName: 'OutputEntry', recordId: req.params.id, details: JSON.stringify({ id: req.params.id }) });
            res.json({ ok: true });
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    // Dispatch entries
    app.post('/api/dispatch-entries', async (req, res) => {
        const b = req.body;
        const validation = validateDispatchPayload(b);
        if (!validation.ok)
            return res.status(400).json({ error: 'Invalid dispatch payload', details: validation.errors });
        try {
            const created = await prisma.dispatchEntry.create({ data: {
                    date: b.date ? new Date(b.date) : new Date(),
                    createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
                    buyerId: b.buyerId ?? null,
                    buyerName: b.buyerName || b.buyer || '',
                    buyerCompanyCode: normalizeCompanyCodes(b.buyerCompanyCode) ?? getPrimaryCompanyCode(b.companyCode) ?? null,
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
                } });
            const fetched = await prisma.dispatchEntry.findUnique({ where: { id: created.id }, include: { shipments: true } });
            void logAudit(req, { action: 'CREATE', tableName: 'DispatchEntry', recordId: created.id, details: JSON.stringify(toClientDispatch(fetched)) });
            res.json(toClientDispatch(fetched));
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.put('/api/dispatch-entries/:id', async (req, res) => {
        try {
            const allowedKeys = ['date', 'createdAt', 'buyerId', 'buyerName', 'buyerCompanyCode', 'contractNumber', 'productId', 'quantityKg', 'orderedQuantityKg', 'batchRefId', 'packagingString', 'pallets', 'bigBags', 'tanks', 'totalWeight', 'salesPricePerKg', 'totalRevenue', 'status'];
            const data = {};
            for (const k of allowedKeys) {
                if (Object.prototype.hasOwnProperty.call(req.body, k))
                    data[k] = req.body[k];
            }
            // Also support legacy 'buyer' key mapped to buyerName
            if (Object.prototype.hasOwnProperty.call(req.body, 'buyer'))
                data.buyerName = req.body.buyer;
            const existing = await prisma.dispatchEntry.findUnique({ where: { id: req.params.id } });
            if (!existing)
                return res.status(404).json({ error: 'Not found' });
            if (data.date)
                data.date = new Date(data.date);
            if (data.createdAt)
                data.createdAt = new Date(data.createdAt);
            if (Object.prototype.hasOwnProperty.call(data, 'buyerCompanyCode')) {
                data.buyerCompanyCode = normalizeCompanyCodes(data.buyerCompanyCode) ?? null;
            }
            const mergedDispatch = {
                productId: data.productId ?? existing.productId,
                buyerName: data.buyerName ?? existing.buyerName,
                orderedQuantityKg: data.orderedQuantityKg ?? existing.orderedQuantityKg ?? existing.quantityKg,
                salesPricePerKg: data.salesPricePerKg ?? existing.salesPricePerKg,
                date: data.date ? data.date.getTime() : existing.date.getTime(),
            };
            const dispatchValidation = validateDispatchPayload(mergedDispatch);
            if (!dispatchValidation.ok)
                return res.status(400).json({ error: 'Invalid dispatch payload', details: dispatchValidation.errors });
            // Prevent lowering orderedQuantityKg below already shipped total
            if (typeof data.orderedQuantityKg === 'number') {
                const parent = await prisma.dispatchEntry.findUnique({ where: { id: req.params.id }, include: { shipments: true } });
                const shipped = parent ? (parent.shipments || []).reduce((acc, s) => acc + (s.quantityKg || 0), 0) : 0;
                if (data.orderedQuantityKg < shipped - 1e-6) {
                    return res.status(409).json({ error: 'orderedQuantityKg cannot be lower than already shipped quantity', orderedQuantityKg: data.orderedQuantityKg, shipped });
                }
            }
            await prisma.dispatchEntry.update({ where: { id: req.params.id }, data });
            const fetched = await prisma.dispatchEntry.findUnique({ where: { id: req.params.id }, include: { shipments: true } });
            void logAudit(req, { action: 'UPDATE', tableName: 'DispatchEntry', recordId: req.params.id, details: JSON.stringify(toClientDispatch(fetched)) });
            res.json(toClientDispatch(fetched));
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    app.delete('/api/dispatch-entries/:id', async (req, res) => {
        try {
            await prisma.dispatchEntry.delete({ where: { id: req.params.id } });
            void logAudit(req, { action: 'DELETE', tableName: 'DispatchEntry', recordId: req.params.id, details: JSON.stringify({ id: req.params.id }) });
            res.json({ ok: true });
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    // Shipments
    app.post('/api/dispatch-entries/:id/shipments', async (req, res) => {
        const dispatchId = req.params.id;
        const s = req.body;
        const validation = validateShipmentPayload(s);
        if (!validation.ok)
            return res.status(400).json({ error: 'Invalid shipment payload', details: validation.errors });
        try {
            // load parent dispatch to enforce ordered quantity limits
            const parent = await prisma.dispatchEntry.findUnique({ where: { id: dispatchId }, include: { shipments: true } });
            if (!parent)
                return res.status(404).json({ error: 'Dispatch not found' });
            const product = await prisma.product.findUnique({ where: { id: s.productId ?? undefined } });
            const parsed = s.packagingString ? parsePackagingString(s.packagingString, product?.defaultPalletWeight ?? 900, product?.defaultBagWeight ?? 850) : { pallets: 0, bigBags: 0, tanks: 0, totalWeight: 0, isValid: false };
            // If packagingString parsed -> enforce whole-unit policy for pallets/bigBags/tanks
            if (parsed.isValid && anyFractional(parsed)) {
                return res.status(400).json({ error: 'Fractional unit counts in shipment packaging are not allowed. Use partial unit weights (e.g. 1 pad*700) or add an explicit kg segment if truly loose.' });
            }
            // If parsed is valid prefer parsed.totalWeight as truth for quantityKg
            const finalQty = (parsed.isValid && parsed.totalWeight > 0) ? parsed.totalWeight : s.quantityKg;
            // Enforce ordered quantity if present — prefer `orderedQuantityKg`, fall back to `quantityKg` (legacy)
            const orderLimit = (parent.orderedQuantityKg ?? parent.quantityKg) ?? null;
            if (orderLimit && orderLimit > 0) {
                const existingTotal = (parent.shipments || []).reduce((acc, cur) => acc + (cur.quantityKg || 0), 0);
                const attempted = finalQty;
                const projected = existingTotal + attempted;
                if (projected - orderLimit > 1e-6) {
                    return res.status(409).json({ error: 'Shipment exceeds orderedQuantityKg', orderLimit, currentTotal: existingTotal, attempted, projected });
                }
            }
            const created = await prisma.dispatchShipment.create({ data: {
                    dispatchEntryId: dispatchId,
                    date: s.date ? new Date(s.date) : new Date(),
                    quantityKg: finalQty,
                    batchId: s.batchId ?? null,
                    note: s.note ?? null,
                    packagingString: s.packagingString ?? null,
                    pallets: parsed.pallets || null,
                    bigBags: parsed.bigBags || null,
                    tanks: parsed.tanks || null,
                    totalWeight: parsed.totalWeight || null
                } });
            void logAudit(req, { action: 'CREATE', tableName: 'DispatchShipment', recordId: created.id, details: JSON.stringify({ dispatchEntryId: dispatchId, quantityKg: created.quantityKg }) });
            // Recalculate summed quantity
            const shipments = await prisma.dispatchShipment.findMany({ where: { dispatchEntryId: dispatchId } });
            const total = shipments.reduce((acc, cur) => acc + cur.quantityKg, 0);
            const dispatch = await prisma.dispatchEntry.findUnique({ where: { id: dispatchId } });
            const totalRevenue = (dispatch?.salesPricePerKg ?? 0) * total;
            await prisma.dispatchEntry.update({ where: { id: dispatchId }, data: { quantityKg: total, totalRevenue } });
            const fetched = await prisma.dispatchEntry.findUnique({ where: { id: dispatchId }, include: { shipments: true } });
            void logAudit(req, { action: 'UPDATE', tableName: 'DispatchEntry', recordId: dispatchId, details: JSON.stringify(toClientDispatch(fetched)) });
            res.json(toClientDispatch(fetched));
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.delete('/api/dispatch-entries/:id/shipments/:shipmentId', async (req, res) => {
        const { id, shipmentId } = req.params;
        try {
            await prisma.dispatchShipment.delete({ where: { id: shipmentId } });
            void logAudit(req, { action: 'DELETE', tableName: 'DispatchShipment', recordId: shipmentId, details: JSON.stringify({ id: shipmentId, dispatchEntryId: id }) });
            const shipments = await prisma.dispatchShipment.findMany({ where: { dispatchEntryId: id } });
            const total = shipments.reduce((acc, cur) => acc + cur.quantityKg, 0);
            const dispatch = await prisma.dispatchEntry.findUnique({ where: { id } });
            const totalRevenue = (dispatch?.salesPricePerKg ?? 0) * total;
            await prisma.dispatchEntry.update({ where: { id }, data: { quantityKg: total, totalRevenue } });
            const fetched = await prisma.dispatchEntry.findUnique({ where: { id }, include: { shipments: true } });
            void logAudit(req, { action: 'UPDATE', tableName: 'DispatchEntry', recordId: id, details: JSON.stringify(toClientDispatch(fetched)) });
            res.json(toClientDispatch(fetched));
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    // Update a shipment (normalize packagingString and recompute dispatch totals)
    app.put('/api/dispatch-entries/:id/shipments/:shipmentId', async (req, res) => {
        const { id, shipmentId } = req.params;
        const body = req.body;
        try {
            const existing = await prisma.dispatchShipment.findUnique({ where: { id: shipmentId } });
            if (!existing)
                return res.status(404).json({ error: 'Shipment not found' });
            const shipmentValidation = validateShipmentPayload({
                quantityKg: body.quantityKg ?? existing.quantityKg,
                date: body.date ?? existing.date.getTime(),
            });
            if (!shipmentValidation.ok)
                return res.status(400).json({ error: 'Invalid shipment payload', details: shipmentValidation.errors });
            const dispatchEntry = await prisma.dispatchEntry.findUnique({ where: { id } });
            if (!dispatchEntry)
                return res.status(404).json({ error: 'Dispatch not found' });
            const product = await prisma.product.findUnique({ where: { id: dispatchEntry.productId } });
            let parsed = { pallets: 0, bigBags: 0, tanks: 0, totalWeight: 0, isValid: false };
            if (typeof body.packagingString === 'string' && body.packagingString.trim() !== '') {
                const { normalizePackagingString } = await import('./utils/packagingNormalize');
                // normalize first
                const norm = normalizePackagingString(body.packagingString, product?.defaultPalletWeight ?? 900, product?.defaultBagWeight ?? 850);
                // reuse parsePackagingString to get parsed numbers
                const { parsePackagingString } = await import('./utils/parser');
                parsed = parsePackagingString(norm.normalized, product?.defaultPalletWeight ?? 900, product?.defaultBagWeight ?? 850);
                if (parsed.isValid && anyFractional(parsed))
                    return res.status(400).json({ error: 'Fractional unit counts in shipment packaging are not allowed. Use partial unit weights (e.g. 1 pad*700) or add an explicit kg segment if truly loose.' });
            }
            const finalQty = (parsed.isValid && parsed.totalWeight > 0) ? parsed.totalWeight : (body.quantityKg ?? existing.quantityKg);
            // Enforce ordered quantity if present (exclude current existing qty). Prefer orderedQuantityKg, fallback to quantityKg
            const parent = await prisma.dispatchEntry.findUnique({ where: { id }, include: { shipments: true } });
            const limit = parent ? ((parent.orderedQuantityKg ?? parent.quantityKg) ?? null) : null;
            if (parent && limit && limit > 0) {
                const existingTotal = (parent.shipments || []).reduce((acc, cur) => acc + (cur.quantityKg || 0), 0) - (existing.quantityKg || 0);
                const attempted = finalQty;
                const projected = existingTotal + attempted;
                if (projected - limit > 1e-6) {
                    return res.status(409).json({ error: 'Updating shipment exceeds orderedQuantityKg', orderLimit: limit, currentTotal: existingTotal, attempted, projected });
                }
            }
            const updatedShipment = await prisma.dispatchShipment.update({ where: { id: shipmentId }, data: {
                    date: body.date ? new Date(body.date) : existing.date,
                    quantityKg: finalQty,
                    batchId: body.batchId ?? existing.batchId,
                    note: body.note ?? existing.note,
                    packagingString: body.packagingString ?? existing.packagingString,
                    pallets: parsed.pallets || null,
                    bigBags: parsed.bigBags || null,
                    tanks: parsed.tanks || null,
                    totalWeight: parsed.totalWeight || null
                } });
            void logAudit(req, { action: 'UPDATE', tableName: 'DispatchShipment', recordId: updatedShipment.id, details: JSON.stringify({ id: updatedShipment.id, quantityKg: updatedShipment.quantityKg }) });
            // Recalculate parent dispatch totals
            const shipments = await prisma.dispatchShipment.findMany({ where: { dispatchEntryId: id } });
            const total = shipments.reduce((acc, cur) => acc + cur.quantityKg, 0);
            const dispatch = await prisma.dispatchEntry.findUnique({ where: { id } });
            const totalRevenue = (dispatch?.salesPricePerKg ?? 0) * total;
            await prisma.dispatchEntry.update({ where: { id }, data: { quantityKg: total, totalRevenue } });
            const fetched = await prisma.dispatchEntry.findUnique({ where: { id }, include: { shipments: true } });
            void logAudit(req, { action: 'UPDATE', tableName: 'DispatchEntry', recordId: id, details: JSON.stringify(toClientDispatch(fetched)) });
            res.json(toClientDispatch(fetched));
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    // Stock Adjustments
    app.get('/api/stock-adjustments', async (req, res) => {
        try {
            const adjustments = await prisma.stockAdjustment.findMany({ orderBy: { timestamp: 'desc' } });
            res.json(adjustments.map(a => ({ ...a, timestamp: mapDate(a.timestamp) })));
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/stock-adjustments', async (req, res) => {
        const body = req.body;
        if (!body.productId)
            return res.status(400).json({ error: 'Missing productId' });
        if (typeof body.adjustmentKg !== 'number')
            return res.status(400).json({ error: 'Missing adjustmentKg' });
        try {
            const created = await prisma.stockAdjustment.create({ data: {
                    productId: body.productId,
                    adjustmentKg: body.adjustmentKg,
                    pallets: body.pallets ?? 0,
                    bigBags: body.bigBags ?? 0,
                    tanks: body.tanks ?? 0,
                    looseKg: body.looseKg ?? 0,
                    reason: body.reason || '',
                    type: body.type || 'correction',
                    performedBy: body.performedBy ?? null,
                    note: body.note ?? null,
                } });
            void logAudit(req, { action: 'CREATE', tableName: 'StockAdjustment', recordId: created.id, details: JSON.stringify(created) });
            res.json({ ...created, timestamp: mapDate(created.timestamp) });
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    app.put('/api/stock-adjustments/:id', async (req, res) => {
        const { id } = req.params;
        const body = req.body;
        try {
            const existing = await prisma.stockAdjustment.findUnique({ where: { id } });
            if (!existing)
                return res.status(404).json({ error: 'Not found' });
            const updated = await prisma.stockAdjustment.update({ where: { id }, data: {
                    adjustmentKg: body.adjustmentKg ?? existing.adjustmentKg,
                    pallets: body.pallets ?? existing.pallets,
                    bigBags: body.bigBags ?? existing.bigBags,
                    tanks: body.tanks ?? existing.tanks,
                    looseKg: body.looseKg ?? existing.looseKg,
                    reason: body.reason ?? existing.reason,
                    type: body.type ?? existing.type,
                    note: body.note ?? existing.note,
                    performedBy: body.performedBy ?? existing.performedBy,
                } });
            void logAudit(req, { action: 'UPDATE', tableName: 'StockAdjustment', recordId: updated.id, details: JSON.stringify(updated) });
            res.json({ ...updated, timestamp: mapDate(updated.timestamp) });
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    app.delete('/api/stock-adjustments/:id', async (req, res) => {
        try {
            await prisma.stockAdjustment.delete({ where: { id: req.params.id } });
            void logAudit(req, { action: 'DELETE', tableName: 'StockAdjustment', recordId: req.params.id, details: '{}' });
            res.json({ ok: true });
        }
        catch (err) {
            res.status(400).json({ error: err.message });
        }
    });
    // Vite integration for development (dynamic import -> no runtime dependency in production)
    if (process.env.NODE_ENV !== 'production') {
        // expose the configured VITE_* env var for troubleshooting
        console.log('[ENV] VITE_AAD_API_SCOPE =', process.env.VITE_AAD_API_SCOPE);
        const root = process.cwd();
        const { createServer: createViteServer } = await import('vite');
        const vite = await createViteServer({
            root,
            envDir: root,
            configFile: path.resolve(root, 'vite.config.ts'),
            mode: 'development',
            define: {
                'import.meta.env.VITE_AAD_CLIENT_ID': JSON.stringify(process.env.VITE_AAD_CLIENT_ID || ''),
                'import.meta.env.VITE_AAD_TENANT_ID': JSON.stringify(process.env.VITE_AAD_TENANT_ID || ''),
                'import.meta.env.VITE_AAD_ALLOWED_DOMAIN': JSON.stringify(process.env.VITE_AAD_ALLOWED_DOMAIN || ''),
                'import.meta.env.VITE_AAD_API_SCOPE': JSON.stringify(process.env.VITE_AAD_API_SCOPE || ''),
            },
            server: { middlewareMode: true },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    }
    else {
        // Serve static files in production and fallback to index.html for SPA routes
        const distPath = path.join(__dirname, '../dist');
        const indexPath = path.join(distPath, 'index.html');
        app.use(express.static(distPath));
        // Fallback for client-side routing: serve index.html for any route that is
        // not /api or /config (and their subpaths). Use a RegExp compatible with
        // Express 5 so '*' is not treated as a parameter name.
        app.get(/^(?!\/(api|config)(\/|$)).*/, (req, res) => {
            return res.sendFile(indexPath);
        });
    }
    console.log("[BOOT] starting server", {
        node: process.version,
        env: process.env.NODE_ENV,
        port: process.env.PORT,
    });
    // ── Schema migration: ensure SupplierQuota table exists ──────────
    if (prismaAvailable) {
        try {
            await prisma.$executeRawUnsafe(`
                IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SupplierQuota')
                BEGIN
                    CREATE TABLE [dbo].[SupplierQuota] (
                        [id] NVARCHAR(1000) NOT NULL,
                        [supplierId] NVARCHAR(1000) NOT NULL,
                        [year] INT NOT NULL,
                        [month] INT NOT NULL,
                        [quotaKg] FLOAT(53) NOT NULL,
                        [actualKg] FLOAT(53),
                        CONSTRAINT [SupplierQuota_pkey] PRIMARY KEY CLUSTERED ([id]),
                        CONSTRAINT [SupplierQuota_supplierId_year_month_key] UNIQUE NONCLUSTERED ([supplierId], [year], [month])
                    );
                    CREATE NONCLUSTERED INDEX [SupplierQuota_year_month_idx] ON [dbo].[SupplierQuota]([year], [month]);
                    ALTER TABLE [dbo].[SupplierQuota] ADD CONSTRAINT [SupplierQuota_supplierId_fkey] FOREIGN KEY ([supplierId]) REFERENCES [dbo].[Supplier]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
                END
            `);
            console.log('[BOOT] SupplierQuota table ensured.');
        }
        catch (err) {
            console.warn('[BOOT] SupplierQuota migration failed (non-fatal):', err?.message ?? err);
        }
    }
    // ── Schema migration: ensure DispatchEntry.createdAt column exists ──
    if (prismaAvailable) {
        try {
            await prisma.$executeRawUnsafe(`
                IF NOT EXISTS (
                    SELECT 1 FROM sys.columns
                    WHERE object_id = OBJECT_ID('dbo.DispatchEntry') AND name = 'createdAt'
                )
                ALTER TABLE [dbo].[DispatchEntry]
                    ADD [createdAt] DATETIME2 NOT NULL
                    CONSTRAINT [DF_DispatchEntry_createdAt] DEFAULT GETDATE();
            `);
            console.log('[BOOT] DispatchEntry.createdAt column ensured.');
        }
        catch (err) {
            console.warn('[BOOT] DispatchEntry.createdAt migration failed (non-fatal):', err?.message ?? err);
        }
    }
    // ── One-time seed: create initial_balance reset records ───────────
    // Uses name matching to find products (handles user-created products with custom IDs).
    // Always replaces existing initial_balance records to ensure correct absolute values.
    if (prismaAvailable) {
        try {
            const allProducts = await prisma.product.findMany();
            const STOCK_SEED = [
                { nameMatch: 'MPC 85', pallets: 35, bigBags: 12, tanks: 0, looseKg: 0, padW: 900, bbW: 850 },
                { nameMatch: 'MPC 83', pallets: 0, bigBags: 30, tanks: 0, looseKg: 248, padW: 900, bbW: 850 },
                { nameMatch: 'MPC 85 Organic', pallets: 4, bigBags: 0, tanks: 0, looseKg: 480, padW: 900, bbW: 850 },
                { nameMatch: 'MPI', pallets: 16, bigBags: 0, tanks: 0, looseKg: 765, padW: 900, bbW: 850 },
                { nameMatch: 'SMP LH', pallets: 63, bigBags: 3, tanks: 0, looseKg: 650, padW: 1000, bbW: 1000 },
                { nameMatch: 'WMP 26/26', pallets: 2, bigBags: 0, tanks: 0, looseKg: 950, padW: 1000, bbW: 1000 },
                { nameMatch: 'Permeate Powder 015', pallets: 19, bigBags: 0, tanks: 0, looseKg: 350, padW: 1000, bbW: 1000 },
            ];
            // Match each seed entry to a product by name (case-insensitive exact match first, then contains)
            const matchProduct = (nameMatch) => {
                const lower = nameMatch.toLowerCase();
                return allProducts.find(p => p.name.toLowerCase() === lower)
                    || allProducts.find(p => p.name.toLowerCase().includes(lower) && !allProducts.some(q => q.id !== p.id && q.name.toLowerCase().includes(lower)));
            };
            // Delete ALL old auto-seeded initial_balance records so we can recreate cleanly
            const deleted = await prisma.stockAdjustment.deleteMany({
                where: { type: 'initial_balance', note: { contains: 'Physical stock count' } }
            });
            if (deleted.count > 0)
                console.log(`[SEED] Deleted ${deleted.count} old initial_balance record(s).`);
            let created = 0;
            for (const s of STOCK_SEED) {
                const product = matchProduct(s.nameMatch);
                if (!product) {
                    console.warn(`[SEED] No product matched for "${s.nameMatch}", skipping.`);
                    continue;
                }
                try {
                    const totalKg = s.pallets * s.padW + s.bigBags * s.bbW + s.tanks * 25000 + s.looseKg;
                    await prisma.stockAdjustment.create({ data: {
                            productId: product.id,
                            adjustmentKg: totalKg,
                            pallets: s.pallets,
                            bigBags: s.bigBags,
                            tanks: s.tanks,
                            looseKg: s.looseKg,
                            reason: `Initial balance: ${s.pallets} pad + ${s.bigBags} bb + ${s.looseKg} loose = ${totalKg} kg`,
                            type: 'initial_balance',
                            note: 'Physical stock count 2026-04-02',
                        } });
                    console.log(`  [SEED] ${product.name} (${product.id}): ${totalKg.toLocaleString()} kg`);
                    created++;
                }
                catch (err) {
                    console.warn(`  [SEED] Failed for ${product.name} (${product.id}):`, err?.message ?? err);
                }
            }
            if (created > 0)
                console.log(`[SEED] Created ${created} initial_balance record(s).`);
        }
        catch (err) {
            console.warn('[SEED] Initial balance seeding failed (non-fatal):', err?.message ?? err);
        }
    }
    // ── One-time seed: populate SupplierQuota from Excel data ─────────
    // Data extracted from "Pieno kvotos 2025-2026 m_.xlsx".
    // Format: [year, month, quotaKg, actualKg|null]
    // For 2026 Jan-Mar, actualKg = quotaKg (user confirmed quota was reached).
    if (prismaAvailable) {
        try {
            const existingCount = await prisma.supplierQuota.count();
            if (existingCount === 0) {
                console.log('[SEED] Seeding supplier quotas from Excel data...');
                const allSuppliers = await prisma.supplier.findMany({ select: { id: true, name: true } });
                const normalize = (s) => s.toLowerCase().replace(/["""'']/g, '').replace(/\s+/g, ' ').trim();
                const matchSupplier = (excelName) => {
                    const norm = normalize(excelName);
                    return allSuppliers.find(s => normalize(s.name) === norm)
                        || allSuppliers.find(s => normalize(s.name).includes(norm) || norm.includes(normalize(s.name)))
                        || allSuppliers.find(s => { const words = norm.split(' ').filter(w => w.length > 2); return words.filter(w => normalize(s.name).includes(w)).length >= Math.min(2, words.length); })
                        || null;
                };
                const QUOTA_SEED = [
                    { n: "Laima Zigmantienė", q: [[2025, 1, 4800, 4861], [2025, 2, 4800, 4810], [2025, 3, 5100, 5444], [2025, 4, 4500, 4449], [2025, 5, 4300, 4284], [2025, 6, 6000, 6439], [2025, 7, 6500, 6704], [2025, 8, 6500, 6140], [2025, 9, 6000, 5792], [2025, 10, 6000, 5687], [2025, 11, 5000, 4568], [2025, 12, 5000, 4748], [2026, 1, 4800, 4800], [2026, 2, 4500, 4500], [2026, 3, 4000, 4000], [2026, 4, 4000, null], [2026, 5, 4500, null], [2026, 6, 6000, null], [2026, 7, 6500, null], [2026, 8, 6500, null], [2026, 9, 6000, null], [2026, 10, 6500, null], [2026, 11, 5000, null], [2026, 12, 5000, null]] },
                    { n: "Elvyra Labakojienė", q: [[2025, 1, 6500, 6179], [2025, 2, 4600, 4607], [2025, 3, 4800, 4870], [2025, 4, 4200, 4309], [2025, 5, 4300, 4378], [2025, 6, 4300, 4352], [2025, 7, 6800, 6707], [2025, 8, 6000, 6038], [2025, 9, 6200, 6085], [2025, 10, 6000, 5574], [2025, 11, 4000, 3813], [2025, 12, 4000, 3930], [2026, 1, 4200, 4200], [2026, 2, 3600, 3600], [2026, 3, 3800, 3800], [2026, 4, 4000, null], [2026, 5, 4200, null], [2026, 6, 5600, null], [2026, 7, 6200, null], [2026, 8, 6500, null], [2026, 9, 6200, null], [2026, 10, 5800, null], [2026, 11, 5000, null], [2026, 12, 4200, null]] },
                    { n: "Petras Aukštikalnis", q: [[2025, 1, 68000, 69953], [2025, 2, 62000, 61552], [2025, 3, 69000, 69892], [2025, 4, 62000, 65739], [2025, 5, 62000, 65678], [2025, 6, 62000, 66238], [2025, 7, 68000, 69035], [2025, 8, 62000, 63368], [2025, 9, 62000, 59804]] },
                    { n: "Aronas Adomonis", q: [[2025, 1, 176000, 176799], [2025, 2, 166000, 165918], [2025, 3, 180000, 181022], [2025, 4, 160000, 163351], [2025, 5, 165000, 165111], [2025, 6, 165000, 168293], [2025, 7, 170000, 173268], [2025, 8, 160000, 158270], [2025, 9, 160000, 162974]] },
                    { n: "Kirdonių ŽŪB", q: [[2025, 1, 250000, 263804], [2025, 2, 250000, 248723], [2025, 3, 270000, 281029], [2025, 4, 270000, 271223], [2025, 5, 270000, 287272], [2025, 6, 270000, 267654], [2025, 7, 270000, 290260], [2025, 8, 280000, 277781], [2025, 9, 240000, 246885]] },
                    { n: "ŽŪB \"Agaro riešutas\"", q: [[2025, 1, 128000, 129005], [2025, 2, 124000, 121257], [2025, 3, 130000, 130387], [2025, 4, 128000, 123484], [2025, 5, 130000, 132927], [2025, 6, 140000, 146749], [2025, 7, 150000, 158937], [2025, 8, 121000, 154279], [2025, 9, 140000, 141013], [2025, 10, 130000, 136843], [2025, 11, 128000, 137814], [2025, 12, 130000, 141886], [2026, 1, 140000, 140000], [2026, 2, 145000, 145000], [2026, 3, 135000, 135000], [2026, 4, 140000, null], [2026, 5, 150000, null], [2026, 6, 150000, null], [2026, 7, 155000, null], [2026, 8, 160000, null], [2026, 9, 150000, null], [2026, 10, 145000, null], [2026, 11, 140000, null], [2026, 12, 135000, null]] },
                    { n: "ŽŪB \"Draugystė\"", q: [[2025, 1, 380000, 391058], [2025, 2, 360000, 350242], [2025, 3, 420000, 424501], [2025, 4, 420000, 408796], [2025, 5, 400000, 400798], [2025, 6, 400000, 390959], [2025, 7, 400000, 406394], [2025, 8, 400000, 389866], [2025, 9, 400000, 369096]] },
                    { n: "UAB \"Tetirvinai\"", q: [[2025, 2, 1120000, 1157000], [2025, 3, 1240000, 1092280], [2025, 4, 1178000, 1210020], [2025, 5, 1178000, 1254200], [2025, 6, 1230000, 1238080], [2025, 7, 1320000, 1323920], [2025, 8, 1320000, 1415540], [2025, 9, 1350000, 1330580], [2025, 10, 674000, 657340]] },
                    { n: "Koop. \"Pieno Puta\"", q: [[2025, 1, 500000, 476760], [2025, 2, 320000, 312200], [2025, 3, 350000, 345540], [2025, 4, 350000, 354080], [2025, 5, 430000, 448980], [2025, 6, 500000, 492080], [2025, 7, 530000, 478940], [2025, 8, 650000, 638140], [2025, 9, 650000, 603620], [2025, 10, 560000, 537740], [2025, 11, 370000, 358740], [2025, 12, 300000, 303240], [2026, 1, 400000, 400000], [2026, 2, 400000, 400000], [2026, 3, 500000, 500000], [2026, 4, 530000, null]] },
                    { n: "UAB \"Šalva\"", q: [[2025, 1, 337000, 353180], [2025, 2, 540000, 523420], [2025, 3, 562000, 550000], [2025, 4, 185000, 182460], [2025, 5, 305000, 322340], [2025, 6, 450000, 477060], [2025, 7, 515000, 506460], [2025, 8, 528000, 566940], [2025, 9, 300000, 301105], [2025, 10, 180000, 167880], [2025, 11, 130000, 128760], [2025, 12, 368000, 341440], [2026, 1, 400000, 400000], [2026, 2, 300000, 300000], [2026, 3, 320000, 320000], [2026, 4, 330000, null]] },
                    { n: "UAB \"Biržų Pienas\"", q: [[2025, 1, 175000, 176003], [2025, 2, 150000, 148688], [2025, 3, 160000, 155660], [2025, 4, 150000, 150068], [2025, 5, 158000, 158880], [2025, 6, 168000, 168519], [2025, 7, 180000, 175693], [2025, 8, 180000, 183293], [2025, 9, 170000, 173416], [2025, 10, 170000, 162951], [2025, 11, 140000, 139284], [2025, 12, 145000, 144388], [2026, 1, 145000, 145000], [2026, 2, 140000, 140000], [2026, 3, 170000, 170000], [2026, 4, 195000, null]] },
                    { n: "UAB \"Pieno partneriai\"", q: [[2025, 1, 500000, 495640], [2025, 2, 380000, 384860], [2025, 3, 525000, 516000], [2025, 4, 350000, 357780], [2025, 5, 350000, 348000], [2025, 6, 600000, 597260], [2025, 7, 700000, 700400], [2025, 8, 700000, 632620], [2025, 9, 750000, 719248], [2025, 10, 700000, 675200], [2025, 11, 700000, 655220], [2025, 12, 700000, 695620], [2026, 1, 700000, 700000], [2026, 2, 750000, 750000], [2026, 3, 800000, 800000], [2026, 4, 800000, null]] },
                    { n: "ŽŪK \"Rešketėnai\"", q: [[2025, 3, 320000, 340000], [2025, 6, 375000, 400240], [2025, 7, 400000, 420520], [2025, 8, 400000, 394540], [2025, 9, 400000, 414680], [2025, 10, 460000, 497820], [2025, 11, 800000, 822120], [2025, 12, 550000, 572820], [2026, 1, 480000, 480000], [2026, 2, 350000, 350000], [2026, 3, 400000, 400000], [2026, 4, 400000, null]] },
                    { n: "AB \"Pieno žvaigždės\"", q: [[2025, 1, 45000, 47180], [2025, 11, 20000, 21120]] },
                    { n: "UAB \"AUGA trade\"", q: [[2025, 1, 413000, 420128], [2025, 2, 445000, 419109], [2025, 3, 526000, 503736], [2025, 4, 355000, 375535], [2025, 5, 435000, 444051], [2025, 6, 538000, 511718], [2025, 7, 398000, 390069], [2025, 8, 398000, 461474], [2025, 9, 453000, 438177], [2025, 10, 427000, 415186], [2025, 11, 390000, 335143], [2025, 12, 235000, 218386], [2026, 1, 112000, 112000], [2026, 2, 92000, 92000], [2026, 3, 109000, 109000], [2026, 4, 113000, null]] },
                    { n: "ŽŪK Pienas LT", q: [[2025, 5, 207000, 214660], [2025, 10, 125000, 118680], [2025, 12, 30000, 44300], [2026, 2, 700000, 700000], [2026, 3, 775000, 775000], [2026, 4, 690000, null]] },
                    { n: "KB \"Žalioji lanka\"", q: [[2026, 2, 60000, 60000], [2026, 3, 280000, 280000], [2026, 4, 310000, null]] },
                ];
                let totalCreated = 0;
                let unmatched = [];
                for (const entry of QUOTA_SEED) {
                    const supplier = matchSupplier(entry.n);
                    if (!supplier) {
                        unmatched.push(entry.n);
                        continue;
                    }
                    for (const [year, month, quotaKg, actualKg] of entry.q) {
                        try {
                            await prisma.supplierQuota.upsert({
                                where: { supplierId_year_month: { supplierId: supplier.id, year, month } },
                                create: { supplierId: supplier.id, year, month, quotaKg, actualKg },
                                update: { quotaKg, actualKg },
                            });
                            totalCreated++;
                        }
                        catch (err) {
                            console.warn(`  [SEED-QUOTA] Failed for ${supplier.name} ${year}-${month}:`, err?.message ?? err);
                        }
                    }
                    console.log(`  [SEED-QUOTA] ${supplier.name}: ${entry.q.length} quotas`);
                }
                console.log(`[SEED] Supplier quotas seeded: ${totalCreated} records.`);
                if (unmatched.length > 0)
                    console.warn(`[SEED-QUOTA] Unmatched suppliers: ${unmatched.join(', ')}`);
            }
            else {
                console.log(`[SEED] Supplier quotas already exist (${existingCount} records), skipping seed.`);
            }
        }
        catch (err) {
            console.warn('[SEED] Supplier quota seeding failed (non-fatal):', err?.message ?? err);
        }
    }
    app.listen(port, host, () => {
        console.log(`[BOOT] listening on ${host}:${port}`);
    });
}
startServer().catch(err => {
    console.error('Failed to start server:', err);
});
