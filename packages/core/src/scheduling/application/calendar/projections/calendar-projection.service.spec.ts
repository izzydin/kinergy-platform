import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import { TestClock } from '../../../domain/shared/clock';
import { AppointmentType } from '../../../domain/value-objects/appointment-type.vo';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { CalendarGridMapper } from '../mappers/calendar-grid.mapper';
import { CalendarProjectionService } from './calendar-projection.service';

describe('CalendarProjectionService & CalendarGridMapper', () => {
  const BASE_DATE = new Date('2026-08-15T00:00:00.000Z');
  let testClock: TestClock;
  let service: CalendarProjectionService;

  beforeEach(() => {
    // Set current test clock to 2026-08-15T10:15:00.000Z (mid-morning)
    testClock = new TestClock(new Date('2026-08-15T10:15:00.000Z'), 'UTC');
    service = new CalendarProjectionService(testClock);
  });

  const createTestAppointment = (
    therapistId: string,
    roomId: string,
    clientId: string,
    startIso: string,
    endIso: string,
    typeStr = 'TREATMENT',
  ): Appointment => {
    const range = TimeRange.create(new Date(startIso), new Date(endIso));
    return Appointment.create({
      clientId,
      therapistId,
      roomId,
      type: AppointmentType.create(typeStr),
      timeRange: range,
    });
  };

  describe('CalendarGridMapper', () => {
    it('generates configurable hour-by-hour time slots', () => {
      const slots30 = CalendarGridMapper.generateTimeSlots(BASE_DATE, {
        intervalMinutes: 30,
        startHour: 9,
        endHour: 11,
      });

      expect(slots30).toHaveLength(4);
      expect(slots30[0]!.startTime.toISOString()).toBe('2026-08-15T09:00:00.000Z');
      expect(slots30[0]!.endTime.toISOString()).toBe('2026-08-15T09:30:00.000Z');
      expect(slots30[3]!.endTime.toISOString()).toBe('2026-08-15T11:00:00.000Z');

      const slots15 = CalendarGridMapper.generateTimeSlots(BASE_DATE, {
        intervalMinutes: 15,
        startHour: 9,
        endHour: 10,
      });
      expect(slots15).toHaveLength(4);
    });

    it('maps appointments to CalendarSlotDTOs and detects resource conflicts', () => {
      // Create 2 overlapping appointments on the same room (Room-A)
      const appt1 = createTestAppointment(
        'therapist_1',
        'room_A',
        'client_101',
        '2026-08-15T09:00:00.000Z',
        '2026-08-15T10:00:00.000Z',
      );

      const appt2 = createTestAppointment(
        'therapist_2',
        'room_A', // Overlapping room!
        'client_102',
        '2026-08-15T09:30:00.000Z',
        '2026-08-15T10:30:00.000Z',
      );

      const mappedSlots = CalendarGridMapper.mapGridSlots({
        date: BASE_DATE,
        appointments: [appt1, appt2],
      });

      expect(mappedSlots).toHaveLength(2);
      expect(mappedSlots[0]!.hasConflict).toBe(true);
      expect(mappedSlots[1]!.hasConflict).toBe(true);
      expect(mappedSlots[0]!.overlapCount).toBe(2);
    });
  });

  describe('CalendarProjectionService Daily & Weekly Agenda', () => {
    it('projects DailyAgendaDTO tagged with real-time operational status (PAST, CURRENT_NOW, UPCOMING)', () => {
      // Clock is set at 10:15 UTC
      // apptPast: 08:00 - 09:00 -> PAST
      // apptCurrent: 10:00 - 11:00 -> CURRENT_NOW
      // apptUpcoming: 14:00 - 15:00 -> UPCOMING
      const apptPast = createTestAppointment(
        'therapist_1',
        'room_1',
        'client_1',
        '2026-08-15T08:00:00.000Z',
        '2026-08-15T09:00:00.000Z',
      );
      const apptCurrent = createTestAppointment(
        'therapist_1',
        'room_1',
        'client_2',
        '2026-08-15T10:00:00.000Z',
        '2026-08-15T11:00:00.000Z',
      );
      const apptUpcoming = createTestAppointment(
        'therapist_2',
        'room_2',
        'client_3',
        '2026-08-15T14:00:00.000Z',
        '2026-08-15T15:00:00.000Z',
      );

      const dailyAgenda = service.projectDailyAgenda({
        date: BASE_DATE,
        appointments: [apptPast, apptCurrent, apptUpcoming],
      });

      expect(dailyAgenda.date).toBe('2026-08-15');
      expect(dailyAgenda.totalAppointments).toBe(3);
      expect(dailyAgenda.summaryByStatus['SCHEDULED']).toBe(3);

      const slots = dailyAgenda.slots;
      expect(slots).toHaveLength(3);

      const pastSlot = slots.find((s) => s.appointmentId === apptPast.id.getValue());
      const currentSlot = slots.find((s) => s.appointmentId === apptCurrent.id.getValue());
      const upcomingSlot = slots.find((s) => s.appointmentId === apptUpcoming.id.getValue());

      expect(pastSlot?.operationalStatus).toBe('PAST');
      expect(currentSlot?.operationalStatus).toBe('CURRENT_NOW');
      expect(upcomingSlot?.operationalStatus).toBe('UPCOMING');

      // Check grouping maps
      expect(dailyAgenda.appointmentsByTherapist['therapist_1']).toHaveLength(2);
      expect(dailyAgenda.appointmentsByTherapist['therapist_2']).toHaveLength(1);
      expect(dailyAgenda.appointmentsByRoom['room_1']).toHaveLength(2);
    });

    it('filters daily agenda by therapistId and roomId', () => {
      const appt1 = createTestAppointment(
        'therapist_alpha',
        'room_1',
        'client_1',
        '2026-08-15T09:00:00.000Z',
        '2026-08-15T10:00:00.000Z',
      );
      const appt2 = createTestAppointment(
        'therapist_beta',
        'room_2',
        'client_2',
        '2026-08-15T11:00:00.000Z',
        '2026-08-15T12:00:00.000Z',
      );

      const therapistAgenda = service.projectDailyAgenda({
        date: BASE_DATE,
        therapistId: 'therapist_alpha',
        appointments: [appt1, appt2],
      });

      expect(therapistAgenda.totalAppointments).toBe(1);
      expect(therapistAgenda.slots[0]!.therapistId).toBe('therapist_alpha');
    });

    it('projects a 7-day WeeklyAgendaDTO', () => {
      const apptDay0 = createTestAppointment(
        'therapist_1',
        'room_1',
        'client_1',
        '2026-08-15T10:00:00.000Z',
        '2026-08-15T11:00:00.000Z',
      );

      const apptDay3 = createTestAppointment(
        'therapist_1',
        'room_1',
        'client_2',
        '2026-08-18T14:00:00.000Z',
        '2026-08-18T15:00:00.000Z',
      );

      const weeklyAgenda = service.projectWeeklyAgenda({
        startDate: BASE_DATE,
        appointments: [apptDay0, apptDay3],
      });

      expect(weeklyAgenda.dailyAgendas).toHaveLength(7);
      expect(weeklyAgenda.totalAppointments).toBe(2);
      expect(weeklyAgenda.dailyAgendas[0]!.totalAppointments).toBe(1);
      expect(weeklyAgenda.dailyAgendas[3]!.totalAppointments).toBe(1);
      expect(weeklyAgenda.dailyAgendas[1]!.totalAppointments).toBe(0);
    });
  });
});
