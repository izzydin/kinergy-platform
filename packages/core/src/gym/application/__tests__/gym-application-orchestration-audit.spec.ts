import {
  Membership,
  MembershipStatus,
  MembershipPlan,
  PlanStatus,
  AttendanceRecord,
  AccessResult,
  CheckInMethod,
  GymDay,
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
  ArchiveMembershipPlanCommand,
  ArchiveMembershipPlanHandler,
  UpdateMembershipPlanPricingCommand,
  UpdateMembershipPlanPricingHandler,
  RecordCheckInCommand,
  RecordCheckInHandler,
  GetMembershipByIdQuery,
  GetMembershipByIdHandler,
  ListMembershipsQuery,
  ListMembershipsHandler,
  GetExpiringMembershipsQuery,
  GetExpiringMembershipsHandler,
  ListExpiredMembershipsQuery,
  ListExpiredMembershipsHandler,
  GetMembershipPlanByIdQuery,
  GetMembershipPlanByIdHandler,
  ListMembershipPlansQuery,
  ListMembershipPlansHandler,
  GetDailyAttendanceQuery,
  GetDailyAttendanceHandler,
  GetClientAttendanceHistoryQuery,
  GetClientAttendanceHistoryHandler,
  SearchAttendanceQuery,
  SearchAttendanceHandler,
  CheckMembershipEligibilityHandler,
  GetTrainerDashboardSummaryQuery,
  GetTrainerDashboardSummaryHandler,
  GetAssignedClientMembershipsQuery,
  GetAssignedClientMembershipsHandler,
  MembershipRepository,
  MembershipPlanRepository,
  AttendanceRecordRepository,
  ClientLookupPort,
  GymEventPublisherPort,
  GymDomainEvent,
  MembershipCreatedEvent,
  MembershipRenewedEvent,
  MembershipFrozenEvent,
  MembershipUnfrozenEvent,
  MembershipCancelledEvent,
  AttendanceRecordedEvent,
} from '../../index';
import { TestClock } from '../../domain/shared/clock';

class MockMembershipRepository implements MembershipRepository {
  public store = new Map<string, Membership>();
  public shouldFailSave = false;

  async save(m: Membership): Promise<void> {
    if (this.shouldFailSave) {
      throw new Error('Database connection failed during membership save');
    }
    this.store.set(m.id.value, m);
  }

  async findById(id: string): Promise<Membership | null> {
    return this.store.get(id) || null;
  }

  async findByClientId(clientId: string): Promise<Membership[]> {
    return Array.from(this.store.values()).filter((m) => m.clientId === clientId);
  }

  async findAll(): Promise<Membership[]> {
    return Array.from(this.store.values());
  }

  async findExpiringCandidates(asOf: Date): Promise<Membership[]> {
    return Array.from(this.store.values()).filter(
      (m) =>
        (m.status === MembershipStatus.ACTIVE || m.status === MembershipStatus.FROZEN) &&
        m.period.endDate.getTime() <= asOf.getTime(),
    );
  }

  async findExpiringWithinHorizon(asOf: Date, horizonDays: number): Promise<Membership[]> {
    const horizonMs = horizonDays * 24 * 60 * 60 * 1000;
    return Array.from(this.store.values()).filter((m) => {
      if (m.status !== MembershipStatus.ACTIVE && m.status !== MembershipStatus.FROZEN) {
        return false;
      }
      const diffMs = m.period.endDate.getTime() - asOf.getTime();
      return diffMs > 0 && diffMs <= horizonMs;
    });
  }

  async findByTrainerId(trainerId: string): Promise<Membership[]> {
    return Array.from(this.store.values()).filter(
      (m) => m.trainerAssignment?.trainerId === trainerId,
    );
  }
}

class MockPlanRepository implements MembershipPlanRepository {
  public store = new Map<string, MembershipPlan>();
  public shouldFailSave = false;

  async save(p: MembershipPlan): Promise<void> {
    if (this.shouldFailSave) {
      throw new Error('Database connection failed during plan save');
    }
    this.store.set(p.id.value, p);
  }

