import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { fileURLToPath } from 'node:url';

// Modes:
//   (default)  standalone web app  -> dist/
//   phone      dev server over self-signed HTTPS so a phone on the LAN gets mic/camera
//   artifact   build for hosting as a Claude artifact (fonts inlined, no service worker) -> dist-artifact/
export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact';
  return {
    base: './',
    plugins: [react(), mode === 'phone' ? basicSsl() : null].filter(Boolean),
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    define: { __ARTIFACT__: JSON.stringify(artifact) },
    worker: { format: 'es' as const },
    build: {
      outDir: artifact ? 'dist-artifact' : 'dist',
      target: 'es2022',
      // The artifact host only loads fonts that are inlined, so inline every asset under 300 kB there.
      assetsInlineLimit: artifact ? 300_000 : 4096,
      chunkSizeWarningLimit: 3000,
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      testTimeout: 30_000,
    },
  };
});
