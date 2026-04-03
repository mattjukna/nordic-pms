import prisma from './prisma';
export async function logAudit(req, params) {
    try {
        const { action, tableName, recordId } = params;
        const details = params.details ?? null;
        const userEmail = (req && req.user && req.user.email) ? req.user.email : (process.env.AUTH_DISABLED ? 'AUTH_DISABLED' : 'unknown');
        const detailsString = typeof details === 'string' ? details : JSON.stringify(details ?? {});
        await prisma.auditLog.create({ data: {
                userEmail,
                action,
                tableName,
                recordId: recordId ?? null,
                details: detailsString,
                timestamp: BigInt(Date.now())
            } });
    }
    catch (err) {
        console.error('[AUDIT] failed to write audit log:', err?.message ?? err);
    }
}
export default logAudit;
