import {
  PrismaClient,
  Prisma,
  RoomStatus,
  ResourceType,
  PlanStatus,
  MembershipStatus,
  CheckInMethod,
  AccessResult,
  AppointmentStatus,
  SessionStatus,
  InventoryCategory,
  UnitOfMeasure,
  InventoryItemStatus,
  StockMovementType,
  AssetCategory,
  AssetCondition,
  AssetStatus,
  UserStatus,
} from '@prisma/client';
import { hashSeedPassword } from './identity.seed';

export interface DemoFixturesSummary {
  usersCount: number;
  roomsCount: number;
  clientsCount: number;
  plansCount: number;
  membershipsCount: number;
  attendanceCount: number;
  appointmentsCount: number;
  treatmentSessionsCount: number;
  inventoryItemsCount: number;
  stockMovementsCount: number;
  fixedAssetsCount: number;
}

/**
 * Safety verification guard ensuring demo fixtures are never executed
 * against production databases or when NODE_ENV is set to production.
 */
export function assertSafeDemoEnvironment(dbUrl = process.env.DATABASE_URL): void {
  const nodeEnv = process.env.NODE_ENV?.toLowerCase();
  if (nodeEnv === 'production') {
    throw new Error('SAFETY LOCK: Seeding demo fixtures is prohibited in NODE_ENV=production.');
  }

  if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable is missing.');
  }

  const normalized = dbUrl.toLowerCase();
  if (
    normalized.includes('prod') ||
    normalized.includes('production') ||
    normalized.includes('live-db')
  ) {
    const masked = dbUrl.replace(/:[^:@]+@/, ':***@');
    throw new Error(
      `SAFETY LOCK: Target database URL contains production indicators: '${masked}'. Seeding aborted.`,
    );
  }
}

/**
 * Seeds deterministic synthetic demo fixtures across gym, kinesiology, and inventory domains.
 * Fully idempotent via upsert with deterministic identifiers.
 */
