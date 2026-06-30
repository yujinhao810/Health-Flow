import react from '@vitejs/plugin-react';
import { build, createServer } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const workspaceRoot = resolve(webRoot, '../..');
export const sharedPackageRoot = resolve(workspaceRoot, 'packages/contracts');
export const sharedSource = resolve(sharedPackageRoot, 'src/index.ts');

const baseConfig = {
  configFile: false,
  plugins: [react()],
  resolve: {
    alias: {
      '@health/shared': sharedSource,
    },
  },
};

export async function createWebServer(port = Number(process.env.WEB_PORT || 5173)) {
  const server = await createServer({
    ...baseConfig,
    root: webRoot,
    optimizeDeps: {
      noDiscovery: true,
      include: [],
    },
    server: {
      host: process.env.WEB_HOST || '127.0.0.1',
      port,
      strictPort: false,
      fs: {
        allow: [webRoot, sharedPackageRoot],
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  });

  return server;
}

export async function buildWeb() {
  return build({
    ...baseConfig,
    root: webRoot,
    build: {
      outDir: resolve(webRoot, 'dist'),
      emptyOutDir: true,
    },
  });
}
