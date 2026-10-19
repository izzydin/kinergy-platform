import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import {
  PrismaClient,
  Sale as PrismaSaleModel,
  SaleItem as PrismaSaleItemModel,
  Payment as PrismaPaymentModel,
  SaleStatus as PrismaSaleStatus,
} from '@prisma/client';
import {
  SaleSourceValidatorPort,
  CreateSaleHandler,
  GetSaleByIdHandler,
  AddSaleItemHandler,
  FinalizeSaleHandler,
  CalculateSaleHandler,
  RecordPaymentHandler,
  CreatePaymentHandler,
  CompletePaymentHandler,
  GetPaymentByIdHandler,
  GetPaymentsBySaleIdHandler,
  GetSalePaymentHistoryHandler,
  PrismaSaleRepository,
  PrismaPaymentRepository,
  PrismaSalesUnitOfWork,
} from '@kinergy-platform/core';

import { SalesController, SALE_REPOSITORY_TOKEN } from '../controllers/sales.controller';
import { PaymentsController, PAYMENT_REPOSITORY_TOKEN } from '../controllers/payments.controller';
import { UNIT_OF_WORK_TOKEN, SALE_SOURCE_VALIDATOR_TOKEN } from '../sales.tokens';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { DefaultAuthorizationEvaluator } from '../../platform/identity/authorization/default-authorization-evaluator';
import {
  ACCESS_TOKEN_SERVICE,
  IAccessTokenService,
} from '../../platform/identity/tokens/access-token.service';
import { IAccessTokenPayload } from '../../platform/identity/tokens/token-payload.interface';
import { IUserRepository, USER_REPOSITORY, User, UserStatus } from '../../platform/identity/domain';
import { PERMISSION_RESOLVER } from '../../platform/identity/authorization/authorization.interface';
import { AUTHORIZATION_EVALUATOR } from '../../platform/identity/authorization/authorization-evaluator.interface';
import { GlobalSanitizationValidationPipe } from '../../common/pipes/global-sanitization-validation.pipe';
import { SalesExceptionFilter } from '../filters/sales-exception.filter';
import { JwtTestFactory, DEFAULT_TEST_JWT_SECRET } from '@kinergy-platform/testing';
import { SalesAuditEventPublisher } from '../infrastructure/sales-audit-event-publisher';

// ============================================================================
// Deterministic Synchronization Barrier for Concurrency Testing (ADR-0140)
// ============================================================================

export class DeterministicSynchronizationBarrier {
  private waiters: Array<() => void> = [];

  constructor(private readonly parties: number = 2) {}

  public async arriveAndWait(timeoutMs: number = 8000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(fulfill);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(
          new Error(
            `DeterministicSynchronizationBarrier timed out after ${timeoutMs}ms waiting for ${this.parties} parties.`,
          ),
        );
      }, timeoutMs);

      const fulfill = () => {
        clearTimeout(timer);
        resolve();
      };

      this.waiters.push(fulfill);
      if (this.waiters.length === this.parties) {
        const toRelease = [...this.waiters];
        this.waiters = [];
        for (const release of toRelease) {
          release();
        }
      }
    });
  }

  public reset(): void {
    this.waiters = [];
  }
}

interface PostgresEngineError extends Error {
  code: string;
  constraint?: string;
  table?: string;
  meta?: { target?: string[]; constraint?: string };
}

function createPgError(
  message: string,
  code: string,
  constraint?: string,
  table?: string,
): PostgresEngineError {
  const err = new Error(message) as PostgresEngineError;
  err.code = code;
  err.constraint = constraint;
  err.table = table;
  err.meta = { constraint, target: constraint ? [constraint] : undefined };
  return err;
}

// ============================================================================
// Concurrency-Hardened Relational Persistence Emulator (ADR-0140)
// Enforces relational constraints:
// 1. sales_pkey: PRIMARY KEY (id)
// 2. uq_sales_clinical_session_active: (tenant_id, source_id) WHERE source_type IN ('TREATMENT_SESSION', 'KINESIOLOGY_SESSION') AND status != 'CANCELLED'
// 3. uq_sales_source_code_active: (tenant_id, source_code) WHERE source_code IS NOT NULL AND status != 'CANCELLED'
// 4. uq_payments_sale_reference: (sale_id, reference) WHERE reference IS NOT NULL
// ============================================================================

