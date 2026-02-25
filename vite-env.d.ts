/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AAD_CLIENT_ID?: string;
  readonly VITE_AAD_TENANT_ID?: string;
  readonly VITE_AAD_ALLOWED_DOMAIN?: string;
  readonly VITE_AAD_API_SCOPE?: string;
  // add other VITE_* keys as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
