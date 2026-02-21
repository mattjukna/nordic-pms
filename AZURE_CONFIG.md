# Azure Database Configuration

These are the connection details for the Nordic PMS Azure SQL Database.

| Property | Value |
| --- | --- |
| **Resource Group** | `nordic-pms-rg` |
| **Server Name** | `nordic-pms-server-2026` |
| **Admin Username** | `nordicadmin2026` |
| **Password** | `NordPMS_2026` |
| **Database Name** | `nordic-production-db` |
| **Connection String (Template)** | `Server=tcp:nordic-pms-server-2026.database.windows.net,1433;Initial Catalog=nordic-production-db;Persist Security Info=False;User ID=nordicadmin2026;Password=NordPMS_2026;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;` |

*Note: Ensure firewall rules on Azure allow access from the application environment.*
