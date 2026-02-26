import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  // Tell Prisma where the schema is located from the root
  schema: "nordic-backend/prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
