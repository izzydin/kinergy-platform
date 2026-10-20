import * as fs from 'fs';
import * as path from 'path';

describe('Architectural Boundary: Browser-Safe Package & Export Integrity (Work Package 1.5)', () => {
  const coreSrcDir = path.resolve(__dirname, '..');
  const corePackageJsonPath = path.resolve(__dirname, '../../package.json');
  const webSrcDir = path.resolve(__dirname, '../../../../apps/web/src');
  const rootIndexFile = path.resolve(coreSrcDir, 'index.ts');
  const serverIndexFile = path.resolve(coreSrcDir, 'server.ts');

  const FORBIDDEN_SERVER_MODULES = [
    '@nestjs',
    '@nestjs/common',
    '@nestjs/core',
    '@nestjs/swagger',
    '@prisma/client',
    '@prisma',
    '.prisma',
    'express',
    'fastify',
    'ioredis',
    'argon2',
  ];

  /**
   * Recursively discovers all files imported or re-exported starting from an entry point.
   */
  function traceReachableModuleGraph(
    entryFilePath: string,
    visited: Set<string> = new Set(),
  ): Set<string> {
    if (visited.has(entryFilePath) || !fs.existsSync(entryFilePath)) {
      return visited;
    }
    visited.add(entryFilePath);

    const content = fs.readFileSync(entryFilePath, 'utf-8');
    const currentDir = path.dirname(entryFilePath);

    // Matches relative imports and re-exports: (import|export) ... from './...'
    const importExportRegex = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"](\.[^'"]+)['"]/g;
    let match: RegExpExecArray | null;

    while ((match = importExportRegex.exec(content)) !== null) {
      const relativeImport = match[1];
      if (!relativeImport) continue;

      const candidates = [
        path.resolve(currentDir, relativeImport),
        path.resolve(currentDir, `${relativeImport}.ts`),
        path.resolve(currentDir, `${relativeImport}.tsx`),
        path.resolve(currentDir, `${relativeImport}.d.ts`),
        path.resolve(currentDir, relativeImport, 'index.ts'),
        path.resolve(currentDir, relativeImport, 'index.tsx'),
      ];

      for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          traceReachableModuleGraph(candidate, visited);
          break;
        }
      }
    }

    return visited;
  }

  function getAllProductionSourceFiles(dirPath: string): string[] {
    const files: string[] = [];
    if (!fs.existsSync(dirPath)) return files;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...getAllProductionSourceFiles(fullPath));
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
        !entry.name.endsWith('.spec.ts') &&
        !entry.name.endsWith('.spec.tsx') &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.test.tsx')
      ) {
        files.push(fullPath);
      }
    }
    return files;
  }

  describe('1. Public Root Entry Point (@kinergy-platform/core) Purity', () => {
    it('ensures root index.ts exists and only points to browser-safe domain/application logic', () => {
      expect(fs.existsSync(rootIndexFile)).toBe(true);
      const content = fs.readFileSync(rootIndexFile, 'utf-8');

      // Root index must not re-export infrastructure directly
      expect(content).not.toMatch(/from\s+['"].*infrastructure.*['"]/i);
    });

    it('ensures zero forbidden server dependencies anywhere in the transitive dependency graph reachable from index.ts', () => {
      const reachableGraph = traceReachableModuleGraph(rootIndexFile);
      expect(reachableGraph.size).toBeGreaterThan(20);

      const violations: Array<{ file: string; forbiddenModule: string }> = [];

      for (const filePath of reachableGraph) {
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const forbidden of FORBIDDEN_SERVER_MODULES) {
          const importPattern = new RegExp(`from\\s+['"]${forbidden}(?:/.*)?['"]`, 'i');
          if (importPattern.test(content)) {
            violations.push({
              file: path.relative(coreSrcDir, filePath),
              forbiddenModule: forbidden,
            });
          }
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe('2. Dedicated Server Entry Point (@kinergy-platform/core/server) Isolation', () => {
    it('ensures server.ts exists and houses server infrastructure adapters', () => {
      expect(fs.existsSync(serverIndexFile)).toBe(true);
      const serverContent = fs.readFileSync(serverIndexFile, 'utf-8');

      expect(serverContent).toContain('./scheduling/infrastructure');
      expect(serverContent).toContain('./kinesiology/infrastructure');
      expect(serverContent).toContain('./gym/infrastructure');
      expect(serverContent).toContain('./resources/infrastructure');
      expect(serverContent).toContain('./sales/infrastructure');
    });

    it('ensures packages/core/package.json declares explicit subpath exports', () => {
      const packageJson = JSON.parse(fs.readFileSync(corePackageJsonPath, 'utf-8'));

      expect(packageJson.exports).toBeDefined();
      expect(packageJson.exports['.']).toBeDefined();
      expect(packageJson.exports['.']['types']).toBe('./src/index.ts');
      expect(packageJson.exports['./server']).toBeDefined();
      expect(packageJson.exports['./server']['types']).toBe('./src/server.ts');
    });
  });

  describe('3. Frontend Consumer Non-Contamination (apps/web)', () => {
    it('guarantees that no web production code imports from @kinergy-platform/core/server or backend libraries', () => {
      const webFiles = getAllProductionSourceFiles(webSrcDir);
      expect(webFiles.length).toBeGreaterThan(0);

      const violations: Array<{ file: string; forbiddenModule: string }> = [];

      for (const filePath of webFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');

        // Check for forbidden server subpath
        if (/from\s+['"]@kinergy-platform\/core\/server['"]/i.test(content)) {
          violations.push({
            file: path.relative(webSrcDir, filePath),
            forbiddenModule: '@kinergy-platform/core/server',
          });
        }

        // Check for direct server modules
        for (const forbidden of FORBIDDEN_SERVER_MODULES) {
          const importPattern = new RegExp(`from\\s+['"]${forbidden}(?:/.*)?['"]`, 'i');
          if (importPattern.test(content)) {
            violations.push({
              file: path.relative(webSrcDir, filePath),
              forbiddenModule: forbidden,
            });
          }
        }
      }

      expect(violations).toEqual([]);
    });
  });
});