export async function seedDemoFixtures(prisma: PrismaClient): Promise<DemoFixturesSummary> {
  assertSafeDemoEnvironment();

  console.log('  🎯 Seeding Deterministic Synthetic Demo Fixtures...');

  const rawPassword = process.env.DEMO_USERS_PASSWORD || 'DemoPass123!';
  const tenantId = 'tenant-kinergy-main';
  const now = new Date('2026-11-02T12:00:00.000Z');

  // ==========================================================================
  // 1. Demo Staff Accounts (Receptionist, Trainer, Kitchen Staff)
  // ==========================================================================
  const roles = await prisma.role.findMany();
  const roleMap = new Map(roles.map((r) => [r.name, r.id]));

  const receptionistRoleId = roleMap.get('Receptionist');
  const trainerRoleId = roleMap.get('Trainer');
  const kitchenRoleId = roleMap.get('Kitchen Staff');

  if (!receptionistRoleId || !trainerRoleId || !kitchenRoleId) {
    throw new Error(
      'Required system roles (Receptionist, Trainer, Kitchen Staff) not found. Run seedIdentity first.',
    );
  }

  const demoAccounts = [
    {
      id: 'usr-demo-reception-001',
      email: 'reception.demo@kinergy.platform',
      roleId: receptionistRoleId,
      roleName: 'Receptionist',
    },
    {
      id: 'usr-demo-therapist-001',
      email: 'therapist.demo@kinergy.platform',
      roleId: trainerRoleId,
      roleName: 'Trainer / Clinical Therapist',
    },
    {
      id: 'usr-demo-inventory-001',
      email: 'inventory.demo@kinergy.platform',
      roleId: kitchenRoleId,
      roleName: 'Kitchen / Inventory Staff',
    },
  ];

  let usersCount = 0;
  for (const acct of demoAccounts) {
    const existing = await prisma.user.findUnique({ where: { email: acct.email } });
    if (!existing) {
      await prisma.user.create({
        data: {
          id: acct.id,
          email: acct.email,
          passwordHash: hashSeedPassword(rawPassword),
          status: UserStatus.ACTIVE,
          roleId: acct.roleId,
          tenantId,
        },
      });
      console.log(`    👤 Created demo account [${acct.roleName}]: ${acct.email}`);
    } else {
      await prisma.user.update({
        where: { email: acct.email },
        data: {
          status: UserStatus.ACTIVE,
          roleId: acct.roleId,
        },
      });
      console.log(`    👤 Verified demo account [${acct.roleName}]: ${acct.email}`);
    }
    usersCount++;
  }

  const therapistUserId = 'usr-demo-therapist-001';
  const inventoryUserId = 'usr-demo-inventory-001';
  const receptionUserId = 'usr-demo-reception-001';

  // ==========================================================================
  // 2. Scheduling & Clinical Rooms
  // ==========================================================================
  const roomsData = [
    {
      id: 'room-seed-kinesio-01',
      name: 'Room 1 - Kinesiology Therapy Suite',
      capacity: 1,
      status: RoomStatus.AVAILABLE,
      resourceType: ResourceType.ROOM,
      features: ['Therapy Bed', 'Ultrasound', 'Rehab Resistance Bands'],
    },
    {
      id: 'room-seed-consult-02',
      name: 'Room 2 - Assessment & Consultation',
      capacity: 1,
      status: RoomStatus.AVAILABLE,
      resourceType: ResourceType.ROOM,
      features: ['Evaluation Desk', 'Clinical Goniometers', 'Spine Models'],
    },
    {
      id: 'studio-b-facility',
      name: 'Studio B - Movement Room',
      capacity: 20,
      status: RoomStatus.AVAILABLE,
      resourceType: ResourceType.ROOM,
      features: ['Mats', 'Pilates Reformers', 'Wall Bars'],
    },
  ];

  let roomsCount = 0;
  for (const r of roomsData) {
    await prisma.room.upsert({
      where: { id: r.id },
      update: {
        name: r.name,
        capacity: r.capacity,
        status: r.status,
        resourceType: r.resourceType,
        features: r.features,
      },
      create: r,
    });
    roomsCount++;
  }

  // ==========================================================================
  // 3. Demo Clients
  // ==========================================================================
  const clientsData = [
    {
      id: 'cli-seed-jane-01',
      referenceNumber: 'CLI-2026-00001',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.com',
      phone: '+15550199123',
      normalizedEmail: 'jane.doe@example.com',
      normalizedPhone: '+15550199123',
      normalizedSearchName: 'jane doe',
      status: 'ACTIVE',
      timelineSummary: 'Initial clinical assessment booked and treatment plan initiated.',
    },
    {
      id: 'cli-seed-john-02',
      referenceNumber: 'CLI-2026-00002',
      firstName: 'John',
      lastName: 'Smith',
      email: 'john.smith@example.com',
      phone: '+15550144123',
      normalizedEmail: 'john.smith@example.com',
      normalizedPhone: '+15550144123',
      normalizedSearchName: 'john smith',
      status: 'ACTIVE',
      timelineSummary: 'Annual Gym Membership activated and reception check-in verified.',
    },
    {
      id: 'cli-seed-carlos-03',
      referenceNumber: 'CLI-2026-00003',
      firstName: 'Carlos',
      lastName: 'Rivera',
      email: 'carlos.rivera@example.com',
      phone: '+15550177123',
      normalizedEmail: 'carlos.rivera@example.com',
      normalizedPhone: '+15550177123',
      normalizedSearchName: 'carlos rivera',
      status: 'ACTIVE',
      timelineSummary:
        'Client intake profile registered for front-desk gym enrollment demonstration.',
    },
  ];

  let clientsCount = 0;
  for (const c of clientsData) {
    const { timelineSummary, ...clientFields } = c;
    await prisma.client.upsert({
      where: { id: c.id },
      update: {
        firstName: clientFields.firstName,
        lastName: clientFields.lastName,
        email: clientFields.email,
        phone: clientFields.phone,
        normalizedEmail: clientFields.normalizedEmail,
        normalizedPhone: clientFields.normalizedPhone,
        normalizedSearchName: clientFields.normalizedSearchName,
        status: clientFields.status,
      },
      create: clientFields,
    });

    // Seed timeline record for client
    const timelineId = `tl-seed-${c.id}`;
    await prisma.clientTimelineEntry.upsert({
      where: { id: timelineId },
      update: { summary: timelineSummary },
      create: {
        id: timelineId,
        clientId: c.id,
        sourceModule: 'DEMO_FIXTURES',
        eventType: 'CLIENT_INTAKE',
        summary: timelineSummary,
        metadata: { seededBy: 'Milestone 9.5.3' },
        occurredAt: now,
      },
    });

    clientsCount++;
  }

  // ==========================================================================
  // 4. Membership Plans
  // ==========================================================================
  const plansData = [
    {
      id: 'plan-seed-gold-annual',
      code: 'MEM-GOLD-2026',
      name: 'Gold Annual Gym Membership',
      description: 'Full 365-day access to gym facilities, equipment, and locker rooms.',
      durationDays: 365,
      priceAmount: new Prisma.Decimal('600.00'),
      priceCurrency: 'USD',
      visitQuota: null,
      status: PlanStatus.ACTIVE,
    },
    {
      id: 'plan-seed-silver-monthly',
      code: 'MEM-SLV-MONTH',
      name: 'Silver Monthly Gym Membership',
      description: 'Standard 30-day recurring facility membership.',
      durationDays: 30,
      priceAmount: new Prisma.Decimal('60.00'),
      priceCurrency: 'USD',
      visitQuota: null,
      status: PlanStatus.ACTIVE,
    },
    {
      id: 'plan-seed-10-visits',
      code: 'MEM-10-VISITS',
      name: '10-Visit Flexibility Pass',
      description: 'Punch-card pass providing 10 check-in visits valid for 60 days.',
      durationDays: 60,
      priceAmount: new Prisma.Decimal('45.00'),
      priceCurrency: 'USD',
      visitQuota: 10,
      status: PlanStatus.ACTIVE,
    },
  ];

  let plansCount = 0;
  for (const p of plansData) {
    await prisma.membershipPlan.upsert({
      where: { id: p.id },
      update: {
        name: p.name,
        description: p.description,
        durationDays: p.durationDays,
        priceAmount: p.priceAmount,
        status: p.status,
        visitQuota: p.visitQuota,
      },
      create: p,
    });
    plansCount++;
  }

  // ==========================================================================
  // 5. Active Memberships & Check-In Attendance Records
  // ==========================================================================
  const membershipId = 'mem-seed-john-01';
  await prisma.membership.upsert({
    where: { id: membershipId },
    update: {
      status: MembershipStatus.ACTIVE,
      assignedTrainerId: therapistUserId,
    },
    create: {
      id: membershipId,
      clientId: 'cli-seed-john-02',
      planId: 'plan-seed-gold-annual',
      status: MembershipStatus.ACTIVE,
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2027-10-01T00:00:00.000Z'),
      assignedTrainerId: therapistUserId,
      version: 1,
    },
  });
  const membershipsCount = 1;

  const attendanceId = 'att-seed-john-001';
  await prisma.attendanceRecord.upsert({
    where: { id: attendanceId },
    update: {
      result: AccessResult.GRANTED,
    },
    create: {
      id: attendanceId,
      clientId: 'cli-seed-john-02',
      membershipId,
      checkInTime: new Date('2026-11-02T08:30:00.000Z'),
      gymDay: '2026-11-02@main(UTC)',
      method: CheckInMethod.QR_CODE,
      result: AccessResult.GRANTED,
      gateId: 'GATE-FRONT-DESK',
      receptionistId: receptionUserId,
      notes: 'Presenter demonstration check-in verified.',
    },
  });
  const attendanceCount = 1;

  // ==========================================================================
  // 6. Appointments & Clinical Treatment Sessions (SOAP Notes)
  // ==========================================================================
  const appt1Id = 'appt-seed-jane-001';
  await prisma.appointment.upsert({
    where: { id: appt1Id },
    update: {
      status: AppointmentStatus.COMPLETED,
    },
    create: {
      id: appt1Id,
      clientId: 'cli-seed-jane-01',
      therapistId: therapistUserId,
      roomId: 'room-seed-kinesio-01',
      type: 'KINESIOLOGY_ASSESSMENT',
      status: AppointmentStatus.COMPLETED,
      startTime: new Date('2026-10-02T10:00:00.000Z'),
      endTime: new Date('2026-10-02T11:00:00.000Z'),
      version: 1,
    },
  });

  const appt2Id = 'appt-seed-jane-upcoming';
  await prisma.appointment.upsert({
    where: { id: appt2Id },
    update: {
      status: AppointmentStatus.SCHEDULED,
    },
    create: {
      id: appt2Id,
      clientId: 'cli-seed-jane-01',
      therapistId: therapistUserId,
      roomId: 'room-seed-kinesio-01',
      type: 'KINESIOLOGY_TREATMENT',
      status: AppointmentStatus.SCHEDULED,
      startTime: new Date('2026-11-03T10:00:00.000Z'),
      endTime: new Date('2026-11-03T11:00:00.000Z'),
      version: 1,
    },
  });
  const appointmentsCount = 2;

  const sessionId = 'sess-seed-rehab-001';
  await prisma.treatmentSession.upsert({
    where: { id: sessionId },
    update: {
      status: SessionStatus.COMPLETED,
      notesSubjective:
        'Client reports persistent right shoulder stiffness after heavy bench pressing. Pain 4/10 upon abduction.',
      notesObjective:
        'Active abduction limited to 140 deg. Supraspinatus tendon tender to palpation. Hawkins-Kennedy positive.',
      notesAssessment:
        'Subacromial impingement syndrome, early stage. Good response to passive mobilization.',
      notesPlan:
        'Prescribed isometric rotator cuff strengthening, manual therapy, and scapular control drills. Re-evaluate next session.',
      notesRawText: 'Client completed 60min evaluation and manual treatment.',
    },
    create: {
      id: sessionId,
      clientId: 'cli-seed-jane-01',
      therapistId: therapistUserId,
      appointmentId: appt1Id,
      status: SessionStatus.COMPLETED,
      notesSubjective:
        'Client reports persistent right shoulder stiffness after heavy bench pressing. Pain 4/10 upon abduction.',
      notesObjective:
        'Active abduction limited to 140 deg. Supraspinatus tendon tender to palpation. Hawkins-Kennedy positive.',
      notesAssessment:
        'Subacromial impingement syndrome, early stage. Good response to passive mobilization.',
      notesPlan:
        'Prescribed isometric rotator cuff strengthening, manual therapy, and scapular control drills. Re-evaluate next session.',
      notesRawText: 'Client completed 60min evaluation and manual treatment.',
      version: 1,
    },
  });
  const treatmentSessionsCount = 1;

  // ==========================================================================
  // 7. Inventory Items & Stock Movements
  // ==========================================================================
  const inventoryItemsData = [
    {
      id: 'inv-seed-bar-protein',
      sku: 'SKU-SNK-BAR-01',
      name: 'Organic Whey Protein Bar 60g (Chocolate)',
      description: 'High protein recovery bar with chocolate coating',
      category: InventoryCategory.HEALTHY_MEALS,
      unit: UnitOfMeasure.UNITS,
      minimumStock: new Prisma.Decimal('15.00'),
      quantityOnHand: new Prisma.Decimal('42.00'),
      purchaseCostAmount: new Prisma.Decimal('1.50'),
      sellingPriceAmount: new Prisma.Decimal('5.50'),
      status: InventoryItemStatus.ACTIVE,
      tenantId,
    },
    {
      id: 'inv-seed-drink-electrolyte',
      sku: 'SKU-DRK-ELEC-01',
      name: 'Electrolyte Hydration Drink (Lemon, 500ml)',
      description: 'Electrolyte replacement drink for post-workout hydration',
      category: InventoryCategory.HEALTHY_DRINKS,
      unit: UnitOfMeasure.BOTTLES,
      minimumStock: new Prisma.Decimal('12.00'),
      quantityOnHand: new Prisma.Decimal('36.00'),
      purchaseCostAmount: new Prisma.Decimal('1.00'),
      sellingPriceAmount: new Prisma.Decimal('3.00'),
      status: InventoryItemStatus.ACTIVE,
      tenantId,
    },
    {
      id: 'inv-seed-med-bandage',
      sku: 'SKU-CLIN-BAND-01',
      name: 'Kinesiology Tape Roll (5m Elastic Beige)',
      description: 'Elastic therapeutic tape for muscle support and rehabilitation',
      category: InventoryCategory.CLINICAL_SUPPLIES,
      unit: UnitOfMeasure.ROLLS,
      minimumStock: new Prisma.Decimal('10.00'),
      quantityOnHand: new Prisma.Decimal('3.00'), // Low stock trigger: 3.00 <= 10.00
      purchaseCostAmount: new Prisma.Decimal('3.50'),
      sellingPriceAmount: new Prisma.Decimal('0.00'),
      status: InventoryItemStatus.ACTIVE,
      tenantId,
    },
  ];

  let inventoryItemsCount = 0;
  for (const item of inventoryItemsData) {
    await prisma.inventoryItem.upsert({
      where: { id: item.id },
      update: {
        name: item.name,
        category: item.category,
        unit: item.unit,
        minimumStock: item.minimumStock,
        quantityOnHand: item.quantityOnHand,
        purchaseCostAmount: item.purchaseCostAmount,
        sellingPriceAmount: item.sellingPriceAmount,
        status: item.status,
      },
      create: item,
    });
    inventoryItemsCount++;
  }

  // Stock Movement Ledger
  const stockMovementsData = [
    {
      id: 'sm-seed-bar-01',
      inventoryItemId: 'inv-seed-bar-protein',
      movementType: StockMovementType.PURCHASE,
      quantityDelta: new Prisma.Decimal('50.00'),
      balanceAfter: new Prisma.Decimal('50.00'),
      unitCostAmount: new Prisma.Decimal('1.50'),
      reason: 'Initial demo stock shipment receipt',
      recordedByUserId: inventoryUserId,
    },
    {
      id: 'sm-seed-bar-02',
      inventoryItemId: 'inv-seed-bar-protein',
      movementType: StockMovementType.SALE,
      quantityDelta: new Prisma.Decimal('-8.00'),
      balanceAfter: new Prisma.Decimal('42.00'),
      unitCostAmount: new Prisma.Decimal('1.50'),
      reason: 'Retail counter sales batch',
      recordedByUserId: inventoryUserId,
    },
    {
      id: 'sm-seed-drk-01',
      inventoryItemId: 'inv-seed-drink-electrolyte',
      movementType: StockMovementType.PURCHASE,
      quantityDelta: new Prisma.Decimal('40.00'),
      balanceAfter: new Prisma.Decimal('40.00'),
      unitCostAmount: new Prisma.Decimal('1.00'),
      reason: 'Initial demo stock shipment receipt',
      recordedByUserId: inventoryUserId,
    },
    {
      id: 'sm-seed-drk-02',
      inventoryItemId: 'inv-seed-drink-electrolyte',
      movementType: StockMovementType.SALE,
      quantityDelta: new Prisma.Decimal('-4.00'),
      balanceAfter: new Prisma.Decimal('36.00'),
      unitCostAmount: new Prisma.Decimal('1.00'),
      reason: 'Front desk retail sales',
      recordedByUserId: inventoryUserId,
    },
    {
      id: 'sm-seed-med-01',
      inventoryItemId: 'inv-seed-med-bandage',
      movementType: StockMovementType.PURCHASE,
      quantityDelta: new Prisma.Decimal('15.00'),
      balanceAfter: new Prisma.Decimal('15.00'),
      unitCostAmount: new Prisma.Decimal('3.50'),
      reason: 'Clinical supplier delivery',
      recordedByUserId: inventoryUserId,
    },
    {
      id: 'sm-seed-med-02',
      inventoryItemId: 'inv-seed-med-bandage',
      movementType: StockMovementType.CONSUMPTION,
      quantityDelta: new Prisma.Decimal('-12.00'),
      balanceAfter: new Prisma.Decimal('3.00'),
      unitCostAmount: new Prisma.Decimal('3.50'),
      reason: 'Clinical treatment consumable usage (low stock trigger)',
      recordedByUserId: inventoryUserId,
    },
  ];

  let stockMovementsCount = 0;
  for (const sm of stockMovementsData) {
    await prisma.stockMovement.upsert({
      where: { id: sm.id },
      update: {
        balanceAfter: sm.balanceAfter,
        unitCostAmount: sm.unitCostAmount,
        reason: sm.reason,
      },
      create: sm,
    });
    stockMovementsCount++;
  }

  // ==========================================================================
  // 8. Fixed Assets
  // ==========================================================================
  const assetId = 'asset-seed-treadmill-01';
  await prisma.fixedAsset.upsert({
    where: { id: assetId },
    update: {
      name: 'Commercial Treadmill Pro Series 8',
      condition: AssetCondition.EXCELLENT,
      status: AssetStatus.ACTIVE,
      location: { facility: 'Main Facility', room: 'Cardio Zone' },
    },
    create: {
      id: assetId,
      assetTag: 'AST-GYM-TRDM-01',
      name: 'Commercial Treadmill Pro Series 8',
      description: 'Cardio area motorized commercial treadmill',
      category: AssetCategory.GYM_EQUIPMENT,
      purchaseDate: new Date('2026-01-15T00:00:00.000Z'),
      purchaseValueAmount: new Prisma.Decimal('3500.00'),
      purchaseValueCurrency: 'USD',
      currentEstimatedValueAmount: new Prisma.Decimal('3100.00'),
      currentEstimatedValueCurrency: 'USD',
      condition: AssetCondition.EXCELLENT,
      status: AssetStatus.ACTIVE,
      location: { facility: 'Main Facility', room: 'Cardio Zone' },
      tenantId,
    },
  });
  const fixedAssetsCount = 1;

  console.log('    ✅ Demo Fixtures Seeded Successfully:');
  console.log(`       - Staff Accounts:    ${usersCount}`);
  console.log(`       - Rooms:             ${roomsCount}`);
  console.log(`       - Clients:           ${clientsCount}`);
  console.log(`       - Membership Plans:  ${plansCount}`);
  console.log(`       - Memberships:       ${membershipsCount}`);
  console.log(`       - Attendance:        ${attendanceCount}`);
  console.log(`       - Appointments:      ${appointmentsCount}`);
  console.log(`       - Clinical Sessions: ${treatmentSessionsCount}`);
  console.log(`       - Inventory Items:   ${inventoryItemsCount}`);
  console.log(`       - Stock Movements:   ${stockMovementsCount}`);
  console.log(`       - Fixed Assets:      ${fixedAssetsCount}`);

  return {
    usersCount,
    roomsCount,
    clientsCount,
    plansCount,
    membershipsCount,
    attendanceCount,
    appointmentsCount,
    treatmentSessionsCount,
    inventoryItemsCount,
    stockMovementsCount,
    fixedAssetsCount,
  };
}
