import { PrismaClient } from '@prisma/client'
import { PrismaMssql } from '@prisma/adapter-mssql'

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

// Create adapter using DATABASE_URL directly to avoid Prisma env() crashes
const adapter = new PrismaMssql(process.env.DATABASE_URL || '')

export const prisma = globalThis.__prisma ?? new PrismaClient({ adapter, log: ['error', 'warn'] })

if (process.env.NODE_ENV !== 'production') globalThis.__prisma = prisma

export default prisma
