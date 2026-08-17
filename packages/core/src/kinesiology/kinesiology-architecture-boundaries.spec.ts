import * as fs from 'fs';
import * as path from 'path';

describe('Kinesiology Bounded Context Architecture & Boundary Purity', () => {
  const kinesiologyDomainPath = path.resolve(__dirname, 'domain');
  const kinesiologyApplicationPath = path.resolve(__dirname, 'application');

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

  it('should guarantee zero foreign aggregate or Prisma dependencies in Kinesiology Domain production code', () => {
    const domainFiles = getProductionTsFiles(kinesiologyDomainPath);
    expect(domainFiles.length).toBeGreaterThan(0);

    const forbiddenPatterns = [
      '@prisma',
      'prisma',
      '@nestjs',
      'scheduling/domain/appointment/appointment.aggregate',
      'scheduling/domain/room',
      'client-domain',
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

  it('should guarantee zero direct Scheduling domain aggregate imports in Kinesiology Application production code', () => {
    const applicationFiles = getProductionTsFiles(kinesiologyApplicationPath);
    expect(applicationFiles.length).toBeGreaterThan(0);

    const forbiddenPatterns = [
      'scheduling/domain/appointment/appointment.aggregate',
      'scheduling/domain/room/room.aggregate',
      'scheduling/infrastructure',
    ];

    for (const filePath of applicationFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const pattern of forbiddenPatterns) {
        const importRegex = new RegExp(`from\\s+['"].*${pattern}.*['"]`, 'i');
        const hasViolation = importRegex.test(content);
        if (hasViolation) {
          throw new Error(
            `Architecture Violation: Kinesiology Application File '${filePath}' contains forbidden import matching '${pattern}'.`,
          );
        }
      }
    }
  });
});
