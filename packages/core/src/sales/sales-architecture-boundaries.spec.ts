import * as fs from 'fs';
import * as path from 'path';

describe('Sales Bounded Context Architecture & Source Domain Boundary Purity (ADR-0121)', () => {
  const salesRootDir = path.resolve(__dirname);
  const salesDomainPath = path.resolve(salesRootDir, 'domain');
  const salesApplicationPath = path.resolve(salesRootDir, 'application');
  const salesInfrastructurePath = path.resolve(salesRootDir, 'infrastructure');
  const apiSalesControllersPath = path.resolve(
    salesRootDir,
    '../../../../apps/api/src/sales/controllers',
  );

  function getProductionTsFiles(dirPath: string): string[] {
    const files: string[] = [];
    if (!fs.existsSync(dirPath)) return files;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'node_modules') {
          files.push(...getProductionTsFiles(fullPath));
        }
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.spec.ts') &&
        !entry.name.endsWith('.test.ts')
      ) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const forbiddenSourceDomainModules = [
    'gym',
    'kinesiology',
    'scheduling',
    'resources',
    'client-domain',
    'identity',
  ];

  const forbiddenConcreteEntities = [
    'Food',
    'FoodOrder',
    'FoodItem',
    'FoodSale',
    'Drink',
    'DrinkOrder',
    'DrinkItem',
    'DrinkSale',
    'Membership',
    'MembershipPlan',
    'GymMembership',
    'GymSale',
    'TreatmentSession',
    'SessionNotes',
    'KinesiologySale',
    'Room',
    'RoomRental',
    'RoomSale',
    'Appointment',
  ];

  describe('1. Sales Domain Layer Purity & Foreign Context Isolation', () => {
    const domainFiles = getProductionTsFiles(salesDomainPath);

    it('proves domain production files exist and are scanned', () => {
      expect(domainFiles.length).toBeGreaterThan(10);
    });

    it('proves that pure Sales Domain files have zero imports from foreign bounded contexts', () => {
      for (const filePath of domainFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const relative = path.relative(salesRootDir, filePath);

        for (const foreignModule of forbiddenSourceDomainModules) {
          const importRegex = new RegExp(
            `from\\s+['"].*[/\\\\]${foreignModule}([/\\\\].*)?['"]`,
            'i',
          );
          const hasViolation = importRegex.test(content);
          expect({ file: relative, foreignModule, hasViolation }).toEqual({
            file: relative,
            foreignModule,
            hasViolation: false,
          });
        }
      }
    });

    it('proves that Sales Domain files do NOT import concrete source-domain entities', () => {
      for (const filePath of domainFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const relative = path.relative(salesRootDir, filePath);

        for (const entityName of forbiddenConcreteEntities) {
          const namedImportRegex = new RegExp(
            `import\\s+(?:type\\s+)?(?:\\{[^}]*\\b${entityName}\\b[^}]*\\}|${entityName})\\s+from`,
          );
          const hasViolation = namedImportRegex.test(content);
          expect({ file: relative, entityName, hasViolation }).toEqual({
            file: relative,
            entityName,
            hasViolation: false,
          });
        }
      }
    });

    it('proves that Sales Domain files have zero dependencies on infrastructure, persistence, or frameworks', () => {
      const forbiddenFrameworks = [
        '@prisma',
        'prisma',
        '@nestjs',
        'express',
        'fastify',
        'axios',
        '../infrastructure',
        '../../infrastructure',
      ];

      for (const filePath of domainFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const relative = path.relative(salesRootDir, filePath);

        for (const framework of forbiddenFrameworks) {
          const importRegex = new RegExp(`from\\s+['"].*${framework}.*['"]`, 'i');
          const hasViolation = importRegex.test(content);
          expect({ file: relative, framework, hasViolation }).toEqual({
            file: relative,
            framework,
            hasViolation: false,
          });
        }
      }
    });
  });

  describe('2. Value Object Boundary Purity (SaleSource & SourceReference)', () => {
    const saleSourceVoPath = path.resolve(salesDomainPath, 'value-objects/sale-source.vo.ts');
    const sourceRefVoPath = path.resolve(salesDomainPath, 'value-objects/source-reference.vo.ts');

    it('proves SaleSource VO has zero repository, database, or asynchronous dependencies', () => {
      expect(fs.existsSync(saleSourceVoPath)).toBe(true);
      const content = fs.readFileSync(saleSourceVoPath, 'utf-8');

      // No repositories
      expect(content).not.toMatch(/Repository/i);
      // No async or Promise operations
      expect(content).not.toMatch(/\basync\b/);
      expect(content).not.toMatch(/\bPromise\b/);
      // No database calls
      expect(content).not.toMatch(/prisma/i);
      // Statically only references generic SaleSourceType and scalar referenceId
      expect(content).toMatch(/type:\s*SaleSourceType/);
      expect(content).toMatch(/referenceId:\s*string/);
    });

    it('proves SourceReference VO has zero repository, database, or asynchronous dependencies', () => {
      expect(fs.existsSync(sourceRefVoPath)).toBe(true);
      const content = fs.readFileSync(sourceRefVoPath, 'utf-8');

      expect(content).not.toMatch(/Repository/i);
      expect(content).not.toMatch(/\basync\b/);
      expect(content).not.toMatch(/\bPromise\b/);
      expect(content).not.toMatch(/prisma/i);
    });
  });

  describe('3. Aggregate Root Autonomy (Sale)', () => {
    const saleAggregatePath = path.resolve(salesDomainPath, 'sale.aggregate.ts');

    it('proves Sale aggregate root has zero source-domain repository or entity dependencies', () => {
      expect(fs.existsSync(saleAggregatePath)).toBe(true);
      const content = fs.readFileSync(saleAggregatePath, 'utf-8');

      // No repository imports or constructor injections
      expect(content).not.toMatch(/Repository/);

      // No concrete source entity properties
      for (const entityName of forbiddenConcreteEntities) {
        expect(content).not.toMatch(new RegExp(`\\b${entityName}\\b\\s*[:=]`));
      }

      // Origin context is exclusively held via generic Value Objects
      expect(content).toMatch(/private\s+(?:readonly\s+)?_source:\s*SaleSource/);
      expect(content).toMatch(/public\s+get\s+source\(\):\s*SaleSource/);
    });
  });

  describe('4. Sales Application Layer Decoupling', () => {
    const applicationFiles = getProductionTsFiles(salesApplicationPath);

    it('proves application production files exist', () => {
      expect(applicationFiles.length).toBeGreaterThan(5);
    });

    it('proves that Sales Application production code does NOT import concrete source entities', () => {
      for (const filePath of applicationFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const relative = path.relative(salesRootDir, filePath);

        for (const entityName of forbiddenConcreteEntities) {
          const namedImportRegex = new RegExp(
            `import\\s+(?:type\\s+)?(?:\\{[^}]*\\b${entityName}\\b[^}]*\\}|${entityName})\\s+from`,
          );
          const hasViolation = namedImportRegex.test(content);
          expect({ file: relative, entityName, hasViolation }).toEqual({
            file: relative,
            entityName,
            hasViolation: false,
          });
        }
      }
    });

    it('proves that Sales Application production code does NOT import repositories from other domains', () => {
      const foreignRepositories = [
        'TreatmentSessionRepository',
        'AppointmentRepository',
        'RoomRepository',
        'MembershipRepository',
        'InventoryItemRepository',
      ];

      for (const filePath of applicationFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const relative = path.relative(salesRootDir, filePath);

        for (const repo of foreignRepositories) {
          const hasViolation = content.includes(repo);
          expect({ file: relative, repo, hasViolation }).toEqual({
            file: relative,
            repo,
            hasViolation: false,
          });
        }
      }
    });
  });

  describe('5. Sales Infrastructure & Repository Autonomy', () => {
    const infraFiles = getProductionTsFiles(salesInfrastructurePath);

    it('proves that Sales Repositories do not query foreign domain database tables directly', () => {
      const forbiddenPrismaDelegates = [
        'prisma.treatmentSession',
        'prisma.appointment',
        'prisma.membership',
        'prisma.membershipPlan',
        'prisma.inventoryItem',
        'prisma.room',
      ];

      for (const filePath of infraFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const relative = path.relative(salesRootDir, filePath);

        for (const delegate of forbiddenPrismaDelegates) {
          const hasViolation = content.includes(delegate);
          expect({ file: relative, delegate, hasViolation }).toEqual({
            file: relative,
            delegate,
            hasViolation: false,
          });
        }
      }
    });
  });

  describe('6. API Controllers Decoupling', () => {
    const controllerFiles = getProductionTsFiles(apiSalesControllersPath);

    it('proves that Sales HTTP controllers do not import concrete source domain entities', () => {
      if (controllerFiles.length === 0) return;

      for (const filePath of controllerFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const fileName = path.basename(filePath);

        for (const entityName of forbiddenConcreteEntities) {
          const namedImportRegex = new RegExp(
            `import\\s+(?:type\\s+)?(?:\\{[^}]*\\b${entityName}\\b[^}]*\\}|${entityName})\\s+from`,
          );
          const hasViolation = namedImportRegex.test(content);
          expect({ file: fileName, entityName, hasViolation }).toEqual({
            file: fileName,
            entityName,
            hasViolation: false,
          });
        }
      }
    });
  });

  describe('7. Receipt Milestone 7.7 vs Milestone 7.9 Architectural Decoupling', () => {
    const receiptAggregatePath = path.resolve(salesDomainPath, 'receipt.aggregate.ts');
    const receiptDtoPath = path.resolve(salesRootDir, 'application/dtos/receipt.dto.ts');

    it('proves Receipt aggregate root does NOT have sourceReference or sourceType properties at the root', () => {
      const content = fs.readFileSync(receiptAggregatePath, 'utf-8');
      expect(content).not.toMatch(/private\s+(?:readonly\s+)?_sourceReference/);
      expect(content).not.toMatch(/public\s+get\s+sourceReference\(\)/);
      expect(content).not.toMatch(/public\s+get\s+sourceType\(\)/);
    });

    it('proves ReceiptDTO does NOT expose sourceReference or sourceType at the root', () => {
      const content = fs.readFileSync(receiptDtoPath, 'utf-8');
      expect(content).not.toMatch(/readonly\s+sourceReference/);
    });

    it('proves Receipt aggregate and handlers have ZERO imports of SaleSource or foreign source entities', () => {
      const receiptFiles = [
        receiptAggregatePath,
        path.resolve(salesRootDir, 'application/handlers/issue-receipt.handler.ts'),
        path.resolve(salesRootDir, 'domain/value-objects/receipt-item-snapshot.vo.ts'),
      ];

      for (const filePath of receiptFiles) {
        if (!fs.existsSync(filePath)) continue;
        const content = fs.readFileSync(filePath, 'utf-8');

        expect(content).not.toMatch(/from\s+['"].*sale-source\.vo['"]/);
        expect(content).not.toMatch(/from\s+['"].*sale-source-type\.enum['"]/);

        for (const entityName of forbiddenConcreteEntities) {
          const namedImportRegex = new RegExp(
            `import\\s+(?:type\\s+)?(?:\\{[^}]*\\b${entityName}\\b[^}]*\\}|${entityName})\\s+from`,
          );
          expect(namedImportRegex.test(content)).toBe(false);
        }
      }
    });
  });
});
