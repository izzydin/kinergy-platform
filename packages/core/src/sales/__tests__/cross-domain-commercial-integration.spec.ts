import {
  CreateSaleHandler,
  CreateSaleCommand,
  SaleRepositoryPort,
  SaleSourceValidatorPort,
  ValidateSourceInput,
  SaleSourceValidationResult,
  ClientFacadePort,
  ClientSummaryPayload,
  Sale,
  SaleId,
  SaleStatus,
  SaleSourceType,
  SourceType,
  SourceNotFoundException,
  InvalidSaleSourceException,
  DuplicateSaleException,
  SaleNotFoundException,
} from '../../index';
import { DeterministicClock } from '../domain/shared/clock';
import * as fs from 'fs';
import * as path from 'path';

/**
 * High-fidelity in-memory Sale persistence adapter for integration testing.
 * Enforces transactional isolation and operational single-billing query contracts.
 */
class InMemorySaleRepository implements SaleRepositoryPort {
  private readonly store = new Map<string, Sale>();
  public saveCount = 0;
  public failOnSave?: Error;
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
    this.saveCount++;
    if (this.failOnSave) {
      throw this.failOnSave;
    }
    this.store.set(sale.id.value, sale);
  }

  public async withTransaction<T>(
    work: (transactionalRepo: SaleRepositoryPort) => Promise<T>,
  ): Promise<T> {
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
    this.saveCount = 0;
    this.failOnSave = undefined;
    this.txLock = false;
  }

  public get count(): number {
    return this.store.size;
  }
}

/**
 * Mock Client Facade simulating the Client domain boundary.
 */
class MockClientFacade implements ClientFacadePort {
  private readonly clients = new Map<string, ClientSummaryPayload>();

  public register(payload: ClientSummaryPayload): void {
    this.clients.set(payload.id, payload);
  }

  public async getClientSummary(clientId: string): Promise<ClientSummaryPayload | null> {
    return this.clients.get(clientId) ?? null;
  }
}

/**
 * Mock Source Validator dispatching validation and commercial detail resolution.
 */
class MockCrossDomainSourceValidator implements SaleSourceValidatorPort {
  public validateHandler?: (input: ValidateSourceInput) => Promise<SaleSourceValidationResult>;

  public async validateSource(input: ValidateSourceInput): Promise<SaleSourceValidationResult> {
    if (this.validateHandler) {
      return this.validateHandler(input);
    }
    return { isValid: true, exists: true };
  }
}

