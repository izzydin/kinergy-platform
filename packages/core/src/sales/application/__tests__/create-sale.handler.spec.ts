import { CreateSaleHandler } from '../handlers/create-sale.handler';
import { CreateSaleCommand, CreateSaleInput } from '../commands/create-sale.command';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import {
  SaleSourceValidatorPort,
  ValidateSourceInput,
  SaleSourceValidationResult,
} from '../ports/sale-source-validator.port';
import { ClientFacadePort, ClientSummaryPayload } from '../ports/client-facade.port';
import { Sale } from '../../domain/sale.aggregate';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { SaleSource } from '../../domain/value-objects/sale-source.vo';
import { SourceReference } from '../../domain/value-objects/source-reference.vo';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { SaleSourceType } from '../../domain/enums/sale-source-type.enum';
import { SourceType } from '../../domain/enums/source-type.enum';
import { DeterministicClock } from '../../domain/shared/clock';
import { DomainEvent } from '../../domain/shared/domain-event';
import { ClientNotFoundException } from '../exceptions/client-not-found.exception';
import { SourceNotFoundException } from '../exceptions/source-not-found.exception';
import { InvalidSaleSourceException } from '../../domain/exceptions/invalid-sale-source.exception';
import { InvalidSaleStateException } from '../../domain/exceptions/invalid-sale-state.exception';
import { DuplicateSaleException } from '../../domain/exceptions/duplicate-sale.exception';
import { InvalidSaleItemException } from '../../domain/exceptions/invalid-sale-item.exception';
import { InvalidDiscountException } from '../../domain/exceptions/invalid-discount.exception';
import { InvalidMoneyException } from '../../domain/exceptions/invalid-money.exception';

class InMemorySaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public saveCallCount = 0;
  public throwOnSave?: Error;

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySourceReference(
    sourceType: SourceType | SaleSourceType | string,
    sourceId: string,
    tenantId?: string,
  ): Promise<Sale | null> {
    for (const sale of this.store.values()) {
      if (
        sale.status !== SaleStatus.CANCELLED &&
        sale.source.sourceType === sourceType &&
        sale.source.sourceId === sourceId &&
        (!tenantId || sale.tenantId === tenantId)
      ) {
        return sale;
      }
    }
    return null;
  }

  async findBySourceCode(sourceCode: string, tenantId?: string): Promise<Sale | null> {
    for (const sale of this.store.values()) {
      if (
        sale.status !== SaleStatus.CANCELLED &&
        sale.source.sourceCode === sourceCode &&
        (!tenantId || sale.tenantId === tenantId)
      ) {
        return sale;
      }
    }
    return null;
  }

  async save(sale: Sale): Promise<void> {
    this.saveCallCount++;
    if (this.throwOnSave) {
      throw this.throwOnSave;
    }
    this.store.set(sale.id.value, sale);
  }

  clear(): void {
    this.store.clear();
    this.saveCallCount = 0;
    this.throwOnSave = undefined;
  }
}

class MockSalesEventPublisher implements SalesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }

  clear(): void {
    this.publishedEvents = [];
  }
}

class MockSaleSourceValidator implements SaleSourceValidatorPort {
  public handler?: (input: ValidateSourceInput) => Promise<SaleSourceValidationResult>;

  async validateSource(input: ValidateSourceInput): Promise<SaleSourceValidationResult> {
    if (this.handler) {
      return this.handler(input);
    }
    return { isValid: true, exists: true };
  }
}

class MockClientFacade implements ClientFacadePort {
  public clients = new Map<string, ClientSummaryPayload>();
  public throwOnError?: Error;

  async getClientSummary(clientId: string): Promise<ClientSummaryPayload | null> {
    if (this.throwOnError) {
      throw this.throwOnError;
    }
    return this.clients.get(clientId) ?? null;
  }
}

function getErrorMessage(result: { getError(): Error | string | null }): string {
  const err = result.getError();
  return err instanceof Error ? err.message : String(err ?? '');
}

