import { BillTreatmentSessionHandler } from './bill-treatment-session.handler';
import { BillTreatmentSessionCommand } from '../commands/bill-treatment-session.command';
import { TreatmentSessionBillingCoordinator } from './treatment-session-billing.coordinator';
import { ITreatmentSessionRepository } from '../../domain/repositories/treatment-session.repository';
import { TreatmentSession } from '../../domain/treatment-session/treatment-session.aggregate';
import { SessionId } from '../../domain/treatment-session/session-id.vo';
import { SessionStatus } from '../../domain/treatment-session/session-status.enum';
import { SessionNotes } from '../../domain/treatment-session/session-notes.vo';
import { TreatmentSessionCompletedEvent } from '../../domain/events/treatment-session-completed.event';
import { IKinesiologySalesGatewayPort } from '../ports/kinesiology-sales-gateway.port';
import { ISchedulingAppointmentLookupPort } from '../ports/scheduling-appointment-lookup.port';
import { DefaultKinesiologyFeeScheduleResolver } from '../ports/kinesiology-fee-schedule.resolver';
import { AppointmentReferenceDTO } from '../dtos/appointment-reference.dto';
import { KinesiologySalesGatewayAdapter } from '../../infrastructure/adapters/kinesiology-sales-gateway.adapter';
import { CreateSaleHandler } from '../../../sales/application/handlers/create-sale.handler';
import { SaleRepositoryPort } from '../../../sales/application/ports/sale-repository.port';
import { Sale } from '../../../sales/domain/sale.aggregate';
import { SaleId } from '../../../sales/domain/value-objects/sale-id.vo';

class InMemoryTreatmentSessionRepository implements ITreatmentSessionRepository {
  public sessions = new Map<string, TreatmentSession>();

  async findById(id: SessionId): Promise<TreatmentSession | null> {
    return this.sessions.get(id.getValue()) ?? null;
  }

  async findByAppointmentId(appointmentId: string): Promise<TreatmentSession | null> {
    for (const session of this.sessions.values()) {
      if (session.appointmentId === appointmentId) return session;
    }
    return null;
  }

  async save(session: TreatmentSession): Promise<void> {
    this.sessions.set(session.id.getValue(), session);
  }

  async findHistoryByClientId(): Promise<never> {
    throw new Error('Not used in test.');
  }
}

class InMemorySalesRepository implements SaleRepositoryPort {
  public sales = new Map<string, Sale>();

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id : id.value;
    return this.sales.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.sales.set(sale.id.value, sale);
  }

  async findBySourceReference(
    sourceType: string,
    sourceId: string,
    tenantId?: string,
  ): Promise<Sale | null> {
    for (const sale of this.sales.values()) {
      if (
        sale.source.sourceType === sourceType &&
        sale.source.sourceId === sourceId &&
        (!tenantId || sale.tenantId === tenantId) &&
        sale.status !== 'CANCELLED'
      ) {
        return sale;
      }
    }
    return null;
  }

  async findBySourceCode(sourceCode: string, tenantId?: string): Promise<Sale | null> {
    for (const sale of this.sales.values()) {
      if (
        sale.source.sourceId === sourceCode &&
        (!tenantId || sale.tenantId === tenantId) &&
        sale.status !== 'CANCELLED'
      ) {
        return sale;
      }
    }
    return null;
  }
}

