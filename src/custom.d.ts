// Provide minimal types for Vite's import.meta.env
interface ImportMetaEnv {
	readonly VITE_AAD_CLIENT_ID?: string;
	readonly VITE_AAD_TENANT_ID?: string;
	readonly VITE_AAD_ALLOWED_DOMAIN?: string;
	readonly VITE_AAD_API_SCOPE?: string;
	readonly DEV?: boolean;
	// add other VITE_* keys as needed
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

// Fallback module declarations for libs without bundled types
declare module 'jose';
declare module 'exceljs';