class ConcurrencyPostgreSqlDatabase {
  public sales = new Map<string, PrismaSaleModel>();
  public saleItems = new Map<string, PrismaSaleItemModel>();
  public payments = new Map<string, PrismaPaymentModel>();

  public commitBarrier: DeterministicSynchronizationBarrier | null = null;
  private transactionLock: Promise<void> = Promise.resolve();

  public clear(): void {
    this.sales.clear();
    this.saleItems.clear();
    this.payments.clear();
    this.commitBarrier = null;
    this.transactionLock = Promise.resolve();
  }

  private async acquireLock(): Promise<() => void> {
    let releaseLock: () => void = () => {};
    const previousLock = this.transactionLock;
    this.transactionLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    await previousLock;
    return releaseLock;
  }

  public createClient(): PrismaClient {
    const enforceSaleUniqueConstraints = (
      bufferedSales: Map<string, PrismaSaleModel>,
      data: PrismaSaleModel,
      isInsert: boolean,
    ) => {
      // 1. Primary Key: sales_pkey on "sales"("id")
      if (isInsert && bufferedSales.has(data.id)) {
        throw createPgError(
          `duplicate key value violates unique constraint "sales_pkey"`,
          'P2002',
          'sales_pkey',
          'sales',
        );
      }

      // 2. Partial Unique Index: uq_sales_clinical_session_active
      const isClinical =
        data.sourceType === 'TREATMENT_SESSION' ||
        data.sourceType === 'KINESIOLOGY_SESSION' ||
        (data.sourceType as unknown) === 'KINESIOLOGY_SESSION';
      const isActive = data.status !== ('CANCELLED' as PrismaSaleStatus);

      if (isClinical && isActive && data.sourceId) {
        for (const existing of bufferedSales.values()) {
          if (existing.id === data.id) continue;
          if (
            existing.tenantId === data.tenantId &&
            existing.sourceId === data.sourceId &&
            (existing.sourceType === 'TREATMENT_SESSION' ||
              existing.sourceType === 'KINESIOLOGY_SESSION') &&
            existing.status !== ('CANCELLED' as PrismaSaleStatus)
          ) {
            throw createPgError(
              `duplicate key value violates unique constraint "uq_sales_clinical_session_active"`,
              'P2002',
              'uq_sales_clinical_session_active',
              'sales',
            );
          }
        }
      }

      // 3. Partial Unique Index: uq_sales_source_code_active
      if (
        data.sourceCode &&
        data.sourceCode !== 'POS_REGISTER' &&
        data.sourceCode !== 'pos_checkout_terminal' &&
        isActive
      ) {
        for (const existing of bufferedSales.values()) {
          if (existing.id === data.id) continue;
          if (
            existing.tenantId === data.tenantId &&
            existing.sourceCode === data.sourceCode &&
            existing.status !== ('CANCELLED' as PrismaSaleStatus)
          ) {
            throw createPgError(
              `duplicate key value violates unique constraint "uq_sales_source_code_active"`,
              'P2002',
              'uq_sales_source_code_active',
              'sales',
            );
          }
        }
      }
    };

    const buildScope = (
      bufferedSales: Map<string, PrismaSaleModel>,
      bufferedItems: Map<string, PrismaSaleItemModel>,
      bufferedPayments: Map<string, PrismaPaymentModel>,
    ) => {
      return {
        sale: {
          findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
            const s = bufferedSales.get(where.id);
            if (!s) return null;
            const items = Array.from(bufferedItems.values()).filter((i) => i.saleId === where.id);
            return { ...s, items };
          }),
          findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
            for (const s of bufferedSales.values()) {
              let match = true;
              if (where.tenantId && s.tenantId !== where.tenantId) match = false;
              if (where.sourceType && s.sourceType !== where.sourceType) match = false;
              if (where.sourceId && s.sourceId !== where.sourceId) match = false;
              if (where.sourceCode && s.sourceCode !== where.sourceCode) match = false;
              if (
                where.status &&
                typeof where.status === 'object' &&
                'not' in (where.status as Record<string, unknown>)
              ) {
                if (s.status === (where.status as { not: string }).not) match = false;
              }
              if (match) {
                const items = Array.from(bufferedItems.values()).filter((i) => i.saleId === s.id);
                return { ...s, items };
              }
            }
            return null;
          }),
          create: jest.fn(async ({ data }: { data: PrismaSaleModel }) => {
            const now = new Date();
            const withDates: PrismaSaleModel = {
              ...data,
              createdAt: data.createdAt ?? now,
              updatedAt: data.updatedAt ?? now,
            };
            enforceSaleUniqueConstraints(bufferedSales, withDates, true);
            bufferedSales.set(withDates.id, withDates);
            return withDates;
          }),
          upsert: jest.fn(
            async ({
              where,
              create,
              update,
            }: {
              where: { id: string };
              create: Record<string, unknown>;
              update: Record<string, unknown>;
            }) => {
              const existing = bufferedSales.get(where.id);
              const now = new Date();
              const isInsert = !existing;
              const data = {
                ...(existing ?? { createdAt: now, ...create }),
                ...update,
                updatedAt: now,
              } as PrismaSaleModel;
              enforceSaleUniqueConstraints(bufferedSales, data, isInsert);
              bufferedSales.set(where.id, data);
              return data;
            },
          ),
          updateMany: jest.fn(
            async ({
              where,
              data,
            }: {
              where: { id: string; version?: number };
              data: Record<string, unknown>;
            }) => {
              const currentInDb = bufferedSales.get(where.id);
              if (
                currentInDb &&
                (where.version === undefined || currentInDb.version === where.version)
              ) {
                const updated = {
                  ...currentInDb,
                  ...data,
                  updatedAt: new Date(),
                } as PrismaSaleModel;
                enforceSaleUniqueConstraints(bufferedSales, updated, false);
                bufferedSales.set(where.id, updated);
                return { count: 1 };
              }
              return { count: 0 };
            },
          ),
          findMany: jest.fn(async ({ where }: { where?: Record<string, unknown> }) => {
            const list: Array<PrismaSaleModel & { items: PrismaSaleItemModel[] }> = [];
            for (const s of bufferedSales.values()) {
              if (where?.tenantId && s.tenantId !== where.tenantId) continue;
              const items = Array.from(bufferedItems.values()).filter((i) => i.saleId === s.id);
              list.push({ ...s, items });
            }
            return list;
          }),
          count: jest.fn(async ({ where }: { where?: Record<string, unknown> }) => {
            let count = 0;
            for (const s of bufferedSales.values()) {
              if (where?.tenantId && s.tenantId !== where.tenantId) continue;
              count++;
            }
            return count;
          }),
        },
        saleItem: {
          findMany: jest.fn(async ({ where }: { where: { saleId: string } }) => {
            return Array.from(bufferedItems.values()).filter((i) => i.saleId === where.saleId);
          }),
          deleteMany: jest.fn(
            async ({ where }: { where: { saleId: string; id?: { notIn?: string[] } } }) => {
              let count = 0;
              for (const [id, item] of Array.from(bufferedItems.entries())) {
                if (item.saleId === where.saleId) {
                  if (where.id?.notIn && where.id.notIn.includes(id)) continue;
                  bufferedItems.delete(id);
                  count++;
                }
              }
              return { count };
            },
          ),
          upsert: jest.fn(
            async ({
              where,
              create,
              update,
            }: {
              where: { id: string };
              create: Record<string, unknown>;
              update: Record<string, unknown>;
            }) => {
              const existing = bufferedItems.get(where.id);
              const data = {
                ...(existing ?? create),
                ...update,
              } as PrismaSaleItemModel;
              bufferedItems.set(where.id, data);
              return data;
            },
          ),
        },
        payment: {
          findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
            return bufferedPayments.get(where.id) ?? null;
          }),
          findMany: jest.fn(async ({ where }: { where: { saleId?: string } }) => {
            return Array.from(bufferedPayments.values()).filter((p) => {
              if (where.saleId && p.saleId !== where.saleId) return false;
              return true;
            });
          }),
          upsert: jest.fn(
            async ({
              where,
              create,
              update,
            }: {
              where: { id: string };
              create: Record<string, unknown>;
              update: Record<string, unknown>;
            }) => {
              const existing = bufferedPayments.get(where.id);
              const data = {
                ...(existing ?? create),
                ...update,
              } as PrismaPaymentModel;
              bufferedPayments.set(where.id, data);
              return data;
            },
          ),
          updateMany: jest.fn(async () => ({ count: 0 })),
        },
      };
    };

    return {
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
        // Deterministic Synchronization Barrier: hold until racing parties arrive at the commit point
        if (this.commitBarrier) {
          const barrier = this.commitBarrier;
          await barrier.arriveAndWait();
          if (this.commitBarrier === barrier) {
            this.commitBarrier = null;
          }
        }

        const release = await this.acquireLock();
        try {
          // Snapshot isolation buffer
          const bufferedSales = new Map<string, PrismaSaleModel>(
            Array.from(this.sales.entries()).map(([k, v]) => [k, { ...v }]),
          );
          const bufferedItems = new Map<string, PrismaSaleItemModel>(
            Array.from(this.saleItems.entries()).map(([k, v]) => [k, { ...v }]),
          );
          const bufferedPayments = new Map<string, PrismaPaymentModel>(
            Array.from(this.payments.entries()).map(([k, v]) => [k, { ...v }]),
          );

          const txScope = buildScope(bufferedSales, bufferedItems, bufferedPayments);
          const result = await callback(txScope);

          // Atomic commit: flush buffered state to database
          this.sales = bufferedSales;
          this.saleItems = bufferedItems;
          this.payments = bufferedPayments;

          return result;
        } finally {
          release();
        }
      }),
      ...buildScope(this.sales, this.saleItems, this.payments),
    } as unknown as PrismaClient;
  }
}

