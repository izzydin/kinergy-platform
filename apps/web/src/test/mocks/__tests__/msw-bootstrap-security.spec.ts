import type { AppConfig } from '../../../app/config/app-config';
import { initDebugHelpers } from '../../../shared/debug/debug-helper';
import { initMsw } from '../init-msw';

// Mock the ./browser module so worker.start can be spied on without real ServiceWorker lifecycle
const mockStart = jest.fn();
jest.mock('../browser', () => ({
  worker: {
    start: (...args: unknown[]) => mockStart(...args),
  },
}));

function createMockConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    env: 'development',
    isDev: true,
    isProd: false,
    isTest: false,
    apiBaseUrl: 'http://localhost:3000/api/v1',
    appTitle: 'Kinergy Platform Dev',
    enableTelemetry: false,
    enableMsw: false,
    queryDefaultStaleTimeMs: 300000,
    queryMaxRetries: 3,
    ...overrides,
  };
}

describe('Step 6 — MSW and Development Tooling Bootstrap Security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStart.mockResolvedValue(undefined);
    delete window.__KINERGY_DEBUG__;
  });

  describe('1. MSW Initialization Policy', () => {
    it('strictly forbids MSW in production mode (even if enableMsw is true)', async () => {
      const prodConfig = createMockConfig({
        env: 'production',
        isProd: true,
        isDev: false,
        enableMsw: true,
      });

      const result = await initMsw(prodConfig);

      expect(result).toEqual({ initialized: false, reason: 'production_mode' });
      expect(mockStart).not.toHaveBeenCalled();
    });

    it('skips MSW in non-development mode (test mode)', async () => {
      const testConfig = createMockConfig({
        env: 'test',
        isProd: false,
        isDev: false,
        isTest: true,
        enableMsw: false,
      });

      const result = await initMsw(testConfig);

      expect(result).toEqual({ initialized: false, reason: 'not_development' });
      expect(mockStart).not.toHaveBeenCalled();
    });

    it('skips MSW in development by default when enableMsw is false (opt-in policy)', async () => {
      const devConfig = createMockConfig({
        env: 'development',
        isDev: true,
        isProd: false,
        enableMsw: false,
      });

      const result = await initMsw(devConfig);

      expect(result).toEqual({ initialized: false, reason: 'opt_out' });
      expect(mockStart).not.toHaveBeenCalled();
    });

    it('starts MSW worker when in development with explicit enableMsw opt-in', async () => {
      const devOptInConfig = createMockConfig({
        env: 'development',
        isDev: true,
        isProd: false,
        enableMsw: true,
      });

      const result = await initMsw(devOptInConfig);

      expect(result).toEqual({ initialized: true });
      expect(mockStart).toHaveBeenCalledTimes(1);
      expect(mockStart).toHaveBeenCalledWith({
        onUnhandledRequest: 'bypass',
        serviceWorker: {
          url: '/mockServiceWorker.js',
        },
      });
    });

    it('handles worker startup failure gracefully without throwing or breaking bootstrap', async () => {
      const startupError = new Error('Service worker registration failed');
      mockStart.mockRejectedValueOnce(startupError);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const devOptInConfig = createMockConfig({
        env: 'development',
        isDev: true,
        isProd: false,
        enableMsw: true,
      });

      const result = await initMsw(devOptInConfig);

      expect(result).toEqual({
        initialized: false,
        reason: 'worker_error',
        error: startupError,
      });
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('2. Debug Helpers Production Boundary', () => {
    it('attaches window.__KINERGY_DEBUG__ only in development environment', () => {
      const devConfig = createMockConfig({
        env: 'development',
        isDev: true,
        isProd: false,
      });

      const success = initDebugHelpers(undefined, devConfig);

      expect(success).toBe(true);
      expect(window.__KINERGY_DEBUG__).toBeDefined();
      expect(window.__KINERGY_DEBUG__?.version).toBe('1.0.0-dev');
    });

    it('strictly forbids window.__KINERGY_DEBUG__ attachment in production mode', () => {
      const prodConfig = createMockConfig({
        env: 'production',
        isDev: false,
        isProd: true,
      });

      const success = initDebugHelpers(undefined, prodConfig);

      expect(success).toBe(false);
      expect(window.__KINERGY_DEBUG__).toBeUndefined();
    });

    it('deletes pre-existing window.__KINERGY_DEBUG__ if attempted in production', () => {
      // Simulate existing debug object in window
      (window as unknown as Record<string, unknown>).__KINERGY_DEBUG__ = { leaked: true };

      const prodConfig = createMockConfig({
        env: 'production',
        isDev: false,
        isProd: true,
      });

      const success = initDebugHelpers(undefined, prodConfig);

      expect(success).toBe(false);
      expect(window.__KINERGY_DEBUG__).toBeUndefined();
    });

    it('strictly forbids window.__KINERGY_DEBUG__ in test environment', () => {
      const testConfig = createMockConfig({
        env: 'test',
        isDev: false,
        isProd: false,
        isTest: true,
      });

      const success = initDebugHelpers(undefined, testConfig);

      expect(success).toBe(false);
      expect(window.__KINERGY_DEBUG__).toBeUndefined();
    });
  });

  describe('3. Production Build Artifact Boundary Verification', () => {
    it('verifies that production build output excludes MSW browser worker and debug helper chunks', async () => {
      const fs = await import('fs');
      const path = await import('path');

      const distAssetsDir = path.resolve(__dirname, '../../../../../../dist/apps/web/assets');

      if (fs.existsSync(distAssetsDir)) {
        const assetFiles = fs.readdirSync(distAssetsDir);

        // 1. Ensure no browser-*.js chunk is present in production output
        const mswChunks = assetFiles.filter((f) => f.startsWith('browser-') && f.endsWith('.js'));
        expect(mswChunks).toEqual([]);

        // 2. Scan emitted JS bundle for MSW worker initialization or debug helper registration
        const jsBundles = assetFiles.filter((f) => f.endsWith('.js'));
        for (const bundle of jsBundles) {
          const content = fs.readFileSync(path.join(distAssetsDir, bundle), 'utf-8');
          expect(content).not.toContain('setupWorker');
          expect(content).not.toContain('mockServiceWorker.js');
          expect(content).not.toContain('__KINERGY_DEBUG__');
        }
      }
    });
  });
});
