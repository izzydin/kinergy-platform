import { CreateSaleHandler } from '../handlers/create-sale.handler';
import { CreateSaleCommand } from '../commands/create-sale.command';
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
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { SaleSourceType } from '../../domain/enums/sale-source-type.enum';
import { SourceType } from '../../domain/enums/source-type.enum';
import { DeterministicClock } from '../../domain/shared/clock';
import { DomainEvent } from '../../domain/shared/domain-event';
import { SourceNotFoundException } from '../exceptions/source-not-found.exception';
import { InvalidSaleSourceException } from '../../domain/exceptions/invalid-sale-source.exception';
import { InvalidSaleStateException } from '../../domain/exceptions/invalid-sale-state.exception';
import { DuplicateSaleException } from '../../domain/exceptions/duplicate-sale.exception';

class InMemorySaleRepositoryWithTx implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public saveCallCount = 0;
  public throwOnSave?: Error;
  private txLock = false;

  public async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  public async findBySourceReference(
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

  public async findBySourceCode(sourceCode: string, tenantId?: string): Promise<Sale | null> {
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

  public async save(sale: Sale): Promise<void> {
    this.saveCallCount++;
    if (this.throwOnSave) {
      throw this.throwOnSave;
    }
    this.store.set(sale.id.value, sale);
  }

  public async withTransaction<T>(
    work: (transactionalRepo: SaleRepositoryPort) => Promise<T>,
  ): Promise<T> {
    // Basic transactional simulation with mutual exclusion
    while (this.txLock) {
      await new Promise((r) => setTimeout(r, 5));
    }
    this.txLock = true;
    try {
      return await work(this);
    } finally {
      this.txLock = false;
    }
  }

  public clear(): void {
    this.store.clear();
    this.saveCallCount = 0;
    this.throwOnSave = undefined;
    this.txLock = false;
  }
}

class MockSalesEventPublisher implements SalesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  public async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }

  public clear(): void {
    this.publishedEvents = [];
  }
}

class MockSaleSourceValidator implements SaleSourceValidatorPort {
  public validateFn?: (input: ValidateSourceInput) => Promise<SaleSourceValidationResult>;

  public async validateSource(input: ValidateSourceInput): Promise<SaleSourceValidationResult> {
    if (this.validateFn) {
      return this.validateFn(input);
    }
    return { isValid: true, exists: true };
  }
}

class MockClientFacade implements ClientFacadePort {
  public clients = new Map<string, ClientSummaryPayload>();

  public async getClientSummary(clientId: string): Promise<ClientSummaryPayload | null> {
    return this.clients.get(clientId) ?? null;
  }
}

