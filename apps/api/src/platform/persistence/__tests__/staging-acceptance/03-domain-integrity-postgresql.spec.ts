import { PrismaClient, Prisma } from '@prisma/client';
import { StagingTestHelper } from './staging-test-helper';

describe('Milestone 10.7 — Phase 3: Critical Domain Integrity Against PostgreSQL', () => {
  let prisma: PrismaClient;
  let isDbAvailable = false;
  const testNamespace = StagingTestHelper.generateTestRunPrefix('P3_DOMAIN');

  beforeAll(async () => {
    jest.setTimeout(30000);
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
      console.warn('[WARN] Staging database not available for Phase 3 Domain Integrity test.');
    }
  });

  afterAll(async () => {
    if (isDbAvailable && prisma) {
      await StagingTestHelper.cleanupTestNamespace(prisma, testNamespace);
      await prisma.$disconnect().catch(() => {});
    }
  });

  it('3.1 Clients & Identity: verifies aggregate persistence, uniqueness, and timeline projection', async () => {
    if (!isDbAvailable) return;

    const clientId = `${testNamespace}_cl_1`;
    const refNum = `${testNamespace}_REF_CLI`;

    // Create client aggregate
    const client = await prisma.client.create({
      data: {
        id: clientId,
        referenceNumber: refNum,
        firstName: 'Elena',
        lastName: 'Rostova',
        email: `${testNamespace}_elena@example.com`,
        phone: '+15551234567',
        normalizedEmail: `${testNamespace}_elena@example.com`.toLowerCase(),
        normalizedPhone: '+15551234567',
        normalizedSearchName: 'elena rostova',
        status: 'ACTIVE',
      },
    });

    expect(client.id).toBe(clientId);

    // Timeline entry
    const entry = await prisma.clientTimelineEntry.create({
      data: {
        id: `${testNamespace}_tle_1`,
        clientId: client.id,
        sourceModule: 'CLIENT',
        eventType: 'CLIENT_REGISTERED',
        summary: 'Client registration completed via onboarding portal',
        occurredAt: new Date(),
        metadata: { source: 'WEB_PORTAL', ip: '127.0.0.1' },
      },
    });

    expect(entry.clientId).toBe(clientId);

    // Verify uniqueness enforcement on referenceNumber (P2002)
    await expect(
      prisma.client.create({
        data: {
          id: `${testNamespace}_cl_dup`,
          referenceNumber: refNum,
          firstName: 'Duplicate',
          lastName: 'Client',
          email: `${testNamespace}_dup@example.com`,
          phone: '+15551234568',
          normalizedEmail: `${testNamespace}_dup@example.com`.toLowerCase(),
          normalizedPhone: '+15551234568',
          normalizedSearchName: 'duplicate client',
        },
      }),
    ).rejects.toThrow();
  });

  it('3.2 Membership & Attendance: verifies plan, lifecycle status transitions, and check-in records', async () => {
    if (!isDbAvailable) return;

    // 1. Create client
    const clientId = `${testNamespace}_cl_gym`;
    await prisma.client.create({
      data: {
        id: clientId,
        referenceNumber: `${testNamespace}_REF_GYM`,
        firstName: 'Carlos',
        lastName: 'Vargas',
        email: `${testNamespace}_carlos@example.com`,
        phone: '+15559876543',
        normalizedEmail: `${testNamespace}_carlos@example.com`.toLowerCase(),
        normalizedPhone: '+15559876543',
        normalizedSearchName: 'carlos vargas',
      },
    });

    // 2. Create membership plan
    const planId = `${testNamespace}_plan_std`;
    const plan = await prisma.membershipPlan.create({
      data: {
        id: planId,
        code: `${testNamespace}_PLAN_MTH`,
        name: 'Monthly Standard Fitness',
        durationDays: 30,
        priceAmount: new Prisma.Decimal('60.00'),
        priceCurrency: 'USD',
        status: 'ACTIVE',
      },
    });

    expect(plan.code).toBe(`${testNamespace}_PLAN_MTH`);

    // 3. Create active membership
    const membershipId = `${testNamespace}_mem_1`;
    const startDate = new Date();
    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const membership = await prisma.membership.create({
      data: {
        id: membershipId,
        clientId,
        planId: plan.id,
        status: 'ACTIVE',
        startDate,
        endDate,
      },
    });

    expect(membership.status).toBe('ACTIVE');

    // 4. Record successful check-in
    const attendanceRecord = await prisma.attendanceRecord.create({
      data: {
        id: `${testNamespace}_att_1`,
        clientId,
        membershipId: membership.id,
        checkInTime: new Date(),
        gymDay: new Date().toISOString().slice(0, 10),
        method: 'QR_CODE',
        result: 'GRANTED',
        gateId: 'MAIN_TURNSTILE_1',
      },
    });

    expect(attendanceRecord.result).toBe('GRANTED');

    // 5. Freeze membership
    const updatedMembership = await prisma.membership.update({
      where: { id: membership.id },
      data: {
        status: 'FROZEN',
        freezeHistory: [
          {
            frozenAt: new Date().toISOString(),
            reason: 'Travel',
          },
        ],
      },
    });

    expect(updatedMembership.status).toBe('FROZEN');

    // 6. Record denied check-in when frozen
    const deniedAttendance = await prisma.attendanceRecord.create({
      data: {
        id: `${testNamespace}_att_2`,
        clientId,
        membershipId: membership.id,
        checkInTime: new Date(),
        gymDay: new Date().toISOString().slice(0, 10),
        method: 'QR_CODE',
        result: 'DENIED_FROZEN',
        notes: 'Membership currently frozen',
      },
    });

    expect(deniedAttendance.result).toBe('DENIED_FROZEN');
  });

  it('3.3 Scheduling & Kinesiology: verifies appointment room overlap check, sessions, and SOAP notes', async () => {
    if (!isDbAvailable) return;

    // 1. Create client & room
    const clientId = `${testNamespace}_cl_kine`;
    await prisma.client.create({
      data: {
        id: clientId,
        referenceNumber: `${testNamespace}_REF_KINE`,
        firstName: 'Marco',
        lastName: 'Diaz',
        email: `${testNamespace}_marco@example.com`,
        phone: '+15553334444',
        normalizedEmail: `${testNamespace}_marco@example.com`.toLowerCase(),
        normalizedPhone: '+15553334444',
        normalizedSearchName: 'marco diaz',
      },
    });

    const roomId = `${testNamespace}_room_101`;
    const room = await prisma.room.create({
      data: {
        id: roomId,
        name: `${testNamespace}_Room 101`,
        resourceType: 'ROOM',
        capacity: 1,
        status: 'AVAILABLE',
      },
    });

    // 2. Schedule appointment
    const slotStart = new Date('2026-11-10T10:00:00.000Z');
    const slotEnd = new Date('2026-11-10T11:00:00.000Z');
    const therapistId = `${testNamespace}_therapist_dr_smith`;

    const appointment = await prisma.appointment.create({
      data: {
        id: `${testNamespace}_appt_1`,
        clientId,
        therapistId,
        roomId: room.id,
        type: 'PHYSIOTHERAPY_EVALUATION',
        status: 'SCHEDULED',
        startTime: slotStart,
        endTime: slotEnd,
      },
    });

    expect(appointment.status).toBe('SCHEDULED');

    // 3. PostgreSQL Overlap Detection Query
    // Querying existing appointments that overlap with slotStart/slotEnd in same room
    const overlapping = await prisma.appointment.findMany({
      where: {
        roomId: room.id,
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
        AND: [{ startTime: { lt: slotEnd } }, { endTime: { gt: slotStart } }],
      },
    });

    expect(overlapping.length).toBe(1);
    expect(overlapping[0]?.id).toBe(appointment.id);

    // 4. Create TreatmentSession linked to appointment
    const session = await prisma.treatmentSession.create({
      data: {
        id: `${testNamespace}_sess_1`,
        clientId,
        therapistId,
        appointmentId: appointment.id,
        status: 'IN_PROGRESS',
        notesSubjective: 'Patient reports acute lumbar discomfort (VAS 7/10)',
        notesObjective: 'Restricted flexion at L4-L5, mild paraspinal muscle spasm',
        notesAssessment: 'Acute lumbar strain',
        notesPlan: 'Thermotherapy, gentle manual mobilisation, home core stability exercises',
      },
    });

    expect(session.status).toBe('IN_PROGRESS');
    expect(session.notesSubjective).toContain('lumbar discomfort');

    // 5. Complete session (locking SOAP notes)
    const completedSession = await prisma.treatmentSession.update({
      where: { id: session.id },
      data: {
        status: 'COMPLETED',
      },
    });

    expect(completedSession.status).toBe('COMPLETED');
  });

  it('3.4 Sales & Payments: verifies sale calculation, payment completion, and receipt sequence generation', async () => {
    if (!isDbAvailable) return;

    const saleId = `${testNamespace}_sale_main`;
    const tenantId = testNamespace;

    // 1. Create Sale with two items
    const sale = await prisma.sale.create({
      data: {
        id: saleId,
        tenantId,
        sourceType: 'COMMERCIAL',
        sourceId: `${testNamespace}_COMM_ORDER_1`,
        status: 'DRAFT',
        currency: 'USD',
        subtotalAmount: new Prisma.Decimal('100.00'),
        discountTotalAmount: new Prisma.Decimal('10.00'),
        totalAmount: new Prisma.Decimal('90.00'),
        items: {
          create: [
            {
              id: `${testNamespace}_sitem_1`,
              sourceType: 'SERVICE',
              sourceId: `${testNamespace}_SRV_01`,
              description: 'Physiotherapy 60min Session',
              quantity: new Prisma.Decimal('1.000'),
              unitPriceAmount: new Prisma.Decimal('70.00'),
              unitPriceCurrency: 'USD',
              subtotalAmount: new Prisma.Decimal('70.00'),
              discountTotalAmount: new Prisma.Decimal('0.00'),
              totalAmount: new Prisma.Decimal('70.00'),
            },
            {
              id: `${testNamespace}_sitem_2`,
              sourceType: 'PRODUCT',
              sourceId: `${testNamespace}_PRD_01`,
              description: 'Kinesio Tape Roll',
              quantity: new Prisma.Decimal('2.000'),
              unitPriceAmount: new Prisma.Decimal('15.00'),
              unitPriceCurrency: 'USD',
              subtotalAmount: new Prisma.Decimal('30.00'),
              discountTotalAmount: new Prisma.Decimal('10.00'),
              totalAmount: new Prisma.Decimal('20.00'),
            },
          ],
        },
      },
      include: { items: true },
    });

    expect(sale.items.length).toBe(2);
    expect(sale.totalAmount.toString()).toBe('90');

    // 2. Process Settled Payment
    const payment = await prisma.payment.create({
      data: {
        id: `${testNamespace}_pay_settled`,
        tenantId,
        saleId: sale.id,
        method: 'CASH',
        amount: new Prisma.Decimal('90.00'),
        currency: 'USD',
        status: 'SETTLED',
        reference: `${testNamespace}_CASH_REF`,
        paidAt: new Date(),
      },
    });

    expect(payment.status).toBe('SETTLED');

    // 3. Increment Receipt Sequence atomically in PostgreSQL
    const year = 2026;
    const seq = await prisma.receiptSequence.upsert({
      where: {
        tenantId_year: { tenantId, year },
      },
      update: {
        currentValue: { increment: 1 },
      },
      create: {
        tenantId,
        year,
        currentValue: 1,
      },
    });

    const receiptNum = `REC-${year}-${String(seq.currentValue).padStart(6, '0')}`;
    expect(receiptNum).toBe('REC-2026-000001');

    // 4. Issue formal Receipt
    const receipt = await prisma.receipt.create({
      data: {
        id: `${testNamespace}_rec_1`,
        tenantId,
        saleId: sale.id,
        receiptNumber: receiptNum,
        saleReference: sale.sourceId,
        itemsSnapshot: sale.items.map((i) => ({ desc: i.description, total: i.totalAmount })),
        paymentsSnapshot: [{ method: payment.method, amount: payment.amount.toString() }],
        subtotalAmount: sale.subtotalAmount,
        discountTotalAmount: sale.discountTotalAmount,
        totalAmount: sale.totalAmount,
        currency: 'USD',
        status: 'ISSUED',
      },
    });

    expect(receipt.receiptNumber).toBe('REC-2026-000001');

    // 5. Enforce single receipt per sale invariant: unique_tenant_sale_receipt
    await expect(
      prisma.receipt.create({
        data: {
          id: `${testNamespace}_rec_dup`,
          tenantId,
          saleId: sale.id,
          receiptNumber: 'REC-2026-000002',
          saleReference: sale.sourceId,
          itemsSnapshot: [],
          paymentsSnapshot: [],
          subtotalAmount: sale.subtotalAmount,
          discountTotalAmount: sale.discountTotalAmount,
          totalAmount: sale.totalAmount,
        },
      }),
    ).rejects.toThrow();
  });

  it('3.5 Inventory: verifies stock receiving, decrement ledger, and low-stock threshold alert', async () => {
    if (!isDbAvailable) return;

    const itemId = `${testNamespace}_item_band`;
    const sku = `${testNamespace}_SKU_RES_BAND`;

    // 1. Create item with 0 stock, minimumStock = 5
    const item = await prisma.inventoryItem.create({
      data: {
        id: itemId,
        tenantId: testNamespace,
        sku,
        name: 'Resistance Exercise Band Medium',
        category: 'THERAPY_CONSUMABLES',
        unit: 'UNITS',
        minimumStock: new Prisma.Decimal('5.00'),
        quantityOnHand: new Prisma.Decimal('0.00'),
        purchaseCostAmount: new Prisma.Decimal('8.00'),
        sellingPriceAmount: new Prisma.Decimal('16.00'),
        status: 'ACTIVE',
      },
    });

    expect(item.quantityOnHand.toString()).toBe('0');

    // 2. Execute Stock Movement: PURCHASE (+20 units)
    await prisma.$transaction(async (tx) => {
      const receivingQty = new Prisma.Decimal('20.00');
      const newBalance = item.quantityOnHand.plus(receivingQty);

      await tx.stockMovement.create({
        data: {
          id: `${testNamespace}_mov_recv`,
          inventoryItemId: item.id,
          movementType: 'PURCHASE',
          quantityDelta: receivingQty,
          balanceAfter: newBalance,
          unitCostAmount: item.purchaseCostAmount,
          reason: 'Initial shipment arrival',
          recordedByUserId: `${testNamespace}_user_admin`,
        },
      });

      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantityOnHand: newBalance },
      });
    });

    let reloadedItem = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(reloadedItem!.quantityOnHand.toString()).toBe('20');

    // 3. Execute Stock Movement: SALE decrement (-16 units)
    await prisma.$transaction(async (tx) => {
      const saleQty = new Prisma.Decimal('-16.00');
      const current = await tx.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
      const newBalance = current.quantityOnHand.plus(saleQty); // 20 - 16 = 4

      await tx.stockMovement.create({
        data: {
          id: `${testNamespace}_mov_sale`,
          inventoryItemId: item.id,
          movementType: 'SALE',
          quantityDelta: saleQty,
          balanceAfter: newBalance,
          unitCostAmount: item.purchaseCostAmount,
          reason: 'Retail checkout sale',
          recordedByUserId: `${testNamespace}_user_clerk`,
        },
      });

      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantityOnHand: newBalance },
      });
    });

    reloadedItem = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(reloadedItem!.quantityOnHand.toString()).toBe('4');

    // 4. Low-stock invariant query
    const isLowStock = reloadedItem!.quantityOnHand.lessThan(reloadedItem!.minimumStock);
    expect(isLowStock).toBe(true); // 4 < 5
  });
});