describe('Prompt 7A: Kinesiology-to-Sales Commercial Integration (ADR-0139)', () => {
  let sessionRepo: InMemoryTreatmentSessionRepository;
  let salesRepo: InMemorySalesRepository;
  let salesGateway: IKinesiologySalesGatewayPort;
  let mockAppointmentLookup: jest.Mocked<ISchedulingAppointmentLookupPort>;
  let handler: BillTreatmentSessionHandler;
  let coordinator: TreatmentSessionBillingCoordinator;

  beforeEach(() => {
    sessionRepo = new InMemoryTreatmentSessionRepository();
    salesRepo = new InMemorySalesRepository();

    const realCreateSaleHandler = new CreateSaleHandler(salesRepo);
    salesGateway = new KinesiologySalesGatewayAdapter(realCreateSaleHandler);

    mockAppointmentLookup = {
      getAppointmentReference: jest.fn(),
    };

    handler = new BillTreatmentSessionHandler(
      sessionRepo,
      salesGateway,
      mockAppointmentLookup,
      new DefaultKinesiologyFeeScheduleResolver(),
    );

    coordinator = new TreatmentSessionBillingCoordinator(handler);
  });

  function seedSession(status: SessionStatus = SessionStatus.COMPLETED): TreatmentSession {
    const session = TreatmentSession.reconstitute({
      id: SessionId.create('sess_pt_100'),
      version: 3,
      status,
      clientId: 'client_pt_123',
      therapistId: 'therapist_dr_smith',
      appointmentId: 'appt_999',
      notes: SessionNotes.create({
        subjective: 'Lower back mobility improved.',
        plan: 'Discharge with home exercise regimen.',
      }),
      createdAt: new Date('2026-10-16T10:00:00.000Z'),
      updatedAt: new Date('2026-10-16T11:00:00.000Z'),
    });
    sessionRepo.sessions.set(session.id.getValue(), session);
    return session;
  }

  describe('1. Canonical Source Reference & Eligible Happy Path', () => {
    it('should successfully create a commercial Sale referencing TreatmentSession ID as canonical sourceId', async () => {
      seedSession(SessionStatus.COMPLETED);

      const command = new BillTreatmentSessionCommand({
        sessionId: 'sess_pt_100',
        expectedClientId: 'client_pt_123',
        tenantId: 'tenant_clin_01',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const saleResult = result.getValue();
      expect(saleResult.saleId).toBeDefined();
      expect(saleResult.totalAmount).toBe(80.0); // Default clinical session rate
      expect(saleResult.currency).toBe('USD');
      expect(saleResult.status).toBe('DRAFT');

      // Verify Sale aggregate in sales repository
      const createdSale = await salesRepo.findById(saleResult.saleId);
      expect(createdSale).not.toBeNull();
      expect(createdSale?.source.sourceType).toBe('KINESIOLOGY_SESSION');
      expect(createdSale?.source.sourceId).toBe('sess_pt_100'); // NOT appt_999!
      expect(createdSale?.clientId).toBe('client_pt_123');
      expect(createdSale?.items[0]?.skuOrCode).toBe('appt_999'); // Appointment stored as SKU/reference

      // Verify TreatmentSession in Kinesiology repository is preserved and unmutated
      const persistedSession = await sessionRepo.findById(SessionId.create('sess_pt_100'));
      expect(persistedSession?.status).toBe(SessionStatus.COMPLETED);
      expect(persistedSession?.notes.getSubjective()).toBe('Lower back mobility improved.');
    });

    it('should coordinate commercial Sale creation directly from TreatmentSessionCompletedEvent', async () => {
      seedSession(SessionStatus.COMPLETED);

      const event = new TreatmentSessionCompletedEvent(
        'sess_pt_100',
        'client_pt_123',
        'therapist_dr_smith',
        'appt_999',
        3,
      );

      const result = await coordinator.onSessionCompleted(event, 'tenant_clin_01');

      expect(result.isSuccess).toBe(true);
      const saleResult = result.getValue();
      expect(saleResult.saleId).toBeDefined();

      const createdSale = await salesRepo.findById(saleResult.saleId);
      expect(createdSale?.source.sourceId).toBe('sess_pt_100');
      expect(createdSale?.clientId).toBe('client_pt_123');
    });
  });

  describe('2. Missing Source Handling', () => {
    it('should fail with not found error when TreatmentSession does not exist', async () => {
      const command = new BillTreatmentSessionCommand({
        sessionId: 'sess_nonexistent_999',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain(
        "TreatmentSession with ID 'sess_nonexistent_999' not found.",
      );
      expect(salesRepo.sales.size).toBe(0);
    });

    it('should reject empty or whitespace sessionId immediately', async () => {
      const command = new BillTreatmentSessionCommand({
        sessionId: '   ',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('Session ID cannot be empty');
      expect(salesRepo.sales.size).toBe(0);
    });
  });

  describe('3. Ineligible Source Lifecycle States', () => {
    it('should reject billing an IN_PROGRESS session and leave session status strictly unmutated', async () => {
      seedSession(SessionStatus.IN_PROGRESS);

      const command = new BillTreatmentSessionCommand({
        sessionId: 'sess_pt_100',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('IN_PROGRESS');
      expect(result.getError()).toContain('Only COMPLETED clinical sessions can be billed');

      // Assert zero Sales created
      expect(salesRepo.sales.size).toBe(0);

      // Assert TreatmentSession remains in IN_PROGRESS (did not mutate to make billing easier)
      const session = await sessionRepo.findById(SessionId.create('sess_pt_100'));
      expect(session?.status).toBe(SessionStatus.IN_PROGRESS);
    });

    it('should reject billing a SCHEDULED session', async () => {
      seedSession(SessionStatus.SCHEDULED);

      const command = new BillTreatmentSessionCommand({
        sessionId: 'sess_pt_100',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('SCHEDULED');
      expect(salesRepo.sales.size).toBe(0);

      const session = await sessionRepo.findById(SessionId.create('sess_pt_100'));
      expect(session?.status).toBe(SessionStatus.SCHEDULED);
    });

    it('should reject billing a CANCELLED session', async () => {
      seedSession(SessionStatus.CANCELLED);

      const command = new BillTreatmentSessionCommand({
        sessionId: 'sess_pt_100',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('CANCELLED');
      expect(salesRepo.sales.size).toBe(0);
    });

    it('should reject billing a NO_SHOW session', async () => {
      seedSession(SessionStatus.NO_SHOW);

      const command = new BillTreatmentSessionCommand({
        sessionId: 'sess_pt_100',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('NO_SHOW');
      expect(salesRepo.sales.size).toBe(0);
    });
  });

  describe('4. Client Mismatch Enforcement', () => {
    it('should reject billing when expectedClientId does not match session.clientId', async () => {
      seedSession(SessionStatus.COMPLETED); // session.clientId is 'client_pt_123'

      const command = new BillTreatmentSessionCommand({
        sessionId: 'sess_pt_100',
        expectedClientId: 'client_attacker_666',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('Client mismatch');
      expect(result.getError()).toContain('client_pt_123');
      expect(result.getError()).toContain('client_attacker_666');
      expect(salesRepo.sales.size).toBe(0);
    });
  });

  describe('5. Authoritative Price and Currency Resolution', () => {
    it('should map appointment service fee dynamically when appointment lookup resolves', async () => {
      seedSession(SessionStatus.COMPLETED);

      const apptReference: AppointmentReferenceDTO = {
        appointmentId: 'appt_999',
        clientId: 'client_pt_123',
        therapistId: 'therapist_dr_smith',
        scheduledAt: new Date('2026-10-16T10:00:00.000Z'),
        isEligibleForSession: true,
      };
      mockAppointmentLookup.getAppointmentReference.mockResolvedValueOnce(apptReference);

      const command = new BillTreatmentSessionCommand({
        sessionId: 'sess_pt_100',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().totalAmount).toBe(85.0); // TREATMENT rate = $85.00
      expect(mockAppointmentLookup.getAppointmentReference).toHaveBeenCalledWith('appt_999');
    });

    it('should fall back gracefully to default clinical session rate if appointment lookup fails', async () => {
      seedSession(SessionStatus.COMPLETED);
      mockAppointmentLookup.getAppointmentReference.mockRejectedValueOnce(
        new Error('Scheduling service temporarily unreachable'),
      );

      const command = new BillTreatmentSessionCommand({
        sessionId: 'sess_pt_100',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().totalAmount).toBe(80.0); // Default clinical rate = $80.00
    });
  });

  describe('6. Repeated Requests, Idempotency & Single-Billing Invariant', () => {
    it('should return existing Sale on idempotent retry with identical parameters', async () => {
      seedSession(SessionStatus.COMPLETED);

      const command = new BillTreatmentSessionCommand({
        sessionId: 'sess_pt_100',
        expectedClientId: 'client_pt_123',
        tenantId: 'tenant_clin_01',
        idempotencyKey: 'idemp_key_100',
      });

      // First call -> creates Sale
      const firstResult = await handler.execute(command);
      expect(firstResult.isSuccess).toBe(true);
      const firstSaleId = firstResult.getValue().saleId;

      // Second call (matching retry) -> returns existing Sale
      const secondResult = await handler.execute(command);
      expect(secondResult.isSuccess).toBe(true);
      expect(secondResult.getValue().saleId).toBe(firstSaleId);

      // Only 1 sale in persistence
      expect(salesRepo.sales.size).toBe(1);
    });

    it('should enforce single-billing invariant and reject duplicate active sale for same session', async () => {
      seedSession(SessionStatus.COMPLETED);

      // First call creates Sale with saleId 'sale_first'
      const firstCommand = new BillTreatmentSessionCommand({
        sessionId: 'sess_pt_100',
        tenantId: 'tenant_clin_01',
        idempotencyKey: 'sale_first',
      });
      const firstResult = await handler.execute(firstCommand);
      expect(firstResult.isSuccess).toBe(true);

      // Second call with different idempotency key attempts duplicate commercial sale for same clinical session
      const secondCommand = new BillTreatmentSessionCommand({
        sessionId: 'sess_pt_100',
        tenantId: 'tenant_clin_01',
        idempotencyKey: 'sale_second',
      });
      const secondResult = await handler.execute(secondCommand);

      expect(secondResult.isFailure).toBe(true);
      expect(secondResult.getError()).toContain('already exists for KINESIOLOGY_SESSION');
      expect(secondResult.getError()).toContain('Duplicate sale creation is prohibited');
      expect(salesRepo.sales.size).toBe(1);
    });

    it('should not block legitimate independent commercial sales for different treatment sessions', async () => {
      // Seed first session
      seedSession(SessionStatus.COMPLETED);

      // Seed second independent session
      const secondSession = TreatmentSession.reconstitute({
        id: SessionId.create('sess_pt_200'),
        version: 1,
        status: SessionStatus.COMPLETED,
        clientId: 'client_pt_456',
        therapistId: 'therapist_dr_smith',
        appointmentId: 'appt_1001',
        notes: SessionNotes.create({ subjective: 'Initial evaluation' }),
        createdAt: new Date('2026-10-16T11:00:00.000Z'),
        updatedAt: new Date('2026-10-16T12:00:00.000Z'),
      });
      sessionRepo.sessions.set(secondSession.id.getValue(), secondSession);

      // Bill first session
      const res1 = await handler.execute(
        new BillTreatmentSessionCommand({ sessionId: 'sess_pt_100', tenantId: 'tenant_clin_01' }),
      );
      expect(res1.isSuccess).toBe(true);

      // Bill second session
      const res2 = await handler.execute(
        new BillTreatmentSessionCommand({ sessionId: 'sess_pt_200', tenantId: 'tenant_clin_01' }),
      );
      expect(res2.isSuccess).toBe(true);

      // Both sales exist independently
      expect(salesRepo.sales.size).toBe(2);
      expect(res1.getValue().saleId).not.toBe(res2.getValue().saleId);
    });
  });

  describe('7. Source / Application Failure Propagation', () => {
    it('should propagate unexpected sales gateway throws with error transparency', async () => {
      seedSession(SessionStatus.COMPLETED);

      const failingGateway: IKinesiologySalesGatewayPort = {
        createSale: jest.fn().mockRejectedValue(new Error('PostgreSQL database deadlocked')),
      };

      const failingHandler = new BillTreatmentSessionHandler(
        sessionRepo,
        failingGateway,
        mockAppointmentLookup,
      );

      const result = await failingHandler.execute(
        new BillTreatmentSessionCommand({ sessionId: 'sess_pt_100' }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('PostgreSQL database deadlocked');

      // Assert session remains COMPLETED without state corruption
      const session = await sessionRepo.findById(SessionId.create('sess_pt_100'));
      expect(session?.status).toBe(SessionStatus.COMPLETED);
    });
  });
});
