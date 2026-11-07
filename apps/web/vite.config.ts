import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    root: __dirname,
    cacheDir: '../../node_modules/.vite/apps/web',

    define: {
      'import.meta.env.DEV': JSON.stringify(mode !== 'production'),
      'import.meta.env.PROD': JSON.stringify(mode === 'production'),
      __CLIENT_ENV__: JSON.stringify({
        MODE: mode,
        VITE_API_BASE_URL:
          env.VITE_API_BASE_URL ||
          (mode === 'production' ? '/api/v1' : 'http://localhost:3000/api/v1'),
        VITE_APP_TITLE: env.VITE_APP_TITLE || 'Kinergy Platform',
        VITE_ENABLE_MSW: env.VITE_ENABLE_MSW === 'true',
        VITE_ENABLE_TELEMETRY: env.VITE_ENABLE_TELEMETRY !== 'false',
      }),
    },

    server: {
      port: 4200,
      host: 'localhost',
    },

    preview: {
      port: 4300,
      host: 'localhost',
    },

    plugins: [react()],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@app': path.resolve(__dirname, './src/app'),
        '@modules': path.resolve(__dirname, './src/modules'),
        '@shared': path.resolve(__dirname, './src/shared'),
        '@kinergy-platform/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
        '@kinergy-platform/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
        '@kinergy-platform/utils': path.resolve(__dirname, '../../packages/utils/src/index.ts'),
        '@kinergy-platform/config': path.resolve(__dirname, '../../packages/config/src/index.ts'),
        '@kinergy-platform/validation': path.resolve(
          __dirname,
          '../../packages/validation/src/index.ts',
        ),
        '@kinergy-platform/testing': path.resolve(__dirname, '../../packages/testing/src/index.ts'),
        '@kinergy-platform/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
      },
    },

    build: {
      outDir: '../../dist/apps/web',
      emptyOutDir: true,
      reportCompressedSize: true,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
  };
});
