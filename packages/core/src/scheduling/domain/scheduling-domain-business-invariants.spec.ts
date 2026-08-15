import {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  AppointmentTypeEnum,
  TimeRange,
  Duration,
  TurnaroundBuffer,
  TherapistSchedule,
  WorkingHours,
  BreakPeriod,
  VacationPeriod,
  AvailabilityOverride,
  Room,
  RoomStatus,
  RecurrenceSeries,
  RecurrencePattern,
  RecurrenceFrequency,
  SeriesStatus,
  WorkingHoursSpecification,
  TherapistAvailabilitySpecification,
  RoomAvailabilitySpecification,
  TurnaroundBufferPolicy,
  BookingWindowPolicy,
  RecurrenceCalculationEngine,
  TestClock,
  InvalidTimeRangeException,
  InvalidAppointmentTransitionException,
} from '../index';
import { ResourceId } from './resource/resource-id.vo';

describe('Milestone 3.7: Scheduling Domain Invariant & Business Rule Validation Suite', () => {
  describe('1. Appointment Aggregate Invariant Matrix', () => {
    const validClientId = '550e8400-e29b-41d4-a716-446655440001';
    const validTherapistId = '550e8400-e29b-41d4-a716-446655440002';
    const validRoomId = '550e8400-e29b-41d4-a716-446655440003';
    const validRange = TimeRange.create(
      new Date('2026-09-01T10:00:00.000Z'),
      new Date('2026-09-01T11:00:00.000Z'),
    );

    it('creates appointment in SCHEDULED state with version 1', () => {
      const appt = Appointment.create({
        clientId: validClientId,
        therapistId: validTherapistId,
        roomId: validRoomId,
        type: AppointmentType.create(AppointmentTypeEnum.TREATMENT),
        timeRange: validRange,
      });

      expect(appt.status).toBe(AppointmentStatus.SCHEDULED);
      expect(appt.version).toBe(1);
      expect(appt.clientId).toBe(validClientId);
      expect(appt.therapistId).toBe(validTherapistId);
      expect(appt.roomId).toBe(validRoomId);
      expect(appt.timeRange.equals(validRange)).toBe(true);
      expect(appt.isDetachedFromSeries).toBe(false);
    });

    it('executes full legal clinical lifecycle: SCHEDULED -> CONFIRMED -> CHECKED_IN -> IN_PROGRESS -> COMPLETED', () => {
      const appt = Appointment.create({
        clientId: validClientId,
        therapistId: validTherapistId,
        roomId: validRoomId,
        type: AppointmentType.create(AppointmentTypeEnum.ASSESSMENT),
        timeRange: validRange,
      });

      // 1. Confirm
      appt.confirm();
      expect(appt.status).toBe(AppointmentStatus.CONFIRMED);

      // 2. Check In
      appt.checkIn();
      expect(appt.status).toBe(AppointmentStatus.CHECKED_IN);

      // 3. Start Session
      appt.start();
      expect(appt.status).toBe(AppointmentStatus.IN_PROGRESS);

      // 4. Complete Session
      appt.complete();
      expect(appt.status).toBe(AppointmentStatus.COMPLETED);
    });

    it('supports legal cancellation from SCHEDULED, CONFIRMED, and CHECKED_IN states', () => {
      // From SCHEDULED
      const appt1 = Appointment.create({
        clientId: validClientId,
        therapistId: validTherapistId,
        roomId: validRoomId,
        type: AppointmentType.create(AppointmentTypeEnum.FOLLOW_UP),
        timeRange: validRange,
      });
      appt1.cancel('Client cancellation');
      expect(appt1.status).toBe(AppointmentStatus.CANCELLED);

      // From CONFIRMED
      const appt2 = Appointment.create({
        clientId: validClientId,
        therapistId: validTherapistId,
        roomId: validRoomId,
        type: AppointmentType.create(AppointmentTypeEnum.FOLLOW_UP),
        timeRange: validRange,
      });
      appt2.confirm();
      appt2.cancel('Practitioner emergency');
      expect(appt2.status).toBe(AppointmentStatus.CANCELLED);

      // From CHECKED_IN
      const appt3 = Appointment.create({
        clientId: validClientId,
        therapistId: validTherapistId,
        roomId: validRoomId,
        type: AppointmentType.create(AppointmentTypeEnum.FOLLOW_UP),
        timeRange: validRange,
      });
      appt3.confirm();
      appt3.checkIn();
      appt3.cancel('Client left before consultation');
      expect(appt3.status).toBe(AppointmentStatus.CANCELLED);
    });

    it('supports marking NO_SHOW from CONFIRMED and SCHEDULED states', () => {
      const appt = Appointment.create({
        clientId: validClientId,
        therapistId: validTherapistId,
        roomId: validRoomId,
        type: AppointmentType.create(AppointmentTypeEnum.TREATMENT),
        timeRange: validRange,
      });
      appt.confirm();
      appt.markNoShow();
      expect(appt.status).toBe(AppointmentStatus.NO_SHOW);
    });

    it('strictly rejects illegal state transitions', () => {
      const appt = Appointment.create({
        clientId: validClientId,
        therapistId: validTherapistId,
        roomId: validRoomId,
        type: AppointmentType.create(AppointmentTypeEnum.TREATMENT),
        timeRange: validRange,
      });
      appt.confirm();
      appt.checkIn();
      appt.start();
      appt.complete();

      // Attempting to cancel a completed appointment
      expect(() => appt.cancel('Refund requested')).toThrow(Error);

      // Attempting to reschedule a completed appointment
      const newRange = TimeRange.create(
        new Date('2026-09-02T10:00:00.000Z'),
        new Date('2026-09-02T11:00:00.000Z'),
      );
      expect(() => appt.reschedule(newRange)).toThrow(InvalidAppointmentTransitionException);
    });

    it('reschedules appointment, updates time range, and increments version', () => {
      const appt = Appointment.create({
        clientId: validClientId,
        therapistId: validTherapistId,
        roomId: 'room-alpha',
        type: AppointmentType.create(AppointmentTypeEnum.TREATMENT),
        timeRange: validRange,
      });

      const newRange = TimeRange.create(
        new Date('2026-09-01T14:00:00.000Z'),
        new Date('2026-09-01T15:00:00.000Z'),
      );

      // Reschedule
      appt.reschedule(newRange);
      expect(appt.timeRange.equals(newRange)).toBe(true);
      expect(appt.status).toBe(AppointmentStatus.RESCHEDULED);
      expect(appt.version).toBe(2);

      // Reassign room
      appt.assignRoom('room-beta');
      expect(appt.roomId).toBe('room-beta');
      expect(appt.version).toBe(3);
    });

    it('supports series detachment', () => {
      const appt = Appointment.create({
        clientId: validClientId,
        therapistId: validTherapistId,
        roomId: validRoomId,
        type: AppointmentType.create(AppointmentTypeEnum.EVALUATION),
        timeRange: validRange,
        seriesId: 'series-123',
      });

      appt.detachFromSeries();
      expect(appt.isDetachedFromSeries).toBe(true);
    });
  });

  describe('2. Therapist Schedule 4-Tier Precedence Engine', () => {
    const therapistId = '550e8400-e29b-41d4-a716-446655440010';
    let schedule: TherapistSchedule;

    beforeEach(() => {
      schedule = TherapistSchedule.create({ therapistId });

      // Monday: 09:00 - 17:00
      schedule.addWorkingHours(WorkingHours.fromTimeStrings(1, '09:00', '17:00'));

      // Break on Mondays: 12:00 - 13:00
      schedule.addBreak(BreakPeriod.createRecurring(1, 12 * 60, 13 * 60, 'Lunch break'));
    });

    it('Tier 4: Working hours check allows standard booking during working shift', () => {
      // 2026-09-07 is Monday
      const mondayMorning = TimeRange.create(
        new Date('2026-09-07T10:00:00.000Z'),
        new Date('2026-09-07T11:00:00.000Z'),
      );
      expect(schedule.isWorking(mondayMorning)).toBe(true);
      expect(schedule.isAvailable(mondayMorning)).toBe(true);

      // Outside shift: Monday 07:00 - 08:00
      const earlyMorning = TimeRange.create(
        new Date('2026-09-07T07:00:00.000Z'),
        new Date('2026-09-07T08:00:00.000Z'),
      );
      expect(schedule.isWorking(earlyMorning)).toBe(false);
      expect(schedule.isAvailable(earlyMorning)).toBe(false);
    });

    it('Tier 3: Daily Break takes precedence over base shift and blocks availability', () => {
      const lunchRange = TimeRange.create(
        new Date('2026-09-07T12:00:00.000Z'),
        new Date('2026-09-07T13:00:00.000Z'),
      );
      expect(schedule.isWorking(lunchRange)).toBe(true); // Is during working shift
      expect(schedule.isBreak(lunchRange)).toBe(true); // But is a break
      expect(schedule.isAvailable(lunchRange)).toBe(false); // Therefore unavailable
    });

    it('Tier 2: Specific Date Override overrides default shift', () => {
      // Monday 2026-09-07 has an emergency morning closure override (09:00 - 12:00 unavailable)
      schedule.addOverride(
        AvailabilityOverride.create(
          TimeRange.create(
            new Date('2026-09-07T09:00:00.000Z'),
            new Date('2026-09-07T12:00:00.000Z'),
          ),
          'UNAVAILABLE',
          'Staff meeting',
        ),
      );

      const morningRange = TimeRange.create(
        new Date('2026-09-07T10:00:00.000Z'),
        new Date('2026-09-07T11:00:00.000Z'),
      );
      expect(schedule.isAvailable(morningRange)).toBe(false);

      // Afternoon (14:00 - 15:00) remains available
      const afternoonRange = TimeRange.create(
        new Date('2026-09-07T14:00:00.000Z'),
        new Date('2026-09-07T15:00:00.000Z'),
      );
      expect(schedule.isAvailable(afternoonRange)).toBe(true);
    });

    it('Tier 1: Vacation period (Highest Precedence) blocks all working hours and overrides', () => {
      schedule.addVacation(
        VacationPeriod.create(
          TimeRange.create(
            new Date('2026-09-07T00:00:00.000Z'),
            new Date('2026-09-14T00:00:00.000Z'),
          ),
          'Annual leave',
        ),
      );

      const afternoonRange = TimeRange.create(
        new Date('2026-09-07T14:00:00.000Z'),
        new Date('2026-09-07T15:00:00.000Z'),
      );
      expect(schedule.isVacation(afternoonRange)).toBe(true);
      expect(schedule.isAvailable(afternoonRange)).toBe(false);
    });
  });

  describe('3. Room Aggregate & Maintenance Invariant Matrix', () => {
    it('creates room with valid name, positive capacity, features, and AVAILABLE state', () => {
      const room = Room.create({
        name: 'Cryotherapy Suite',
        capacity: 2,
        features: ['cryo_chamber', 'oxygen_bar'],
      });

      expect(room.name).toBe('Cryotherapy Suite');
      expect(room.capacity).toBe(2);
      expect(Array.from(room.features)).toEqual(['cryo_chamber', 'oxygen_bar']);
      expect(room.status).toBe(RoomStatus.AVAILABLE);
      expect(room.isReservable()).toBe(true);
      expect(room.version).toBe(1);
    });

    it('rejects invalid room creation arguments', () => {
      expect(() => Room.create({ name: '   ', capacity: 1 })).toThrow('empty');
      expect(() => Room.create({ name: 'Suite', capacity: 0 })).toThrow('positive integer');
      expect(() => Room.create({ name: 'Suite', capacity: -3 })).toThrow('positive integer');
    });

    it('manages room operational state machine with mandatory deactivation reason', () => {
      const room = Room.create({ name: 'Rehab Bay 1', capacity: 1 });

      // Deactivate
      room.deactivate('Under floor renovation');
      expect(room.status).toBe(RoomStatus.UNAVAILABLE);
      expect(room.maintenanceReason).toBe('Under floor renovation');
      expect(room.isReservable()).toBe(false);
      expect(room.version).toBe(2);

      // Reactivate
      room.activate();
      expect(room.status).toBe(RoomStatus.AVAILABLE);
      expect(room.maintenanceReason).toBeUndefined();
      expect(room.isReservable()).toBe(true);
      expect(room.version).toBe(3);
    });

    it('manages maintenance windows and cancellation', () => {
      const room = Room.create({ name: 'Massage Room 1', capacity: 1 });

      const window1 = TimeRange.create(
        new Date('2026-09-10T08:00:00.000Z'),
        new Date('2026-09-10T12:00:00.000Z'),
      );

      const win = room.scheduleMaintenance({ timeRange: window1, reason: 'Filter sanitation' });
      expect(room.maintenanceWindows).toHaveLength(1);
      expect(room.version).toBe(2);

      // Cancel maintenance window
      const removed = room.cancelMaintenance(win.id);
      expect(removed).toBe(true);
      expect(room.maintenanceWindows).toHaveLength(0);
      expect(room.version).toBe(3);
    });
  });

  describe('4. RecurrenceSeries Pattern & Rolling Generation Invariants', () => {
    it('creates weekly series, calculates occurrences, and bounds by endDate', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-09-01T09:00:00.000Z'),
        endDate: new Date('2026-09-30T23:59:59.999Z'),
        localStartTime: { hour: 9, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const series = RecurrenceSeries.create({
        clientId: 'client-1',
        therapistId: 'therapist-1',
        roomId: 'room-1',
        serviceType: 'TREATMENT',
        pattern,
      });

      expect(series.status).toBe(SeriesStatus.ACTIVE);
      expect(series.version).toBe(1);

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: series.id.toString(),
        pattern,
        window: TimeRange.create(
          new Date('2026-09-01T00:00:00.000Z'),
          new Date('2026-09-30T23:59:59.999Z'),
        ),
      });

      // Tuesdays in Sept 2026: Sept 1, Sept 8, Sept 15, Sept 22, Sept 29 (5 occurrences)
      expect(result.slots).toHaveLength(5);
    });

    it('creates biweekly series and respects maxOccurrences ceiling', () => {
      const pattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.BIWEEKLY,
        startDate: new Date('2026-09-01T10:00:00.000Z'),
        maxOccurrences: 3,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: 'series-biweekly',
        pattern,
        window: TimeRange.create(
          new Date('2026-09-01T00:00:00.000Z'),
          new Date('2026-12-31T23:59:59.999Z'),
        ),
      });

      expect(result.slots).toHaveLength(3);
    });

    it('records slot-level exceptions (SKIPPED, MODIFIED) in audit log', () => {
      const series = RecurrenceSeries.create({
        clientId: 'client-1',
        therapistId: 'therapist-1',
        roomId: 'room-1',
        serviceType: 'TREATMENT',
        pattern: RecurrencePattern.create({
          frequency: RecurrenceFrequency.WEEKLY,
          startDate: new Date('2026-09-01T09:00:00.000Z'),
          localStartTime: { hour: 9, minute: 0 },
          durationMinutes: 60,
          timezone: 'UTC',
        }),
      });

      series.skipOccurrence(1, new Date('2026-09-08T09:00:00.000Z'), 'Patient holiday');
      expect(series.exceptions).toHaveLength(1);
      expect(series.exceptions[0]!.type).toBe('SKIPPED');

      series.recordModifiedException(
        2,
        new Date('2026-09-15T09:00:00.000Z'),
        'Room reassigned to Hydro Suite',
      );
      expect(series.exceptions).toHaveLength(2);
    });
  });

  describe('5. Value Objects Invariant & Equality Matrix', () => {
    it('TimeRange: validates start < end, rejects invalid ranges, supports transformations', () => {
      const d1 = new Date('2026-09-01T10:00:00.000Z');
      const d2 = new Date('2026-09-01T11:00:00.000Z');
      const tr = TimeRange.create(d1, d2);

      expect(tr.start).toEqual(d1);
      expect(tr.end).toEqual(d2);
      expect(tr.duration().toMinutes()).toBe(60);

      // Rejections
      expect(() => TimeRange.create(d2, d1)).toThrow(InvalidTimeRangeException);
      expect(() => TimeRange.create(d1, d1)).toThrow(InvalidTimeRangeException);

      // Buffer expansion
      const buffered = tr.toBufferedRange(TurnaroundBuffer.of(10, 15));
      expect(buffered.start).toEqual(new Date('2026-09-01T09:50:00.000Z'));
      expect(buffered.end).toEqual(new Date('2026-09-01T11:15:00.000Z'));

      // Half-open boundary: touches
      const adjacent = TimeRange.create(d2, new Date('2026-09-01T12:00:00.000Z'));
      expect(tr.touches(adjacent)).toBe(true);
      expect(tr.overlaps(adjacent)).toBe(false); // [10, 11) does not overlap [11, 12)
    });

    it('Duration: arithmetic and value comparisons', () => {
      const dur30 = Duration.fromMinutes(30);
      const dur60 = Duration.fromHours(1);

      expect(dur30.toMinutes()).toBe(30);
      expect(dur60.toMinutes()).toBe(60);
      expect(dur30.add(dur30).equals(dur60)).toBe(true);
      expect(dur60.subtract(dur30).equals(dur30)).toBe(true);
      expect(dur30.toMilliseconds() < dur60.toMilliseconds()).toBe(true);
    });

    it('ResourceId & AppointmentType: validation and equality', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440099';
      const rid1 = ResourceId.create(validUuid);
      const rid2 = ResourceId.create(validUuid);
      expect(rid1.equals(rid2)).toBe(true);

      expect(() => ResourceId.create('')).toThrow();

      const apptType = AppointmentType.create(AppointmentTypeEnum.TREATMENT);
      expect(apptType.getValue()).toBe('TREATMENT');
      expect(() => AppointmentType.create('INVALID_TYPE')).toThrow();
    });
  });

  describe('6. Specifications & Business Policies Matrix', () => {
    it('WorkingHoursSpecification & TherapistAvailabilitySpecification', () => {
      const schedule = TherapistSchedule.create({
        therapistId: 'therapist-spec-1',
      });
      schedule.addWorkingHours(WorkingHours.fromTimeStrings(1, '09:00', '17:00'));

      const workingSpec = new WorkingHoursSpecification();
      const availSpec = new TherapistAvailabilitySpecification();

      const mondayMorning = TimeRange.create(
        new Date('2026-09-07T10:00:00.000Z'),
        new Date('2026-09-07T11:00:00.000Z'),
      );
      expect(workingSpec.isSatisfiedBy({ schedule, range: mondayMorning })).toBe(true);
      expect(availSpec.isSatisfiedBy({ schedule, range: mondayMorning })).toBe(true);

      const mondayNight = TimeRange.create(
        new Date('2026-09-07T20:00:00.000Z'),
        new Date('2026-09-07T21:00:00.000Z'),
      );
      expect(workingSpec.isSatisfiedBy({ schedule, range: mondayNight })).toBe(false);
      expect(availSpec.isSatisfiedBy({ schedule, range: mondayNight })).toBe(false);
    });

    it('RoomAvailabilitySpecification evaluates capacity and feature matches', () => {
      const room = Room.create({
        name: 'Deluxe Rehab',
        capacity: 4,
        features: ['ultrasound', 'traction_bed'],
      });

      const spec = new RoomAvailabilitySpecification();
      expect(
        spec.isSatisfiedBy({
          room,
          requiredCapacity: 2,
          requiredFeatures: ['ultrasound'],
        }),
      ).toBe(true);

      expect(
        spec.isSatisfiedBy({
          room,
          requiredCapacity: 10,
        }),
      ).toBe(false);
    });

    it('BookingWindowPolicy enforces lead time and maximum horizon', () => {
      const clock = new TestClock(new Date('2026-09-01T08:00:00.000Z'));
      const policy = new BookingWindowPolicy(); // Min 2 hours lead time, Max 90 days horizon

      // Valid: 24 hours in future
      expect(
        policy.validateBookingWindow(new Date('2026-09-02T10:00:00.000Z'), clock).isValid,
      ).toBe(true);

      // Invalid: 1 hour in future (less than 2h lead time)
      expect(
        policy.validateBookingWindow(new Date('2026-09-01T08:30:00.000Z'), clock).isValid,
      ).toBe(false);

      // Invalid: 120 days in future (exceeds 90 days horizon)
      expect(
        policy.validateBookingWindow(new Date('2027-01-01T10:00:00.000Z'), clock).isValid,
      ).toBe(false);
    });

    it('TurnaroundBufferPolicy computes modal turnaround times', () => {
      const policy = TurnaroundBufferPolicy.createDefault();

      const treatmentBuffer = policy.getBufferFor({
        appointmentType: AppointmentType.create(AppointmentTypeEnum.TREATMENT),
      });
      expect(treatmentBuffer.cleanupDuration.toMinutes()).toBe(15);
      expect(treatmentBuffer.prepDuration.toMinutes()).toBe(0);

      const evalBuffer = policy.getBufferFor({
        appointmentType: AppointmentType.create(AppointmentTypeEnum.EVALUATION),
      });
      expect(evalBuffer.prepDuration.toMinutes()).toBe(10);
      expect(evalBuffer.cleanupDuration.toMinutes()).toBe(10);

      const followupBuffer = policy.getBufferFor({
        appointmentType: AppointmentType.create(AppointmentTypeEnum.FOLLOW_UP),
      });
      expect(followupBuffer.isEmpty()).toBe(true);
    });
  });

  describe('7. Temporal & DST Edge Cases Validation', () => {
    it('Month-End Clamping: Monthly series on Jan 31 resolves to Feb 28 on non-leap year and Feb 29 on leap year', () => {
      // 2028 is a Leap Year
      const leapPattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.MONTHLY,
        startDate: new Date('2028-01-31T10:00:00.000Z'),
        maxOccurrences: 4,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: 'series-leap',
        pattern: leapPattern,
        window: TimeRange.create(
          new Date('2028-01-01T00:00:00.000Z'),
          new Date('2028-05-31T23:59:59.999Z'),
        ),
      });

      expect(result.slots).toHaveLength(4);
      expect(result.slots[0]!.timeRange.start.toISOString()).toBe('2028-01-31T10:00:00.000Z');
      expect(result.slots[1]!.timeRange.start.toISOString()).toBe('2028-02-29T10:00:00.000Z'); // Clamped to Feb 29
      expect(result.slots[2]!.timeRange.start.toISOString()).toBe('2028-03-31T10:00:00.000Z');
      expect(result.slots[3]!.timeRange.start.toISOString()).toBe('2028-04-30T10:00:00.000Z'); // Clamped to Apr 30
    });

    it('DST Spring Forward Transition: Preserves 10:00 AM local clinic time across EST -> EDT shift', () => {
      // America/New_York Spring Forward: March 8, 2026 (EST UTC-5 -> EDT UTC-4)
      const dstPattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-03-01T15:00:00.000Z'), // March 1, 2026 10:00 AM EST = 15:00 UTC
        maxOccurrences: 3,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'America/New_York',
      });

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: 'series-dst-spring',
        pattern: dstPattern,
        window: TimeRange.create(
          new Date('2026-03-01T00:00:00.000Z'),
          new Date('2026-03-31T23:59:59.999Z'),
        ),
      });

      expect(result.slots).toHaveLength(3);
      // Pre-DST: March 1 (EST = UTC-5) -> 15:00 UTC
      expect(result.slots[0]!.timeRange.start.toISOString()).toBe('2026-03-01T15:00:00.000Z');
      // Post-DST: March 8 (EDT = UTC-4) -> 14:00 UTC (Preserving 10:00 AM local wall-clock)
      expect(result.slots[1]!.timeRange.start.toISOString()).toBe('2026-03-08T14:00:00.000Z');
      // Post-DST: March 15 (EDT = UTC-4) -> 14:00 UTC
      expect(result.slots[2]!.timeRange.start.toISOString()).toBe('2026-03-15T14:00:00.000Z');
    });

    it('DST Fall Back Transition: Preserves 10:00 AM local clinic time across EDT -> EST shift', () => {
      // America/New_York Fall Back: November 1, 2026 (EDT UTC-4 -> EST UTC-5)
      const dstPattern = RecurrencePattern.create({
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: new Date('2026-10-25T14:00:00.000Z'), // Oct 25, 2026 10:00 AM EDT = 14:00 UTC
        maxOccurrences: 3,
        localStartTime: { hour: 10, minute: 0 },
        durationMinutes: 60,
        timezone: 'America/New_York',
      });

      const result = RecurrenceCalculationEngine.calculate({
        seriesId: 'series-dst-fall',
        pattern: dstPattern,
        window: TimeRange.create(
          new Date('2026-10-20T00:00:00.000Z'),
          new Date('2026-11-20T23:59:59.999Z'),
        ),
      });

      expect(result.slots).toHaveLength(3);
      // Pre-FallBack: Oct 25 (EDT = UTC-4) -> 14:00 UTC
      expect(result.slots[0]!.timeRange.start.toISOString()).toBe('2026-10-25T14:00:00.000Z');
      // Post-FallBack: Nov 1 (EST = UTC-5) -> 15:00 UTC (Preserving 10:00 AM local wall-clock)
      expect(result.slots[1]!.timeRange.start.toISOString()).toBe('2026-11-01T15:00:00.000Z');
      // Post-FallBack: Nov 8 (EST = UTC-5) -> 15:00 UTC
      expect(result.slots[2]!.timeRange.start.toISOString()).toBe('2026-11-08T15:00:00.000Z');
    });
  });
});