describe('Cross-Domain Commercial Integration Test Suite (Milestone 7.17 / 7.19 & ADR-0139)', () => {
  const fixedNow = new Date('2026-10-16T14:00:00.000Z');
  let clock: DeterministicClock;
  let saleRepo: InMemorySaleRepository;
  let clientFacade: MockClientFacade;
  let sourceValidator: MockCrossDomainSourceValidator;
  let handler: CreateSaleHandler;

  beforeEach(() => {
    clock = new DeterministicClock(fixedNow);
    saleRepo = new InMemorySaleRepository();
    clientFacade = new MockClientFacade();
    sourceValidator = new MockCrossDomainSourceValidator();

    clientFacade.register({
      id: 'patient-rehab-101',
      fullName: 'Alice Walker',
      email: 'alice.walker@example.com',
    });

    clientFacade.register({
      id: 'gym-member-202',
      fullName: 'Robert Davis',
      email: 'robert.davis@example.com',
    });

    handler = new CreateSaleHandler(saleRepo, clock, undefined, sourceValidator, clientFacade);
  });

  // ==========================================================================
  // 1. Kinesiology Integration
  // ==========================================================================
  describe('1. Kinesiology Commercial Source Integration', () => {
    it('creates a valid Sale reference for an eligible COMPLETED TreatmentSession with authoritative price and client', async () => {
      sourceValidator.validateHandler = async (input) => {
        expect(input.sourceType).toBe(SaleSourceType.KINESIOLOGY_SESSION);
        expect(input.sourceId).toBe('treatment-session-888');
        return {
          isValid: true,
          exists: true,
          belongsToContext: true,
          actualContext: 'kinesiology',
          commercialDetails: {
            clientId: 'patient-rehab-101',
            unitPriceCents: 8500, // $85.00
            currency: 'USD',
            description: 'Clinical Kinesiology Session - Therapist dr-smith',
            skuOrCode: 'appt-scheduling-999',
            version: 3,
          },
        };
      };

      const command = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: 'treatment-session-888',
          sourceCode: 'appt-scheduling-999',
        },
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(true);

      const sale = result.getValue();
      expect(sale.id).toBeDefined();
      expect(sale.status).toBe(SaleStatus.DRAFT);
      expect(sale.clientId).toBe('patient-rehab-101');
      expect(sale.currency).toBe('USD');
      expect(sale.source.sourceType).toBe(SaleSourceType.KINESIOLOGY_SESSION);
      expect(sale.source.sourceId).toBe('treatment-session-888');

      // Authoritative item snapshot verification
      expect(sale.items.length).toBe(1);
      const lineItem = sale.items[0];
      expect(lineItem).toBeDefined();
      if (lineItem) {
        expect(lineItem.description).toBe('Clinical Kinesiology Session - Therapist dr-smith');
        expect(lineItem.skuOrCode).toBe('appt-scheduling-999');
        expect(lineItem.unitPrice.amount).toBe(85);
        expect(lineItem.quantity).toBe(1);
      }
      expect(sale.total.amount).toBe(85);
    });

    it('strictly distinguishes TreatmentSession ID from Appointment ID and preserves both in the commercial snapshot', async () => {
      const treatmentSessionId = 'treatment-sess-uuid-001';
      const appointmentId = 'appt-calendar-booking-777';

      sourceValidator.validateHandler = async () => ({
        isValid: true,
        exists: true,
        commercialDetails: {
          clientId: 'patient-rehab-101',
          unitPriceCents: 12000,
          currency: 'USD',
          description: 'Comprehensive Kinesiology Evaluation',
          skuOrCode: appointmentId,
        },
      });

      const command = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: treatmentSessionId, // Operational source entity identity
          sourceCode: appointmentId, // External appointment schedule reference
        },
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(true);

      const sale = result.getValue();
      expect(sale.source.sourceId).toBe(treatmentSessionId);
      expect(sale.source.sourceId).not.toBe(appointmentId);
      expect(sale.items[0]?.skuOrCode).toBe(appointmentId);
    });

    it('rejects sale creation when TreatmentSession is in an ineligible lifecycle status (IN_PROGRESS, SCHEDULED, CANCELLED)', async () => {
      sourceValidator.validateHandler = async () => ({
        isValid: false,
        exists: true,
        errorMessage:
          "Treatment session 'sess-active' is in 'IN_PROGRESS' status. Only COMPLETED clinical sessions can be billed.",
      });

      const command = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: 'sess-active',
        },
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleSourceException);
      expect((result.getError() as InvalidSaleSourceException).code).toBe(
        'SOURCE_VALIDATION_FAILED',
      );
      expect((result.getError() as Error).message).toContain(
        'Only COMPLETED clinical sessions can be billed',
      );
      expect(saleRepo.count).toBe(0);
    });

    it('rejects sale creation when TreatmentSession does not exist in Kinesiology repository', async () => {
      sourceValidator.validateHandler = async () => ({
        isValid: false,
        exists: false,
        errorMessage: "TreatmentSession with ID 'sess-404' not found.",
      });

      const command = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: 'sess-404',
        },
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(SourceNotFoundException);
      expect((result.getError() as SourceNotFoundException).code).toBe('SOURCE_NOT_FOUND');
      expect(saleRepo.count).toBe(0);
    });

    it('rejects client mismatch when checkout client conflicts with authoritative patient on TreatmentSession', async () => {
      sourceValidator.validateHandler = async () => ({
        isValid: true,
        exists: true,
        commercialDetails: {
          clientId: 'patient-rehab-101', // Authoritative session patient
          unitPriceCents: 8500,
          currency: 'USD',
        },
      });

      const command = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        clientId: 'gym-member-202', // Conflicting customer ID
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: 'treatment-session-888',
        },
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleSourceException);
      expect((result.getError() as InvalidSaleSourceException).code).toBe('CLIENT_MISMATCH');
      expect((result.getError() as Error).message).toContain(
        "Requested client 'gym-member-202' does not match source client 'patient-rehab-101'",
      );
      expect(saleRepo.count).toBe(0);
    });

    it('strictly prohibits duplicate billing of the same TreatmentSession across separate commercial transactions', async () => {
      sourceValidator.validateHandler = async () => ({
        isValid: true,
        exists: true,
        commercialDetails: {
          clientId: 'patient-rehab-101',
          unitPriceCents: 8500,
          currency: 'USD',
        },
      });

      const commandA = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: 'session-single-billing-only',
        },
      });

      const commandB = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: 'session-single-billing-only',
        },
      });

      const resA = await handler.execute(commandA);
      expect(resA.isSuccess).toBe(true);

      const resB = await handler.execute(commandB);
      expect(resB.isSuccess).toBe(false);
      expect(resB.getError()).toBeInstanceOf(DuplicateSaleException);
      expect((resB.getError() as Error).message).toContain(
        "already exists for KINESIOLOGY_SESSION 'session-single-billing-only'",
      );
      expect(saleRepo.count).toBe(1);
    });
  });

  // ==========================================================================
  // 2. Gym Integration
  // ==========================================================================
  describe('2. Gym Management Commercial Source Integration', () => {
    it('creates a valid Sale reference for an ACTIVE MembershipPlan with authoritative catalog pricing', async () => {
      sourceValidator.validateHandler = async (input) => {
        expect(input.sourceType).toBe(SaleSourceType.GYM_MEMBERSHIP);
        return {
          isValid: true,
          exists: true,
          belongsToContext: true,
          actualContext: 'gym',
          commercialDetails: {
            unitPriceCents: 7500, // $75.00
            currency: 'USD',
            description: 'Gym Membership - Gold Monthly All-Access',
            skuOrCode: 'PLAN-GOLD-MONTHLY',
            version: 1,
          },
        };
      };

      const command = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        clientId: 'gym-member-202',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.GYM_MEMBERSHIP,
          sourceId: 'plan-gold-uuid',
          sourceCode: 'PLAN-GOLD-MONTHLY',
        },
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(true);

      const sale = result.getValue();
      expect(sale.source.sourceType).toBe(SaleSourceType.GYM_MEMBERSHIP);
      expect(sale.source.sourceId).toBe('plan-gold-uuid');
      expect(sale.items[0]?.skuOrCode).toBe('PLAN-GOLD-MONTHLY');
      expect(sale.total.amount).toBe(75);
    });

    it('rejects sale creation when MembershipPlan is in an ineligible status (DRAFT, ARCHIVED)', async () => {
      sourceValidator.validateHandler = async () => ({
        isValid: false,
        exists: true,
        errorMessage:
          "Membership plan 'Early Bird 2024' is in 'ARCHIVED' status. Only ACTIVE plans can be sold.",
      });

      const command = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        clientId: 'gym-member-202',
        source: {
          sourceType: SaleSourceType.GYM_MEMBERSHIP,
          sourceId: 'plan-archived-99',
        },
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleSourceException);
      expect((result.getError() as Error).message).toContain('Only ACTIVE plans can be sold');
      expect(saleRepo.count).toBe(0);
    });

    it('permits legitimate membership renewals and multiple distinct plan purchases without single-billing blocking', async () => {
      sourceValidator.validateHandler = async () => ({
        isValid: true,
        exists: true,
        commercialDetails: {
          unitPriceCents: 6000,
          currency: 'USD',
          description: 'Gym Membership - Standard Monthly',
          skuOrCode: 'PLAN-STD-MONTHLY',
        },
      });

      // Member 1 purchases the plan
      const purchase1 = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        clientId: 'gym-member-202',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.GYM_MEMBERSHIP,
          sourceId: 'plan-standard-monthly-id',
        },
      });

      // Member 2 purchases the same plan
      const purchase2 = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        clientId: 'patient-rehab-101',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.GYM_MEMBERSHIP,
          sourceId: 'plan-standard-monthly-id', // Same plan
        },
      });

      const res1 = await handler.execute(purchase1);
      const res2 = await handler.execute(purchase2);

      expect(res1.isSuccess).toBe(true);
      expect(res2.isSuccess).toBe(true);
      expect(res1.getValue().id).not.toBe(res2.getValue().id);
      expect(saleRepo.count).toBe(2);
    });

    it('prevents double-billing when replaying the same checkout request with identical idempotency token', async () => {
      sourceValidator.validateHandler = async () => ({
        isValid: true,
        exists: true,
        commercialDetails: {
          unitPriceCents: 5000,
          currency: 'USD',
        },
      });

      const command = new CreateSaleCommand({
        idempotencyKey: 'idemp-membership-checkout-alpha',
        tenantId: 'tenant-facility-1',
        clientId: 'gym-member-202',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.GYM_MEMBERSHIP,
          sourceId: 'plan-basic-id',
        },
      });

      const firstResult = await handler.execute(command);
      expect(firstResult.isSuccess).toBe(true);

      const replayResult = await handler.execute(command);
      expect(replayResult.isSuccess).toBe(true);

      expect(replayResult.getValue().id).toBe(firstResult.getValue().id);
      expect(saleRepo.saveCount).toBe(1);
    });

    it('rejects conflicting re-execution with same idempotency token but altered commercial parameters', async () => {
      sourceValidator.validateHandler = async () => ({
        isValid: true,
        exists: true,
        commercialDetails: {
          unitPriceCents: 5000,
          currency: 'USD',
        },
      });

      const initial = new CreateSaleCommand({
        idempotencyKey: 'fixed-tx-token-555',
        tenantId: 'tenant-facility-1',
        clientId: 'gym-member-202',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.GYM_MEMBERSHIP,
          sourceId: 'plan-basic-id',
        },
      });

      await handler.execute(initial);

      const conflicting = new CreateSaleCommand({
        idempotencyKey: 'fixed-tx-token-555',
        tenantId: 'tenant-facility-1',
        clientId: 'gym-member-202',
        currency: 'EUR', // Conflicting currency
        source: {
          sourceType: SaleSourceType.GYM_MEMBERSHIP,
          sourceId: 'plan-basic-id',
        },
      });

      const conflictRes = await handler.execute(conflicting);
      expect(conflictRes.isSuccess).toBe(false);
      expect(conflictRes.getError()).toBeInstanceOf(DuplicateSaleException);
    });
  });

  // ==========================================================================
  // 3. Resources (Food & Drink) Integration
  // ==========================================================================
  describe('3. Resources (Food & Drink) Commercial Source Integration', () => {
    it('creates valid Sale references for consumable FOOD and DRINK items using canonical inventory identity', async () => {
      sourceValidator.validateHandler = async (input) => {
        expect(input.sourceType).toBe(SaleSourceType.FOOD);
        return {
          isValid: true,
          exists: true,
          belongsToContext: true,
          actualContext: 'resources',
          commercialDetails: {
            unitPriceCents: 1250, // $12.50
            currency: 'USD',
            description: 'Organic Chicken & Rice Bowl',
            skuOrCode: 'FOOD-CHK-BOWL-01',
          },
        };
      };

      const command = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: 'item-inv-uuid-chicken',
          sourceCode: 'FOOD-CHK-BOWL-01',
        },
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(true);

      const sale = result.getValue();
      expect(sale.source.sourceType).toBe(SaleSourceType.FOOD);
      expect(sale.source.sourceId).toBe('item-inv-uuid-chicken');
      expect(sale.total.amount).toBe(12.5);
    });

    it('treats reusable Consumable SKU/ID as item reference rather than unique transaction identity, enabling repeat sales', async () => {
      sourceValidator.validateHandler = async () => ({
        isValid: true,
        exists: true,
        commercialDetails: {
          unitPriceCents: 450,
          currency: 'USD',
          description: 'Cold-Pressed Green Juice',
          skuOrCode: 'DRINK-GREEN-JUICE',
        },
      });

      const purchase1 = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.DRINK,
          sourceId: 'item-drink-green-001',
        },
      });

      const purchase2 = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.DRINK,
          sourceId: 'item-drink-green-001', // Same consumable SKU
        },
      });

      const res1 = await handler.execute(purchase1);
      const res2 = await handler.execute(purchase2);

      expect(res1.isSuccess).toBe(true);
      expect(res2.isSuccess).toBe(true);
      expect(res1.getValue().id).not.toBe(res2.getValue().id);
      expect(saleRepo.count).toBe(2);
    });

    it('rejects checkout when consumable stock is insufficient for the requested quantity', async () => {
      sourceValidator.validateHandler = async () => ({
        isValid: false,
        exists: true,
        errorMessage: "Insufficient stock for 'Whey Protein Isolate'. Available: 0, Requested: 1.",
      });

      const command = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.DRINK,
          sourceId: 'item-whey-protein',
        },
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleSourceException);
      expect((result.getError() as Error).message).toContain('Insufficient stock');
      expect(saleRepo.count).toBe(0);
    });

    it('rejects sale creation when inventory item is in an INACTIVE status', async () => {
      sourceValidator.validateHandler = async () => ({
        isValid: false,
        exists: true,
        errorMessage:
          "Inventory item 'Discontinued Energy Bar' is in 'INACTIVE' status. Only ACTIVE items can be sold.",
      });

      const command = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: 'item-discontinued-bar',
        },
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toBeInstanceOf(InvalidSaleSourceException);
      expect((result.getError() as Error).message).toContain('Only ACTIVE items can be sold');
      expect(saleRepo.count).toBe(0);
    });

    it('preserves stock invariants and avoids duplicate sales upon network retry with identical transaction identity', async () => {
      sourceValidator.validateHandler = async () => ({
        isValid: true,
        exists: true,
        commercialDetails: {
          unitPriceCents: 350,
          currency: 'USD',
          description: 'Electrolyte Water',
        },
      });

      const command = new CreateSaleCommand({
        idempotencyKey: 'pos-terminal-retry-order-99',
        tenantId: 'tenant-facility-1',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.DRINK,
          sourceId: 'item-water-01',
        },
      });

      const res1 = await handler.execute(command);
      expect(res1.isSuccess).toBe(true);

      const res2 = await handler.execute(command);
      expect(res2.isSuccess).toBe(true);

      expect(res1.getValue().id).toBe(res2.getValue().id);
      expect(saleRepo.saveCount).toBe(1);
    });
  });

  // ==========================================================================
  // 4. Shared Invariants, Boundary Integrity & Security
  // ==========================================================================
  describe('4. Shared Domain Invariants, Boundary Integrity & Security', () => {
    it('proves Sales bounded context owns financial totals, currency, and sale lifecycle without upstream leakage', async () => {
      sourceValidator.validateHandler = async () => ({
        isValid: true,
        exists: true,
        commercialDetails: {
          unitPriceCents: 5000,
          currency: 'USD',
          description: 'Standard Service',
        },
      });

      const command = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.DRINK,
          sourceId: 'service-item-1',
        },
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(true);

      const sale = result.getValue();
      expect(sale.status).toBe(SaleStatus.DRAFT);
      expect(sale.total.amount).toBe(50);
      expect(sale.subtotal.amount).toBe(50);
      expect(sale.discountTotal.amount).toBe(0);
      expect(sale.currency).toBe('USD');
    });

    it('proves source domains remain the sole authoritative owners of clinical notes, membership validity, and physical inventory', async () => {
      sourceValidator.validateHandler = async () => ({
        isValid: true,
        exists: true,
        commercialDetails: {
          clientId: 'patient-rehab-101',
          unitPriceCents: 8500,
          currency: 'USD',
          description: 'Clinical Kinesiology Session',
        },
      });

      const command = new CreateSaleCommand({
        tenantId: 'tenant-facility-1',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: 'session-chart-01',
        },
      });

      const result = await handler.execute(command);
      expect(result.isSuccess).toBe(true);

      // Verify Sale aggregate only captures commercial identifiers and contains zero medical chart fields
      const savedSale = await saleRepo.findById(result.getValue().id);
      expect(savedSale).not.toBeNull();
      if (savedSale) {
        expect(savedSale.source.sourceId).toBe('session-chart-01');
        // Type-level verification: notes, charts, subjective/objective clinical data do not exist on Sale
        expect((savedSale as unknown as Record<string, unknown>)['clinicalNotes']).toBeUndefined();
        expect((savedSale as unknown as Record<string, unknown>)['medicalRecord']).toBeUndefined();
      }
    });

    it('maps all cross-domain validation failures to established domain exception hierarchy (404, 422, 409)', async () => {
      // 1. 404: Source Not Found
      sourceValidator.validateHandler = async () => ({
        isValid: false,
        exists: false,
        errorMessage: 'Source entity missing',
      });
      const res404 = await handler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant-facility-1',
          source: { sourceType: SaleSourceType.FOOD, sourceId: 'missing-id' },
        }),
      );
      expect(res404.isSuccess).toBe(false);
      expect(res404.getError()).toBeInstanceOf(SourceNotFoundException);

      // 2. 422: Ineligible Source Lifecycle State
      sourceValidator.validateHandler = async () => ({
        isValid: false,
        exists: true,
        errorMessage: 'Source entity not billable',
      });
      const res422 = await handler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant-facility-1',
          source: { sourceType: SaleSourceType.FOOD, sourceId: 'ineligible-id' },
        }),
      );
      expect(res422.isSuccess).toBe(false);
      expect(res422.getError()).toBeInstanceOf(InvalidSaleSourceException);

      // 3. 409: Duplicate Sale Single-Billing Collision
      sourceValidator.validateHandler = async () => ({
        isValid: true,
        exists: true,
        commercialDetails: { unitPriceCents: 1000, currency: 'USD' },
      });
      await handler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant-facility-1',
          source: { sourceType: SaleSourceType.KINESIOLOGY_SESSION, sourceId: 'sess-single' },
        }),
      );
      const res409 = await handler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant-facility-1',
          source: { sourceType: SaleSourceType.KINESIOLOGY_SESSION, sourceId: 'sess-single' },
        }),
      );
      expect(res409.isSuccess).toBe(false);
      expect(res409.getError()).toBeInstanceOf(DuplicateSaleException);
    });

    it('enforces multi-tenant isolation, rejecting cross-tenant checkout probes with 404 resource concealment', async () => {
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
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect(saleRepo.count).toBe(0);
    });

    it('verifies architectural purity: zero Prisma or relational foreign key dependencies leak into domain or application boundaries', () => {
      const salesDomainPath = path.resolve(__dirname, '../domain');
      const salesApplicationPath = path.resolve(__dirname, '../application');

      const checkFilePurity = (dir: string): void => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            if (!file.includes('__tests__') && !file.includes('node_modules')) {
              checkFilePurity(fullPath);
            }
          } else if (file.endsWith('.ts') && !file.endsWith('.spec.ts')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            expect(content).not.toContain('@prisma/client');
            expect(content).not.toContain('PrismaClient');
            expect(content).not.toContain('prisma.');
          }
        }
      };

      checkFilePurity(salesDomainPath);
      checkFilePurity(salesApplicationPath);
    });
  });
});
