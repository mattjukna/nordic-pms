import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          manifest: {
            name: 'Nordic Proteins PMS',
            short_name: 'Nordic PMS',
            description: 'Production management system for Nordic Proteins',
            theme_color: '#0f172a',
            background_color: '#f8fafc',
            display: 'standalone',
            start_url: '/',
            icons: [
              {
                src: '/Nordic insights app icon.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any',
              },
              {
                src: '/Nordic insights app icon.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any',
              },
              {
                src: '/Nordic insights logo transparent.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'maskable',
              },
              {
                src: '/Nordic insights logo transparent.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
              },
            ],
          },
          workbox: {
            navigateFallback: '/index.html',
            runtimeCaching: [
              {
                urlPattern: /\/api\/.*/,
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'api-cache',
                  expiration: {
                    maxEntries: 100,
                    maxAgeSeconds: 60 * 60 * 24,
                  },
                },
              },
              {
                urlPattern: /\.(?:js|css|woff2?|png|jpg|jpeg|svg|gif|ico)$/,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'static-assets',
                  expiration: {
                    maxEntries: 200,
                    maxAgeSeconds: 60 * 60 * 24 * 30,
                  },
                },
              },
            ],
          },
          devOptions: {
            enabled: false,
          },
        }),
      ],
      define: {
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
