import * as fs from 'fs';
import * as path from 'path';
import { Sale } from './domain/sale.aggregate';
import { SaleId } from './domain/value-objects/sale-id.vo';
import { SaleSource } from './domain/value-objects/sale-source.vo';
import { SaleSourceType } from './domain/enums/sale-source-type.enum';
import { SaleSourceValidatorPort } from './application/ports/sale-source-validator.port';
import { SaleRepositoryPort } from './application/ports/sale-repository.port';
import { CreateSaleHandler } from './application/handlers/create-sale.handler';

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

    it('proves valid reference can be stored in Sales without loading or resolving concrete source entities', () => {
      // Create Sale using pure SaleSource without needing or instantiating any source entities
      const source = SaleSource.create(SaleSourceType.KINESIOLOGY_SESSION, 'sess_cross_ctx_999');
      const sale = Sale.create({
        id: SaleId.create('sale-isolated-01'),
        tenantId: 'tenant-pure',
        clientId: 'client-pure',
        currency: 'USD',
        source,
      });

      // Verify Sale aggregate only holds the scalar (type, referenceId) pair
      expect(sale.source).toBeInstanceOf(SaleSource);
      expect(sale.source.sourceType).toBe(SaleSourceType.KINESIOLOGY_SESSION);
      expect(sale.source.sourceId).toBe('sess_cross_ctx_999');
      // No entity graph or foreign models attached
      expect((sale as unknown as Record<string, unknown>)['treatmentSession']).toBeUndefined();
      expect((sale as unknown as Record<string, unknown>)['concreteEntity']).toBeUndefined();
    });

    it('proves source validation occurs in application layer via SaleSourceValidatorPort without aggregate coupling', async () => {
      const mockValidator: SaleSourceValidatorPort = {
        validateSource: jest.fn().mockResolvedValue({
          isValid: true,
          exists: true,
          belongsToContext: true,
          actualContext: 'KINESIOLOGY',
        }),
      };

      const mockRepo: SaleRepositoryPort = {
        findById: jest.fn().mockResolvedValue(null),
        save: jest.fn().mockResolvedValue(undefined),
      };

      const handler = new CreateSaleHandler(mockRepo, undefined, undefined, mockValidator);

      const result = await handler.execute({
        input: {
          currency: 'USD',
          tenantId: 'tenant-1',
          clientId: 'client-1',
          source: {
            sourceType: SaleSourceType.KINESIOLOGY_SESSION,
            sourceId: 'sess_valid_01',
          },
          expectedContext: 'KINESIOLOGY',
        },
      });

      expect(result.isSuccess).toBe(true);
      expect(mockValidator.validateSource).toHaveBeenCalledWith({
        sourceType: SaleSourceType.KINESIOLOGY_SESSION,
        sourceId: 'sess_valid_01',
        sourceCode: null,
        tenantId: 'tenant-1',
        expectedContext: 'KINESIOLOGY',
      });
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('proves application layer rejects creation when SaleSourceValidatorPort reports non-existent entity', async () => {
      const mockValidator: SaleSourceValidatorPort = {
        validateSource: jest.fn().mockResolvedValue({
          isValid: false,
          exists: false,
          errorMessage: 'Treatment session not found in kinesiology registry.',
        }),
      };

      const mockRepo: SaleRepositoryPort = {
        findById: jest.fn().mockResolvedValue(null),
        save: jest.fn().mockResolvedValue(undefined),
      };

      const handler = new CreateSaleHandler(mockRepo, undefined, undefined, mockValidator);

      const result = await handler.execute({
        input: {
          currency: 'USD',
          source: {
            sourceType: SaleSourceType.KINESIOLOGY_SESSION,
            sourceId: 'sess_non_existent',
          },
        },
      });

      expect(result.isSuccess).toBe(false);
      expect((result.getError() as Error).message).toContain(
        'Treatment session not found in kinesiology registry',
      );
      expect(mockRepo.save).not.toHaveBeenCalled();
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

  describe('8. Payment & Sale Aggregate Boundary & Application Orchestration Purity (ADR-0115, ADR-0116, ADR-0122)', () => {
    const paymentAggregatePath = path.resolve(salesDomainPath, 'payment.aggregate.ts');
    const saleAggregatePath = path.resolve(salesDomainPath, 'sale.aggregate.ts');
    const completePaymentHandlerPath = path.resolve(
      salesRootDir,
      'application/handlers/complete-payment.handler.ts',
    );

    it('proves Payment aggregate has ZERO imports of Sale aggregate, entity, or domain implementation', () => {
      const paymentContent = fs.readFileSync(paymentAggregatePath, 'utf-8');

      // Must not import Sale aggregate
      expect(paymentContent).not.toMatch(/from\s+['"].*sale\.aggregate['"]/);
      expect(paymentContent).not.toMatch(
        /import\s+(?:type\s+)?(?:\{[^}]*\bSale\b[^}]*\}|\bSale\b)\s+from/,
      );

      // Must only reference SaleId value object
      expect(paymentContent).toMatch(/import\s+(?:type\s+)?\{[^}]*SaleId[^}]*\}\s+from/);
      expect(paymentContent).toMatch(/private\s+readonly\s+_saleId:\s*SaleId/);
    });

    it('proves Sale aggregate has ZERO imports of Payment aggregate, entity, or status', () => {
      const saleContent = fs.readFileSync(saleAggregatePath, 'utf-8');

      // Must not import Payment aggregate or Payment value objects/enums
      expect(saleContent).not.toMatch(/from\s+['"].*payment\.aggregate['"]/);
      expect(saleContent).not.toMatch(/from\s+['"].*payment-id\.vo['"]/);
      expect(saleContent).not.toMatch(/from\s+['"].*payment-status\.enum['"]/);
      expect(saleContent).not.toMatch(/from\s+['"].*payment-method\.enum['"]/);
      expect(saleContent).not.toMatch(
        /import\s+(?:type\s+)?(?:\{[^}]*\bPayment\b[^}]*\}|\bPayment\b)\s+from/,
      );
    });

    it('proves Payment.complete() has ZERO domain knowledge or invocation of Sale.markPaid()', () => {
      const paymentContent = fs.readFileSync(paymentAggregatePath, 'utf-8');

      // Payment.complete must not call markPaid or reference Sale methods
      expect(paymentContent).not.toMatch(/markPaid/);
      expect(paymentContent).not.toMatch(/markPartiallyPaid/);
      expect(paymentContent).not.toMatch(/sale\.status/i);
    });

    it('proves Sale.markPaid() has ZERO domain knowledge or invocation of Payment methods', () => {
      const saleContent = fs.readFileSync(saleAggregatePath, 'utf-8');

      // Sale.markPaid must only guard its own internal lifecycle status
      expect(saleContent).not.toMatch(/payment\.complete/i);
      expect(saleContent).not.toMatch(/payment\.settle/i);
      expect(saleContent).not.toMatch(/PaymentRepository/i);
    });

    it('proves CompletePaymentHandler orchestrates Payment and Sale without merging aggregates', () => {
      const handlerContent = fs.readFileSync(completePaymentHandlerPath, 'utf-8');

      // Application service coordinates Payment -> Application Service -> Sale
      expect(handlerContent).toMatch(/paymentRepository/);
      expect(handlerContent).toMatch(/saleRepository/);
      expect(handlerContent).toMatch(/payment\.complete\(/);
      expect(handlerContent).toMatch(/sale\.markPaid\(/);

      // Orchestrates cross-aggregate invariants (sale scoping, currency parity, remaining balance)
      expect(handlerContent).toMatch(/SaleNotFoundException/);
      expect(handlerContent).toMatch(/PaymentCurrencyMismatchException/);
      expect(handlerContent).toMatch(/PaymentOverpaymentException/);

      // Guarantees atomic cross-aggregate persistence via unitOfWork
      expect(handlerContent).toMatch(/unitOfWork/);
    });
  });

  describe('9. PaymentRepository Hexagonal Architecture & Milestone 7.12 Capabilities (ADR-0115, ADR-0116, ADR-0122, ADR-0133)', () => {
    const paymentRepoPortPath = path.resolve(
      salesRootDir,
      'application/ports/payment-repository.port.ts',
    );
    const prismaPaymentRepoPath = path.resolve(
      salesRootDir,
      'infrastructure/persistence/prisma/repositories/prisma-payment.repository.ts',
    );

    it('proves PaymentRepositoryPort has ZERO imports of Prisma, ORM, or database frameworks', () => {
      const portContent = fs.readFileSync(paymentRepoPortPath, 'utf-8');

      expect(portContent).not.toMatch(/@prisma/);
      expect(portContent).not.toMatch(/prisma/i);
      expect(portContent).not.toMatch(/typeorm/i);
      expect(portContent).not.toMatch(/sequelize/i);
      expect(portContent).not.toMatch(/from\s+['"]sqlite/i);
      expect(portContent).not.toMatch(/from\s+['"]pg/i);
    });

    it('proves PaymentRepositoryPort forbids partial CRUD methods that bypass Payment Aggregate', () => {
      const portContent = fs.readFileSync(paymentRepoPortPath, 'utf-8');

      // Aggregate root lifecycle is authoritative: no anemic partial mutations
      expect(portContent).not.toMatch(/updateStatus\s*\(/);
      expect(portContent).not.toMatch(/updateAmount\s*\(/);
      expect(portContent).not.toMatch(/updatePaidAt\s*\(/);
      expect(portContent).not.toMatch(/updateReference\s*\(/);

      // Financial and commercial records are immutable; no physical deletion
      expect(portContent).not.toMatch(/delete\s*\(/);
      expect(portContent).not.toMatch(/deleteById\s*\(/);
    });

    it('proves PaymentRepositoryPort and PrismaPaymentRepository expose all required Milestone 7.12 capabilities', () => {
      const portContent = fs.readFileSync(paymentRepoPortPath, 'utf-8');
      const adapterContent = fs.readFileSync(prismaPaymentRepoPath, 'utf-8');

      // Required capabilities: create, getById / findById, list / findMany, listBySaleId / findBySaleId, save, withTransaction
      expect(portContent).toMatch(/create\?\s*\(\s*payment:\s*Payment\s*\)/);
      expect(portContent).toMatch(/findById\s*\(/);
      expect(portContent).toMatch(/getById\?\s*\(/);
      expect(portContent).toMatch(/findBySaleId\s*\(/);
      expect(portContent).toMatch(/listBySaleId\?\s*\(/);
      expect(portContent).toMatch(/save\s*\(\s*payment:\s*Payment\s*\)/);
      expect(portContent).toMatch(/list\?\s*\(/);
      expect(portContent).toMatch(/withTransaction\?(?:<[^>]+>)?\s*\(/);

      // Concrete Prisma adapter implements every capability
      expect(adapterContent).toMatch(/public\s+async\s+create\s*\(\s*payment:\s*Payment\s*\)/);
      expect(adapterContent).toMatch(/public\s+async\s+findById\s*\(/);
      expect(adapterContent).toMatch(/public\s+async\s+getById\s*\(/);
      expect(adapterContent).toMatch(/public\s+async\s+findBySaleId\s*\(/);
      expect(adapterContent).toMatch(/public\s+async\s+listBySaleId\s*\(/);
      expect(adapterContent).toMatch(/public\s+async\s+save\s*\(\s*payment:\s*Payment\s*\)/);
      expect(adapterContent).toMatch(/public\s+async\s+list\s*\(/);
      expect(adapterContent).toMatch(/public\s+async\s+withTransaction(?:<[^>]+>)?\s*\(/);
    });
  });
});