describe('Cross-Domain Orchestration and Idempotency Specification (ADR-0120 & ADR-0139)', () => {
  const fixedNow = new Date('2026-10-16T12:00:00.000Z');
  let clock: DeterministicClock;
  let saleRepo: InMemorySaleRepositoryWithTx;
  let eventPublisher: MockSalesEventPublisher;
  let sourceValidator: MockSaleSourceValidator;
  let clientFacade: MockClientFacade;
  let handler: CreateSaleHandler;

  beforeEach(() => {
    clock = new DeterministicClock(fixedNow);
    saleRepo = new InMemorySaleRepositoryWithTx();
    eventPublisher = new MockSalesEventPublisher();
    sourceValidator = new MockSaleSourceValidator();
    clientFacade = new MockClientFacade();

    clientFacade.clients.set('client-patient-101', {
      id: 'client-patient-101',
      fullName: 'Alice Smith',
      email: 'alice@example.com',
    });

    clientFacade.clients.set('client-gym-member-202', {
      id: 'client-gym-member-202',
      fullName: 'Bob Jones',
      email: 'bob@example.com',
    });

    handler = new CreateSaleHandler(saleRepo, clock, eventPublisher, sourceValidator, clientFacade);
  });

  // ==========================================================================
  // 1. Repeated Requests & Caller-Supplied Idempotency
  // ==========================================================================
  describe('1. Repeated Requests & Transaction Idempotency', () => {
    it('returns the existing Sale without re-persisting when an identical retry is submitted with the same idempotency key', async () => {
      sourceValidator.validateFn = async () => ({
        isValid: true,
        exists: true,
        commercialDetails: {
          clientId: 'client-gym-member-202',
          unitPriceCents: 5000,
          currency: 'USD',
          description: 'Gym Basic Plan',
        },
      });

      const command = new CreateSaleCommand({
        idempotencyKey: 'checkout-idempotency-key-001',
        tenantId: 'tenant-facility-1',
        clientId: 'client-gym-member-202',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.GYM_MEMBERSHIP,
          sourceId: 'plan-basic-monthly',
        },
      });

      const firstResult = await handler.execute(command);
      expect(firstResult.isSuccess).toBe(true);
      const firstSale = firstResult.getValue();
      expect(firstSale.id).toBeDefined();
      expect(saleRepo.saveCallCount).toBe(1);

      // Replay identical request
      const retryResult = await handler.execute(command);
      expect(retryResult.isSuccess).toBe(true);
      const retrySale = retryResult.getValue();

      expect(retrySale.id).toBe(firstSale.id);
      expect(retrySale.totalAmount).toBe(firstSale.totalAmount);
      expect(saleRepo.saveCallCount).toBe(1); // Did not trigger second write
    });

    it('rejects with DuplicateSaleException when an existing transaction ID is submitted with conflicting parameters', async () => {
      sourceValidator.validateFn = async () => ({
        isValid: true,
        exists: true,
        commercialDetails: {
          unitPriceCents: 5000,
          currency: 'USD',
        },
      });

      const initialCmd = new CreateSaleCommand({
        idempotencyKey: 'fixed-tx-key-42',
        tenantId: 'tenant-facility-1',
        clientId: 'client-gym-member-202',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.GYM_MEMBERSHIP,
          sourceId: 'plan-basic-monthly',
        },
      });

      await handler.execute(initialCmd);

      // Conflicting retry: different client
      const conflictingCmd = new CreateSaleCommand({
        idempotencyKey: 'fixed-tx-key-42',
        tenantId: 'tenant-facility-1',
        clientId: 'client-patient-101', // Conflict
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.GYM_MEMBERSHIP,
          sourceId: 'plan-basic-monthly',
        },
      });

      const conflictResult = await handler.execute(conflictingCmd);
      expect(conflictResult.isSuccess).toBe(false);
      expect(conflictResult.getError()).toBeInstanceOf(DuplicateSaleException);
      expect((conflictResult.getError() as Error).message).toContain(
        'already exists with different transaction parameters',
      );
    });
  });

  // ==========================================================================
  // 2. Concurrent Duplicate Attempts
  // ==========================================================================
  describe('2. Concurrent Duplicate Attempts', () => {
    it('serializes concurrent duplicate requests with the same idempotency key, creating exactly one Sale', async () => {
      sourceValidator.validateFn = async () => ({
        isValid: true,
        exists: true,
        commercialDetails: {
          clientId: 'client-gym-member-202',
          unitPriceCents: 6000,
          currency: 'USD',
        },
      });

      const command = new CreateSaleCommand({
        idempotencyKey: 'race-condition-key-777',
        tenantId: 'tenant-facility-1',
        clientId: 'client-gym-member-202',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.GYM_MEMBERSHIP,
          sourceId: 'plan-premium-monthly',
        },
      });

      // Dispatch 3 concurrent requests simultaneously
      const results = await Promise.all([
        handler.execute(command),
        handler.execute(command),
        handler.execute(command),
      ]);

      // All 3 requests should resolve successfully to the same Sale
      for (const res of results) {
        expect(res.isSuccess).toBe(true);
      }

      const saleIds = results.map((r) => r.getValue().id);
      expect(saleIds[0]).toBe(saleIds[1]);
      expect(saleIds[1]).toBe(saleIds[2]);
      expect(saleRepo.saveCallCount).toBe(1);
    });

    it('rejects concurrent racing checkouts attempting to bill the same clinical session under different transaction IDs', async () => {
      sourceValidator.validateFn = async () => ({
        isValid: true,
        exists: true,
        commercialDetails: {
          clientId: 'client-patient-101',
          unitPriceCents: 8500,
          currency: 'USD',
        },
      });

      const sessionCmdA = new CreateSaleCommand({
        idempotencyKey: 'tx-branch-alpha',
        tenantId: 'tenant-facility-1',
        clientId: 'client-patient-101',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: 'session-concurrent-race-99',
        },
      });

      const sessionCmdB = new CreateSaleCommand({
        idempotencyKey: 'tx-branch-beta',
        tenantId: 'tenant-facility-1',
        clientId: 'client-patient-101',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: 'session-concurrent-race-99',
        },
      });

      // Execute sequentially or concurrently through withTransaction
      const [resA, resB] = await Promise.all([
        handler.execute(sessionCmdA),
        handler.execute(sessionCmdB),
      ]);

      const successCount = (resA.isSuccess ? 1 : 0) + (resB.isSuccess ? 1 : 0);
      const failCount = (resA.isFailure ? 1 : 0) + (resB.isFailure ? 1 : 0);

      expect(successCount).toBe(1);
      expect(failCount).toBe(1);

      const failedResult = resA.isFailure ? resA : resB;
      expect(failedResult.getError()).toBeInstanceOf(DuplicateSaleException);
      expect((failedResult.getError() as Error).message).toContain(
        "already exists for KINESIOLOGY_SESSION 'session-concurrent-race-99'",
      );
    });
  });

  // ==========================================================================
  // 3. Source Validation Failures
  // ==========================================================================
  describe('3. Source Validation Failures', () => {
    it('fails fast with SourceNotFoundException when the upstream source entity does not exist', async () => {
      sourceValidator.validateFn = async () => ({
        isValid: false,
        exists: false,
        errorMessage: "Clinical TreatmentSession 'session-ghost' does not exist.",
      });

      const command = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: 'session-ghost',
        },
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(SourceNotFoundException);
      expect((result.getError() as SourceNotFoundException).code).toBe('SOURCE_NOT_FOUND');
      expect(saleRepo.saveCallCount).toBe(0);
    });

    it('rejects with InvalidSaleSourceException when the source status is ineligible for billing', async () => {
      sourceValidator.validateFn = async () => ({
        isValid: false,
        exists: true,
        errorMessage:
          "Treatment session 'session-draft' is in 'IN_PROGRESS' status. Only COMPLETED clinical sessions can be billed.",
      });

      const command = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: 'session-draft',
        },
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleSourceException);
      expect((result.getError() as InvalidSaleSourceException).code).toBe(
        'SOURCE_VALIDATION_FAILED',
      );
      expect(saleRepo.saveCallCount).toBe(0);
    });

    it('rejects with CLIENT_MISMATCH when caller specifies a client that conflicts with the authoritative session client', async () => {
      sourceValidator.validateFn = async () => ({
        isValid: true,
        exists: true,
        commercialDetails: {
          clientId: 'client-patient-101', // Authoritative client on the treatment session
          unitPriceCents: 8500,
          currency: 'USD',
        },
      });

      const command = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        clientId: 'client-gym-member-202', // Conflicting client provided in checkout
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: 'session-rehab-valid',
        },
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleSourceException);
      expect((result.getError() as InvalidSaleSourceException).code).toBe('CLIENT_MISMATCH');
      expect((result.getError() as Error).message).toContain(
        "Requested client 'client-gym-member-202' does not match source client 'client-patient-101'",
      );
      expect(saleRepo.saveCallCount).toBe(0);
    });

    it('rejects checkout when client identity is empty or whitespace', async () => {
      sourceValidator.validateFn = async () => ({
        isValid: true,
        exists: true,
        commercialDetails: {
          unitPriceCents: 4500,
          currency: 'USD',
          description: 'Gym Plan',
        },
      });

      const command = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        currency: 'USD',
        clientId: '   ',
        source: {
          sourceType: SaleSourceType.GYM_MEMBERSHIP,
          sourceId: 'plan-basic',
        },
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect((result.getError() as Error).message).toContain(
        'clientId cannot be empty or whitespace.',
      );
      expect(saleRepo.saveCallCount).toBe(0);
    });
  });

  // ==========================================================================
  // 4. Persistence Failure
  // ==========================================================================
  describe('4. Database Persistence Failure', () => {
    it('does not publish domain events and returns a failed ApplicationResult when database save throws', async () => {
      saleRepo.throwOnSave = new Error(
        'PostgreSQL connection timeout: connection terminated unexpectedly.',
      );

      sourceValidator.validateFn = async () => ({
        isValid: true,
        exists: true,
        commercialDetails: {
          unitPriceCents: 1500,
          currency: 'USD',
          description: 'Protein Shake',
        },
      });

      const command = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.DRINK,
          sourceId: 'item-shake-vanilla',
        },
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(false);
      expect((result.getError() as Error).message).toContain('PostgreSQL connection timeout');
      expect(eventPublisher.publishedEvents.length).toBe(0);
      expect(saleRepo.store.size).toBe(0);
    });
  });

  // ==========================================================================
  // 5. Source-Specific Legitimate Repeated Transactions
  // ==========================================================================
  describe('5. Source-Specific Legitimate Repeated Transactions', () => {
    it('permits a customer to legitimately purchase the same Food/Drink consumable multiple times', async () => {
      sourceValidator.validateFn = async () => ({
        isValid: true,
        exists: true,
        commercialDetails: {
          unitPriceCents: 450,
          currency: 'USD',
          description: 'Electrolyte Hydration Drink',
          skuOrCode: 'DRINK-ELEC-01',
        },
      });

      // Customer buys a drink at 10:00 AM
      const sale1Cmd = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        clientId: 'client-gym-member-202',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.DRINK,
          sourceId: 'item-electrolyte-01',
        },
      });

      const sale1Res = await handler.execute(sale1Cmd);
      expect(sale1Res.isSuccess).toBe(true);

      // Customer buys a second drink at 11:30 AM (legitimate repeated transaction)
      const sale2Cmd = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        clientId: 'client-gym-member-202',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.DRINK,
          sourceId: 'item-electrolyte-01',
        },
      });

      const sale2Res = await handler.execute(sale2Cmd);
      expect(sale2Res.isSuccess).toBe(true);

      const sale1 = sale1Res.getValue();
      const sale2 = sale2Res.getValue();

      expect(sale1.id).not.toBe(sale2.id);
      expect(saleRepo.store.size).toBe(2);
    });

    it('permits multiple clients to purchase the same Gym MembershipPlan without single-billing collision', async () => {
      sourceValidator.validateFn = async () => ({
        isValid: true,
        exists: true,
        commercialDetails: {
          unitPriceCents: 10000,
          currency: 'USD',
          description: 'Monthly All-Access Gym Membership',
          skuOrCode: 'PLAN-ALL-ACCESS',
        },
      });

      // Client A purchases plan
      const clientACmd = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        clientId: 'client-patient-101',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.GYM_MEMBERSHIP,
          sourceId: 'plan-all-access-id',
        },
      });

      // Client B purchases the same plan
      const clientBCmd = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        clientId: 'client-gym-member-202',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.GYM_MEMBERSHIP,
          sourceId: 'plan-all-access-id',
        },
      });

      const resA = await handler.execute(clientACmd);
      const resB = await handler.execute(clientBCmd);

      expect(resA.isSuccess).toBe(true);
      expect(resB.isSuccess).toBe(true);
      expect(resA.getValue().id).not.toBe(resB.getValue().id);
      expect(saleRepo.store.size).toBe(2);
    });

    it('strictly prohibits duplicate billing of the same Clinical Kinesiology Session', async () => {
      sourceValidator.validateFn = async () => ({
        isValid: true,
        exists: true,
        commercialDetails: {
          clientId: 'client-patient-101',
          unitPriceCents: 8500,
          currency: 'USD',
          description: 'Clinical Kinesiology Session',
        },
      });

      const firstBill = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: 'session-rehab-exclusive-77',
        },
      });

      const secondBill = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: 'session-rehab-exclusive-77',
        },
      });

      const firstRes = await handler.execute(firstBill);
      expect(firstRes.isSuccess).toBe(true);

      const secondRes = await handler.execute(secondBill);
      expect(secondRes.isSuccess).toBe(false);
      expect(secondRes.getError()).toBeInstanceOf(DuplicateSaleException);
    });
  });

  // ==========================================================================
  // 6. Authoritative Snapshot Resolution
  // ==========================================================================
  describe('6. Authoritative Commercial Snapshot Resolution', () => {
    it('authoritatively adopts client and builds line item with integer-cent pricing from source details when omitted in request', async () => {
      sourceValidator.validateFn = async () => ({
        isValid: true,
        exists: true,
        commercialDetails: {
          clientId: 'client-patient-101',
          unitPriceCents: 12000, // $120.00
          currency: 'USD',
          description: 'Comprehensive Kinesiology Assessment',
          skuOrCode: 'APPT-REHAB-999',
        },
      });

      // Checkout request omits clientId, currency, and line items
      const command = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: 'session-assessment-123',
        },
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(true);

      const dto = result.getValue();
      expect(dto.clientId).toBe('client-patient-101');
      expect(dto.currency).toBe('USD');
      const firstItem = dto.items[0];
      expect(firstItem).toBeDefined();
      if (firstItem) {
        expect(firstItem.description).toBe('Comprehensive Kinesiology Assessment');
        expect(firstItem.skuOrCode).toBe('APPT-REHAB-999');
        expect(firstItem.unitPrice.amount).toBe(120);
      }
      expect(dto.total.amount).toBe(120);
    });
  });

  // ==========================================================================
  // 7. Multi-Tenant Boundary Enforcement
  // ==========================================================================
  describe('7. Multi-Tenant Boundary Enforcement', () => {
    it('rejects cross-tenant sale creation when user tenant does not match target tenant', async () => {
      const command = new CreateSaleCommand({
        tenantId: 'tenant-facility-2',
        currentUser: {
          id: 'user-cashier-1',
          tenantId: 'tenant-facility-1', // Tenant mismatch
          roles: ['Receptionist'],
          permissions: ['sales.create'],
        },
        source: {
          sourceType: SaleSourceType.DRINK,
          sourceId: 'item-water-01',
        },
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(false);
      expect((result.getError() as Error).message).toContain(
        "Sale with ID 'unknown' was not found.",
      );
      expect(saleRepo.saveCallCount).toBe(0);
    });
  });
});
