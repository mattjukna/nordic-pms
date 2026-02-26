import { PrismaClient } from '@prisma/client'

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

// Attempt to load the MSSQL adapter dynamically. If it's not installed
// we continue without it so the app can still start; users can install
// the adapter in production if needed.
let adapter: any | undefined
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('@prisma/adapter-mssql')
  const PrismaMssql = mod?.PrismaMssql || mod?.default || mod
  if (PrismaMssql) {
    adapter = new PrismaMssql(process.env.DATABASE_URL || '')
  }
} catch (err: any) {
  console.warn('[BOOT] @prisma/adapter-mssql not installed or failed to load:', err?.message || err)
}

const clientOptions: any = adapter ? { adapter, log: ['error', 'warn'] } : { log: ['error', 'warn'] }
export const prisma = globalThis.__prisma ?? new PrismaClient(clientOptions as any)

if (process.env.NODE_ENV !== 'production') globalThis.__prisma = prisma

export default prisma
