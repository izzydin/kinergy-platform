import * as fs from 'fs';
import * as path from 'path';

/**
 * Authoritative Architecture Verification Test Suite for Gym Management (Phase 5.1-G).
 * Structurally protects bounded context isolation, domain layer purity, public API boundaries,
 * and documentation integrity.
 */

describe('Gym Management Bounded Context Architecture & Boundary Verification (Phase 5.1-G)', () => {
  const gymDomainPath = path.resolve(__dirname, 'domain');
  const gymApplicationPath = path.resolve(__dirname, 'application');
  const schedulingPath = path.resolve(__dirname, '../scheduling');
  const kinesiologyPath = path.resolve(__dirname, '../kinesiology');
  const clientPath = path.resolve(__dirname, '../../../../modules/client');
  const identityPath = path.resolve(__dirname, '../../../../apps/api/src/platform/identity');

  function getProductionTsFiles(dirPath: string): string[] {
    const files: string[] = [];
    if (!fs.existsSync(dirPath)) return files;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...getProductionTsFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  describe('1. Domain Layer Independence & Framework Freedom', () => {
    it('should guarantee zero foreign aggregate, framework or Prisma dependencies in Gym Domain production code', () => {
      const domainFiles = getProductionTsFiles(gymDomainPath);

      const forbiddenPatterns = [
        '@prisma',
        'prisma',
        '@nestjs',
        'scheduling/domain/appointment/appointment.aggregate',
        'scheduling/domain/room',
        'kinesiology/domain',
        'client-domain/domain',
        'modules/client/domain',
        'platform/identity/domain',
        'express',
        'fastify',
      ];

      for (const filePath of domainFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const pattern of forbiddenPatterns) {
          const importRegex = new RegExp(`from\\s+['"].*${pattern}.*['"]`, 'i');
          const hasViolation = importRegex.test(content);
          if (hasViolation) {
            throw new Error(
              `Architecture Violation: File '${filePath}' contains forbidden import matching '${pattern}'.`,
            );
          }
        }
      }
    });

    it('should guarantee zero direct foreign domain aggregate imports in Gym Application production code', () => {
      const applicationFiles = getProductionTsFiles(gymApplicationPath);

      const forbiddenPatterns = [
        'scheduling/domain/appointment/appointment.aggregate',
        'scheduling/domain/room/room.aggregate',
        'kinesiology/domain/treatment-session/treatment-session.aggregate',
        'modules/client/domain/aggregates/client.aggregate',
        'platform/identity/domain/user.entity',
        'scheduling/infrastructure',
        'kinesiology/infrastructure',
      ];

      for (const filePath of applicationFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const pattern of forbiddenPatterns) {
          const importRegex = new RegExp(`from\\s+['"].*${pattern}.*['"]`, 'i');
          const hasViolation = importRegex.test(content);
          if (hasViolation) {
            throw new Error(
              `Architecture Violation: Gym Application File '${filePath}' contains forbidden import matching '${pattern}'.`,
            );
          }
        }
      }
    });
  });

  describe('2. Bounded Context Reverse Isolation (Zero Leaks to Peer Contexts)', () => {
    it('should guarantee Scheduling, Kinesiology, Client, and Identity do not import Gym domain internals', () => {
      const foreignContextFiles = [
        ...getProductionTsFiles(schedulingPath),
        ...getProductionTsFiles(kinesiologyPath),
        ...getProductionTsFiles(clientPath),
        ...getProductionTsFiles(identityPath),
      ];

      expect(foreignContextFiles.length).toBeGreaterThan(0);

      const forbiddenInternalPatterns = [
        'gym/domain/membership',
        'gym/domain/attendance',
        'gym/domain/plan',
        'gym/infrastructure',
      ];

      for (const filePath of foreignContextFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const pattern of forbiddenInternalPatterns) {
          const importRegex = new RegExp(`from\\s+['"].*${pattern}.*['"]`, 'i');
          const hasViolation = importRegex.test(content);
          if (hasViolation) {
            throw new Error(
              `Boundary Leak Violation: Foreign file '${filePath}' illegally imports Gym internal '${pattern}'.`,
            );
          }
        }
      }
    });
  });

  describe('3. Public Barrel & Package Exports Verification', () => {
    it('should export Gym bounded context name and adhere to public barrel boundaries', () => {
      const gymIndexPath = path.resolve(__dirname, 'index.ts');
      const coreIndexPath = path.resolve(__dirname, '../index.ts');

      expect(fs.existsSync(gymIndexPath)).toBe(true);
      expect(fs.existsSync(coreIndexPath)).toBe(true);

      const gymIndexContent = fs.readFileSync(gymIndexPath, 'utf-8');
      expect(gymIndexContent).toContain('GYM_BOUNDED_CONTEXT_NAME');
      expect(gymIndexContent).toContain("export * from './domain'");

      const coreIndexContent = fs.readFileSync(coreIndexPath, 'utf-8');
      expect(coreIndexContent).toContain("export * from './gym'");
    });

    it('should cleanly export Membership aggregate, Value Objects, and Domain Events without kernel collision', () => {
      const domainIndexPath = path.resolve(__dirname, 'domain/index.ts');
      expect(fs.existsSync(domainIndexPath)).toBe(true);

      const domainIndexContent = fs.readFileSync(domainIndexPath, 'utf-8');
      expect(domainIndexContent).toContain("export * from './exceptions'");
      expect(domainIndexContent).toContain("export * from './membership'");
      expect(domainIndexContent).toContain("export * from './events'");
      // Must not re-export ./shared directly to prevent global collision with root kernel
      expect(domainIndexContent).not.toContain("export * from './shared'");
    });
  });

  describe('4. Architecture Documentation & ADR Integrity Verification', () => {
    it('should verify all Phase 5.1 ADRs exist, are accepted, and are indexed in docs/adr/README.md', () => {
      const adrIndexPath = path.resolve(__dirname, '../../../../docs/adr/README.md');
      expect(fs.existsSync(adrIndexPath)).toBe(true);

      const adrIndexContent = fs.readFileSync(adrIndexPath, 'utf-8');
      const requiredAdrs = ['0054', '0055', '0056', '0057', '0058'];

      for (const adrNum of requiredAdrs) {
        expect(adrIndexContent).toContain(`[${adrNum}]`);
        const adrFiles = fs
          .readdirSync(path.resolve(__dirname, '../../../../docs/adr'))
          .filter((f) => f.startsWith(adrNum));
        expect(adrFiles.length).toBe(1);
        const adrFileName = adrFiles[0]!;

        const adrContent = fs.readFileSync(
          path.resolve(__dirname, '../../../../docs/adr', adrFileName),
          'utf-8',
        );
        expect(adrContent).toContain('Status**: Accepted');
      }
    });

    it('should enforce all Phase 5.1 & 5.3 architecture specification documents exist and contain invariants', () => {
      const contextDocPath = path.resolve(
        __dirname,
        '../../../../docs/architecture/contexts/gym.md',
      );
      const reconDocPath = path.resolve(
        __dirname,
        '../../../../docs/architecture/gym-management-reconnaissance.md',
      );
      const vocabDocPath = path.resolve(__dirname, '../../../../docs/business/gym-vocabulary.md');
      const aggDocPath = path.resolve(
        __dirname,
        '../../../../docs/architecture/gym-aggregate-boundaries.md',
      );
      const lifecycleDocPath = path.resolve(
        __dirname,
        '../../../../docs/architecture/gym-lifecycle-and-invariants.md',
      );
      const commercialDocPath = path.resolve(
        __dirname,
        '../../../../docs/architecture/gym-commercial-model.md',
      );

      expect(fs.existsSync(contextDocPath)).toBe(true);
      expect(fs.existsSync(reconDocPath)).toBe(true);
      expect(fs.existsSync(vocabDocPath)).toBe(true);
      expect(fs.existsSync(aggDocPath)).toBe(true);
      expect(fs.existsSync(lifecycleDocPath)).toBe(true);
      expect(fs.existsSync(commercialDocPath)).toBe(true);

      const commercialDocContent = fs.readFileSync(commercialDocPath, 'utf-8');
      expect(commercialDocContent).toContain('MembershipPlan');
      expect(commercialDocContent).toContain('PlanDuration');
      expect(commercialDocContent).toContain('PlanPrice');
      expect(commercialDocContent).toContain('PlanStatus');

      const contextDocContent = fs.readFileSync(contextDocPath, 'utf-8');
      expect(contextDocContent).toContain('Gym Management Bounded Context');
      expect(contextDocContent).toContain('Mandatory Architectural Invariant');
      expect(contextDocContent).toContain('Authoritative Ownership Matrix');
      expect(contextDocContent).toContain('Membership');
      expect(contextDocContent).toContain('MembershipPlan');
      expect(contextDocContent).toContain('AttendanceRecord');
    });
  });
});
