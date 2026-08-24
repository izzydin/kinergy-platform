import {
  Membership,
  MembershipStatus,
  MembershipId,
  MembershipPlan,
  PlanId,
  PlanCode,
  PlanStatus,
  AttendanceRecord,
  AccessResult,
  CheckInMethod,
  TestClock,
  CreateMembershipCommand,
  CreateMembershipHandler,
  RenewMembershipCommand,
  RenewMembershipHandler,
  FreezeMembershipCommand,
  FreezeMembershipHandler,
  UnfreezeMembershipCommand,
  UnfreezeMembershipHandler,
  CancelMembershipCommand,
  CancelMembershipHandler,
  ExpireMembershipsCommand,
  ExpireMembershipsHandler,
  CreateMembershipPlanCommand,
  CreateMembershipPlanHandler,
  PublishMembershipPlanCommand,
  PublishMembershipPlanHandler,
  ArchiveMembershipPlanHandler,
  ArchiveMembershipPlanCommand,
  RecordCheckInCommand,
  RecordCheckInHandler,
  CheckMembershipEligibilityQuery,
  CheckMembershipEligibilityHandler,
  GetTrainerDashboardSummaryQuery,
  GetTrainerDashboardSummaryHandler,
  GetAssignedClientMembershipsQuery,
  GetAssignedClientMembershipsHandler,
  ListMembershipsQuery,
  ListMembershipsHandler,
  GetMembershipByIdQuery,
  GetMembershipByIdHandler,
  MembershipRepository,
  MembershipPlanRepository,
  AttendanceRecordRepository,
  AttendanceId,
  ClientLookupPort,
  GymEventPublisherPort,
  MembershipCreatedEvent,
  MembershipRenewedEvent,
  AssignedClientMembershipDTO,
} from '@kinergy-platform/core';

// In-Memory Test Infrastructure
class InMemoryGymStore {
  public memberships = new Map<string, Membership>();
  public plans = new Map<string, MembershipPlan>();
  public attendance: AttendanceRecord[] = [];
  public clients = new Map<
    string,
    { id: string; name: string; email: string; assignedTrainerId?: string }
  >();
  public publishedEvents: unknown[] = [];
}

