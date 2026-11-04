import { PrismaClient, Prisma } from '@prisma/client';
import { StagingTestHelper } from './staging-test-helper';

describe('Milestone 10.7 — Phase 2: PostgreSQL Database Engine Compatibility', () => {
  let prisma: PrismaClient;
  let isDbAvailable = false;
  let testRole: { id: string; name: string };
  const testNamespace = StagingTestHelper.generateTestRunPrefix('P2_COMPAT');

  beforeAll(async () => {
    jest.setTimeout(30000);
    const activeUrl = await StagingTestHelper.resolveActivePostgresUrl();
    try {
      const probe = StagingTestHelper.createClient(activeUrl);
      await probe.$queryRawUnsafe('SELECT 1');
      await probe.$disconnect();
      isDbAvailable = true;

      prisma = StagingTestHelper.createClient(activeUrl);

      // Ensure test role exists for foreign key references
      testRole = await prisma.role.upsert({
        where: { name: `${testNamespace}_ROLE` },
        update: {},
        create: {
          name: `${testNamespace}_ROLE`,
          description: 'Staging Acceptance Test Role',
          type: 'CUSTOM',
        },
      });
    } catch (error) {
      isDbAvailable = false;
      if (process.env['CI']) {
        throw new Error(
          `[FATAL] Staging database not available in CI environment at ${activeUrl}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error },
        );
      }
      console.warn('[WARN] Staging database not available for Phase 2 Compatibility test.');
    }
  });

  afterAll(async () => {
    if (isDbAvailable && prisma) {
      await StagingTestHelper.cleanupTestNamespace(prisma, testNamespace);
      await prisma.$disconnect().catch(() => {});
    }
  });

  it('2.1 verifies Decimal(12, 2) arithmetic and PostgreSQL monetary check constraints', async () => {
    if (!isDbAvailable) return;

    const testSaleId = `${testNamespace}_sale_dec_1`;
    const testSourceId = `${testNamespace}_SRC_001`;

    // 1. Successful exact decimal precision write
    const sale = await prisma.sale.create({
      data: {
        id: testSaleId,
        sourceType: 'COMMERCIAL',
        sourceId: testSourceId,
        status: 'DRAFT',
        currency: 'USD',
        subtotalAmount: new Prisma.Decimal('199.99'),
        discountTotalAmount: new Prisma.Decimal('20.00'),
        totalAmount: new Prisma.Decimal('179.99'),
        tenantId: testNamespace,
      },
    });

    expect(sale.subtotalAmount.toString()).toBe('199.99');
    expect(sale.discountTotalAmount.toString()).toBe('20');
    expect(sale.totalAmount.toString()).toBe('179.99');

    // 2. PostgreSQL check constraint enforcement (negative total_amount rejected with 23514)
    await expect(
      prisma.sale.create({
        data: {
          id: `${testNamespace}_sale_neg_total`,
          sourceType: 'COMMERCIAL',
          sourceId: `${testNamespace}_SRC_NEG`,
          status: 'DRAFT',
          currency: 'USD',
          subtotalAmount: new Prisma.Decimal('100.00'),
          discountTotalAmount: new Prisma.Decimal('0.00'),
          totalAmount: new Prisma.Decimal('-50.00'), // Violates chk_sales_non_negative_total
          tenantId: testNamespace,
        },
      }),
    ).rejects.toThrow();

    // 3. PostgreSQL check constraint enforcement on payment amount (> 0)
    await expect(
      prisma.payment.create({
        data: {
          id: `${testNamespace}_pay_zero`,
          saleId: testSaleId,
          method: 'CASH',
          status: 'PENDING',
          currency: 'USD',
          amount: new Prisma.Decimal('0.00'), // Violates chk_payments_positive_amount
          tenantId: testNamespace,
        },
      }),
    ).rejects.toThrow();
  });

  it('2.2 verifies Date/Time UTC timezone preservation and millisecond fidelity', async () => {
    if (!isDbAvailable) return;

    const testClientId = `${testNamespace}_client_tz`;
    const testRef = `${testNamespace}_CL_TZ`;
    const utcDate = new Date('2026-11-04T14:30:45.123Z');

    const client = await prisma.client.create({
      data: {
        id: testClientId,
        referenceNumber: testRef,
        firstName: 'Timezone',
        lastName: 'Verification',
        email: `${testNamespace}_tz@example.com`,
        phone: '+15555550199',
        normalizedEmail: `${testNamespace}_tz@example.com`.toLowerCase(),
        normalizedPhone: '+15555550199',
        normalizedSearchName: 'timezone verification',
        createdAt: utcDate,
        updatedAt: utcDate,
      },
    });

    const retrieved = await prisma.client.findUnique({
      where: { id: testClientId },
    });

    expect(retrieved).not.toBeNull();
    expect(retrieved!.createdAt.toISOString()).toBe('2026-11-04T14:30:45.123Z');
    expect(client.id).toBe(testClientId);
  });

  it('2.3 verifies pg_trgm fuzzy similarity query performance on client search index', async () => {
    if (!isDbAvailable) return;

    const testClientId = `${testNamespace}_client_trgm`;
    const testRef = `${testNamespace}_CL_TRGM`;

    await prisma.client.create({
      data: {
        id: testClientId,
        referenceNumber: testRef,
        firstName: 'Alejandro',
        lastName: 'Fernandez-Kinesio',
        email: `${testNamespace}_trgm@example.com`,
        phone: '+15555550198',
        normalizedEmail: `${testNamespace}_trgm@example.com`.toLowerCase(),
        normalizedPhone: '+15555550198',
        normalizedSearchName: 'alejandro fernandez kinesio',
      },
    });

    // Execute raw PostgreSQL query using pg_trgm similarity function
    const results = await prisma.$queryRawUnsafe<Array<{ id: string; sim: number }>>(
      `SELECT id, similarity(normalized_search_name, 'alexandro fernandez') as sim
       FROM clients
       WHERE normalized_search_name % 'alexandro fernandez'
         AND reference_number LIKE $1
       ORDER BY sim DESC`,
      `${testNamespace}%`,
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.id).toBe(testClientId);
    expect(Number(results[0]?.sim)).toBeGreaterThan(0.3); // High trigram similarity match
  });

  it('2.4 verifies relational Foreign Key cascade and restrict constraints', async () => {
    if (!isDbAvailable) return;

    // 1. CASCADE: Deleting User cascades to RefreshTokens
    const testUserId = `${testNamespace}_user_casc`;
    const user = await prisma.user.create({
      data: {
        id: testUserId,
        email: `${testNamespace}_casc@example.com`,
        passwordHash: 'dummy_hash',
        roleId: testRole.id,
      },
    });

    await prisma.refreshToken.create({
      data: {
        id: `${testNamespace}_tok_1`,
        tokenHash: `${testNamespace}_hash_1`,
        familyId: `${testNamespace}_fam_1`,
        userId: user.id,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    // Delete user -> verify refresh token is removed automatically
    await prisma.user.delete({ where: { id: user.id } });
    const orphanToken = await prisma.refreshToken.findUnique({
      where: { id: `${testNamespace}_tok_1` },
    });
    expect(orphanToken).toBeNull();

    // 2. RESTRICT: Deleting Sale with associated Payment is rejected with foreign key violation
    const testSaleId = `${testNamespace}_sale_restrict`;
    await prisma.sale.create({
      data: {
        id: testSaleId,
        sourceType: 'COMMERCIAL',
        sourceId: `${testNamespace}_SRC_RES`,
        status: 'DRAFT',
        currency: 'USD',
        subtotalAmount: new Prisma.Decimal('50.00'),
        discountTotalAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('50.00'),
        tenantId: testNamespace,
      },
    });

    await prisma.payment.create({
      data: {
        id: `${testNamespace}_pay_res`,
        saleId: testSaleId,
        method: 'CASH',
        status: 'PENDING',
        currency: 'USD',
        amount: new Prisma.Decimal('50.00'),
        tenantId: testNamespace,
      },
    });

    // Deleting the sale must fail due to foreign key RESTRICT constraint
    await expect(prisma.sale.delete({ where: { id: testSaleId } })).rejects.toThrow();
  });

  it('2.5 verifies Unique Constraints (P2002 / 23505)', async () => {
    if (!isDbAvailable) return;

    const email = `${testNamespace}_unique@example.com`;

    await prisma.user.create({
      data: {
        id: `${testNamespace}_u_uniq_1`,
        email,
        passwordHash: 'hash1',
        roleId: testRole.id,
      },
    });

    // Attempt duplicate email insertion
    await expect(
      prisma.user.create({
        data: {
          id: `${testNamespace}_u_uniq_2`,
          email,
          passwordHash: 'hash2',
          roleId: testRole.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('2.6 verifies Native PostgreSQL Enums reject invalid string values', async () => {
    if (!isDbAvailable) return;

    // PostgreSQL enum column UserStatus rejects non-enum string values at engine level (22P02)
    let enumRejected = false;
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO users (id, email, password_hash, role_id, status, created_at, updated_at) 
         VALUES ($1, $2, 'hash', $3, 'NON_EXISTENT_STATUS'::"UserStatus", NOW(), NOW())`,
        `${testNamespace}_invalid_enum`,
        `${testNamespace}_bad_enum@test.com`,
        testRole.id,
      );
    } catch (err: unknown) {
      enumRejected = true;
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/invalid input value for enum|22P02/i);
    }
    expect(enumRejected).toBe(true);
  });

  it('2.7 verifies JSONB structured document persistence and queryability', async () => {
    if (!isDbAvailable) return;

    const testClientId = `${testNamespace}_client_jsonb`;
    const testRef = `${testNamespace}_CL_JSONB`;

    await prisma.client.create({
      data: {
        id: testClientId,
        referenceNumber: testRef,
        firstName: 'Jsonb',
        lastName: 'Testing',
        email: `${testNamespace}_jsonb@example.com`,
        phone: '+15555550197',
        normalizedEmail: `${testNamespace}_jsonb@example.com`.toLowerCase(),
        normalizedPhone: '+15555550197',
        normalizedSearchName: 'jsonb testing',
      },
    });

    const structuredMetadata = {
      action: 'MEMBERSHIP_FROZEN',
      reason: 'Medical Leave',
      durationDays: 14,
      nested: {
        approvedBy: 'admin_dr_smith',
        tags: ['medical', 'temporary'],
      },
    };

    const timelineEntry = await prisma.clientTimelineEntry.create({
      data: {
        id: `${testNamespace}_tl_1`,
        clientId: testClientId,
        sourceModule: 'GYM',
        eventType: 'MEMBERSHIP_FROZEN',
        summary: 'Membership frozen for medical leave',
        occurredAt: new Date(),
        metadata: structuredMetadata,
      },
    });

    expect(timelineEntry.metadata).toEqual(structuredMetadata);

    // Query JSONB field using PostgreSQL operators ->> and #>>
    const queried = await prisma.$queryRawUnsafe<
      Array<{ id: string; reason: string; approvedBy: string }>
    >(
      `SELECT id, metadata->>'reason' as reason, metadata#>>'{nested,approvedBy}' as "approvedBy"
       FROM client_timeline_entries
       WHERE id = $1`,
      `${testNamespace}_tl_1`,
    );

    expect(queried.length).toBe(1);
    expect(queried[0]?.reason).toBe('Medical Leave');
    expect(queried[0]?.approvedBy).toBe('admin_dr_smith');
  });

  it('2.8 verifies ACID Transaction atomicity: complete rollback upon partial failure', async () => {
    if (!isDbAvailable) return;

    const testSaleId = `${testNamespace}_tx_rollback_sale`;
    const testItemId = `${testNamespace}_tx_rollback_item`;

    let txFailed = false;
    try {
      await prisma.$transaction(async (tx) => {
        // Step 1: Insert valid sale
        await tx.sale.create({
          data: {
            id: testSaleId,
            sourceType: 'COMMERCIAL',
            sourceId: `${testNamespace}_TX_REF`,
            status: 'DRAFT',
            currency: 'USD',
            subtotalAmount: new Prisma.Decimal('100.00'),
            discountTotalAmount: new Prisma.Decimal('0.00'),
            totalAmount: new Prisma.Decimal('100.00'),
            tenantId: testNamespace,
          },
        });

        // Step 2: Insert invalid item (violates chk_sale_items_positive_quantity)
        await tx.saleItem.create({
          data: {
            id: testItemId,
            saleId: testSaleId,
            sourceType: 'COMMERCIAL',
            sourceId: `${testNamespace}_ITEM_SRC`,
            description: 'Invalid Item',
            quantity: new Prisma.Decimal('-1.000'), // VIOLATION of chk_sale_items_positive_quantity!
            unitPriceAmount: new Prisma.Decimal('100.00'),
            unitPriceCurrency: 'USD',
            subtotalAmount: new Prisma.Decimal('100.00'),
            discountTotalAmount: new Prisma.Decimal('0.00'),
            totalAmount: new Prisma.Decimal('100.00'),
          },
        });
      });
    } catch {
      txFailed = true;
    }

    expect(txFailed).toBe(true);

    // Verify ACID rollback: Step 1 must NOT have persisted
    const rolledBackSale = await prisma.sale.findUnique({
      where: { id: testSaleId },
    });
    expect(rolledBackSale).toBeNull();
  });
});
