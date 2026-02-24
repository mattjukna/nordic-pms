import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'import.meta.env.VITE_AAD_CLIENT_ID': JSON.stringify(env.VITE_AAD_CLIENT_ID || ''),
        'import.meta.env.VITE_AAD_TENANT_ID': JSON.stringify(env.VITE_AAD_TENANT_ID || ''),
        'import.meta.env.VITE_AAD_ALLOWED_DOMAIN': JSON.stringify(env.VITE_AAD_ALLOWED_DOMAIN || ''),
        'import.meta.env.VITE_AAD_API_SCOPE': JSON.stringify(env.VITE_AAD_API_SCOPE || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
