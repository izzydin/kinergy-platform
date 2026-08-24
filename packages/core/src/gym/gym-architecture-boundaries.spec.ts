import * as fs from 'fs';
import * as path from 'path';

describe('Phase 5: Gym Management Bounded Context Architecture & Boundary Purity', () => {
  const gymDomainPath = path.resolve(__dirname, 'domain');
  const gymApplicationPath = path.resolve(__dirname, 'application');
  const apiGymControllersPath = path.resolve(__dirname, '../../../../apps/api/src/gym/controllers');
  const webGymModulesPath = path.resolve(__dirname, '../../../../apps/web/src/modules/gym');

  function getProductionTsFiles(dirPath: string): string[] {
    const files: string[] = [];
    if (!fs.existsSync(dirPath)) return files;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...getProductionTsFiles(fullPath));
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
        !entry.name.endsWith('.spec.ts') &&
        !entry.name.endsWith('.spec.tsx')
      ) {
        files.push(fullPath);
      }
    }
    return files;
  }

  it('Domain Layer Purity: zero foreign bounded context, infrastructure, or framework imports in Gym Domain', () => {
    const domainFiles = getProductionTsFiles(gymDomainPath);
    expect(domainFiles.length).toBeGreaterThan(0);

    const forbiddenPatterns = [
      '@prisma',
      'prisma',
      '@nestjs',
      'scheduling',
      'kinesiology',
      'client-domain',
      'identity',
      'express',
      'fastify',
      'axios',
      '../infrastructure',
      '../../infrastructure',
    ];

    for (const filePath of domainFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const pattern of forbiddenPatterns) {
        const importRegex = new RegExp(`from\\s+['"].*${pattern}.*['"]`, 'i');
        const hasViolation = importRegex.test(content);
        if (hasViolation) {
          throw new Error(
            `Domain Purity Violation: File '${filePath}' contains forbidden import matching '${pattern}'.`,
          );
        }
      }
    }
  });

  it('Application Layer Purity: zero infrastructure or foreign database access in Gym Application layer', () => {
    const applicationFiles = getProductionTsFiles(gymApplicationPath);
    expect(applicationFiles.length).toBeGreaterThan(0);

    const forbiddenPatterns = [
      '@prisma',
      'PrismaClient',
      '@nestjs/common',
      'scheduling/infrastructure',
      'kinesiology/infrastructure',
      'client/infrastructure',
      '../infrastructure',
      '../../infrastructure',
    ];

    for (const filePath of applicationFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const pattern of forbiddenPatterns) {
        const importRegex = new RegExp(`from\\s+['"].*${pattern}.*['"]`, 'i');
        const hasViolation = importRegex.test(content);
        if (hasViolation) {
          throw new Error(
            `Application Layer Violation: File '${filePath}' contains forbidden import matching '${pattern}'.`,
          );
        }
      }
    }
  });

  it('API Controllers Boundary: controllers must not invoke Prisma directly or contain domain state calculations', () => {
    const controllerFiles = getProductionTsFiles(apiGymControllersPath).filter((f) =>
      f.endsWith('.controller.ts'),
    );
    expect(controllerFiles.length).toBeGreaterThan(0);

    for (const filePath of controllerFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');

      // 1. No direct Prisma client injection in controllers
      expect(content).not.toMatch(/PrismaService/);
      expect(content).not.toMatch(/@prisma\/client/);

      // 2. Controllers must delegate to CQRS handlers
      expect(content).toMatch(/Handler/);
    }
  });

  it('Frontend Boundary: Web UI modules must communicate via API transport and not import backend domain aggregates', () => {
    const webFiles = getProductionTsFiles(webGymModulesPath);
    expect(webFiles.length).toBeGreaterThan(0);

    const forbiddenPatterns = [
      'packages/core/src/gym/domain',
      '@prisma',
      'PrismaClient',
      'membership.aggregate',
      'membership-plan.aggregate',
      'attendance-record.aggregate',
    ];

    for (const filePath of webFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const pattern of forbiddenPatterns) {
        const importRegex = new RegExp(`from\\s+['"].*${pattern}.*['"]`, 'i');
        const hasViolation = importRegex.test(content);
        if (hasViolation) {
          throw new Error(
            `Frontend Boundary Violation: File '${filePath}' contains forbidden domain import matching '${pattern}'.`,
          );
        }
      }
    }
  });

  it('Cross-Context Ownership: Client identity is only referenced by scalar ID (clientId), not by embedding Client aggregates', () => {
    const domainFiles = getProductionTsFiles(gymDomainPath);
    for (const filePath of domainFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).not.toMatch(/import\s+.*\bClient\b.*from/);
      expect(content).not.toMatch(/import\s+.*\bUser\b.*from/);
    }
  });
});
