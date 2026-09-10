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
});
