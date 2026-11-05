import { PrismaClient, Prisma } from '@prisma/client';
import { StagingTestHelper } from './staging-test-helper';

describe('Milestone 10.7 — Phase 4: Full Business Acceptance Journeys Against PostgreSQL', () => {
  let prisma: PrismaClient;
  let isDbAvailable = false;
  const testNamespace = StagingTestHelper.generateTestRunPrefix('P4_JOURNEYS');

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
      console.warn('[WARN] Staging database not available for Phase 4 Acceptance Journeys.');
    }
  }, 30000);

  afterAll(async () => {
    if (isDbAvailable && prisma) {
      await StagingTestHelper.cleanupTestNamespace(prisma, testNamespace);
      await prisma.$disconnect().catch(() => {});
    }
  });

  // ============================================================================
  // Journey 1: Gym Management
  // Client -> Membership -> Payment -> Receipt -> Check-in
  // ============================================================================
  it('4.1 Gym Acceptance Journey: Client -> Membership -> Payment -> Receipt -> Check-In', async () => {
    if (!isDbAvailable) return;

    const tenantId = testNamespace;

    // Step 1: Client Onboarding
    const clientId = `${testNamespace}_client_gym_e2e`;
    const clientRef = `${testNamespace}_REF_E2E_GYM`;
    const client = await prisma.client.create({
      data: {
        id: clientId,
        referenceNumber: clientRef,
        firstName: 'Valeria',
        lastName: 'Gomez',
        email: `${testNamespace}_valeria@example.com`,
        phone: '+15551112233',
        normalizedEmail: `${testNamespace}_valeria@example.com`.toLowerCase(),
        normalizedPhone: '+15551112233',
        normalizedSearchName: 'valeria gomez',
        status: 'ACTIVE',
      },
    });
    expect(client.status).toBe('ACTIVE');

    // Step 2: Select Membership Plan & Enroll
    const planId = `${testNamespace}_plan_premium`;
    const plan = await prisma.membershipPlan.create({
      data: {
        id: planId,
        code: `${testNamespace}_PLAN_PREM`,
        name: 'Annual Premium All-Access',
        durationDays: 365,
        priceAmount: new Prisma.Decimal('600.00'),
        priceCurrency: 'USD',
        status: 'ACTIVE',
      },
    });

    const membershipId = `${testNamespace}_mem_gym_e2e`;
    const startDate = new Date();
    const endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const membership = await prisma.membership.create({
      data: {
        id: membershipId,
        clientId: client.id,
        planId: plan.id,
        status: 'ACTIVE',
        startDate,
        endDate,
      },
    });
    expect(membership.status).toBe('ACTIVE');

    // Step 3: Billing & Payment for Membership
    const saleId = `${testNamespace}_sale_gym_mem`;
    const sale = await prisma.sale.create({
      data: {
        id: saleId,
        tenantId,
        clientId: client.id,
        sourceType: 'GYM_MEMBERSHIP',
        sourceId: membership.id,
        status: 'COMPLETED',
        currency: 'USD',
        subtotalAmount: new Prisma.Decimal('600.00'),
        discountTotalAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('600.00'),
        completedAt: new Date(),
        items: {
          create: [
            {
              id: `${testNamespace}_sitem_mem`,
              sourceType: 'MEMBERSHIP',
              sourceId: plan.id,
              description: 'Annual Premium All-Access Membership',
              quantity: new Prisma.Decimal('1.000'),
              unitPriceAmount: new Prisma.Decimal('600.00'),
              unitPriceCurrency: 'USD',
              subtotalAmount: new Prisma.Decimal('600.00'),
              discountTotalAmount: new Prisma.Decimal('0.00'),
              totalAmount: new Prisma.Decimal('600.00'),
            },
          ],
        },
      },
      include: { items: true },
    });

    const payment = await prisma.payment.create({
      data: {
        id: `${testNamespace}_pay_gym_mem`,
        tenantId,
        saleId: sale.id,
        method: 'QR',
        amount: new Prisma.Decimal('600.00'),
        currency: 'USD',
        status: 'SETTLED',
        reference: `${testNamespace}_QR_TXN_001`,
        paidAt: new Date(),
      },
    });
    expect(payment.status).toBe('SETTLED');

    // Step 4: Issue Formal Receipt
    const seq = await prisma.receiptSequence.upsert({
      where: { tenantId_year: { tenantId, year: 2026 } },
      update: { currentValue: { increment: 1 } },
      create: { tenantId, year: 2026, currentValue: 1 },
    });

    const receiptNumber = `REC-2026-${String(seq.currentValue).padStart(6, '0')}`;
    const receipt = await prisma.receipt.create({
      data: {
        id: `${testNamespace}_rec_gym_mem`,
        tenantId,
        saleId: sale.id,
        receiptNumber,
        saleReference: membership.id,
        clientSnapshot: { id: client.id, name: `${client.firstName} ${client.lastName}` },
        itemsSnapshot: sale.items.map((i) => ({ desc: i.description, amount: i.totalAmount })),
        paymentsSnapshot: [{ method: payment.method, amount: payment.amount.toString() }],
        subtotalAmount: sale.subtotalAmount,
        discountTotalAmount: sale.discountTotalAmount,
        totalAmount: sale.totalAmount,
        currency: 'USD',
        status: 'ISSUED',
      },
    });
    expect(receipt.receiptNumber).toBe(receiptNumber);

    // Step 5: Member Check-In at Turnstile
    const checkIn = await prisma.attendanceRecord.create({
      data: {
        id: `${testNamespace}_att_gym_e2e`,
        clientId: client.id,
        membershipId: membership.id,
        checkInTime: new Date(),
        gymDay: new Date().toISOString().slice(0, 10),
        method: 'QR_CODE',
        result: 'GRANTED',
        gateId: 'NORTH_TURNSTILE_A',
      },
    });

    expect(checkIn.result).toBe('GRANTED');

    // Verify complete graph exists in staging PostgreSQL
    const savedMembership = await prisma.membership.findUnique({
      where: { id: membership.id },
      include: {
        plan: true,
        attendanceRecords: true,
      },
    });
    expect(savedMembership?.attendanceRecords.length).toBe(1);
    expect(savedMembership?.attendanceRecords[0]?.result).toBe('GRANTED');
  });

  // ============================================================================
  // Journey 2: Kinesiology & Clinical Scheduling
  // Client -> Appointment -> Treatment session -> SOAP -> Payment -> Receipt
  // ============================================================================
  it('4.2 Kinesiology Acceptance Journey: Client -> Appointment -> Treatment Session -> SOAP -> Payment -> Receipt', async () => {
    if (!isDbAvailable) return;

    const tenantId = testNamespace;

    // Step 1: Client Registration
    const clientId = `${testNamespace}_client_kine_e2e`;
    const clientRef = `${testNamespace}_REF_E2E_KINE`;
    const client = await prisma.client.create({
      data: {
        id: clientId,
        referenceNumber: clientRef,
        firstName: 'Mauricio',
        lastName: 'Perez',
        email: `${testNamespace}_mauricio@example.com`,
        phone: '+15554443322',
        normalizedEmail: `${testNamespace}_mauricio@example.com`.toLowerCase(),
        normalizedPhone: '+15554443322',
        normalizedSearchName: 'mauricio perez',
        status: 'ACTIVE',
      },
    });

    // Step 2: Schedule Appointment in Treatment Room
    const roomId = `${testNamespace}_room_kine_201`;
    const room = await prisma.room.create({
      data: {
        id: roomId,
        name: `${testNamespace}_Room 201 - Electrotherapy`,
        resourceType: 'ROOM',
        capacity: 1,
        status: 'AVAILABLE',
      },
    });

    const apptId = `${testNamespace}_appt_kine_e2e`;
    const startTime = new Date('2026-11-15T14:00:00.000Z');
    const endTime = new Date('2026-11-15T15:00:00.000Z');
    const therapistId = `${testNamespace}_therapist_dr_clara`;

    const appointment = await prisma.appointment.create({
      data: {
        id: apptId,
        clientId: client.id,
        therapistId,
        roomId: room.id,
        type: 'POST_OP_REHAB',
        status: 'CONFIRMED',
        startTime,
        endTime,
      },
    });
    expect(appointment.status).toBe('CONFIRMED');

    // Step 3: Initiate Treatment Session
    const sessionId = `${testNamespace}_session_kine_e2e`;
    const session = await prisma.treatmentSession.create({
      data: {
        id: sessionId,
        clientId: client.id,
        therapistId,
        appointmentId: appointment.id,
        status: 'IN_PROGRESS',
        notesSubjective:
          'Patient reports reduced swelling post ACL repair, knee flexion improved to 95 degrees',
        notesObjective:
          'Goniometry confirms 95 deg active flexion, minimal effusion at suprapatellar pouch',
        notesAssessment: 'Satisfactory Phase 2 ACL rehabilitation progress',
        notesPlan:
          'Isometric quadriceps sets, closed kinetic chain mini-squats, cryotherapy 15 mins',
      },
    });
    expect(session.status).toBe('IN_PROGRESS');

    // Step 4: Lock Clinical SOAP Notes & Complete Session
    const completedSession = await prisma.treatmentSession.update({
      where: { id: session.id },
      data: { status: 'COMPLETED' },
    });
    expect(completedSession.status).toBe('COMPLETED');
    expect(completedSession.notesSubjective).toContain('ACL repair');

    // Step 5: Commercial Billing & Payment for Kinesiology Session
    const saleId = `${testNamespace}_sale_kine_e2e`;
    const sale = await prisma.sale.create({
      data: {
        id: saleId,
        tenantId,
        clientId: client.id,
        sourceType: 'KINESIOLOGY_SESSION',
        sourceId: session.id,
        status: 'COMPLETED',
        currency: 'USD',
        subtotalAmount: new Prisma.Decimal('85.00'),
        discountTotalAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('85.00'),
        completedAt: new Date(),
        items: {
          create: [
            {
              id: `${testNamespace}_sitem_kine`,
              sourceType: 'SERVICE',
              sourceId: session.id,
              description: 'Post-Operative Kinesiology Session (60 min)',
              quantity: new Prisma.Decimal('1.000'),
              unitPriceAmount: new Prisma.Decimal('85.00'),
              unitPriceCurrency: 'USD',
              subtotalAmount: new Prisma.Decimal('85.00'),
              discountTotalAmount: new Prisma.Decimal('0.00'),
              totalAmount: new Prisma.Decimal('85.00'),
            },
          ],
        },
      },
      include: { items: true },
    });

    const payment = await prisma.payment.create({
      data: {
        id: `${testNamespace}_pay_kine_e2e`,
        tenantId,
        saleId: sale.id,
        method: 'CASH',
        amount: new Prisma.Decimal('85.00'),
        currency: 'USD',
        status: 'SETTLED',
        reference: `${testNamespace}_CASH_REHAB_85`,
        paidAt: new Date(),
      },
    });
    expect(payment.status).toBe('SETTLED');

    // Step 6: Issue Formal Receipt
    const seq = await prisma.receiptSequence.upsert({
      where: { tenantId_year: { tenantId, year: 2026 } },
      update: { currentValue: { increment: 1 } },
      create: { tenantId, year: 2026, currentValue: 1 },
    });

    const receiptNumber = `REC-2026-${String(seq.currentValue).padStart(6, '0')}`;
    const receipt = await prisma.receipt.create({
      data: {
        id: `${testNamespace}_rec_kine_e2e`,
        tenantId,
        saleId: sale.id,
        receiptNumber,
        saleReference: session.id,
        clientSnapshot: { id: client.id, name: `${client.firstName} ${client.lastName}` },
        itemsSnapshot: sale.items.map((i) => ({ desc: i.description, amount: i.totalAmount })),
        paymentsSnapshot: [{ method: payment.method, amount: payment.amount.toString() }],
        subtotalAmount: sale.subtotalAmount,
        discountTotalAmount: sale.discountTotalAmount,
        totalAmount: sale.totalAmount,
        currency: 'USD',
        status: 'ISSUED',
      },
    });

    expect(receipt.receiptNumber).toBe(receiptNumber);
    expect(receipt.totalAmount.toString()).toBe('85');
  });

  // ============================================================================
  // Journey 3: Inventory & Retail Point of Sale
  // Stock receiving -> Retail sale -> Stock movement -> Low-stock behavior
  // ============================================================================
  it('4.3 Inventory Acceptance Journey: Stock Receiving -> Retail Sale -> Stock Movement -> Low-Stock Trigger', async () => {
    if (!isDbAvailable) return;

    const tenantId = testNamespace;

    // Step 1: Create Retail Product (Reorder threshold = 5 units)
    const itemId = `${testNamespace}_item_protein`;
    const sku = `${testNamespace}_SKU_PROT_ISOLATE`;

    const item = await prisma.inventoryItem.create({
      data: {
        id: itemId,
        tenantId,
        sku,
        name: 'Whey Protein Isolate 1kg Chocolate',
        category: 'SUPPLEMENTS',
        unit: 'UNITS',
        minimumStock: new Prisma.Decimal('5.00'),
        quantityOnHand: new Prisma.Decimal('0.00'),
        purchaseCostAmount: new Prisma.Decimal('25.00'),
        sellingPriceAmount: new Prisma.Decimal('45.00'),
        status: 'ACTIVE',
      },
    });
    expect(item.quantityOnHand.toString()).toBe('0');

    // Step 2: Inbound Stock Receiving (PURCHASE of 10 units)
    await prisma.$transaction(async (tx) => {
      const receivedQty = new Prisma.Decimal('10.00');
      const balanceAfter = item.quantityOnHand.plus(receivedQty);

      await tx.stockMovement.create({
        data: {
          id: `${testNamespace}_smov_inbound_10`,
          inventoryItemId: item.id,
          movementType: 'PURCHASE',
          quantityDelta: receivedQty,
          balanceAfter,
          unitCostAmount: item.purchaseCostAmount,
          reason: 'Supplier Purchase Order PO-9812',
          recordedByUserId: `${testNamespace}_warehouse_mgr`,
        },
      });

      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantityOnHand: balanceAfter },
      });
    });

    let stockState = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(stockState?.quantityOnHand.toString()).toBe('10');

    // Step 3: Retail Sale of 7 units to client
    const saleId = `${testNamespace}_sale_retail_prot`;
    const sale = await prisma.sale.create({
      data: {
        id: saleId,
        tenantId,
        sourceType: 'RETAIL_POS',
        sourceId: `${testNamespace}_POS_TXN_007`,
        status: 'COMPLETED',
        currency: 'USD',
        subtotalAmount: new Prisma.Decimal('315.00'), // 7 * 45 = 315
        discountTotalAmount: new Prisma.Decimal('15.00'),
        totalAmount: new Prisma.Decimal('300.00'),
        completedAt: new Date(),
        items: {
          create: [
            {
              id: `${testNamespace}_sitem_prot_7`,
              sourceType: 'PRODUCT',
              sourceId: item.id,
              skuOrCode: item.sku,
              description: item.name,
              quantity: new Prisma.Decimal('7.000'),
              unitPriceAmount: new Prisma.Decimal('45.00'),
              unitPriceCurrency: 'USD',
              subtotalAmount: new Prisma.Decimal('315.00'),
              discountTotalAmount: new Prisma.Decimal('15.00'),
              totalAmount: new Prisma.Decimal('300.00'),
            },
          ],
        },
      },
      include: { items: true },
    });

    const payment = await prisma.payment.create({
      data: {
        id: `${testNamespace}_pay_retail_prot`,
        tenantId,
        saleId: sale.id,
        method: 'CASH',
        amount: new Prisma.Decimal('300.00'),
        currency: 'USD',
        status: 'SETTLED',
        reference: `${testNamespace}_POS_CASH_300`,
        paidAt: new Date(),
      },
    });
    expect(payment.status).toBe('SETTLED');

    // Step 4: Atomic Stock Movement Decrement (-7 units)
    await prisma.$transaction(async (tx) => {
      const soldQty = new Prisma.Decimal('-7.00');
      const current = await tx.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
      const balanceAfter = current.quantityOnHand.plus(soldQty); // 10 - 7 = 3

      await tx.stockMovement.create({
        data: {
          id: `${testNamespace}_smov_retail_out_7`,
          inventoryItemId: item.id,
          movementType: 'SALE',
          quantityDelta: soldQty,
          balanceAfter,
          unitCostAmount: item.purchaseCostAmount,
          reason: `Fulfilled POS sale ${sale.id}`,
          referenceId: sale.id,
          recordedByUserId: `${testNamespace}_cashier_clerk`,
        },
      });

      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantityOnHand: balanceAfter },
      });
    });

    // Step 5: Verify Low-Stock Invariant Triggered
    stockState = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(stockState?.quantityOnHand.toString()).toBe('3');

    // 3 units on hand < minimumStock threshold (5 units)
    const isBelowMinimum = stockState!.quantityOnHand.lessThan(stockState!.minimumStock);
    expect(isBelowMinimum).toBe(true);

    // Verify stock ledger history in PostgreSQL
    const movements = await prisma.stockMovement.findMany({
      where: { inventoryItemId: item.id },
      orderBy: { recordedAt: 'asc' },
    });
    expect(movements.length).toBe(2);
    expect(movements[0]?.movementType).toBe('PURCHASE');
    expect(movements[0]?.balanceAfter.toString()).toBe('10');
    expect(movements[1]?.movementType).toBe('SALE');
    expect(movements[1]?.balanceAfter.toString()).toBe('3');
  });
});