  async findById(id: string): Promise<MembershipPlan | null> {
    return this.store.get(id) || null;
  }

  async findByCode(code: string): Promise<MembershipPlan | null> {
    for (const p of this.store.values()) {
      if (p.code.value === code) return p;
    }
    return null;
  }

  async findAll(): Promise<MembershipPlan[]> {
    return Array.from(this.store.values());
  }

  async findActive(): Promise<MembershipPlan[]> {
    return Array.from(this.store.values()).filter((p) => p.isAvailableForPurchase());
  }
}

class MockAttendanceRepository implements AttendanceRecordRepository {
  public records: AttendanceRecord[] = [];
  public shouldFailAppend = false;

  async append(r: AttendanceRecord): Promise<void> {
    if (this.shouldFailAppend) {
      throw new Error('Database connection failed during attendance append');
    }
    this.records.push(r);
  }

  async findById(id: string): Promise<AttendanceRecord | null> {
    return this.records.find((r) => r.id.value === id) || null;
  }

  async findByClientId(clientId: string, limit?: number): Promise<AttendanceRecord[]> {
    const list = this.records
      .filter((r) => r.clientId === clientId)
      .sort((a, b) => b.checkInTime.getTime() - a.checkInTime.getTime());
    return limit ? list.slice(0, limit) : list;
  }

  async findRecentByClientId(clientId: string, since: Date): Promise<AttendanceRecord[]> {
    return this.records
      .filter((r) => r.clientId === clientId && r.checkInTime.getTime() >= since.getTime())
      .sort((a, b) => b.checkInTime.getTime() - a.checkInTime.getTime());
  }

  async findByGymDay(gymDay: string, facilityId?: string): Promise<AttendanceRecord[]> {
    return this.records.filter((r) => {
      const matchesDay =
        r.gymDay.localDate === gymDay ||
        r.gymDay.toString() === gymDay ||
        gymDay.includes(r.gymDay.localDate);
      const matchesFacility = !facilityId || r.gymDay.facilityId === facilityId;
      return matchesDay && matchesFacility;
    });
  }

  async countGrantedByGymDay(gymDay: string, facilityId?: string): Promise<number> {
    return this.records.filter(
      (r) =>
        r.isGranted() &&
        (r.gymDay.localDate === gymDay || r.gymDay.toString() === gymDay) &&
        (!facilityId || r.gymDay.facilityId === facilityId),
    ).length;
  }

  async countGrantedByClientAndGymDay(clientId: string, gymDay: string): Promise<number> {
    return this.records.filter(
      (r) =>
        r.clientId === clientId &&
        r.isGranted() &&
        (r.gymDay.localDate === gymDay || r.gymDay.toString() === gymDay),
    ).length;
  }
}

class MockClientLookupPort implements ClientLookupPort {
  public knownClients = new Set<string>();

  async validateClientExists(clientId: string): Promise<boolean> {
    return this.knownClients.has(clientId);
  }
}

class MockEventPublisher implements GymEventPublisherPort {
  public published: GymDomainEvent[] = [];
  public shouldThrow = false;

  async publish(events: ReadonlyArray<GymDomainEvent>): Promise<void> {
    if (this.shouldThrow) {
      throw new Error('Message broker connection lost');
    }
    this.published.push(...events);
  }
}

