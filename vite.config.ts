import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = 'http://127.0.0.1:4318';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    open: true,
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
