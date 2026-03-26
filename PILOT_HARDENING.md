# Pilot hardening summary

## Changelog
- Added reusable client validation, draft persistence, and unsaved-change warnings for intake, dispatch, and master-data forms.
- Added session event messaging plus retry-first auth handling before redirecting to sign-in.
- Tightened backend payload validation for intake, output, dispatch, and shipment routes.
- Replaced operator-facing labels: `AI` → `Insights`, `Database` → `Master Data`.
- Removed client-side Gemini key exposure from the Vite build config.
- Added baseline ESLint, Prettier, and helper unit tests.

## Risky areas touched
- Auth token acquisition and authenticated fetch retry flow.
- Intake, dispatch, shipment, supplier, buyer, product, and contract form submit paths.
- Backend request validation in [server.ts](server.ts).
- Session notice banner wiring in [components/NordicLogApp.tsx](components/NordicLogApp.tsx).

## Manual QA checklist
- Sign in, let the token expire, and confirm the app shows a session notice before redirecting.
- Enter partial intake data, refresh the page, and verify the draft is restored.
- Try invalid intake, output, dispatch, shipment, supplier, buyer, product, and contract data and confirm save buttons stay blocked.
- Create, edit, and delete intake/output/dispatch entries and confirm stock/revenue totals still update.
- Export invoice and monthly report and confirm auth retry still allows download.
- Confirm CORS still works for approved origins and blocks unexpected origins.
- Run lint, test, and build before pilot release.
