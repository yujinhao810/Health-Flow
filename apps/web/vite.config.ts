import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const sharedSource = new URL('../../packages/contracts/src/index.ts', import.meta.url).pathname.replace(
  /^\/(?=[A-Za-z]:)/,
  '',
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@health/shared': sharedSource,
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
