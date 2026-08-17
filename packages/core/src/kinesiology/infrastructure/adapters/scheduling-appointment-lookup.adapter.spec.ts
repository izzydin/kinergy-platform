import { SchedulingAppointmentLookupAdapter } from './scheduling-appointment-lookup.adapter';
import { GetAppointmentByIdHandler } from '../../../scheduling/application/appointment/handlers/get-appointment-by-id.handler';
import { AppointmentRepository } from '../../../scheduling/domain/repositories/appointment.repository';
import { Appointment } from '../../../scheduling/domain/appointment/appointment.aggregate';
import { AppointmentId } from '../../../scheduling/domain/appointment/appointment-id.vo';
import {
  AppointmentType,
  AppointmentTypeEnum,
} from '../../../scheduling/domain/value-objects/appointment-type.vo';
import { TimeRange } from '../../../scheduling/domain/value-objects/time-range.vo';
import { TestClock } from '../../../scheduling/domain/shared/clock';

class InMemoryAppointmentRepository implements AppointmentRepository {
  private appointments = new Map<string, Appointment>();

  async findById(id: AppointmentId | string): Promise<Appointment | null> {
    const key = typeof id === 'string' ? id : id.getValue();
    return this.appointments.get(key) ?? null;
  }
  async save(appointment: Appointment): Promise<void> {
    this.appointments.set(appointment.id.getValue(), appointment);
  }
  async findBySeriesId(): Promise<Appointment[]> {
    return [];
  }
  async findConflictingAppointments(): Promise<Appointment[]> {
    return [];
  }
  async findAppointmentsForTherapist(): Promise<Appointment[]> {
    return [];
  }
  async findAppointmentsForRoom(): Promise<Appointment[]> {
    return [];
  }
  async findAppointmentsForClient(): Promise<Appointment[]> {
    return [];
  }
  async findAppointmentsByRange(): Promise<Appointment[]> {
    return [];
  }
}

describe('SchedulingAppointmentLookupAdapter', () => {
  let repository: InMemoryAppointmentRepository;
  let queryHandler: GetAppointmentByIdHandler;
  let adapter: SchedulingAppointmentLookupAdapter;
  let clock: TestClock;
  const now = new Date('2026-08-17T09:00:00.000Z');

  const createAppointment = (type: AppointmentTypeEnum = AppointmentTypeEnum.TREATMENT) => {
    return Appointment.create(
      {
        clientId: 'client_100',
        therapistId: 'therapist_200',
        roomId: 'room_300',
        type: AppointmentType.create(type),
        timeRange: TimeRange.create(
          new Date('2026-08-17T10:00:00.000Z'),
          new Date('2026-08-17T11:00:00.000Z'),
        ),
      },
      clock,
    );
  };

  beforeEach(() => {
    clock = new TestClock(now);
    repository = new InMemoryAppointmentRepository();
    queryHandler = new GetAppointmentByIdHandler(repository);
    adapter = new SchedulingAppointmentLookupAdapter(queryHandler);
  });

  it('should return eligible reference for a valid clinical SCHEDULED appointment', async () => {
    const appt = createAppointment(AppointmentTypeEnum.TREATMENT);
    await repository.save(appt);

    const ref = await adapter.getAppointmentReference(appt.id.getValue());

    expect(ref).not.toBeNull();
    expect(ref?.appointmentId).toBe(appt.id.getValue());
    expect(ref?.clientId).toBe('client_100');
    expect(ref?.therapistId).toBe('therapist_200');
    expect(ref?.isEligibleForSession).toBe(true);
    expect(ref?.ineligibilityReason).toBeUndefined();
  });

  it('should return eligible reference when appointment is CHECKED_IN', async () => {
    const appt = createAppointment(AppointmentTypeEnum.ASSESSMENT);
    appt.checkIn(clock);
    await repository.save(appt);

    const ref = await adapter.getAppointmentReference(appt.id.getValue());

    expect(ref).not.toBeNull();
    expect(ref?.isEligibleForSession).toBe(true);
  });

  it('should return ineligible reference when appointment type is non-clinical (e.g. RENTAL)', async () => {
    const appt = createAppointment(AppointmentTypeEnum.RENTAL);
    await repository.save(appt);

    const ref = await adapter.getAppointmentReference(appt.id.getValue());

    expect(ref).not.toBeNull();
    expect(ref?.isEligibleForSession).toBe(false);
    expect(ref?.ineligibilityReason).toContain(
      "Appointment type 'RENTAL' is not a clinical kinesiology service",
    );
  });

  it('should return ineligible reference when appointment is CANCELLED', async () => {
    const appt = createAppointment(AppointmentTypeEnum.TREATMENT);
    appt.cancel('Patient unwell', clock);
    await repository.save(appt);

    const ref = await adapter.getAppointmentReference(appt.id.getValue());

    expect(ref).not.toBeNull();
    expect(ref?.isEligibleForSession).toBe(false);
    expect(ref?.ineligibilityReason).toContain("Appointment is in 'CANCELLED' status");
  });

  it('should return null when appointment ID is not found', async () => {
    const ref = await adapter.getAppointmentReference('appt_nonexistent');
    expect(ref).toBeNull();
  });
});