describe('CreateSaleHandler Specification (Milestone 7.11 & ADR-0132)', () => {
  const fixedNow = new Date('2026-10-01T12:00:00.000Z');
  let clock: DeterministicClock;
  let saleRepo: InMemorySaleRepository;
  let eventPublisher: MockSalesEventPublisher;
  let sourceValidator: MockSaleSourceValidator;
  let clientFacade: MockClientFacade;
  let handler: CreateSaleHandler;

  beforeEach(() => {
    clock = new DeterministicClock(fixedNow);
    saleRepo = new InMemorySaleRepository();
    eventPublisher = new MockSalesEventPublisher();
    sourceValidator = new MockSaleSourceValidator();
    clientFacade = new MockClientFacade();

    handler = new CreateSaleHandler(saleRepo, clock, eventPublisher, sourceValidator, clientFacade);
  });

  describe('1. Valid Sale Creation', () => {
    it('creates a minimal walk-in sale without upstream source reference', async () => {
      const command = new CreateSaleCommand({
        allowWalkInWithoutSource: true,
        currency: 'USD',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.id).toBeDefined();
      expect(dto.status).toBe(SaleStatus.DRAFT);
      expect(dto.currency).toBe('USD');
      expect(dto.source.sourceType).toBe(SaleSourceType.DRINK);
      expect(dto.source.sourceId).toBe('pos_checkout_terminal');
      expect(dto.source.sourceCode).toBeNull();
      expect(dto.subtotalAmount).toBe(0);
      expect(dto.discountTotalAmount).toBe(0);
      expect(dto.totalAmount).toBe(0);
      expect(dto.itemCount).toBe(0);
      expect(dto.version).toBe(1);

      // Verify persistence
      expect(saleRepo.saveCallCount).toBe(1);
      const persisted = saleRepo.store.get(dto.id);
      expect(persisted).toBeDefined();
      expect(persisted?.status).toBe(SaleStatus.DRAFT);

      // Verify domain events dispatched and cleared from aggregate
      expect(eventPublisher.publishedEvents).toHaveLength(1);
      expect(eventPublisher.publishedEvents[0]?.eventType).toBe('SaleCreated');
      expect(persisted?.getUncommittedEvents()).toHaveLength(0);
    });

    it('creates a sale with explicit SaleSource and tenant context', async () => {
      const command = new CreateSaleCommand({
        tenantId: 'tenant_kinergy_alpha',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.GYM_MEMBERSHIP,
          sourceId: 'plan_annual_gold_001',
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.tenantId).toBe('tenant_kinergy_alpha');
      expect(dto.source.sourceType).toBe(SaleSourceType.GYM_MEMBERSHIP);
      expect(dto.source.sourceId).toBe('plan_annual_gold_001');
      expect(dto.source.sourceCode).toBeNull();
    });

    it('creates a sale with legacy SourceReference type and preserves sourceCode', async () => {
      const command = new CreateSaleCommand({
        source: {
          sourceType: SourceType.CUSTOM_SERVICE,
          sourceId: 'service_biomech_audit',
          sourceCode: 'BIOMECH_2026',
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.source.sourceType).toBe(SourceType.CUSTOM_SERVICE);
      expect(dto.source.sourceId).toBe('service_biomech_audit');
      expect(dto.source.sourceCode).toBe('BIOMECH_2026');
    });

    it('resolves and links a client when clientId is specified and client exists', async () => {
      clientFacade.clients.set('client_alex_01', {
        id: 'client_alex_01',
        fullName: 'Alex Athlete',
        email: 'alex@example.com',
      });

      const command = new CreateSaleCommand({
        clientId: 'client_alex_01',
        allowWalkInWithoutSource: true,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().clientId).toBe('client_alex_01');
    });

    it('creates a sale with line items and verifies domain aggregate computes totals', async () => {
      const command = new CreateSaleCommand({
        allowWalkInWithoutSource: true,
        currency: 'USD',
        items: [
          {
            description: 'Kinesiology Tape Roll',
            skuOrCode: 'TAPE-01',
            quantity: 2,
            unitPriceAmount: 15.5, // 2 * 15.50 = 31.00
          },
          {
            description: 'Protein Shake',
            skuOrCode: 'PROT-02',
            quantity: 1,
            unitPriceAmount: 8.0, // 1 * 8.00 = 8.00
          },
        ],
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.itemCount).toBe(2);
      expect(dto.subtotalAmount).toBe(39.0);
      expect(dto.discountTotalAmount).toBe(0);
      expect(dto.totalAmount).toBe(39.0);
      expect(dto.items).toHaveLength(2);
      expect(dto.items[0]?.description).toBe('Kinesiology Tape Roll');
      expect(dto.items[0]?.subtotalAmount).toBe(31.0);
      expect(dto.items[1]?.description).toBe('Protein Shake');
      expect(dto.items[1]?.subtotalAmount).toBe(8.0);

      // Verify domain events: SaleCreated + 2 SaleItemAdded
      expect(eventPublisher.publishedEvents).toHaveLength(3);
      const eventTypes = eventPublisher.publishedEvents.map((e) => e.eventType);
      expect(eventTypes).toContain('SaleCreated');
      expect(eventTypes.filter((t) => t === 'SaleItemAdded')).toHaveLength(2);
    });

    it('creates a sale with item discounts and order discount with deterministic domain arithmetic', async () => {
      const command = new CreateSaleCommand({
        allowWalkInWithoutSource: true,
        currency: 'USD',
        items: [
          {
            description: 'Rehab Band Set',
            quantity: 1,
            unitPriceAmount: 100.0,
            discount: {
              type: 'PERCENTAGE',
              value: 10, // 10% off 100 = 10 discount, line total = 90
              reason: 'Promo VIP',
            },
          },
        ],
        orderDiscount: {
          type: 'FIXED',
          value: 15.0, // Order discount 15 off line total 90 = 75 total
          reason: 'Manager Courtesy',
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.subtotalAmount).toBe(100.0);
      // Line discount 10 + order discount 15 = 25 total discount
      expect(dto.discountTotalAmount).toBe(25.0);
      expect(dto.totalAmount).toBe(75.0);
    });

    it('supports idempotent re-execution with identical transaction parameters', async () => {
      const input: CreateSaleInput = {
        id: 'sale_idempotent_001',
        tenantId: 'tenant_1',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.DRINK,
          sourceId: 'drink_item_water',
        },
      };

      const result1 = await handler.execute(new CreateSaleCommand(input));
      expect(result1.isSuccess).toBe(true);
      expect(saleRepo.saveCallCount).toBe(1);

      // Re-execute with identical parameters
      const result2 = await handler.execute(new CreateSaleCommand(input));
      expect(result2.isSuccess).toBe(true);
      expect(result2.getValue().id).toBe('sale_idempotent_001');
      // Save should NOT be called again
      expect(saleRepo.saveCallCount).toBe(1);
    });
  });

  describe('2. Missing Required Fields and Application Preconditions', () => {
    it('fails when command is null or undefined', async () => {
      const result = await handler.execute(null as unknown as CreateSaleCommand);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleSourceException);
      expect(getErrorMessage(result)).toContain('cannot be null or undefined');
    });

    it('fails when input is null or undefined', async () => {
      const result = await handler.execute(
        new CreateSaleCommand(null as unknown as CreateSaleInput),
      );

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleSourceException);
    });

    it('fails when tenantId is empty string or only whitespace', async () => {
      const command = new CreateSaleCommand({
        tenantId: '   ',
        allowWalkInWithoutSource: true,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect(getErrorMessage(result)).toContain('tenantId cannot be empty or whitespace');
    });

    it('fails when clientId is empty string or only whitespace', async () => {
      const command = new CreateSaleCommand({
        clientId: '   ',
        allowWalkInWithoutSource: true,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect(getErrorMessage(result)).toContain('clientId cannot be empty or whitespace');
    });

    it('fails when source is missing and allowWalkInWithoutSource is not true', async () => {
      const command = new CreateSaleCommand({
        currency: 'USD',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleSourceException);
      expect((result.getError() as InvalidSaleSourceException).code).toBe(
        'MISSING_SOURCE_REFERENCE',
      );
    });

    it('fails when source.sourceId is empty string or whitespace', async () => {
      const command = new CreateSaleCommand({
        source: {
          sourceType: SaleSourceType.DRINK,
          sourceId: '   ',
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleSourceException);
      expect((result.getError() as InvalidSaleSourceException).code).toBe(
        'INVALID_SALE_SOURCE_REFERENCE_ID',
      );
    });
  });

  describe('3. Invalid Client Handling', () => {
    it('fails with ClientNotFoundException when client does not exist in client facade', async () => {
      const command = new CreateSaleCommand({
        clientId: 'non_existent_client_999',
        allowWalkInWithoutSource: true,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(ClientNotFoundException);
      expect((result.getError() as ClientNotFoundException).clientId).toBe(
        'non_existent_client_999',
      );
    });

    it('returns failure when client facade throws an unexpected error', async () => {
      clientFacade.throwOnError = new Error('Client context service unavailable');

      const command = new CreateSaleCommand({
        clientId: 'client_any',
        allowWalkInWithoutSource: true,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(getErrorMessage(result)).toContain('Client context service unavailable');
    });
  });

  describe('4. Invalid Source Handling', () => {
    it('fails when sourceType is unsupported', async () => {
      const command = new CreateSaleCommand({
        source: {
          sourceType: 'UNKNOWN_FABRICATED_SOURCE_TYPE',
          sourceId: '123',
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleSourceException);
      expect((result.getError() as InvalidSaleSourceException).code).toBe(
        'UNSUPPORTED_SALE_SOURCE_TYPE',
      );
    });

    it('fails with SourceNotFoundException when source does not exist in upstream domain', async () => {
      sourceValidator.handler = async () => ({
        exists: false,
        isValid: false,
        errorMessage: "Treatment session 'sess_999' not found",
      });

      const command = new CreateSaleCommand({
        source: {
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: 'sess_999',
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(SourceNotFoundException);
      expect((result.getError() as SourceNotFoundException).sourceId).toBe('sess_999');
    });

    it('fails with SOURCE_CONTEXT_MISMATCH when source belongs to a different context', async () => {
      sourceValidator.handler = async () => ({
        exists: true,
        isValid: true,
        belongsToContext: false,
        actualContext: 'nutrition',
        errorMessage: 'Source entity belongs to nutrition context',
      });

      const command = new CreateSaleCommand({
        expectedContext: 'clinical',
        source: {
          sourceType: SourceType.CUSTOM_SERVICE,
          sourceId: 'srv_100',
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleSourceException);
      expect((result.getError() as InvalidSaleSourceException).code).toBe(
        'SOURCE_CONTEXT_MISMATCH',
      );
    });

    it('fails with SOURCE_VALIDATION_FAILED when upstream source entity state is invalid', async () => {
      sourceValidator.handler = async () => ({
        exists: true,
        isValid: false,
        errorMessage: 'Clinical session is already marked completed and settled',
      });

      const command = new CreateSaleCommand({
        source: {
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: 'sess_completed',
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleSourceException);
      expect((result.getError() as InvalidSaleSourceException).code).toBe(
        'SOURCE_VALIDATION_FAILED',
      );
      expect(getErrorMessage(result)).toContain('already marked completed');
    });
  });

  describe('5. Invalid Currency Handling', () => {
    it('fails when currency code is not a valid 3-letter ISO code', async () => {
      const invalidCurrencies = ['US', 'USDD', '123', 'usd-1', '$$$'];

      for (const badCurrency of invalidCurrencies) {
        const command = new CreateSaleCommand({
          currency: badCurrency,
          allowWalkInWithoutSource: true,
        });

        const result = await handler.execute(command);

        expect(result.isSuccess).toBe(false);
        expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
        expect(getErrorMessage(result)).toContain('Invalid ISO-4217 currency code');
      }
    });
  });

  describe('6. Invalid Domain State Handling', () => {
    it('fails when item unit price is negative', async () => {
      const command = new CreateSaleCommand({
        allowWalkInWithoutSource: true,
        currency: 'USD',
        items: [
          {
            description: 'Faulty Service',
            quantity: 1,
            unitPriceAmount: -25.0,
          },
        ],
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidMoneyException);
      expect(getErrorMessage(result)).toContain('cannot be negative');
    });

    it('fails when item quantity is zero or negative', async () => {
      const commandZero = new CreateSaleCommand({
        allowWalkInWithoutSource: true,
        currency: 'USD',
        items: [
          {
            description: 'Item',
            quantity: 0,
            unitPriceAmount: 10,
          },
        ],
      });

      const resultZero = await handler.execute(commandZero);
      expect(resultZero.isSuccess).toBe(false);
      expect(resultZero.getError()).toBeInstanceOf(InvalidSaleItemException);

      const commandNegative = new CreateSaleCommand({
        allowWalkInWithoutSource: true,
        currency: 'USD',
        items: [
          {
            description: 'Item',
            quantity: -3,
            unitPriceAmount: 10,
          },
        ],
      });

      const resultNegative = await handler.execute(commandNegative);
      expect(resultNegative.isSuccess).toBe(false);
      expect(resultNegative.getError()).toBeInstanceOf(InvalidSaleItemException);
    });

    it('fails when item quantity underflows decimal precision (< 0.001)', async () => {
      const command = new CreateSaleCommand({
        allowWalkInWithoutSource: true,
        currency: 'USD',
        items: [
          {
            description: 'Micro Quantity',
            quantity: 0.0001,
            unitPriceAmount: 100,
          },
        ],
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleItemException);
      expect(getErrorMessage(result)).toContain('rounds down to 0');
    });

    it('fails when item description is empty', async () => {
      const command = new CreateSaleCommand({
        allowWalkInWithoutSource: true,
        currency: 'USD',
        items: [
          {
            description: '   ',
            quantity: 1,
            unitPriceAmount: 10,
          },
        ],
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleItemException);
      expect(getErrorMessage(result)).toContain('description cannot be empty');
    });

    it('fails when order discount percentage exceeds 100% or is negative', async () => {
      const commandOver100 = new CreateSaleCommand({
        allowWalkInWithoutSource: true,
        currency: 'USD',
        orderDiscount: {
          type: 'PERCENTAGE',
          value: 120,
        },
      });

      const resultOver100 = await handler.execute(commandOver100);
      expect(resultOver100.isSuccess).toBe(false);
      expect(resultOver100.getError()).toBeInstanceOf(InvalidDiscountException);

      const commandNegative = new CreateSaleCommand({
        allowWalkInWithoutSource: true,
        currency: 'USD',
        orderDiscount: {
          type: 'PERCENTAGE',
          value: -10,
        },
      });

      const resultNegative = await handler.execute(commandNegative);
      expect(resultNegative.isSuccess).toBe(false);
      expect(resultNegative.getError()).toBeInstanceOf(InvalidDiscountException);
    });

    it('fails when discount type is invalid', async () => {
      const command = new CreateSaleCommand({
        allowWalkInWithoutSource: true,
        currency: 'USD',
        orderDiscount: {
          type: 'BOGUS_DISCOUNT_TYPE',
          value: 10,
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidDiscountException);
      expect(getErrorMessage(result)).toContain('Invalid discount type');
    });
  });

  describe('7. Repository Failures, Collisions, and Uniqueness Invariants', () => {
    it('returns failure when repository save throws an unexpected error', async () => {
      saleRepo.throwOnSave = new Error('Database disk full');

      const command = new CreateSaleCommand({
        allowWalkInWithoutSource: true,
        currency: 'USD',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(getErrorMessage(result)).toBe('Database disk full');
    });

    it('fails with DuplicateSaleException when ID exists with differing transaction parameters', async () => {
      const existingSale = Sale.create(
        {
          id: SaleId.create('sale_collision_id'),
          currency: 'USD',
          source: SaleSource.create(SaleSourceType.FOOD, 'snack_001'),
        },
        clock,
      );
      saleRepo.store.set(existingSale.id.value, existingSale);

      const command = new CreateSaleCommand({
        id: 'sale_collision_id',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.DRINK, // Different sourceType
          sourceId: 'drink_002',
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(DuplicateSaleException);
      expect(getErrorMessage(result)).toContain(
        'already exists with different transaction parameters',
      );
    });

    it('enforces single-billing invariant: rejects duplicate active sale for TreatmentSession', async () => {
      const existingSale = Sale.create(
        {
          id: SaleId.create('sale_session_001'),
          tenantId: 'tenant_kinergy',
          currency: 'USD',
          source: SourceReference.create({
            sourceType: SourceType.TREATMENT_SESSION,
            sourceId: 'session_clinical_456',
          }),
        },
        clock,
      );
      saleRepo.store.set(existingSale.id.value, existingSale);

      const command = new CreateSaleCommand({
        tenantId: 'tenant_kinergy',
        currency: 'USD',
        source: {
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: 'session_clinical_456',
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(DuplicateSaleException);
      expect(getErrorMessage(result)).toContain('already exists for TreatmentSession');
    });

    it('enforces external order code uniqueness when non-generic code collides', async () => {
      const existingSale = Sale.create(
        {
          id: SaleId.create('sale_order_first'),
          tenantId: 'tenant_kinergy',
          currency: 'USD',
          source: SourceReference.create({
            sourceType: SourceType.MEMBERSHIP_PLAN,
            sourceId: 'plan_annual',
            sourceCode: 'ORDER-2026-X99',
          }),
        },
        clock,
      );
      saleRepo.store.set(existingSale.id.value, existingSale);

      const command = new CreateSaleCommand({
        id: 'sale_order_second',
        tenantId: 'tenant_kinergy',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: 'different_plan',
          sourceCode: 'ORDER-2026-X99',
        },
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(DuplicateSaleException);
      expect(getErrorMessage(result)).toContain('already exists with order reference');
    });
  });

  describe('8. Domain Invariant Ownership & Purity', () => {
    it('verifies the aggregate root owns totals and status without application layer manual arithmetic', async () => {
      const command = new CreateSaleCommand({
        allowWalkInWithoutSource: true,
        currency: 'USD',
        items: [
          {
            description: 'Item A',
            quantity: 3,
            unitPriceAmount: 33.33, // 3 * 33.33 = 99.99
          },
        ],
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      // The aggregate computed 99.99 without application layer doing manual arithmetic
      expect(dto.subtotalAmount).toBe(99.99);
      expect(dto.totalAmount).toBe(99.99);
      expect(dto.status).toBe(SaleStatus.DRAFT);
    });
  });
});
