import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  // Tell Prisma where the schema is located from the root
  schema: "nordic-backend/prisma/schema.prisma",
  datasource: {
     // Use raw process.env access to avoid PrismaConfigEnvError during CI builds
     // when the `DATABASE_URL` secret isn't set. This prevents Prisma v7's
     // env() helper from throwing during build-time.
     url: process.env.DATABASE_URL || 'sqlserver://localhost:1433',
  },
});
