import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The E2E suite runs on its own ports so it never collides with `npm run dev`.
const apiTarget = `http://127.0.0.1:${process.env.NOVEL_API_PORT ?? '4318'}`;
const e2e = process.env.NOVEL_E2E === '1';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.NOVEL_CLIENT_PORT ?? '5173'),
    strictPort: true,
    open: !e2e,
    proxy: {
      // changeOrigin sets Host to the API's own host:port so the server's Host check stays strict.
      '/api': { target: apiTarget, changeOrigin: true },
      '/assets': { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist/client',
    // /assets/* is reserved for book images served by the API.
    assetsDir: 'static',
    emptyOutDir: true,
  },
});
