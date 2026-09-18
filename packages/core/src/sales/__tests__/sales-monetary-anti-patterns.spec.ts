import * as fs from 'fs';
import * as path from 'path';
import { Money } from '../domain/value-objects/money.vo';
import { InvalidMoneyException } from '../domain/exceptions/invalid-money.exception';

describe('Sales Monetary Architecture & Anti-Pattern Static Inspection', () => {
  const salesRootDir = path.resolve(__dirname, '..');
  const domainDir = path.resolve(salesRootDir, 'domain');
  const applicationDir = path.resolve(salesRootDir, 'application');

  function getAllTsFiles(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'node_modules') {
          results.push(...getAllTsFiles(fullPath));
        }
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.spec.ts') &&
        !entry.name.endsWith('.test.ts')
      ) {
        results.push(fullPath);
      }
    }
    return results;
  }

  describe('1. Domain Layer Architectural Purity', () => {
    const domainFiles = getAllTsFiles(domainDir);

    it('proves that pure domain source files have zero dependencies on infrastructure, persistence, Prisma, or NestJS', () => {
      expect(domainFiles.length).toBeGreaterThan(5);

      for (const file of domainFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        const relative = path.relative(salesRootDir, file);

        expect({ file: relative, hasPrisma: content.includes('@prisma') }).toEqual({
          file: relative,
          hasPrisma: false,
        });

        expect({ file: relative, hasNest: content.includes('@nestjs') }).toEqual({
          file: relative,
          hasNest: false,
        });

        expect({
          file: relative,
          hasInfrastructure: /from\s+['"].*infrastructure/i.test(content),
        }).toEqual({
          file: relative,
          hasInfrastructure: false,
        });
      }
    });
  });

  describe('2. Floating-Point Anti-Pattern Static Scan', () => {
    const domainAndAppFiles = [...getAllTsFiles(domainDir), ...getAllTsFiles(applicationDir)];

    it('proves that financial calculations do not use dangerous floating point casts (.toNumber(), Number(money))', () => {
      for (const file of domainAndAppFiles) {
        const rawContent = fs.readFileSync(file, 'utf-8');
        // Strip block and line comments to avoid false positives on warning docstrings
        const content = rawContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
        const relative = path.relative(salesRootDir, file);

        // Prohibit calling .toNumber() on Money
        expect({ file: relative, hasToNumber: /\.toNumber\(\)/.test(content) }).toEqual({
          file: relative,
          hasToNumber: false,
        });

        // Prohibit Number(money)
        expect({ file: relative, hasNumberMoney: /Number\(\s*money\s*\)/i.test(content) }).toEqual({
          file: relative,
          hasNumberMoney: false,
        });
      }
    });

    it('proves that Math.floor is only utilized for integer minor-to-major quotient division', () => {
      for (const file of domainAndAppFiles) {
        const rawContent = fs.readFileSync(file, 'utf-8');
        const content = rawContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
        const relative = path.relative(salesRootDir, file);

        if (content.includes('Math.floor')) {
          // If Math.floor is present, it must strictly be in Money formatting/mapping integer division
          const isAllowedMathFloor =
            relative.includes('money.vo.ts') || relative.includes('money.mapper.ts');
          expect({ file: relative, allowed: isAllowedMathFloor }).toEqual({
            file: relative,
            allowed: true,
          });

          // Verify it divides by 100
          expect(content).toMatch(/Math\.floor\(absCents\s*\/\s*100\)/);
        }
      }
    });

    it('proves that cross-currency operations are strictly rejected at the domain boundary', () => {
      const usd = Money.create(50.0, 'USD');
      const eur = Money.create(50.0, 'EUR');

      expect(usd.equals(eur)).toBe(false);
      expect(() => usd.add(eur)).toThrow(InvalidMoneyException);
      expect(() => usd.subtract(eur)).toThrow(InvalidMoneyException);
      expect(() => usd.greaterThan(eur)).toThrow(InvalidMoneyException);
      expect(() => usd.lessThan(eur)).toThrow(InvalidMoneyException);
    });
  });
});
