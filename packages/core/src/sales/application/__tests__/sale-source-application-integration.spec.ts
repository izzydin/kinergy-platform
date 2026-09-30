import { CreateSaleHandler } from '../handlers/create-sale.handler';
import { AssignSaleSourceHandler } from '../handlers/assign-sale-source.handler';
import { CreateSaleCommand } from '../commands/create-sale.command';
import { AssignSaleSourceCommand } from '../commands/assign-sale-source.command';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import {
  SaleSourceValidatorPort,
  ValidateSourceInput,
  SaleSourceValidationResult,
} from '../ports/sale-source-validator.port';
import { Sale } from '../../domain/sale.aggregate';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { SaleSourceType } from '../../domain/enums/sale-source-type.enum';
import { SourceType } from '../../domain/enums/source-type.enum';
import { Clock } from '../../domain/shared/clock';
import { InvalidSaleSourceException } from '../../domain/exceptions/invalid-sale-source.exception';
import { InvalidSaleStateException } from '../../domain/exceptions/invalid-sale-state.exception';
import { DuplicateSaleException } from '../../domain/exceptions/duplicate-sale.exception';
import { SourceNotFoundException } from '../exceptions/source-not-found.exception';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';

class MockSaleRepository implements SaleRepositoryPort {
  private sales = new Map<string, Sale>();

  public async findById(id: string): Promise<Sale | null> {
    return this.sales.get(id) ?? null;
  }

  public async save(sale: Sale): Promise<void> {
    this.sales.set(sale.id.value, sale);
  }

  public async findBySourceReference(
    sourceType: SourceType | string,
    sourceId: string,
    tenantId?: string,
  ): Promise<Sale | null> {
    for (const s of this.sales.values()) {
      if (
        s.status !== SaleStatus.CANCELLED &&
        s.source.sourceType === sourceType &&
        s.source.sourceId === sourceId &&
        (!tenantId || s.tenantId === tenantId)
      ) {
        return s;
      }
    }
    return null;
  }

  public async findBySourceCode(sourceCode: string, tenantId?: string): Promise<Sale | null> {
    for (const s of this.sales.values()) {
      if (
        s.status !== SaleStatus.CANCELLED &&
        s.source.sourceCode === sourceCode &&
        (!tenantId || s.tenantId === tenantId)
      ) {
        return s;
      }
    }
    return null;
  }

  public async delete(id: string): Promise<void> {
    this.sales.delete(id);
  }

  public clear(): void {
    this.sales.clear();
  }
}

class MockSaleSourceValidator implements SaleSourceValidatorPort {
  public validationHandler?: (input: ValidateSourceInput) => Promise<SaleSourceValidationResult>;

  public async validateSource(input: ValidateSourceInput): Promise<SaleSourceValidationResult> {
    if (this.validationHandler) {
      return this.validationHandler(input);
    }
    return { isValid: true, exists: true };
  }
}

