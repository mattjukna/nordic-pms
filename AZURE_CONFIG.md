# Azure Database Configuration (Template)

This file provides a sanitized template for configuring an Azure SQL Database connection for local development. Do NOT place secrets here; use a `.env` file with a `DATABASE_URL` environment variable.

Example placeholder values:

| Property | Value |
| --- | --- |
| **Server Name** | <your-server-name>.database.windows.net |
| **Admin Username** | <db-admin-username> |
| **Password** | <db-password> |
| **Database Name** | <database-name> |
| **Connection String (Template)** | Server=tcp:<your-server-name>.database.windows.net,1433;Initial Catalog=<database-name>;Persist Security Info=False;User ID=<db-admin-username>;Password=<db-password>;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30; |

Usage notes:

- Add the full connection string to a local `.env` file as `DATABASE_URL` in Prisma format. For example:

	DATABASE_URL="sqlserver://<user>:<password>@<your-server-name>.database.windows.net:1433;database=<database-name>;encrypt=true;trustServerCertificate=false"

- Do not commit your `.env` file to the repository. This document intentionally contains placeholders only.
