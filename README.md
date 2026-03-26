<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Nordic Proteins PM

This repository contains the Nordic Proteins production, stock, dispatch, and master-data app.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Configure the required authentication and backend environment variables.
3. Run the app:
   `npm run dev`

## Authentication (MSAL / Azure AD)

This app uses Microsoft Entra ID (Azure AD) for authentication. Add the following to your `.env` or use the provided `.env.example`:

- `VITE_AAD_CLIENT_ID`
- `VITE_AAD_TENANT_ID`
- `VITE_AAD_ALLOWED_DOMAIN` (e.g. nordicproteins.com)
- `VITE_AAD_API_SCOPE` (e.g. api://<client-id>/access_as_user)

Backend env vars:

- `AAD_CLIENT_ID`
- `AAD_TENANT_ID`
- `AAD_ALLOWED_DOMAIN`
- `CORS_ALLOWED_ORIGINS` (semicolon- or comma-separated allowlist; defaults to localhost)
- `AUTH_DISABLED` (optional; set to `true` to bypass auth for local debugging)

After installing dependencies, run `npm install` then `npm run dev` and open http://localhost:3000. The app will require Microsoft sign-in.

## Company import

Use the Prisma-based importer to load buyer and supplier company data directly into SQL Server without going through the HTTP API.

### Run

- Dry run: `npm run import:companies -- --dry-run`
- Write data: `npm run import:companies`
- Custom files: `npm run import:companies -- --file ../entities_master.csv --buyers-file ../buyers_clean.csv --suppliers-file ../suppliers_clean.csv`
- Allow empty CSV values to clear existing DB values: `npm run import:companies -- --allow-empty-overwrite`

### Expected CSV columns

The importer reads `entities_master.csv` and, when present, supplements it with `buyers_clean.csv` and `suppliers_clean.csv`.

- Master columns used: `entity_uid`, `canonical_name`, `canonical_address`, `phones`, `source_roles`, `is_buyer`, `is_supplier`, `buyer_source_codes`, `supplier_source_codes`, `all_source_codes`
- Optional overlay columns used: `entity_uid`, `name_clean`, `address_clean`, `phones`, `source_code`
- Also supported when present: `company_code`, `phone`, `country`, `address_line_1`, `address_line_2`, `created_on`, `route_group`, `contract_quota`, `base_price_per_kg`, `normal_milk_price_per_kg`, `fat_bonus_per_pct`, `protein_bonus_per_pct`, `is_eco`, `default_milk_type`

### Duplicate detection

- Existing buyers/suppliers are matched by `companyCode` first when a single non-ambiguous code is available.
- If no usable code is available, the importer falls back to normalized `name` matching.
- Normalized names trim whitespace, collapse repeated spaces, and compare case-insensitively.
- Ambiguous matches are logged and skipped instead of guessed.

## Quality checks

- Lint: `npm run lint`
- Format check: `npm run format:check`
- Tests: `npm run test`
- Pilot hardening notes: [PILOT_HARDENING.md](PILOT_HARDENING.md)