describe('SaleSource Application Workflows & Integration Specification', () => {
  const fixedNow = new Date('2026-09-30T10:00:00.000Z');
  const clock: Clock = { now: () => fixedNow };

  let repository: MockSaleRepository;
  let sourceValidator: MockSaleSourceValidator;
  let createHandler: CreateSaleHandler;
  let assignHandler: AssignSaleSourceHandler;

  beforeEach(() => {
    repository = new MockSaleRepository();
    sourceValidator = new MockSaleSourceValidator();
    createHandler = new CreateSaleHandler(repository, clock, undefined, sourceValidator);
    assignHandler = new AssignSaleSourceHandler(repository, sourceValidator);
  });

  // --------------------------------------------------------------------------
  // 1. Valid Source Integration
  // --------------------------------------------------------------------------
  describe('1. Valid Source Creation', () => {
    it('creates a Sale successfully with a valid FOOD source', async () => {
      sourceValidator.validationHandler = async () => ({
        isValid: true,
        exists: true,
      });

      const command = new CreateSaleCommand({
        currency: 'USD',
        tenantId: 'tenant-1',
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: 'food-order-123',
        },
        items: [
          {
            description: 'Organic Protein Bowl',
            quantity: 1,
            unitPriceAmount: 14.5,
          },
        ],
      });

      const result = await createHandler.execute(command);
      expect(result.isSuccess).toBe(true);

      const dto = result.getValue();
      expect(dto.source.sourceType).toBe(SaleSourceType.FOOD);
      expect(dto.source.sourceId).toBe('food-order-123');
      expect(dto.status).toBe(SaleStatus.DRAFT);
      expect(dto.total.amount).toBe(14.5);

      const persisted = await repository.findById(dto.id);
      expect(persisted).toBeDefined();
      expect(persisted?.source.sourceType).toBe(SaleSourceType.FOOD);
    });

    it('creates a Sale across all 5 canonical SaleSourceType values', async () => {
      const types = [
        SaleSourceType.KINESIOLOGY_SESSION,
        SaleSourceType.GYM_MEMBERSHIP,
        SaleSourceType.FOOD,
        SaleSourceType.DRINK,
        SaleSourceType.ROOM_RENTAL,
      ];

      for (const type of types) {
        const cmd = new CreateSaleCommand({
          currency: 'USD',
          source: {
            sourceType: type,
            sourceId: `ref-${type.toLowerCase()}-01`,
          },
          items: [{ description: `Item for ${type}`, quantity: 1, unitPriceAmount: 25.0 }],
        });

        const res = await createHandler.execute(cmd);
        expect(res.isSuccess).toBe(true);
        expect(res.getValue().source.sourceType).toBe(type);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 2. Unsupported Source Rejection
  // --------------------------------------------------------------------------
  describe('2. Unsupported Source Handling', () => {
    it('rejects unsupported source types before persistence with UNSUPPORTED_SALE_SOURCE_TYPE', async () => {
      const saveSpy = jest.spyOn(repository, 'save');

      const command = new CreateSaleCommand({
        currency: 'USD',
        source: {
          sourceType: 'ASTRONAUT_TRAINING',
          sourceId: 'session-999',
        },
      });

      const result = await createHandler.execute(command);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleSourceException);
      expect((result.getError() as InvalidSaleSourceException).code).toBe(
        'UNSUPPORTED_SALE_SOURCE_TYPE',
      );
      expect((result.getError() as Error).message).toContain(
        "Invalid or unsupported source type: 'ASTRONAUT_TRAINING'",
      );

      // Proves persistence was never called
      expect(saveSpy).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // 3. Missing Source Reference
  // --------------------------------------------------------------------------
  describe('3. Missing Source Reference Handling', () => {
    it('fails fast when source is completely omitted and walk-in fallback is not enabled', async () => {
      const command = new CreateSaleCommand({
        currency: 'USD',
        source: null as unknown as undefined,
      });

      const result = await createHandler.execute(command);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleSourceException);
      expect((result.getError() as InvalidSaleSourceException).code).toBe(
        'MISSING_SOURCE_REFERENCE',
      );
    });

    it('fails fast when source referenceId is empty or whitespace', async () => {
      const command = new CreateSaleCommand({
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: '   ',
        },
      });

      const result = await createHandler.execute(command);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleSourceException);
      expect((result.getError() as InvalidSaleSourceException).code).toBe(
        'INVALID_SALE_SOURCE_REFERENCE_ID',
      );
    });
  });

  // --------------------------------------------------------------------------
  // 4. Source Not Found Where Validation is Required
  // --------------------------------------------------------------------------
  describe('4. Source Existence Validation (SaleSourceValidatorPort)', () => {
    it('rejects with SourceNotFoundException when upstream entity does not exist', async () => {
      sourceValidator.validationHandler = async () => ({
        isValid: false,
        exists: false,
        errorMessage: "TreatmentSession 'session-404' was not found in Kinesiology.",
      });

      const command = new CreateSaleCommand({
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: 'session-404',
        },
      });

      const result = await createHandler.execute(command);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(SourceNotFoundException);
      expect((result.getError() as SourceNotFoundException).code).toBe('SOURCE_NOT_FOUND');
      expect((result.getError() as Error).message).toContain(
        "TreatmentSession 'session-404' was not found in Kinesiology.",
      );

      // Proves nothing was saved to database
      const found = await repository.findBySourceReference(
        SaleSourceType.KINESIOLOGY_SESSION,
        'session-404',
      );
      expect(found).toBeNull();
    });

    it('bypasses synchronous existence checks when sourceValidator is intentionally omitted', async () => {
      // Handler constructed WITHOUT sourceValidator (decoupled asynchronous mode)
      const decoupledHandler = new CreateSaleHandler(repository, clock);

      const command = new CreateSaleCommand({
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: 'unverified-kitchen-ticket-77',
        },
        items: [{ description: 'Salad', quantity: 1, unitPriceAmount: 10.0 }],
      });

      const result = await decoupledHandler.execute(command);
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().source.sourceId).toBe('unverified-kitchen-ticket-77');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Source Belonging to Another Business Context
  // --------------------------------------------------------------------------
  describe('5. Source Cross-Context Ownership Verification', () => {
    it('rejects when source entity exists but belongs to an incompatible context', async () => {
      sourceValidator.validationHandler = async () => ({
        isValid: false,
        exists: true,
        belongsToContext: false,
        actualContext: 'gym',
        errorMessage:
          "Entity 'id-99' is a Gym Membership Plan, not a Kinesiology TreatmentSession.",
      });

      const command = new CreateSaleCommand({
        currency: 'USD',
        expectedContext: 'kinesiology',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: 'id-99',
        },
      });

      const result = await createHandler.execute(command);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleSourceException);
      expect((result.getError() as InvalidSaleSourceException).code).toBe(
        'SOURCE_CONTEXT_MISMATCH',
      );
      expect((result.getError() as Error).message).toContain(
        'is a Gym Membership Plan, not a Kinesiology TreatmentSession',
      );
    });
  });

  // --------------------------------------------------------------------------
  // 6. Duplicate Source Where Uniqueness Applies
  // --------------------------------------------------------------------------
  describe('6. Duplicate Source Uniqueness Enforcement', () => {
    it('rejects duplicate active Sale for KINESIOLOGY_SESSION single-billing invariant', async () => {
      const firstCommand = new CreateSaleCommand({
        tenantId: 'tenant-1',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: 'session-rehab-101',
        },
        items: [{ description: 'Therapy Session', quantity: 1, unitPriceAmount: 85.0 }],
      });

      const firstResult = await createHandler.execute(firstCommand);
      expect(firstResult.isSuccess).toBe(true);

      // Attempt second sale for the same session with conflicting parameters
      const secondCommand = new CreateSaleCommand({
        tenantId: 'tenant-1',
        currency: 'EUR', // conflicting currency
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: 'session-rehab-101',
        },
        items: [{ description: 'Therapy Session', quantity: 1, unitPriceAmount: 95.0 }],
      });

      const secondResult = await createHandler.execute(secondCommand);
      expect(secondResult.isSuccess).toBe(false);
      expect(secondResult.getError()).toBeInstanceOf(DuplicateSaleException);
      expect((secondResult.getError() as Error).message).toContain(
        "already exists for KINESIOLOGY_SESSION 'session-rehab-101'",
      );
    });

    it('permits multiple distinct sales for FOOD and DRINK retail items', async () => {
      const cmdA = new CreateSaleCommand({
        tenantId: 'tenant-1',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: 'food-order-bar-tab-1',
        },
        items: [{ description: 'Item A', quantity: 1, unitPriceAmount: 12.0 }],
      });

      const cmdB = new CreateSaleCommand({
        tenantId: 'tenant-1',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: 'food-order-bar-tab-1', // same source
        },
        items: [{ description: 'Item B', quantity: 1, unitPriceAmount: 8.0 }],
      });

      const resA = await createHandler.execute(cmdA);
      const resB = await createHandler.execute(cmdB);

      expect(resA.isSuccess).toBe(true);
      expect(resB.isSuccess).toBe(true);
      expect(resA.getValue().id).not.toBe(resB.getValue().id);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Valid Sale Without Source If Permitted
  // --------------------------------------------------------------------------
  describe('7. Valid Sale Without Source (Permitted Walk-In POS Retail)', () => {
    it('creates a valid DRAFT sale with standardized POS terminal source when allowWalkInWithoutSource is true', async () => {
      const command = new CreateSaleCommand({
        currency: 'USD',
        allowWalkInWithoutSource: true,
        items: [{ description: 'Front-desk Walk-in Towel', quantity: 1, unitPriceAmount: 5.0 }],
      });

      const result = await createHandler.execute(command);
      expect(result.isSuccess).toBe(true);

      const dto = result.getValue();
      expect(dto.status).toBe(SaleStatus.DRAFT);
      expect(dto.source.sourceType).toBe(SaleSourceType.DRINK);
      expect(dto.source.sourceId).toBe('pos_checkout_terminal');
      expect(dto.source.sourceCode).toBeNull();
      expect(dto.total.amount).toBe(5.0);
    });
  });

  // --------------------------------------------------------------------------
  // 8. Invalid Source Assignment to Existing Sale
  // --------------------------------------------------------------------------
  describe('8. Invalid Source Assignment to Existing Sale Workflows', () => {
    let existingSaleId: string;

    beforeEach(async () => {
      const createRes = await createHandler.execute(
        new CreateSaleCommand({
          currency: 'USD',
          source: {
            sourceType: SaleSourceType.FOOD,
            sourceId: 'original-salad-1',
          },
          items: [{ description: 'Caesar Salad', quantity: 1, unitPriceAmount: 11.0 }],
        }),
      );
      existingSaleId = createRes.getValue().id;
    });

    it('prohibits reassigning source on an existing DRAFT sale under ADR-0121 immutability law', async () => {
      const assignCmd = new AssignSaleSourceCommand({
        saleId: existingSaleId,
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: 'reassigned-pasta-2',
        },
      });

      const result = await assignHandler.execute(assignCmd);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect((result.getError() as InvalidSaleStateException).code).toBe('SALE_SOURCE_IMMUTABLE');
      expect((result.getError() as Error).message).toContain(
        'SaleSource has already been assigned and is strictly immutable',
      );

      // Verify the sale in repository was NOT mutated
      const reloaded = await repository.findById(existingSaleId);
      expect(reloaded?.source.sourceId).toBe('original-salad-1');
    });

    it('fails when attempting to assign an unsupported source type to an existing sale', async () => {
      const assignCmd = new AssignSaleSourceCommand({
        saleId: existingSaleId,
        source: {
          sourceType: 'INVALID_NEW_TYPE',
          sourceId: 'some-id',
        },
      });

      const result = await assignHandler.execute(assignCmd);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleSourceException);
      expect((result.getError() as InvalidSaleSourceException).code).toBe(
        'UNSUPPORTED_SALE_SOURCE_TYPE',
      );
    });

    it('fails when attempting to assign a source with empty reference ID', async () => {
      const assignCmd = new AssignSaleSourceCommand({
        saleId: existingSaleId,
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: '   ',
        },
      });

      const result = await assignHandler.execute(assignCmd);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleSourceException);
      expect((result.getError() as InvalidSaleSourceException).code).toBe(
        'INVALID_SALE_SOURCE_REFERENCE_ID',
      );
    });

    it('fails when the target Sale is not found in persistence', async () => {
      const assignCmd = new AssignSaleSourceCommand({
        saleId: 'non-existent-sale-id',
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: 'order-1',
        },
      });

      const result = await assignHandler.execute(assignCmd);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect((result.getError() as Error).message).toContain(
        "Sale with ID 'non-existent-sale-id' was not found.",
      );
    });

    it('prohibits assigning source to a CANCELLED sale', async () => {
      const sale = await repository.findById(existingSaleId);
      expect(sale).toBeDefined();
      sale?.cancel('Cancelled by test', clock);
      await repository.save(sale!);

      const assignCmd = new AssignSaleSourceCommand({
        saleId: existingSaleId,
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: 'new-food-order',
        },
      });

      const result = await assignHandler.execute(assignCmd);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect((result.getError() as InvalidSaleStateException).code).toBe(
        'CANNOT_MODIFY_CANCELLED_SALE',
      );
    });
  });
});