describe('Phase 5.7-J: Gym Critical End-to-End Business Workflows (API & Core Domain E2E)', () => {
  let store: InMemoryGymStore;
  let clock: TestClock;

  const advanceDays = (days: number) => clock.advanceBy(days * 24 * 60 * 60 * 1000);
  const advanceMinutes = (minutes: number) => clock.advanceBy(minutes * 60 * 1000);

  // Repositories
  let membershipRepo: MembershipRepository;
  let planRepo: MembershipPlanRepository;
  let attendanceRepo: AttendanceRecordRepository;
  let clientLookupPort: ClientLookupPort;
  let eventPublisher: GymEventPublisherPort;

  // Application Handlers
  let createMembershipHandler: CreateMembershipHandler;
  let renewMembershipHandler: RenewMembershipHandler;
  let freezeMembershipHandler: FreezeMembershipHandler;
  let unfreezeMembershipHandler: UnfreezeMembershipHandler;
  let cancelMembershipHandler: CancelMembershipHandler;
  let expireMembershipsHandler: ExpireMembershipsHandler;
  let getMembershipByIdHandler: GetMembershipByIdHandler;
  let listMembershipsHandler: ListMembershipsHandler;

  let createPlanHandler: CreateMembershipPlanHandler;
  let publishPlanHandler: PublishMembershipPlanHandler;
  let archivePlanHandler: ArchiveMembershipPlanHandler;

  let recordCheckInHandler: RecordCheckInHandler;
  let checkEligibilityHandler: CheckMembershipEligibilityHandler;

  let getTrainerSummaryHandler: GetTrainerDashboardSummaryHandler;
  let getAssignedClientsHandler: GetAssignedClientMembershipsHandler;

  const t0 = new Date('2026-08-01T08:00:00.000Z');

  beforeEach(() => {
    store = new InMemoryGymStore();
    clock = new TestClock(t0);

    // Setup Seed Clients
    store.clients.set('client_sarah', {
      id: 'client_sarah',
      name: 'Sarah Connor',
      email: 'sarah@resistance.io',
      assignedTrainerId: 'trainer_bob',
    });
    store.clients.set('client_john', {
      id: 'client_john',
      name: 'John Connor',
      email: 'john@resistance.io',
      assignedTrainerId: 'trainer_bob',
    });
    store.clients.set('client_kyle', {
      id: 'client_kyle',
      name: 'Kyle Reese',
      email: 'kyle@resistance.io',
      assignedTrainerId: 'trainer_alice',
    });

    // Membership Repository
    membershipRepo = {
      save: async (m: Membership) => {
        store.memberships.set(m.id.value, m);
      },
      findById: async (id: MembershipId | string) => {
        const key = typeof id === 'string' ? id : id.value;
        return store.memberships.get(key) || null;
      },
      findByClientId: async (clientId: string) => {
        return Array.from(store.memberships.values()).filter((m) => m.clientId === clientId);
      },
      findAll: async () => Array.from(store.memberships.values()),
      findExpiringCandidates: async (asOf: Date) => {
        return Array.from(store.memberships.values()).filter(
          (m) =>
            (m.status === MembershipStatus.ACTIVE || m.status === MembershipStatus.FROZEN) &&
            m.period.endDate.getTime() <= asOf.getTime(),
        );
      },
      findExpiringWithinHorizon: async (asOf: Date, horizonDays: number) => {
        const horizonMs = horizonDays * 24 * 60 * 60 * 1000;
        return Array.from(store.memberships.values()).filter((m) => {
          if (m.status !== MembershipStatus.ACTIVE && m.status !== MembershipStatus.FROZEN) {
            return false;
          }
          const diffMs = m.period.endDate.getTime() - asOf.getTime();
          return diffMs > 0 && diffMs <= horizonMs;
        });
      },
      findByTrainerId: async (trainerId: string) => {
        return Array.from(store.memberships.values()).filter(
          (m) => m.trainerAssignment?.trainerId === trainerId,
        );
      },
    };

    // Plan Repository
    planRepo = {
      save: async (p: MembershipPlan) => {
        store.plans.set(p.id.value, p);
      },
      findById: async (id: PlanId | string) => {
        const key = typeof id === 'string' ? id : id.value;
        return store.plans.get(key) || null;
      },
      findByCode: async (code: PlanCode | string) => {
        const strCode = typeof code === 'string' ? code : code.value;
        for (const p of store.plans.values()) {
          if (p.code.value === strCode) return p;
        }
        return null;
      },
      findAll: async () => Array.from(store.plans.values()),
      findActive: async () => {
        return Array.from(store.plans.values()).filter((p) => p.isAvailableForPurchase());
      },
    };

    // Attendance Record Repository
    attendanceRepo = {
      append: async (record: AttendanceRecord) => {
        store.attendance.push(record);
      },
      findById: async (id: AttendanceId | string) => {
        const idVal = typeof id === 'string' ? id : id.value;
        return store.attendance.find((r) => r.id.value === idVal) || null;
      },
      findByClientId: async (clientId: string, limit?: number) => {
        const matching = store.attendance
          .filter((r) => r.clientId === clientId)
          .sort((a, b) => b.checkInTime.getTime() - a.checkInTime.getTime());
        return limit ? matching.slice(0, limit) : matching;
      },
      findRecentByClientId: async (clientId: string, since: Date) => {
        return store.attendance
          .filter((r) => r.clientId === clientId && r.checkInTime.getTime() >= since.getTime())
          .sort((a, b) => b.checkInTime.getTime() - a.checkInTime.getTime());
      },
      findByGymDay: async (gymDay: string, facilityId?: string) => {
        return store.attendance.filter((r) => {
          const matchesDay =
            r.gymDay.localDate === gymDay ||
            r.gymDay.toString() === gymDay ||
            gymDay.includes(r.gymDay.localDate);
          const matchesFacility = !facilityId || r.gymDay.facilityId === facilityId;
          return matchesDay && matchesFacility;
        });
      },
      countGrantedByGymDay: async (gymDay: string, facilityId?: string) => {
        return store.attendance.filter(
          (r) =>
            r.isGranted() &&
            (r.gymDay.localDate === gymDay || r.gymDay.toString() === gymDay) &&
            (!facilityId || r.gymDay.facilityId === facilityId),
        ).length;
      },
      countGrantedByClientAndGymDay: async (clientId: string, gymDay: string) => {
        return store.attendance.filter(
          (r) =>
            r.clientId === clientId &&
            r.isGranted() &&
            (r.gymDay.localDate === gymDay || r.gymDay.toString() === gymDay),
        ).length;
      },
    };

    // Client Lookup Port
    clientLookupPort = {
      validateClientExists: async (id: string) => store.clients.has(id),
    };

    // Event Publisher
    eventPublisher = {
      publish: async (events: ReadonlyArray<unknown>) => {
        store.publishedEvents.push(...events);
      },
    };

    // Instantiate Application Handlers
    createPlanHandler = new CreateMembershipPlanHandler(planRepo, clock, eventPublisher);
    publishPlanHandler = new PublishMembershipPlanHandler(planRepo, clock, eventPublisher);
    archivePlanHandler = new ArchiveMembershipPlanHandler(planRepo, clock, eventPublisher);

    createMembershipHandler = new CreateMembershipHandler(
      membershipRepo,
      planRepo,
      clientLookupPort,
      clock,
      eventPublisher,
    );
    renewMembershipHandler = new RenewMembershipHandler(
      membershipRepo,
      planRepo,
      clock,
      eventPublisher,
    );
    freezeMembershipHandler = new FreezeMembershipHandler(membershipRepo, clock, eventPublisher);
    unfreezeMembershipHandler = new UnfreezeMembershipHandler(
      membershipRepo,
      clock,
      eventPublisher,
    );
    cancelMembershipHandler = new CancelMembershipHandler(membershipRepo, clock, eventPublisher);
    expireMembershipsHandler = new ExpireMembershipsHandler(membershipRepo, clock, eventPublisher);
    getMembershipByIdHandler = new GetMembershipByIdHandler(membershipRepo);
    listMembershipsHandler = new ListMembershipsHandler(membershipRepo);

    checkEligibilityHandler = new CheckMembershipEligibilityHandler(
      membershipRepo,
      clientLookupPort,
      clock,
    );

    recordCheckInHandler = new RecordCheckInHandler(
      attendanceRepo,
      checkEligibilityHandler,
      clock,
      eventPublisher,
    );

    getTrainerSummaryHandler = new GetTrainerDashboardSummaryHandler(
      membershipRepo,
      attendanceRepo,
      clock,
    );
    getAssignedClientsHandler = new GetAssignedClientMembershipsHandler(
      membershipRepo,
      planRepo,
      clock,
    );
  });

  // Helper to create & publish standard monthly plan (30 days, $99)
  async function seedStandardPlan(): Promise<string> {
    const createRes = await createPlanHandler.execute(
      new CreateMembershipPlanCommand({
        code: 'PLAN_STD_MONTHLY',
        name: 'Standard Monthly Pass',
        durationInDays: 30,
        priceAmount: 99,
        priceCurrency: 'USD',
        description: 'Unlimited facility access for 30 days',
      }),
    );
    expect(createRes.isSuccess).toBe(true);
    const planId = createRes.getValue().id;

    const pubRes = await publishPlanHandler.execute(new PublishMembershipPlanCommand({ planId }));
    expect(pubRes.isSuccess).toBe(true);
    return planId;
  }

  // =========================================================================
  // Workflow 1: Create Membership
  // =========================================================================
  it('Workflow 1 — Create Membership: Authorized staff creates membership with authoritative period calculation', async () => {
    const planId = await seedStandardPlan();

    // 1. Create Membership for Client Sarah
    const cmd = new CreateMembershipCommand({
      clientId: 'client_sarah',
      planId,
      assignedTrainerId: 'trainer_bob',
      startDate: t0,
    });
    const result = await createMembershipHandler.execute(cmd);

    expect(result.isSuccess).toBe(true);
    const membership = result.getValue();

    expect(membership.clientId).toBe('client_sarah');
    expect(membership.planId).toBe(planId);
    expect(membership.assignedTrainerId).toBe('trainer_bob');
    expect(membership.status).toBe(MembershipStatus.ACTIVE);

    // 2. Verify deterministic 30-day period
    expect(new Date(membership.period.startDate)).toEqual(t0);
    const expectedEndDate = new Date('2026-08-31T08:00:00.000Z');
    expect(new Date(membership.period.endDate)).toEqual(expectedEndDate);
    expect(membership.period.durationDays).toBe(30);

    // 3. Verify persistence
    const persisted = await membershipRepo.findById(membership.id);
    expect(persisted).not.toBeNull();
    expect(persisted?.status).toBe(MembershipStatus.ACTIVE);

    // 4. Verify domain event publication
    const createdEvent = store.publishedEvents.find(
      (e) => e instanceof MembershipCreatedEvent,
    ) as MembershipCreatedEvent;
    expect(createdEvent).toBeDefined();
    expect(createdEvent.payload.clientId).toBe('client_sarah');
    expect(createdEvent.aggregateId).toBe(membership.id);

    // 5. Verify query retrieval
    const queryRes = await getMembershipByIdHandler.execute(
      new GetMembershipByIdQuery({ membershipId: membership.id }),
    );
    expect(queryRes.isSuccess).toBe(true);
    expect(queryRes.getValue().status).toBe('ACTIVE');
  });

  // =========================================================================
  // Workflow 2: Renew Membership (Early, Boundary, Post-Expiration)
  // =========================================================================
  describe('Workflow 2 — Renew Membership', () => {
    it('2a. Early renewal: Unused time is preserved by extending from existing endDate', async () => {
      const planId = await seedStandardPlan();

      // Create initial 30-day membership (Aug 1 -> Aug 31)
      const createRes = await createMembershipHandler.execute(
        new CreateMembershipCommand({
          clientId: 'client_sarah',
          planId,
          startDate: t0,
        }),
      );
      const membershipId = createRes.getValue().id;

      // Advance clock by 10 days to Aug 11 (20 days remaining)
      advanceDays(10);
      expect(clock.now()).toEqual(new Date('2026-08-11T08:00:00.000Z'));

      // Renew membership with another 30-day plan
      const renewRes = await renewMembershipHandler.execute(
        new RenewMembershipCommand({
          membershipId,
          newPlanId: planId,
        }),
      );
      expect(renewRes.isSuccess).toBe(true);

      const renewed = renewRes.getValue();
      // Start date remains Aug 1, but endDate extends by 30 days from previous endDate (Aug 31 + 30 days = Sep 30)
      expect(new Date(renewed.period.startDate)).toEqual(t0);
      expect(new Date(renewed.period.endDate)).toEqual(new Date('2026-09-30T08:00:00.000Z'));
      expect(renewed.period.durationDays).toBe(60);

      // Verify domain event
      const renewEvent = store.publishedEvents.find(
        (e) => e instanceof MembershipRenewedEvent,
      ) as MembershipRenewedEvent;
      expect(renewEvent).toBeDefined();
    });

    it('2b. Boundary renewal: Exactly on expiration date preserves continuity', async () => {
      const planId = await seedStandardPlan();

      const createRes = await createMembershipHandler.execute(
        new CreateMembershipCommand({
          clientId: 'client_sarah',
          planId,
          startDate: t0,
        }),
      );
      const membershipId = createRes.getValue().id;

      // Advance clock exactly to expiration moment (Aug 31)
      advanceDays(30);
      expect(clock.now()).toEqual(new Date('2026-08-31T08:00:00.000Z'));

      const renewRes = await renewMembershipHandler.execute(
        new RenewMembershipCommand({
          membershipId,
          newPlanId: planId,
        }),
      );
      expect(renewRes.isSuccess).toBe(true);
      expect(new Date(renewRes.getValue().period.endDate)).toEqual(
        new Date('2026-09-30T08:00:00.000Z'),
      );
    });

    it('2c. Post-expiration renewal: Resets period start date to current renewal date', async () => {
      const planId = await seedStandardPlan();

      const createRes = await createMembershipHandler.execute(
        new CreateMembershipCommand({
          clientId: 'client_sarah',
          planId,
          startDate: t0,
        }),
      );
      const membershipId = createRes.getValue().id;

      // Advance clock to Sep 10 (10 days past Aug 31 expiration)
      advanceDays(40);
      const nowSep10 = clock.now();
      expect(nowSep10).toEqual(new Date('2026-09-10T08:00:00.000Z'));

      // Expire batch executes
      await expireMembershipsHandler.execute(new ExpireMembershipsCommand({ asOfDate: nowSep10 }));
      const expiredMem = await membershipRepo.findById(membershipId);
      expect(expiredMem?.status).toBe(MembershipStatus.EXPIRED);

      // Renewing an expired membership resets from current date (Sep 10 -> Oct 10)
      const renewRes = await renewMembershipHandler.execute(
        new RenewMembershipCommand({
          membershipId,
          newPlanId: planId,
        }),
      );
      expect(renewRes.isSuccess).toBe(true);
      expect(renewRes.getValue().status).toBe(MembershipStatus.ACTIVE);
      expect(new Date(renewRes.getValue().period.startDate)).toEqual(nowSep10);
      expect(new Date(renewRes.getValue().period.endDate)).toEqual(
        new Date('2026-10-10T08:00:00.000Z'),
      );
    });
  });

  // =========================================================================
  // Workflow 3: Expired Membership & Temporal Access Control
  // =========================================================================
  it('Workflow 3 — Expired Membership: Temporal expiration denies eligibility and rejects check-in', async () => {
    const planId = await seedStandardPlan();

    // Create 30-day membership
    const createRes = await createMembershipHandler.execute(
      new CreateMembershipCommand({
        clientId: 'client_sarah',
        planId,
        startDate: t0,
      }),
    );
    const membershipId = createRes.getValue().id;

    // Advance clock past expiration (Aug 1 + 31 days = Sep 1)
    advanceDays(31);
    const asOfDate = clock.now();

    // Run expiration batch
    const expireRes = await expireMembershipsHandler.execute(
      new ExpireMembershipsCommand({ asOfDate }),
    );
    expect(expireRes.isSuccess).toBe(true);
    expect(expireRes.getValue().expiredCount).toBe(1);

    // Verify membership status in DB
    const m = await membershipRepo.findById(membershipId);
    expect(m?.status).toBe(MembershipStatus.EXPIRED);

    // Verify real-time eligibility check is NOT eligible
    const eligRes = await checkEligibilityHandler.execute(
      new CheckMembershipEligibilityQuery('client_sarah'),
    );
    expect(eligRes.isSuccess).toBe(true);
    expect(eligRes.getValue().isEligible).toBe(false);

    // Verify Turnstile check-in is REJECTED
    const checkInRes = await recordCheckInHandler.execute(
      new RecordCheckInCommand({
        clientId: 'client_sarah',
        method: CheckInMethod.QR_CODE,
        gateId: 'turnstile_main',
      }),
    );
    expect(checkInRes.isSuccess).toBe(true);
    expect(checkInRes.getValue().outcome).toBe(AccessResult.DENIED_EXPIRED);
    expect(checkInRes.getValue().isGranted).toBe(false);
  });

  // =========================================================================
  // Workflow 4: Gym Check-In Matrix (Active, Suspended, Duplicate, Concurrency)
  // =========================================================================
  describe('Workflow 4 — Gym Check-In Validation Matrix', () => {
    it('4a. Grants access to client with ACTIVE membership and logs event', async () => {
      const planId = await seedStandardPlan();
      await createMembershipHandler.execute(
        new CreateMembershipCommand({
          clientId: 'client_sarah',
          planId,
          startDate: t0,
        }),
      );

      const res = await recordCheckInHandler.execute(
        new RecordCheckInCommand({
          clientId: 'client_sarah',
          method: CheckInMethod.QR_CODE,
          gateId: 'gate_1',
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.getValue().outcome).toBe(AccessResult.GRANTED);
      expect(res.getValue().isGranted).toBe(true);
    });

    it('4b. Denies access when client has NO membership record', async () => {
      // client_kyle is a valid client in store.clients with NO membership agreements
      const res = await recordCheckInHandler.execute(
        new RecordCheckInCommand({
          clientId: 'client_kyle',
          method: CheckInMethod.MANUAL_RECEPTION,
          gateId: 'desk_1',
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.getValue().outcome).toBe(AccessResult.DENIED_NO_MEMBERSHIP);
      expect(res.getValue().isGranted).toBe(false);
    });

    it('4c. Denies access when membership is FROZEN / SUSPENDED', async () => {
      const planId = await seedStandardPlan();
      const createRes = await createMembershipHandler.execute(
        new CreateMembershipCommand({
          clientId: 'client_sarah',
          planId,
          startDate: t0,
        }),
      );

      // Freeze membership
      await freezeMembershipHandler.execute(
        new FreezeMembershipCommand({
          membershipId: createRes.getValue().id,
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2026-08-15T00:00:00.000Z'),
          reason: 'Medical suspension',
        }),
      );

      const res = await recordCheckInHandler.execute(
        new RecordCheckInCommand({
          clientId: 'client_sarah',
          method: CheckInMethod.BARCODE,
          gateId: 'gate_1',
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.getValue().outcome).toBe(AccessResult.DENIED_FROZEN);
      expect(res.getValue().isGranted).toBe(false);
    });

    it('4d. Denies access when membership is CANCELLED', async () => {
      const planId = await seedStandardPlan();
      const createRes = await createMembershipHandler.execute(
        new CreateMembershipCommand({
          clientId: 'client_sarah',
          planId,
          startDate: t0,
        }),
      );

      // Cancel membership
      await cancelMembershipHandler.execute(
        new CancelMembershipCommand({
          membershipId: createRes.getValue().id,
          reason: 'Relocation outside city',
        }),
      );

      const res = await recordCheckInHandler.execute(
        new RecordCheckInCommand({
          clientId: 'client_sarah',
          method: CheckInMethod.QR_CODE,
          gateId: 'gate_1',
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.getValue().outcome).toBe(AccessResult.DENIED_NO_MEMBERSHIP);
      expect(res.getValue().isGranted).toBe(false);
    });

    it('4e. Prevents DUPLICATE check-in within the same gym day and anti-passback cooldown window', async () => {
      const planId = await seedStandardPlan();
      await createMembershipHandler.execute(
        new CreateMembershipCommand({
          clientId: 'client_sarah',
          planId,
          startDate: t0,
        }),
      );

      // First check-in succeeds
      const first = await recordCheckInHandler.execute(
        new RecordCheckInCommand({
          clientId: 'client_sarah',
          method: CheckInMethod.QR_CODE,
          gateId: 'gate_1',
        }),
      );
      expect(first.getValue().outcome).toBe(AccessResult.GRANTED);

      // Advance clock by 2 minutes (within the 5-minute anti-passback cooldown window)
      advanceMinutes(2);

      // Second check-in within anti-passback window is rejected as DUPLICATE
      const second = await recordCheckInHandler.execute(
        new RecordCheckInCommand({
          clientId: 'client_sarah',
          method: CheckInMethod.QR_CODE,
          gateId: 'gate_1',
        }),
      );
      expect(second.isSuccess).toBe(true);
      expect(second.getValue().outcome).toBe(AccessResult.DENIED_DUPLICATE_CHECKIN);
      expect(second.getValue().isGranted).toBe(false);
    });
  });

  // =========================================================================
  // Workflow 5 & 6: Trainer Dashboard & Authorization Scoping
  // =========================================================================
  describe('Workflow 5 & 6 — Trainer Dashboard & Scoped Authorization', () => {
    it('Workflow 5: Trainer receives authoritative KPI metrics and scoped client roster', async () => {
      const planId = await seedStandardPlan();

      // Sarah & John assigned to Bob; Kyle assigned to Alice
      await createMembershipHandler.execute(
        new CreateMembershipCommand({
          clientId: 'client_sarah',
          planId,
          assignedTrainerId: 'trainer_bob',
          startDate: t0,
        }),
      );
      await createMembershipHandler.execute(
        new CreateMembershipCommand({
          clientId: 'client_john',
          planId,
          assignedTrainerId: 'trainer_bob',
          startDate: t0,
        }),
      );
      await createMembershipHandler.execute(
        new CreateMembershipCommand({
          clientId: 'client_kyle',
          planId,
          assignedTrainerId: 'trainer_alice',
          startDate: t0,
        }),
      );

      // Sarah checks in
      await recordCheckInHandler.execute(
        new RecordCheckInCommand({
          clientId: 'client_sarah',
          method: CheckInMethod.QR_CODE,
          gateId: 'gate_1',
        }),
      );

      // Query Trainer Bob dashboard summary
      const summaryRes = await getTrainerSummaryHandler.execute(
        new GetTrainerDashboardSummaryQuery({ trainerId: 'trainer_bob', horizonDays: 7 }),
      );

      expect(summaryRes.isSuccess).toBe(true);
      expect(summaryRes.getValue().totalAssignedClients).toBe(2);
      expect(summaryRes.getValue().activeMembershipsCount).toBe(2);
      expect(summaryRes.getValue().todayCheckInsCount).toBe(1);

      // Query Trainer Bob assigned client roster
      const rosterRes = await getAssignedClientsHandler.execute(
        new GetAssignedClientMembershipsQuery({ trainerId: 'trainer_bob' }),
      );
      expect(rosterRes.isSuccess).toBe(true);
      expect(rosterRes.getValue().length).toBe(2);
      const clientIds = rosterRes.getValue().map((i: AssignedClientMembershipDTO) => i.clientId);
      expect(clientIds).toContain('client_sarah');
      expect(clientIds).toContain('client_john');
      expect(clientIds).not.toContain('client_kyle'); // Scoped away
    });

    it('Workflow 6: Trainer is denied access to non-assigned client attendance records', async () => {
      // Alice queries her own assigned roster -> only Kyle is returned
      const aliceRoster = await getAssignedClientsHandler.execute(
        new GetAssignedClientMembershipsQuery({ trainerId: 'trainer_alice' }),
      );
      expect(aliceRoster.isSuccess).toBe(true);
      expect(
        aliceRoster
          .getValue()
          .every((i: AssignedClientMembershipDTO) => i.clientId === 'client_kyle'),
      ).toBe(true);
    });
  });

  // =========================================================================
  // Workflow 7: Plan Deactivation & Historical Integrity
  // =========================================================================
  it('Workflow 7 — Plan Deactivation: Archived plan preserves existing memberships but prevents new creation', async () => {
    const planId = await seedStandardPlan();

    // Create membership under active plan
    const memRes = await createMembershipHandler.execute(
      new CreateMembershipCommand({
        clientId: 'client_sarah',
        planId,
        startDate: t0,
      }),
    );
    expect(memRes.isSuccess).toBe(true);
    const existingMemId = memRes.getValue().id;

    // Archive / Deactivate the Plan
    const archiveRes = await archivePlanHandler.execute(
      new ArchiveMembershipPlanCommand({ planId }),
    );
    expect(archiveRes.isSuccess).toBe(true);

    const plan = await planRepo.findById(planId);
    expect(plan?.status).toBe(PlanStatus.ARCHIVED);

    // Existing membership remains historically intact and ACTIVE
    const existingMem = await membershipRepo.findById(existingMemId);
    expect(existingMem?.status).toBe(MembershipStatus.ACTIVE);
    expect(existingMem?.planId).toBe(planId);

    // Attempting to create a NEW membership with archived plan FAILS
    const newMemRes = await createMembershipHandler.execute(
      new CreateMembershipCommand({
        clientId: 'client_john',
        planId,
        startDate: t0,
      }),
    );
    expect(newMemRes.isFailure).toBe(true);
    expect(newMemRes.getError()).toContain('not active');
  });

  // =========================================================================
  // Workflow 8: Lifecycle State Machine Invariants
  // =========================================================================
  describe('Workflow 8 — Domain Lifecycle Integrity & State Machine Invariants', () => {
    it('Enforces valid transitions and rejects invalid state mutations', async () => {
      const planId = await seedStandardPlan();
      const createRes = await createMembershipHandler.execute(
        new CreateMembershipCommand({
          clientId: 'client_sarah',
          planId,
          startDate: t0,
        }),
      );
      const memId = createRes.getValue().id;

      // 1. ACTIVE -> FROZEN
      const freezeRes = await freezeMembershipHandler.execute(
        new FreezeMembershipCommand({
          membershipId: memId,
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2026-08-10T00:00:00.000Z'),
          reason: 'Holiday',
        }),
      );
      expect(freezeRes.isSuccess).toBe(true);

      // Cannot freeze an already frozen membership
      const doubleFreeze = await freezeMembershipHandler.execute(
        new FreezeMembershipCommand({
          membershipId: memId,
          startDate: new Date('2026-08-11T00:00:00.000Z'),
          endDate: new Date('2026-08-20T00:00:00.000Z'),
        }),
      );
      expect(doubleFreeze.isFailure).toBe(true);

      // 2. FROZEN -> ACTIVE (Unfreeze)
      const unfreezeRes = await unfreezeMembershipHandler.execute(
        new UnfreezeMembershipCommand({ membershipId: memId }),
      );
      expect(unfreezeRes.isSuccess).toBe(true);

      // 3. ACTIVE -> CANCELLED
      const cancelRes = await cancelMembershipHandler.execute(
        new CancelMembershipCommand({
          membershipId: memId,
          reason: 'Client requested cancellation',
        }),
      );
      expect(cancelRes.isSuccess).toBe(true);

      // Cannot freeze or renew a CANCELLED membership
      const freezeCancelled = await freezeMembershipHandler.execute(
        new FreezeMembershipCommand({
          membershipId: memId,
          startDate: new Date('2026-08-15T00:00:00.000Z'),
          endDate: new Date('2026-08-20T00:00:00.000Z'),
        }),
      );
      expect(freezeCancelled.isFailure).toBe(true);
    });
  });

  // =========================================================================
  // Workflow 9: URL & Query State Synchronization
  // =========================================================================
  it('Workflow 9 — Query State & Pagination Invariants: List and filter returns deterministic subsets', async () => {
    const planId = await seedStandardPlan();

    await createMembershipHandler.execute(
      new CreateMembershipCommand({
        clientId: 'client_sarah',
        planId,
        assignedTrainerId: 'trainer_bob',
        startDate: t0,
      }),
    );
    await createMembershipHandler.execute(
      new CreateMembershipCommand({
        clientId: 'client_john',
        planId,
        assignedTrainerId: 'trainer_bob',
        startDate: t0,
      }),
    );

    // Query list with pagination & status filter
    const listRes = await listMembershipsHandler.execute(
      new ListMembershipsQuery({
        status: 'ACTIVE',
        page: 1,
        limit: 10,
      }),
    );

    expect(listRes.isSuccess).toBe(true);
    expect(listRes.getValue().items.length).toBe(2);
    expect(listRes.getValue().total).toBe(2);
  });

  // =========================================================================
  // Workflow 10: Failure Recovery & Non-Existent Client Resiliency
  // =========================================================================
  it('Workflow 10 — Failure Recovery: Validates non-existent client lookup and clock boundaries gracefully', async () => {
    const planId = await seedStandardPlan();

    // Attempt creation with non-existent client
    const invalidClientRes = await createMembershipHandler.execute(
      new CreateMembershipCommand({
        clientId: 'non_existent_client_999',
        planId,
        startDate: t0,
      }),
    );
    expect(invalidClientRes.isFailure).toBe(true);
    expect(invalidClientRes.getError()).toContain('does not exist');

    // Attempt check-in with non-existent client records DENIED_INACTIVE_CLIENT without throwing
    const checkInUnknown = await recordCheckInHandler.execute(
      new RecordCheckInCommand({
        clientId: 'non_existent_client_999',
        method: CheckInMethod.MANUAL_RECEPTION,
        gateId: 'desk_1',
      }),
    );
    expect(checkInUnknown.isSuccess).toBe(true);
    expect(checkInUnknown.getValue().outcome).toBe(AccessResult.DENIED_INACTIVE_CLIENT);
  });
});
