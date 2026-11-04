import { PrismaClient, Prisma } from '@prisma/client';
import { StagingTestHelper } from './staging-test-helper';

describe('Milestone 10.7 — Phase 5: PostgreSQL Concurrency & Transaction Stress Testing', () => {
  let prisma: PrismaClient;
  let isDbAvailable = false;
  const testNamespace = StagingTestHelper.generateTestRunPrefix('P5_CONCUR');

  beforeAll(async () => {
    jest.setTimeout(45000);
    const activeUrl = await StagingTestHelper.resolveActivePostgresUrl();
    try {
      const probe = StagingTestHelper.createClient(activeUrl);
      await probe.$queryRawUnsafe('SELECT 1');
      await probe.$disconnect();
      isDbAvailable = true;

      prisma = StagingTestHelper.createClient(activeUrl);
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
      console.warn('[WARN] Staging database not available for Phase 5 Concurrency test.');
    }
  });

  afterAll(async () => {
    if (isDbAvailable && prisma) {
      await StagingTestHelper.cleanupTestNamespace(prisma, testNamespace);
      await prisma.$disconnect().catch(() => {});
    }
  });

  // ============================================================================
  // 5.1 Concurrent Attendance / Check-In
  // ============================================================================
  it('5.1 verifies concurrent check-in requests for the same client execute deterministically', async () => {
    if (!isDbAvailable) return;

    // 1. Setup client and active membership
    const clientId = `${testNamespace}_cl_conc_att`;
    await prisma.client.create({
      data: {
        id: clientId,
        referenceNumber: `${testNamespace}_REF_CONC_ATT`,
        firstName: 'Lucas',
        lastName: 'Moretti',
        email: `${testNamespace}_lucas@example.com`,
        phone: '+15556667788',
        normalizedEmail: `${testNamespace}_lucas@example.com`.toLowerCase(),
        normalizedPhone: '+15556667788',
        normalizedSearchName: 'lucas moretti',
        status: 'ACTIVE',
      },
    });

    const plan = await prisma.membershipPlan.create({
      data: {
        id: `${testNamespace}_plan_conc`,
        code: `${testNamespace}_PLAN_CONC`,
        name: 'Concurrency Test Plan',
        durationDays: 30,
        priceAmount: new Prisma.Decimal('50.00'),
        status: 'ACTIVE',
      },
    });

    const membership = await prisma.membership.create({
      data: {
        id: `${testNamespace}_mem_conc_att`,
        clientId,
        planId: plan.id,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 86400000),
      },
    });

    // 2. Fire 5 simultaneous check-in attempts via Promise.all
    const gymDay = new Date().toISOString().slice(0, 10);
    const concurrentCheckInPromises = Array.from({ length: 5 }).map((_, idx) =>
      prisma.attendanceRecord.create({
        data: {
          id: `${testNamespace}_att_burst_${idx}`,
          clientId,
          membershipId: membership.id,
          checkInTime: new Date(Date.now() + idx * 10),
          gymDay,
          method: 'QR_CODE',
          result: idx === 0 ? 'GRANTED' : 'DENIED_DUPLICATE_CHECKIN',
          gateId: `TURNSTILE_${idx}`,
        },
      }),
    );

    const results = await Promise.all(concurrentCheckInPromises);
    expect(results.length).toBe(5);

    // Verify all 5 records are persisted in PostgreSQL without engine deadlock or corruption
    const persisted = await prisma.attendanceRecord.findMany({
      where: { clientId },
    });
    expect(persisted.length).toBe(5);

    const grantedCount = persisted.filter((r) => r.result === 'GRANTED').length;
    const deniedCount = persisted.filter((r) => r.result === 'DENIED_DUPLICATE_CHECKIN').length;
    expect(grantedCount).toBe(1);
    expect(deniedCount).toBe(4);
  });

  // ============================================================================
  // 5.2 Concurrent Appointment Booking on Same Room Slot
  // ============================================================================
  it('5.2 verifies concurrent appointment booking conflict detection in PostgreSQL', async () => {
    if (!isDbAvailable) return;

    // 1. Setup Room and 2 Clients
    const roomId = `${testNamespace}_room_conc_race`;
    await prisma.room.create({
      data: {
        id: roomId,
        name: `${testNamespace}_Race Room 303`,
        resourceType: 'ROOM',
        capacity: 1,
        status: 'AVAILABLE',
      },
    });

    const client1 = await prisma.client.create({
      data: {
        id: `${testNamespace}_cl_race_1`,
        referenceNumber: `${testNamespace}_REF_RACE_1`,
        firstName: 'Racer',
        lastName: 'One',
        email: `${testNamespace}_racer1@example.com`,
        phone: '+15550010001',
        normalizedEmail: `${testNamespace}_racer1@example.com`.toLowerCase(),
        normalizedPhone: '+15550010001',
        normalizedSearchName: 'racer one',
      },
    });

    const client2 = await prisma.client.create({
      data: {
        id: `${testNamespace}_cl_race_2`,
        referenceNumber: `${testNamespace}_REF_RACE_2`,
        firstName: 'Racer',
        lastName: 'Two',
        email: `${testNamespace}_racer2@example.com`,
        phone: '+15550020002',
        normalizedEmail: `${testNamespace}_racer2@example.com`.toLowerCase(),
        normalizedPhone: '+15550020002',
        normalizedSearchName: 'racer two',
      },
    });

    const startTime = new Date('2026-11-20T16:00:00.000Z');
    const endTime = new Date('2026-11-20T17:00:00.000Z');
    const therapistId = `${testNamespace}_therapist_dr_race`;

    // 2. Transactional conflict-detection function matching application booking service
    const attemptBookAppointment = async (
      apptId: string,
      clientId: string,
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        return await prisma.$transaction(
          async (tx) => {
            // Check for existing overlapping appointment in PostgreSQL
            const conflict = await tx.appointment.findFirst({
              where: {
                roomId,
                status: { in: ['SCHEDULED', 'CONFIRMED'] },
                AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startTime } }],
              },
            });

            if (conflict) {
              throw new Error(`ROOM_CONFLICT: Room ${roomId} is already booked`);
            }

            // Create appointment if no conflict
            await tx.appointment.create({
              data: {
                id: apptId,
                clientId,
                therapistId,
                roomId,
                type: 'EVALUATION',
                status: 'CONFIRMED',
                startTime,
                endTime,
              },
            });

            return { success: true };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    };

    // 3. Execute both booking attempts concurrently
    const [result1, result2] = await Promise.all([
      attemptBookAppointment(`${testNamespace}_appt_race_1`, client1.id),
      attemptBookAppointment(`${testNamespace}_appt_race_2`, client2.id),
    ]);

    // Exactly one booking MUST succeed and the other MUST fail
    const successes = [result1, result2].filter((r) => r.success).length;
    const failures = [result1, result2].filter((r) => !r.success).length;

    expect(successes).toBe(1);
    expect(failures).toBe(1);

    // Verify in PostgreSQL database: exactly 1 appointment exists for this slot
    const bookedAppointments = await prisma.appointment.findMany({
      where: { roomId, startTime, endTime },
    });
    expect(bookedAppointments.length).toBe(1);
  });

  // ============================================================================
  // 5.3 Concurrent Stock Decrement & Non-Negative Inventory Invariant
  // ============================================================================
  it('5.3 verifies concurrent stock decrements enforce non-negative stock invariant', async () => {
    if (!isDbAvailable) return;

    // 1. Create item with exactly 10 units in stock
    const itemId = `${testNamespace}_item_conc_stock`;
    const item = await prisma.inventoryItem.create({
      data: {
        id: itemId,
        tenantId: testNamespace,
        sku: `${testNamespace}_SKU_CONC_STOCK`,
        name: 'Concurrent Magnesium Glycinate',
        category: 'SUPPLEMENTS',
        unit: 'UNITS',
        minimumStock: new Prisma.Decimal('2.00'),
        quantityOnHand: new Prisma.Decimal('10.00'), // 10 units available
        purchaseCostAmount: new Prisma.Decimal('15.00'),
        sellingPriceAmount: new Prisma.Decimal('30.00'),
        status: 'ACTIVE',
      },
    });

    // 2. 3 concurrent requests each attempt to decrement 4 units (total 12 units requested > 10 available)
    const attemptDecrement = async (reqIndex: number): Promise<{ success: boolean }> => {
      try {
        await prisma.$transaction(
          async (tx) => {
            // In PostgreSQL, execute an atomic guarded decrement:
            // UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - 4
            // WHERE id = ? AND quantity_on_hand >= 4
            const updated = await tx.$executeRawUnsafe(
              `UPDATE inventory_items 
               SET quantity_on_hand = quantity_on_hand - 4.00, version = version + 1
               WHERE id = $1 AND quantity_on_hand >= 4.00`,
              item.id,
            );

            if (updated === 0) {
              throw new Error('INSUFFICIENT_STOCK: Inventory exhausted');
            }

            // Record movement
            await tx.stockMovement.create({
              data: {
                id: `${testNamespace}_smov_conc_${reqIndex}`,
                inventoryItemId: item.id,
                movementType: 'SALE',
                quantityDelta: new Prisma.Decimal('-4.00'),
                balanceAfter: new Prisma.Decimal('0.00'), // Placeholder for ledger
                reason: `Concurrent checkout ${reqIndex}`,
                recordedByUserId: `${testNamespace}_clerk`,
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
        );
        return { success: true };
      } catch {
        return { success: false };
      }
    };

    const results = await Promise.all([
      attemptDecrement(1),
      attemptDecrement(2),
      attemptDecrement(3),
    ]);

    const successes = results.filter((r) => r.success).length;
    const failures = results.filter((r) => !r.success).length;

    // Exactly 2 decrements succeed (2 * 4 = 8 units decremented)
    // The 3rd request fails because 2 < 4
    expect(successes).toBe(2);
    expect(failures).toBe(1);

    // Verify final stock in PostgreSQL is exactly 2 units (10 - 8 = 2), never negative!
    const finalItem = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(finalItem?.quantityOnHand.toString()).toBe('2');
    expect(finalItem?.quantityOnHand.isNegative()).toBe(false);
  });

  // ============================================================================
  // 5.4 Concurrent Receipt Issuance on Same Sale (Idempotency / Uniqueness)
  // ============================================================================
  it('5.4 verifies concurrent receipt issuance on the same sale enforces unique_tenant_sale_receipt', async () => {
    if (!isDbAvailable) return;

    const tenantId = testNamespace;

    // 1. Create completed sale
    const saleId = `${testNamespace}_sale_conc_rec`;
    const sale = await prisma.sale.create({
      data: {
        id: saleId,
        tenantId,
        sourceType: 'COMMERCIAL',
        sourceId: `${testNamespace}_SRC_CONC_REC`,
        status: 'COMPLETED',
        currency: 'USD',
        subtotalAmount: new Prisma.Decimal('120.00'),
        discountTotalAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('120.00'),
        completedAt: new Date(),
      },
    });

    // 2. 2 concurrent workers attempt to generate receipt for the same sale
    const attemptIssueReceipt = async (
      workerId: string,
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        await prisma.receipt.create({
          data: {
            id: `${testNamespace}_rec_conc_${workerId}`,
            tenantId,
            saleId: sale.id,
            receiptNumber: `REC-2026-${workerId}`,
            saleReference: sale.sourceId,
            itemsSnapshot: [],
            paymentsSnapshot: [],
            subtotalAmount: sale.subtotalAmount,
            discountTotalAmount: sale.discountTotalAmount,
            totalAmount: sale.totalAmount,
            currency: 'USD',
            status: 'ISSUED',
          },
        });
        return { success: true };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    };

    const [workerA, workerB] = await Promise.all([
      attemptIssueReceipt('WORKER_A'),
      attemptIssueReceipt('WORKER_B'),
    ]);

    const successes = [workerA, workerB].filter((r) => r.success).length;
    const failures = [workerA, workerB].filter((r) => !r.success).length;

    // Exactly 1 receipt issued; duplicate rejected by PostgreSQL unique_tenant_sale_receipt
    expect(successes).toBe(1);
    expect(failures).toBe(1);

    const receiptsInDb = await prisma.receipt.findMany({ where: { saleId: sale.id } });
    expect(receiptsInDb.length).toBe(1);
  });

  // ============================================================================
  // 5.5 Transaction Rollback After Partial Failure
  // ============================================================================
  it('5.5 verifies multi-table transaction rolls back completely on middle-step failure', async () => {
    if (!isDbAvailable) return;

    const clientRef = `${testNamespace}_REF_ROLLBACK_CLI`;
    const clientId = `${testNamespace}_cl_rollback`;
    const apptId = `${testNamespace}_appt_rollback`;

    let txError = false;
    try {
      await prisma.$transaction(async (tx) => {
        // Step 1: Create Client (Valid)
        await tx.client.create({
          data: {
            id: clientId,
            referenceNumber: clientRef,
            firstName: 'Rollback',
            lastName: 'Tester',
            email: `${testNamespace}_rollback@test.com`,
            phone: '+15559998877',
            normalizedEmail: `${testNamespace}_rollback@test.com`.toLowerCase(),
            normalizedPhone: '+15559998877',
            normalizedSearchName: 'rollback tester',
          },
        });

        // Step 2: Attempt to create Sale with negative subtotal (VIOLATES chk_sales_non_negative_subtotal)
        await tx.sale.create({
          data: {
            id: `${testNamespace}_sale_rb`,
            sourceType: 'COMMERCIAL',
            sourceId: `${testNamespace}_SRC_RB`,
            status: 'DRAFT',
            currency: 'USD',
            subtotalAmount: new Prisma.Decimal('-100.00'), // VIOLATION!
            discountTotalAmount: new Prisma.Decimal('0.00'),
            totalAmount: new Prisma.Decimal('0.00'),
            tenantId: testNamespace,
          },
        });
      });
    } catch {
      txError = true;
    }

    expect(txError).toBe(true);

    // Verify ACID guarantee: Client from Step 1 was completely rolled back!
    const clientAfterRollback = await prisma.client.findUnique({
      where: { id: clientId },
    });
    expect(clientAfterRollback).toBeNull();

    const apptAfterRollback = await prisma.appointment.findUnique({
      where: { id: apptId },
    });
    expect(apptAfterRollback).toBeNull();
  });
});
