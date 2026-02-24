<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/12a4bb4e-88a0-4845-8cc7-36d8dc0ecb69

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
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
- `AUTH_DISABLED` (optional; set to `true` to bypass auth for local debugging)

After installing dependencies, run `npm install` then `npm run dev` and open http://localhost:3000. The app will require Microsoft sign-in.
