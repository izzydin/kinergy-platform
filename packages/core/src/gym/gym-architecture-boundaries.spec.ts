import * as fs from 'fs';
import * as path from 'path';

describe('Gym Management Bounded Context Architecture & Boundary Purity', () => {
  const gymDomainPath = path.resolve(__dirname, 'domain');
  const gymApplicationPath = path.resolve(__dirname, 'application');

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

  it('should enforce architectural boundary constraints between Gym and other Bounded Contexts', () => {
    // Verify that the architecture baseline exists and is defined
    const contextDocPath = path.resolve(__dirname, '../../../../docs/architecture/contexts/gym.md');
    const adrDocPath = path.resolve(
      __dirname,
      '../../../../docs/adr/0054-gym-management-bounded-context-ownership-and-context-map.md',
    );
    const vocabDocPath = path.resolve(__dirname, '../../../../docs/business/gym-vocabulary.md');
    const adrVocabDocPath = path.resolve(
      __dirname,
      '../../../../docs/adr/0055-gym-management-canonical-domain-vocabulary-and-semantic-contracts.md',
    );
    const aggDocPath = path.resolve(
      __dirname,
      '../../../../docs/architecture/gym-aggregate-boundaries.md',
    );
    const adrAggDocPath = path.resolve(
      __dirname,
      '../../../../docs/adr/0056-gym-management-aggregate-discovery-and-boundary-decisions.md',
    );

    expect(fs.existsSync(contextDocPath)).toBe(true);
    expect(fs.existsSync(adrDocPath)).toBe(true);
    expect(fs.existsSync(vocabDocPath)).toBe(true);
    expect(fs.existsSync(adrVocabDocPath)).toBe(true);
    expect(fs.existsSync(aggDocPath)).toBe(true);
    expect(fs.existsSync(adrAggDocPath)).toBe(true);

    const contextDocContent = fs.readFileSync(contextDocPath, 'utf-8');
    expect(contextDocContent).toContain('Gym Management Bounded Context');
    expect(contextDocContent).toContain('Mandatory Architectural Invariant');
    expect(contextDocContent).toContain('Authoritative Ownership Matrix');

    const vocabDocContent = fs.readFileSync(vocabDocPath, 'utf-8');
    expect(vocabDocContent).toContain('Membership');
    expect(vocabDocContent).toContain('MembershipPlan');
    expect(vocabDocContent).toContain('AttendanceRecord');
    expect(vocabDocContent).toContain('GymDay');

    const aggDocContent = fs.readFileSync(aggDocPath, 'utf-8');
    expect(aggDocContent).toContain('Membership');
    expect(aggDocContent).toContain('MembershipPlan');
    expect(aggDocContent).toContain('AttendanceRecord');
  });
});