describe('Phase 5: Gym Management Application Layer Orchestration Audit', () => {
  let membershipRepo: MockMembershipRepository;
  let planRepo: MockPlanRepository;
  let attendanceRepo: MockAttendanceRepository;
  let clientLookup: MockClientLookupPort;
  let eventPublisher: MockEventPublisher;
  let clock: TestClock;

  const t0 = new Date('2026-08-01T08:00:00.000Z');

  beforeEach(() => {
    membershipRepo = new MockMembershipRepository();
    planRepo = new MockPlanRepository();
    attendanceRepo = new MockAttendanceRepository();
    clientLookup = new MockClientLookupPort();
    eventPublisher = new MockEventPublisher();
    clock = new TestClock(t0);

    // Seed known clients
    clientLookup.knownClients.add('client_sarah');
    clientLookup.knownClients.add('client_john');
  });

  async function createAndPublishPlan(
    code = 'PLAN_STD_30',
    days = 30,
    price = 99,
  ): Promise<string> {
    const createPlanHandler = new CreateMembershipPlanHandler(planRepo, clock, eventPublisher);
    const planRes = await createPlanHandler.execute(
      new CreateMembershipPlanCommand({
        code,
        name: `Plan ${code}`,
        durationInDays: days,
        priceAmount: price,
        priceCurrency: 'USD',
      }),
    );
    const planId = planRes.getValue().id;
    const pubHandler = new PublishMembershipPlanHandler(planRepo, clock, eventPublisher);
    await pubHandler.execute(new PublishMembershipPlanCommand({ planId }));
    return planId;
  }

  // =========================================================================
  // SECTION 1: MEMBERSHIP COMMAND ORCHESTRATION
  // =========================================================================
  describe('1. Membership Command Handlers', () => {
    it('CreateMembership: orchestrates client validation, plan lookup, period calculation, persistence & events', async () => {
      const planId = await createAndPublishPlan();
      const handler = new CreateMembershipHandler(
        membershipRepo,
        planRepo,
        clientLookup,
        clock,
        eventPublisher,
      );

      const cmd = new CreateMembershipCommand({
        clientId: 'client_sarah',
        planId,
        assignedTrainerId: 'trainer_bob',
        startDate: t0,
      });

      const res = await handler.execute(cmd);
      expect(res.isSuccess).toBe(true);

      const dto = res.getValue();
      expect(dto.clientId).toBe('client_sarah');
      expect(dto.status).toBe(MembershipStatus.ACTIVE);
      expect(dto.period.durationDays).toBe(30);

      // Verify persistence
      const persisted = await membershipRepo.findById(dto.id);
      expect(persisted).not.toBeNull();

      // Verify event
      const event = eventPublisher.published.find((e) => e instanceof MembershipCreatedEvent);
      expect(event).toBeDefined();
    });

    it('CreateMembership: negative path - fails when client does not exist', async () => {
      const planId = await createAndPublishPlan();
      const handler = new CreateMembershipHandler(
        membershipRepo,
        planRepo,
        clientLookup,
        clock,
        eventPublisher,
      );

      const cmd = new CreateMembershipCommand({
        clientId: 'unknown_client_999',
        planId,
        startDate: t0,
      });

      const res = await handler.execute(cmd);
      expect(res.isFailure).toBe(true);
      expect(res.getError()).toContain('does not exist');
    });

    it('CreateMembership: negative path - fails when plan does not exist or is not active', async () => {
      const handler = new CreateMembershipHandler(
        membershipRepo,
        planRepo,
        clientLookup,
        clock,
        eventPublisher,
      );

      // Missing plan
      const missingPlanRes = await handler.execute(
        new CreateMembershipCommand({
          clientId: 'client_sarah',
          planId: 'plan_non_existent',
          startDate: t0,
        }),
      );
      expect(missingPlanRes.isFailure).toBe(true);
      expect(missingPlanRes.getError()).toContain('not found');

      // Draft plan
      const createPlanHandler = new CreateMembershipPlanHandler(planRepo, clock, eventPublisher);
      const draftPlan = await createPlanHandler.execute(
        new CreateMembershipPlanCommand({
          code: 'PLAN_DRAFT',
          name: 'Draft',
          durationInDays: 30,
          priceAmount: 50,
          priceCurrency: 'USD',
        }),
      );

      const inactivePlanRes = await handler.execute(
        new CreateMembershipCommand({
          clientId: 'client_sarah',
          planId: draftPlan.getValue().id,
          startDate: t0,
        }),
      );
      expect(inactivePlanRes.isFailure).toBe(true);
      expect(inactivePlanRes.getError()).toContain('not active');
    });

    it('RenewMembership: orchestrates period extension and event publishing', async () => {
      const planId = await createAndPublishPlan();
      const createHandler = new CreateMembershipHandler(
        membershipRepo,
        planRepo,
        clientLookup,
        clock,
        eventPublisher,
      );
      const createRes = await createHandler.execute(
        new CreateMembershipCommand({
          clientId: 'client_sarah',
          planId,
          startDate: t0,
        }),
      );
      const memId = createRes.getValue().id;

      const renewHandler = new RenewMembershipHandler(
        membershipRepo,
        planRepo,
        clock,
        eventPublisher,
      );
      const renewRes = await renewHandler.execute(
        new RenewMembershipCommand({
          membershipId: memId,
          newPlanId: planId,
        }),
      );

      expect(renewRes.isSuccess).toBe(true);
      expect(renewRes.getValue().period.durationDays).toBe(60);

      const event = eventPublisher.published.find((e) => e instanceof MembershipRenewedEvent);
      expect(event).toBeDefined();
    });

    it('Freeze and Unfreeze Membership: orchestrates freeze window lifecycle and date math', async () => {
      const planId = await createAndPublishPlan();
      const createHandler = new CreateMembershipHandler(
        membershipRepo,
        planRepo,
        clientLookup,
        clock,
        eventPublisher,
      );
      const mem = await createHandler.execute(
        new CreateMembershipCommand({ clientId: 'client_sarah', planId, startDate: t0 }),
      );
      const memId = mem.getValue().id;

      // Freeze
      const freezeHandler = new FreezeMembershipHandler(membershipRepo, clock, eventPublisher);
      const freezeRes = await freezeHandler.execute(
        new FreezeMembershipCommand({
          membershipId: memId,
          startDate: new Date('2026-08-05T00:00:00.000Z'),
          endDate: new Date('2026-08-15T00:00:00.000Z'),
          reason: 'Travel',
        }),
      );
      expect(freezeRes.isSuccess).toBe(true);
      expect(freezeRes.getValue().status).toBe(MembershipStatus.FROZEN);
      expect(eventPublisher.published.some((e) => e instanceof MembershipFrozenEvent)).toBe(true);

      // Unfreeze
      const unfreezeHandler = new UnfreezeMembershipHandler(membershipRepo, clock, eventPublisher);
      const unfreezeRes = await unfreezeHandler.execute(
        new UnfreezeMembershipCommand({ membershipId: memId }),
      );
      expect(unfreezeRes.isSuccess).toBe(true);
      expect(unfreezeRes.getValue().status).toBe(MembershipStatus.ACTIVE);
      expect(eventPublisher.published.some((e) => e instanceof MembershipUnfrozenEvent)).toBe(true);
    });

    it('CancelMembership: transitions to CANCELLED and records audit reason', async () => {
      const planId = await createAndPublishPlan();
      const createHandler = new CreateMembershipHandler(
        membershipRepo,
        planRepo,
        clientLookup,
        clock,
        eventPublisher,
      );
      const mem = await createHandler.execute(
        new CreateMembershipCommand({ clientId: 'client_sarah', planId, startDate: t0 }),
      );
      const memId = mem.getValue().id;

      const cancelHandler = new CancelMembershipHandler(membershipRepo, clock, eventPublisher);
      const cancelRes = await cancelHandler.execute(
        new CancelMembershipCommand({
          membershipId: memId,
          reason: 'Client moved abroad',
        }),
      );

      expect(cancelRes.isSuccess).toBe(true);
      expect(cancelRes.getValue().status).toBe(MembershipStatus.CANCELLED);
      expect(eventPublisher.published.some((e) => e instanceof MembershipCancelledEvent)).toBe(
        true,
      );
    });

    it('ExpireMemberships: batch processes expired passes with dryRun safety', async () => {
      const planId = await createAndPublishPlan();
      const createHandler = new CreateMembershipHandler(
        membershipRepo,
        planRepo,
        clientLookup,
        clock,
        eventPublisher,
      );
      await createHandler.execute(
        new CreateMembershipCommand({ clientId: 'client_sarah', planId, startDate: t0 }),
      );

      // Advance clock past expiration
      clock.advanceDays(35);
      const expireHandler = new ExpireMembershipsHandler(membershipRepo, clock, eventPublisher);

      // Dry run
      const dryRunRes = await expireHandler.execute(
        new ExpireMembershipsCommand({ asOfDate: clock.now(), dryRun: true }),
      );
      expect(dryRunRes.isSuccess).toBe(true);
      expect(dryRunRes.getValue().dryRun).toBe(true);
      expect(dryRunRes.getValue().expiredCount).toBe(1);

      // Verify not yet modified in DB
      const mAfterDryRun = (await membershipRepo.findAll())[0];
      expect(mAfterDryRun?.status).toBe(MembershipStatus.ACTIVE);

      // Real execution
      const realRes = await expireHandler.execute(
        new ExpireMembershipsCommand({ asOfDate: clock.now(), dryRun: false }),
      );
      expect(realRes.isSuccess).toBe(true);
      expect(realRes.getValue().expiredCount).toBe(1);

      const mAfterReal = (await membershipRepo.findAll())[0];
      expect(mAfterReal?.status).toBe(MembershipStatus.EXPIRED);
    });
  });

  // =========================================================================
  // SECTION 2: PLAN COMMAND HANDLERS
  // =========================================================================
  describe('2. Membership Plan Command Handlers', () => {
    it('Create, Publish, Update Price, Archive Plan orchestration', async () => {
      const createHandler = new CreateMembershipPlanHandler(planRepo, clock, eventPublisher);
      const pubHandler = new PublishMembershipPlanHandler(planRepo, clock, eventPublisher);
      const updatePriceHandler = new UpdateMembershipPlanPricingHandler(
        planRepo,
        clock,
        eventPublisher,
      );
      const archiveHandler = new ArchiveMembershipPlanHandler(planRepo, clock, eventPublisher);

      // 1. Create
      const createRes = await createHandler.execute(
        new CreateMembershipPlanCommand({
          code: 'PLAN_CORP_YEAR',
          name: 'Corporate Annual',
          durationInDays: 365,
          priceAmount: 1200,
          priceCurrency: 'USD',
        }),
      );
      expect(createRes.isSuccess).toBe(true);
      const planId = createRes.getValue().id;

      // 2. Publish
      const pubRes = await pubHandler.execute(new PublishMembershipPlanCommand({ planId }));
      expect(pubRes.isSuccess).toBe(true);
      expect(pubRes.getValue().status).toBe(PlanStatus.ACTIVE);

      // 3. Update Pricing
      const updateRes = await updatePriceHandler.execute(
        new UpdateMembershipPlanPricingCommand({
          planId,
          newPriceAmount: 1299,
        }),
      );
      expect(updateRes.isSuccess).toBe(true);
      expect(updateRes.getValue().priceAmount).toBe(1299);

      // 4. Archive
      const archiveRes = await archiveHandler.execute(new ArchiveMembershipPlanCommand({ planId }));
      expect(archiveRes.isSuccess).toBe(true);
      expect(archiveRes.getValue().status).toBe(PlanStatus.ARCHIVED);
    });
  });

  // =========================================================================
  // SECTION 3: ATTENDANCE & CHECK-IN ORCHESTRATION
  // =========================================================================
  describe('3. Attendance & Live Check-In Handlers', () => {
    it('RecordCheckIn: validates eligibility, anti-passback cooldown, appends record & publishes event', async () => {
      const planId = await createAndPublishPlan();
      const createHandler = new CreateMembershipHandler(
        membershipRepo,
        planRepo,
        clientLookup,
        clock,
        eventPublisher,
      );
      await createHandler.execute(
        new CreateMembershipCommand({ clientId: 'client_sarah', planId, startDate: t0 }),
      );

      const eligHandler = new CheckMembershipEligibilityHandler(
        membershipRepo,
        clientLookup,
        clock,
      );
      const checkInHandler = new RecordCheckInHandler(
        attendanceRepo,
        eligHandler,
        clock,
        eventPublisher,
      );

      // First check-in succeeds
      const checkInRes = await checkInHandler.execute(
        new RecordCheckInCommand({
          clientId: 'client_sarah',
          method: CheckInMethod.QR_CODE,
          gateId: 'turnstile_main',
        }),
      );

      expect(checkInRes.isSuccess).toBe(true);
      expect(checkInRes.getValue().outcome).toBe(AccessResult.GRANTED);
      expect(checkInRes.getValue().isGranted).toBe(true);
      expect(attendanceRepo.records.length).toBe(1);
      expect(eventPublisher.published.some((e) => e instanceof AttendanceRecordedEvent)).toBe(true);

      // Immediate re-scan within 5-min anti-passback window is DENIED
      clock.advanceMinutes(2);
      const secondCheckIn = await checkInHandler.execute(
        new RecordCheckInCommand({
          clientId: 'client_sarah',
          method: CheckInMethod.QR_CODE,
          gateId: 'turnstile_main',
        }),
      );
      expect(secondCheckIn.isSuccess).toBe(true);
      expect(secondCheckIn.getValue().outcome).toBe(AccessResult.DENIED_DUPLICATE_CHECKIN);
      expect(secondCheckIn.getValue().isGranted).toBe(false);
    });
  });

  // =========================================================================
  // SECTION 4: QUERY HANDLERS
  // =========================================================================
  describe('4. Query Handlers', () => {
    it('GetMembershipById & ListMemberships Query Handlers', async () => {
      const planId = await createAndPublishPlan();
      const createHandler = new CreateMembershipHandler(
        membershipRepo,
        planRepo,
        clientLookup,
        clock,
        eventPublisher,
      );
      const m1 = await createHandler.execute(
        new CreateMembershipCommand({ clientId: 'client_sarah', planId, startDate: t0 }),
      );
      await createHandler.execute(
        new CreateMembershipCommand({ clientId: 'client_john', planId, startDate: t0 }),
      );

      const getHandler = new GetMembershipByIdHandler(membershipRepo);
      const getRes = await getHandler.execute(
        new GetMembershipByIdQuery({ membershipId: m1.getValue().id }),
      );
      expect(getRes.isSuccess).toBe(true);
      expect(getRes.getValue().clientId).toBe('client_sarah');

      const listHandler = new ListMembershipsHandler(membershipRepo);
      const listRes = await listHandler.execute(new ListMembershipsQuery({ page: 1, limit: 10 }));
      expect(listRes.isSuccess).toBe(true);
      expect(listRes.getValue().total).toBe(2);
    });

    it('GetExpiringMemberships & ListExpiredMemberships Query Handlers', async () => {
      const planId = await createAndPublishPlan();
      const createHandler = new CreateMembershipHandler(
        membershipRepo,
        planRepo,
        clientLookup,
        clock,
        eventPublisher,
      );
      await createHandler.execute(
        new CreateMembershipCommand({ clientId: 'client_sarah', planId, startDate: t0 }),
      );

      // Advance clock to within 5 days of expiration (day 26 of 30)
      clock.advanceDays(26);

      const expiringHandler = new GetExpiringMembershipsHandler(membershipRepo, clock);
      const expiringRes = await expiringHandler.execute(
        new GetExpiringMembershipsQuery({ horizonDays: 7 }),
      );
      expect(expiringRes.isSuccess).toBe(true);
      expect(expiringRes.getValue().length).toBe(1);

      // Advance past expiration and run expiration
      clock.advanceDays(10);
      const expireHandler = new ExpireMembershipsHandler(membershipRepo, clock, eventPublisher);
      await expireHandler.execute(new ExpireMembershipsCommand({ asOfDate: clock.now() }));

      const listExpiredHandler = new ListExpiredMembershipsHandler(membershipRepo);
      const expiredList = await listExpiredHandler.execute(new ListExpiredMembershipsQuery());
      expect(expiredList.isSuccess).toBe(true);
      expect(expiredList.getValue().items.length).toBe(1);
    });

    it('GetMembershipPlanById & ListMembershipPlans Query Handlers', async () => {
      const planId = await createAndPublishPlan('PLAN_GOLD', 90, 250);

      const getPlanHandler = new GetMembershipPlanByIdHandler(planRepo);
      const getRes = await getPlanHandler.execute(new GetMembershipPlanByIdQuery({ planId }));
      expect(getRes.isSuccess).toBe(true);
      expect(getRes.getValue().code).toBe('PLAN_GOLD');

      const listPlanHandler = new ListMembershipPlansHandler(planRepo);
      const listRes = await listPlanHandler.execute(new ListMembershipPlansQuery());
      expect(listRes.isSuccess).toBe(true);
      expect(listRes.getValue().items.length).toBe(1);
    });

    it('Daily Attendance & Attendance History & Search Handlers', async () => {
      const record = AttendanceRecord.record(
        {
          clientId: 'client_sarah',
          membershipId: 'mem_1',
          checkInTime: clock.now(),
          gymDay: GymDay.fromUtc(clock.now()),
          method: CheckInMethod.QR_CODE,
          result: AccessResult.GRANTED,
        },
        clock,
      );
      await attendanceRepo.append(record);

      // Daily attendance
      const dailyHandler = new GetDailyAttendanceHandler(attendanceRepo, clock);
      const dailyRes = await dailyHandler.execute(new GetDailyAttendanceQuery());
      expect(dailyRes.isSuccess).toBe(true);
      expect(dailyRes.getValue().items.length).toBe(1);

      // History
      const historyHandler = new GetClientAttendanceHistoryHandler(attendanceRepo);
      const historyRes = await historyHandler.execute(
        new GetClientAttendanceHistoryQuery({ clientId: 'client_sarah' }),
      );
      expect(historyRes.isSuccess).toBe(true);
      expect(historyRes.getValue().items.length).toBe(1);

      // Search
      const searchHandler = new SearchAttendanceHandler(attendanceRepo);
      const searchRes = await searchHandler.execute(
        new SearchAttendanceQuery({ clientId: 'client_sarah' }),
      );
      expect(searchRes.isSuccess).toBe(true);
      expect(searchRes.getValue().items.length).toBe(1);
    });

    it('Trainer Dashboard Summary & Assigned Clients Handlers', async () => {
      const planId = await createAndPublishPlan();
      const createHandler = new CreateMembershipHandler(
        membershipRepo,
        planRepo,
        clientLookup,
        clock,
        eventPublisher,
      );
      await createHandler.execute(
        new CreateMembershipCommand({
          clientId: 'client_sarah',
          planId,
          assignedTrainerId: 'trainer_bob',
          startDate: t0,
        }),
      );

      const summaryHandler = new GetTrainerDashboardSummaryHandler(
        membershipRepo,
        attendanceRepo,
        clock,
      );
      const summaryRes = await summaryHandler.execute(
        new GetTrainerDashboardSummaryQuery({ trainerId: 'trainer_bob' }),
      );
      expect(summaryRes.isSuccess).toBe(true);
      expect(summaryRes.getValue().totalAssignedClients).toBe(1);
      expect(summaryRes.getValue().activeMembershipsCount).toBe(1);

      const rosterHandler = new GetAssignedClientMembershipsHandler(
        membershipRepo,
        planRepo,
        clock,
      );
      const rosterRes = await rosterHandler.execute(
        new GetAssignedClientMembershipsQuery({ trainerId: 'trainer_bob' }),
      );
      expect(rosterRes.isSuccess).toBe(true);
      expect(rosterRes.getValue().length).toBe(1);
      expect(rosterRes.getValue()[0]?.clientId).toBe('client_sarah');
    });
  });

  // =========================================================================
  // SECTION 5: RESILIENCE & FAILURE PATHS
  // =========================================================================
  describe('5. Application Resilience & Exception Handling', () => {
    it('Fails gracefully and returns failure Result when repository throws on save', async () => {
      const planId = await createAndPublishPlan();
      membershipRepo.shouldFailSave = true; // Injected persistence failure

      const handler = new CreateMembershipHandler(
        membershipRepo,
        planRepo,
        clientLookup,
        clock,
        eventPublisher,
      );

      const res = await handler.execute(
        new CreateMembershipCommand({
          clientId: 'client_sarah',
          planId,
          startDate: t0,
        }),
      );

      expect(res.isFailure).toBe(true);
      expect(res.getError()).toContain('Database connection failed');
    });
  });
});
