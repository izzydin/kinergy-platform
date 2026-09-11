import * as fs from 'fs';
import * as path from 'path';

describe('Phase 6: Resources Management Bounded Context Architecture & Boundary Purity', () => {
  const resourcesDomainPath = path.resolve(__dirname, 'domain');

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

  it('Domain Layer Purity: zero foreign bounded context, infrastructure, or framework imports in Resources Domain', () => {
    const domainFiles = getProductionTsFiles(resourcesDomainPath);
    expect(domainFiles.length).toBeGreaterThan(0);

    const forbiddenPatterns = [
      '@prisma',
      'prisma',
      '@nestjs',
      'scheduling',
      'kinesiology',
      'client-domain',
      'identity',
      'gym',
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

  it('Cross-Context Decoupling: User, TreatmentSession, and SchedulableResource are referenced strictly by scalar ID', () => {
    const domainFiles = getProductionTsFiles(resourcesDomainPath);
    for (const filePath of domainFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).not.toMatch(/import\s+.*\bUser\b.*from/);
      expect(content).not.toMatch(/import\s+.*\bClient\b.*from/);
      expect(content).not.toMatch(/import\s+.*\bTreatmentSession\b.*from/);
      expect(content).not.toMatch(/import\s+.*\bRoom\b.*from/);
    }
  });

  it('Client Decoupling & No Identity Duplication: Resources domain defines zero Customer, Patient, or Member models', () => {
    const domainFiles = getProductionTsFiles(resourcesDomainPath);
    for (const filePath of domainFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).not.toMatch(/class\s+(Client|Customer|Patient|Member)\b/);
      expect(content).not.toMatch(/interface\s+(Client|Customer|Patient|Member)\b/);
      expect(content).not.toMatch(/type\s+(Client|Customer|Patient|Member)\s*=/);
    }
  });

  it('Schema Purity: inventory_items and fixed_assets have zero foreign keys or direct relation fields to clients', () => {
    const schemaPath = path.resolve(__dirname, '../../../../prisma/schema.prisma');
    if (!fs.existsSync(schemaPath)) return;
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

    // Extract InventoryItem model
    const invItemMatch = schemaContent.match(/model\s+InventoryItem\s*\{[\s\S]*?\}/);
    expect(invItemMatch).not.toBeNull();
    if (invItemMatch) {
      expect(invItemMatch[0]).not.toMatch(/\bclientId\b/i);
      expect(invItemMatch[0]).not.toMatch(/\bclient\b\s+Client/i);
    }

    // Extract FixedAsset model
    const fixedAssetMatch = schemaContent.match(/model\s+FixedAsset\s*\{[\s\S]*?\}/);
    expect(fixedAssetMatch).not.toBeNull();
    if (fixedAssetMatch) {
      expect(fixedAssetMatch[0]).not.toMatch(/\bclientId\b/i);
      expect(fixedAssetMatch[0]).not.toMatch(/\bclient\b\s+Client/i);
    }
  });

  it('Scheduling Decoupling & Room Independence: Room aggregate does not import or own FixedAsset', () => {
    const schedulingDomainPath = path.resolve(__dirname, '../scheduling/domain');
    const schedulingFiles = getProductionTsFiles(schedulingDomainPath);
    for (const filePath of schedulingFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).not.toMatch(/import\s+.*\bFixedAsset\b.*from/);
      expect(content).not.toMatch(/import\s+.*\bAssetLocation\b.*from/);
    }
  });

  it('Schema Purity: rooms and fixed_assets have zero foreign keys or direct relation fields connecting them', () => {
    const schemaPath = path.resolve(__dirname, '../../../../prisma/schema.prisma');
    if (!fs.existsSync(schemaPath)) return;
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

    // Extract Room model
    const roomMatch = schemaContent.match(/model\s+Room\s*\{[\s\S]*?\}/);
    expect(roomMatch).not.toBeNull();
    if (roomMatch) {
      expect(roomMatch[0]).not.toMatch(/\bfixedAssets\b/i);
      expect(roomMatch[0]).not.toMatch(/\bFixedAsset\b/i);
    }

    // Extract FixedAsset model
    const fixedAssetMatch = schemaContent.match(/model\s+FixedAsset\s*\{[\s\S]*?\}/);
    expect(fixedAssetMatch).not.toBeNull();
    if (fixedAssetMatch) {
      expect(fixedAssetMatch[0]).not.toMatch(/\broomId\b\s+String/i);
      expect(fixedAssetMatch[0]).not.toMatch(/\broom\b\s+Room/i);
    }
  });

  it('Application Layer Purity: Resources Application layer does not import Prisma, NestJS, HTTP controllers, or unrelated domains', () => {
    const resourcesAppPath = path.resolve(__dirname, 'application');
    const appFiles = getProductionTsFiles(resourcesAppPath);
    expect(appFiles.length).toBeGreaterThan(0);

    const forbiddenAppPatterns = [
      '@prisma',
      '@nestjs',
      'controllers',
      'apps/',
      '../infrastructure/persistence',
      '../../infrastructure/persistence',
      'scheduling',
      'kinesiology',
      'client-domain',
      'identity',
      'gym',
    ];

    for (const filePath of appFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const pattern of forbiddenAppPatterns) {
        const importRegex = new RegExp(`from\\s+['"].*${pattern}.*['"]`, 'i');
        const hasViolation = importRegex.test(content);
        if (hasViolation) {
          throw new Error(
            `Application Purity Violation: File '${filePath}' contains forbidden import matching '${pattern}'.`,
          );
        }
      }
    }
  });

  it('Sales-Inventory Boundary: Resources domain/application has zero dependencies on Sales modules or Prisma models', () => {
    const resourcesPath = path.resolve(__dirname);
    const allResourcesFiles = getProductionTsFiles(resourcesPath);

    for (const filePath of allResourcesFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).not.toMatch(/from\s+['"].*\bsales\b.*['"]/i);
      expect(content).not.toMatch(/from\s+['"].*\bpos\b.*['"]/i);
    }
  });

  it('Zero Duplicated IAM: Resources defines zero custom Token, Session, Password, or AuthUser models', () => {
    const domainFiles = getProductionTsFiles(resourcesDomainPath);
    for (const filePath of domainFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).not.toMatch(/class\s+(AuthUser|Session|Token|Credential|Password)\b/);
      expect(content).not.toMatch(/interface\s+(AuthUser|Session|Token|Credential|Password)\b/);
    }
  });
});