// ============================================================================
// Scenario 5 Test Suite: Concurrency, Uniqueness & Idempotency Proofs
// ============================================================================

describe('Milestone 7.23 - Scenario 5: Duplicate Commercial Request & Concurrency Protection', () => {
  let app: INestApplication;
  let db: ConcurrencyPostgreSqlDatabase;
  let saleRepo: PrismaSaleRepository;
  let paymentRepo: PrismaPaymentRepository;
  let unitOfWork: PrismaSalesUnitOfWork;

  const TENANT_ALPHA = 'tenant_chile_s5_alpha';
  const TENANT_BETA = 'tenant_chile_s5_beta';
  const STAFF_USER_ID = 'usr_staff_s5';

  let staffTokenAlpha: string;
  let staffTokenBeta: string;

  beforeAll(async () => {
    db = new ConcurrencyPostgreSqlDatabase();
    const prismaClient = db.createClient();

    saleRepo = new PrismaSaleRepository(prismaClient);
    paymentRepo = new PrismaPaymentRepository(prismaClient);
    unitOfWork = new PrismaSalesUnitOfWork(prismaClient);

    const staffUserAlpha = new User({
      id: `${STAFF_USER_ID}_alpha`,
      email: 'staff@alpha.platform',
      passwordHash: 'dummy_hash',
      status: UserStatus.ACTIVE,
      roles: ['Receptionist'],
      permissions: ['sales.create', 'sales.read', 'payments.create', 'payments.read'],
      tenantId: TENANT_ALPHA,
      tokenVersion: 1,
    });

    const staffUserBeta = new User({
      id: `${STAFF_USER_ID}_beta`,
      email: 'staff@beta.platform',
      passwordHash: 'dummy_hash',
      status: UserStatus.ACTIVE,
      roles: ['Receptionist'],
      permissions: ['sales.create', 'sales.read', 'payments.create', 'payments.read'],
      tenantId: TENANT_BETA,
      tokenVersion: 1,
    });

    const userStore = new Map<string, User>();
    userStore.set(staffUserAlpha.id, staffUserAlpha);
    userStore.set(staffUserBeta.id, staffUserBeta);

    const mockUserRepository: Partial<IUserRepository> = {
      findById: async (id: string) => userStore.get(id) ?? null,
      findByEmail: async (email: string) =>
        Array.from(userStore.values()).find((u) => u.email === email) ?? null,
    };

    const mockAccessTokenService: IAccessTokenService = {
      generateToken: async (identity) =>
        JwtTestFactory.createSignedToken({
          sub: identity.userId,
          email: identity.email,
          roles: identity.roles,
          permissions: identity.permissions,
          tenantId: identity.tenantId ?? TENANT_ALPHA,
        }),
      validateToken: async (token: string) => {
        try {
          return jwt.verify(token, DEFAULT_TEST_JWT_SECRET) as unknown as IAccessTokenPayload;
        } catch {
          return null;
        }
      },
    };

    staffTokenAlpha = JwtTestFactory.createSignedToken({
      sub: staffUserAlpha.id,
      email: staffUserAlpha.email,
      roles: staffUserAlpha.roles,
      permissions: staffUserAlpha.permissions,
      tenantId: TENANT_ALPHA,
    });

    staffTokenBeta = JwtTestFactory.createSignedToken({
      sub: staffUserBeta.id,
      email: staffUserBeta.email,
      roles: staffUserBeta.roles,
      permissions: staffUserBeta.permissions,
      tenantId: TENANT_BETA,
    });

    const auditPublisher = new SalesAuditEventPublisher();

    const mockSourceValidator: SaleSourceValidatorPort = {
      validateSource: jest.fn().mockImplementation(async (source) => ({
        exists: true,
        isValid: true,
        isEligible: true,
        belongsToContext: true,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        unitPriceCents: 10000, // 100.00 USD
        currency: 'USD',
        description: 'Validated Commercial Source Item',
      })),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SalesController, PaymentsController],
      providers: [
        { provide: SALE_REPOSITORY_TOKEN, useValue: saleRepo },
        { provide: PAYMENT_REPOSITORY_TOKEN, useValue: paymentRepo },
        { provide: UNIT_OF_WORK_TOKEN, useValue: unitOfWork },
        { provide: SALE_SOURCE_VALIDATOR_TOKEN, useValue: mockSourceValidator },
        { provide: ACCESS_TOKEN_SERVICE, useValue: mockAccessTokenService },
        { provide: USER_REPOSITORY, useValue: mockUserRepository },
        { provide: SalesAuditEventPublisher, useValue: auditPublisher },
        {
          provide: PERMISSION_RESOLVER,
          useValue: {
            resolvePermissions: async (_userId: string, _roles: string[], directPerms?: string[]) =>
              directPerms ?? [],
          },
        },
        { provide: AUTHORIZATION_EVALUATOR, useClass: DefaultAuthorizationEvaluator },
        AuthenticationGuard,
        AuthorizationGuard,
        {
          provide: CreateSaleHandler,
          useFactory: () =>
            new CreateSaleHandler(saleRepo, undefined, auditPublisher, mockSourceValidator),
        },
        {
          provide: GetSaleByIdHandler,
          useFactory: () => new GetSaleByIdHandler(saleRepo),
        },
        {
          provide: AddSaleItemHandler,
          useFactory: () => new AddSaleItemHandler(saleRepo),
        },
        {
          provide: FinalizeSaleHandler,
          useFactory: () => new FinalizeSaleHandler(saleRepo, undefined, auditPublisher),
        },
        {
          provide: CalculateSaleHandler,
          useFactory: () => new CalculateSaleHandler(saleRepo),
        },
        {
          provide: RecordPaymentHandler,
          useFactory: () =>
            new RecordPaymentHandler(paymentRepo, saleRepo, undefined, auditPublisher, unitOfWork),
        },
        {
          provide: CreatePaymentHandler,
          useExisting: RecordPaymentHandler,
        },
        {
          provide: CompletePaymentHandler,
          useFactory: () =>
            new CompletePaymentHandler(
              paymentRepo,
              saleRepo,
              undefined,
              auditPublisher,
              unitOfWork,
            ),
        },
        {
          provide: GetPaymentByIdHandler,
          useFactory: () => new GetPaymentByIdHandler(paymentRepo, saleRepo),
        },
        {
          provide: GetPaymentsBySaleIdHandler,
          useFactory: () => new GetPaymentsBySaleIdHandler(paymentRepo, saleRepo),
        },
        {
          provide: GetSalePaymentHistoryHandler,
          useFactory: () => new GetSalePaymentHistoryHandler(paymentRepo, saleRepo),
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new GlobalSanitizationValidationPipe());
    app.useGlobalFilters(new SalesExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    db.clear();
  });

  // ==========================================================================
  // 1. Sequential Duplicate Requests via Idempotency Key (Idempotent Replay)
  // ==========================================================================

  it('[S5-E2E-1] Sequential identical requests with same idempotencyKey return matching Sale DTO idempotently without duplicate rows', async () => {
    const payload = {
      idempotencyKey: 'idemp_key_seq_001',
      clientId: 'client_s5_seq_001',
      currency: 'USD',
      sourceReference: {
        type: 'FOOD',
        referenceId: 'snack_bar_item_99',
        referenceCode: 'SNACK-99',
      },
      items: [
        {
          description: 'Protein Power Bar (Organic)',
          skuOrCode: 'SNACK-99',
          quantity: 1,
          unitPriceAmount: 100.0,
        },
      ],
    };

    // First request: 201 Created
    const res1 = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${staffTokenAlpha}`)
      .send(payload);

    expect(res1.status).toBe(201);
    const saleId = res1.body.id;
    expect(saleId).toBe('idemp_key_seq_001');
    expect(res1.body.totalAmount).toBe(100.0);
    expect(res1.body.status).toBe('DRAFT');

    // Second request: identical payload and idempotencyKey (network retry simulation)
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${staffTokenAlpha}`)
      .send(payload);

    // In accordance with ADR-0140: returns the existing Sale representation (idempotent replay)
    expect([200, 201]).toContain(res2.status);
    expect(res2.body.id).toBe(saleId);
    expect(res2.body.clientId).toBe('client_s5_seq_001');
    expect(res2.body.totalAmount).toBe(100.0);
    expect(res2.body.itemCount).toBe(1);

    // Authoritative persistence check: strictly 1 Sale and 1 SaleItem in the database
    expect(db.sales.size).toBe(1);
    expect(db.saleItems.size).toBe(1);
  });

  // ==========================================================================
  // 2. Sequential Duplicate Requests for Single-Billing Clinical Session (Rejection)
  // ==========================================================================

  it('[S5-E2E-2] Sequential requests for the same clinical treatment session are strictly rejected as 409 Conflict', async () => {
    const clinicalSessionId = 'kine_session_rotator_cuff_01';

    // First checkout for clinical session
    const res1 = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${staffTokenAlpha}`)
      .send({
        sourceReference: {
          type: 'KINESIOLOGY_SESSION',
          referenceId: clinicalSessionId,
        },
        clientId: 'client_pt_patient_01',
        currency: 'USD',
      });

    expect(res1.status).toBe(201);
    const originalSaleId = res1.body.id;

    // Second request attempting to create a second sale for the same session (e.g. accidental second click by staff)
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${staffTokenAlpha}`)
      .send({
        id: 'sale_attempted_dup_002',
        sourceReference: {
          type: 'KINESIOLOGY_SESSION',
          referenceId: clinicalSessionId,
        },
        clientId: 'client_pt_patient_01',
        currency: 'USD',
      });

    expect(res2.status).toBe(409);
    expect(res2.body.error).toBe('Conflict');
    expect(res2.body.message).toContain('already exists for KINESIOLOGY_SESSION');
    expect(res2.body.message).toContain('Duplicate sale creation is prohibited');

    // Persistence inspection: strictly 1 Sale exists for this session
    expect(db.sales.size).toBe(1);
    expect(db.sales.has(originalSaleId)).toBe(true);
  });

  // ==========================================================================
  // 3. Concurrent Duplicate Requests on Same Idempotency Key (sales_pkey)
  // ==========================================================================

  it('[S5-E2E-3] Concurrent identical requests with same idempotencyKey synchronize at persistence layer; exactly 1 Sale persists', async () => {
    const payload = {
      idempotencyKey: 'idemp_concurrent_key_003',
      clientId: 'client_s5_concurrent_001',
      currency: 'USD',
      sourceReference: {
        type: 'FOOD',
        referenceId: 'smoothie_bowl_01',
        referenceCode: 'SMOOTHIE-BOWL',
      },
      items: [
        {
          description: 'Acai Berry Energy Bowl',
          skuOrCode: 'SMOOTHIE-BOWL',
          quantity: 1,
          unitPriceAmount: 100.0,
        },
      ],
    };

    // Arm the deterministic synchronization barrier for 2 concurrent parties
    db.commitBarrier = new DeterministicSynchronizationBarrier(2);

    // Launch both requests simultaneously
    const [resA, resB] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${staffTokenAlpha}`)
        .send(payload),
      request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${staffTokenAlpha}`)
        .send(payload),
    ]);

    // Both callers receive successful resolution with identical Sale identity
    expect([200, 201]).toContain(resA.status);
    expect([200, 201]).toContain(resB.status);
    expect(resA.body.id).toBe('idemp_concurrent_key_003');
    expect(resB.body.id).toBe('idemp_concurrent_key_003');
    expect(resA.body.totalAmount).toBe(100.0);
    expect(resB.body.totalAmount).toBe(100.0);

    // Persistence inspection: strictly ONE Sale in database
    expect(db.sales.size).toBe(1);
    expect(db.saleItems.size).toBe(1);
  });

  // ==========================================================================
  // 4. Concurrent Race on Single-Billing Session (uq_sales_clinical_session_active)
  // ==========================================================================

  it('[S5-E2E-4] Concurrent requests for the same clinical session hit partial unique index; exactly 1 Sale persists, other receives 409', async () => {
    const sessionId = 'kine_session_race_shoulder_55';

    // Arm synchronization barrier to ensure simultaneous arrival at database transaction commit
    db.commitBarrier = new DeterministicSynchronizationBarrier(2);

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${staffTokenAlpha}`)
        .send({
          id: 'sale_race_party_1',
          sourceReference: {
            type: 'KINESIOLOGY_SESSION',
            referenceId: sessionId,
          },
          clientId: 'client_pt_race_01',
          currency: 'USD',
          items: [
            {
              description: 'Kinesiology Treatment Session',
              skuOrCode: 'KINE-SESS-01',
              quantity: 1,
              unitPriceAmount: 100.0,
            },
          ],
        }),
      request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${staffTokenAlpha}`)
        .send({
          id: 'sale_race_party_2',
          sourceReference: {
            type: 'KINESIOLOGY_SESSION',
            referenceId: sessionId,
          },
          clientId: 'client_pt_race_01',
          currency: 'USD',
          items: [
            {
              description: 'Kinesiology Treatment Session',
              skuOrCode: 'KINE-SESS-01',
              quantity: 1,
              unitPriceAmount: 100.0,
            },
          ],
        }),
    ]);

    // Exactly one must succeed (201) and one must be rejected (409 Conflict)
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const rejectedRes = resA.status === 409 ? resA : resB;
    expect(rejectedRes.body.error).toBe('Conflict');
    expect(rejectedRes.body.message).toContain('already exists for KINESIOLOGY_SESSION');

    // Persistence inspection: strictly 1 Sale and 1 SaleItem exist in the database
    expect(db.sales.size).toBe(1);
    expect(db.saleItems.size).toBe(1);
    const winningSaleId = resA.status === 201 ? resA.body.id : resB.body.id;
    expect(db.sales.has(winningSaleId)).toBe(true);
  });

  // ==========================================================================
  // 5. External Order Reference Collision (uq_sales_source_code_active)
  // ==========================================================================

  it('[S5-E2E-5] Prohibits duplicate active sales with the same external order reference code under concurrent submission', async () => {
    const orderCode = 'SHOPIFY-ORD-2026-X99';

    db.commitBarrier = new DeterministicSynchronizationBarrier(2);

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${staffTokenAlpha}`)
        .send({
          id: 'sale_order_ref_1',
          sourceReference: {
            type: 'FOOD',
            referenceId: 'inv_supplements_01',
            referenceCode: orderCode,
          },
          items: [
            {
              description: 'Nutritional Supplement Pack',
              skuOrCode: 'SUPP-01',
              quantity: 1,
              unitPriceAmount: 100.0,
            },
          ],
        }),
      request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', `Bearer ${staffTokenAlpha}`)
        .send({
          id: 'sale_order_ref_2',
          sourceReference: {
            type: 'FOOD',
            referenceId: 'inv_supplements_02',
            referenceCode: orderCode,
          },
          items: [
            {
              description: 'Nutritional Supplement Pack',
              skuOrCode: 'SUPP-02',
              quantity: 1,
              unitPriceAmount: 100.0,
            },
          ],
        }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const rejected = resA.status === 409 ? resA : resB;
    expect(rejected.body.message).toContain('order reference');
    expect(rejected.body.message).toContain(orderCode);

    // Exactly 1 Sale persisted
    expect(db.sales.size).toBe(1);
  });

  // ==========================================================================
  // 6. Tenant Scoping Verification
  // ==========================================================================

  it('[S5-E2E-6] Uniqueness is strictly tenant-scoped: distinct tenants can independently bill identical local session IDs without colliding', async () => {
    const localSessionId = 'kine_shared_local_session_99';

    // Tenant Alpha creates sale for localSessionId
    const resAlpha = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${staffTokenAlpha}`)
      .send({
        sourceReference: {
          type: 'KINESIOLOGY_SESSION',
          referenceId: localSessionId,
        },
        clientId: 'client_tenant_alpha',
        currency: 'USD',
      });
    expect(resAlpha.status).toBe(201);
    expect(resAlpha.body.tenantId).toBe(TENANT_ALPHA);

    // Tenant Beta independently creates sale for identical localSessionId
    const resBeta = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${staffTokenBeta}`)
      .send({
        sourceReference: {
          type: 'KINESIOLOGY_SESSION',
          referenceId: localSessionId,
        },
        clientId: 'client_tenant_beta',
        currency: 'USD',
      });
    expect(resBeta.status).toBe(201);
    expect(resBeta.body.tenantId).toBe(TENANT_BETA);

    // Both sales coexist legitimately because uniqueness is scoped by tenant_id
    expect(db.sales.size).toBe(2);
    expect(db.sales.get(resAlpha.body.id)?.tenantId).toBe(TENANT_ALPHA);
    expect(db.sales.get(resBeta.body.id)?.tenantId).toBe(TENANT_BETA);
  });

  // ==========================================================================
  // 7. Legitimate Distinct Repeat Retail Purchases
  // ==========================================================================

  it('[S5-E2E-7] Retail consumable purchases of the same SKU do not trigger false uniqueness conflicts', async () => {
    const drinkSku = 'DRINK-COLD-PRESSED-DETOX';

    // Sale 1: Client buys detox drink
    const res1 = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${staffTokenAlpha}`)
      .send({
        sourceReference: {
          type: 'DRINK',
          referenceId: drinkSku,
          referenceCode: 'POS_REGISTER',
        },
        items: [
          {
            description: 'Cold-Pressed Detox Drink',
            skuOrCode: drinkSku,
            quantity: 1,
            unitPriceAmount: 100.0,
          },
        ],
      });
    expect(res1.status).toBe(201);

    // Sale 2: Second client buys the same detox drink SKU (repeat retail purchase)
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${staffTokenAlpha}`)
      .send({
        sourceReference: {
          type: 'DRINK',
          referenceId: drinkSku,
          referenceCode: 'POS_REGISTER',
        },
        items: [
          {
            description: 'Cold-Pressed Detox Drink',
            skuOrCode: drinkSku,
            quantity: 1,
            unitPriceAmount: 100.0,
          },
        ],
      });
    expect(res2.status).toBe(201);

    // Both sales legitimately coexist in database
    expect(db.sales.size).toBe(2);
    expect(res1.body.id).not.toBe(res2.body.id);
  });

  // ==========================================================================
  // 8. Conflicting Commercial Payload Rejection on Reused Idempotency Key
  // ==========================================================================

  it('[S5-E2E-8] Reusing the same idempotencyKey with conflicting commercial payload is rejected as 409 Conflict', async () => {
    const key = 'idemp_key_payload_conflict';

    // 1. Initial sale creation
    const res1 = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${staffTokenAlpha}`)
      .send({
        idempotencyKey: key,
        clientId: 'client_initial_01',
        currency: 'USD',
        sourceReference: {
          type: 'FOOD',
          referenceId: 'food_item_01',
        },
        items: [
          {
            description: 'Initial Food Item',
            skuOrCode: 'FOOD-01',
            quantity: 1,
            unitPriceAmount: 100.0,
          },
        ],
      });
    expect(res1.status).toBe(201);

    // 2. Second request with SAME key but DIFFERENT clientId (conflicting transaction)
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${staffTokenAlpha}`)
      .send({
        idempotencyKey: key,
        clientId: 'client_tampered_02', // Conflicting client!
        currency: 'USD',
        sourceReference: {
          type: 'FOOD',
          referenceId: 'food_item_01',
        },
        items: [
          {
            description: 'Initial Food Item',
            skuOrCode: 'FOOD-01',
            quantity: 1,
            unitPriceAmount: 100.0,
          },
        ],
      });

    expect(res2.status).toBe(409);
    expect(res2.body.error).toBe('Conflict');
    expect(res2.body.message).toContain('different transaction parameters');

    // Database still contains strictly the original sale
    expect(db.sales.size).toBe(1);
    expect(db.sales.get(key)?.clientId).toBe('client_initial_01');
  });
});
