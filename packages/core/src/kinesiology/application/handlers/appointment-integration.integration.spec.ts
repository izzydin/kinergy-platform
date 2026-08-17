import { CreateTreatmentSessionFromAppointmentHandler } from './create-treatment-session-from-appointment.handler';
import { CreateTreatmentSessionFromAppointmentCommand } from '../commands/create-treatment-session-from-appointment.command';
import { SchedulingAppointmentLookupAdapter } from '../../infrastructure/adapters/scheduling-appointment-lookup.adapter';
import { GetAppointmentByIdHandler } from '../../../scheduling/application/appointment/handlers/get-appointment-by-id.handler';
import { AppointmentRepository } from '../../../scheduling/domain/repositories/appointment.repository';
import { Appointment } from '../../../scheduling/domain/appointment/appointment.aggregate';
import { AppointmentId } from '../../../scheduling/domain/appointment/appointment-id.vo';
import {
  AppointmentType,
  AppointmentTypeEnum,
} from '../../../scheduling/domain/value-objects/appointment-type.vo';
import { TimeRange } from '../../../scheduling/domain/value-objects/time-range.vo';
import { ITreatmentSessionRepository } from '../../domain/repositories/treatment-session.repository';
import { TreatmentSession } from '../../domain/treatment-session/treatment-session.aggregate';
import { SessionId } from '../../domain/treatment-session/session-id.vo';
import { PaginatedTreatmentHistoryDTO } from '../dtos/treatment-history-summary.dto';
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

class InMemoryTreatmentSessionRepository implements ITreatmentSessionRepository {
  private sessions = new Map<string, TreatmentSession>();
  private appointmentIndex = new Set<string>();

  async findById(id: SessionId): Promise<TreatmentSession | null> {
    return this.sessions.get(id.getValue()) ?? null;
  }

  async findByAppointmentId(appointmentId: string): Promise<TreatmentSession | null> {
    for (const session of this.sessions.values()) {
      if (session.appointmentId === appointmentId) {
        return session;
      }
    }
    return null;
  }

  async save(session: TreatmentSession): Promise<void> {
    // Simulates database atomic unique index constraint (P2002)
    if (this.appointmentIndex.has(session.appointmentId)) {
      const existing = await this.findByAppointmentId(session.appointmentId);
      if (existing && !existing.id.equals(session.id)) {
        throw new Error(
          `Unique constraint violation: TreatmentSession with appointmentId '${session.appointmentId}' already exists.`,
        );
      }
    }
    this.appointmentIndex.add(session.appointmentId);
    this.sessions.set(session.id.getValue(), session);
  }

  async findHistoryByClientId(): Promise<PaginatedTreatmentHistoryDTO> {
    return {
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    };
  }
}

describe('Appointment to TreatmentSession Integration End-to-End', () => {
  let appointmentRepository: InMemoryAppointmentRepository;
  let sessionRepository: InMemoryTreatmentSessionRepository;
  let getAppointmentByIdHandler: GetAppointmentByIdHandler;
  let aclAdapter: SchedulingAppointmentLookupAdapter;
  let createSessionHandler: CreateTreatmentSessionFromAppointmentHandler;
  let clock: TestClock;
  const now = new Date('2026-08-17T10:00:00.000Z');

  const createSchedulingAppointment = async (
    type: AppointmentTypeEnum = AppointmentTypeEnum.TREATMENT,
  ): Promise<Appointment> => {
    const appt = Appointment.create(
      {
        clientId: 'client_uuid_100',
        therapistId: 'therapist_uuid_200',
        roomId: 'room_uuid_300',
        type: AppointmentType.create(type),
        timeRange: TimeRange.create(
          new Date('2026-08-17T11:00:00.000Z'),
          new Date('2026-08-17T12:00:00.000Z'),
        ),
      },
      clock,
    );
    await appointmentRepository.save(appt);
    return appt;
  };

  beforeEach(() => {
    clock = new TestClock(now);
    appointmentRepository = new InMemoryAppointmentRepository();
    sessionRepository = new InMemoryTreatmentSessionRepository();
    getAppointmentByIdHandler = new GetAppointmentByIdHandler(appointmentRepository);
    aclAdapter = new SchedulingAppointmentLookupAdapter(getAppointmentByIdHandler);
    createSessionHandler = new CreateTreatmentSessionFromAppointmentHandler(
      aclAdapter,
      sessionRepository,
      clock,
    );
  });

  describe('Integration Contract & Field Minimization', () => {
    it('should strictly contain only authorized contract fields and never leak room or recurrence internals', async () => {
      const appt = await createSchedulingAppointment(AppointmentTypeEnum.TREATMENT);
      const ref = await aclAdapter.getAppointmentReference(appt.id.getValue());

      expect(ref).not.toBeNull();
      const keys = Object.keys(ref ?? {}).sort();
      expect(keys).toEqual(
        [
          'appointmentId',
          'clientId',
          'ineligibilityReason',
          'isEligibleForSession',
          'scheduledAt',
          'therapistId',
        ].sort(),
      );

      // Verify prohibited logistics fields are not leaked
      const record = ref as unknown as Record<string, unknown>;
      expect(record['roomId']).toBeUndefined();
      expect(record['seriesId']).toBeUndefined();
      expect(record['turnaroundBuffer']).toBeUndefined();
    });
  });

  describe('Eligibility Matrix & Creation Flows', () => {
    it('should successfully orchestrate TreatmentSession creation from an active checked-in appointment', async () => {
      const appt = await createSchedulingAppointment(AppointmentTypeEnum.ASSESSMENT);
      appt.checkIn(clock);
      await appointmentRepository.save(appt);

      const command = new CreateTreatmentSessionFromAppointmentCommand({
        appointmentId: appt.id.getValue(),
        initialNotes: 'Patient ready in treatment room 1.',
        autoStart: true,
      });

      const result = await createSessionHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const sessionDTO = result.getValue();
      expect(sessionDTO.appointmentId).toBe(appt.id.getValue());
      expect(sessionDTO.clientId).toBe('client_uuid_100');
      expect(sessionDTO.therapistId).toBe('therapist_uuid_200');
      expect(sessionDTO.status).toBe('IN_PROGRESS');
      expect(sessionDTO.version).toBe(2);
      expect(sessionDTO.notes.rawText).toBe('Patient ready in treatment room 1.');

      const persisted = await sessionRepository.findByAppointmentId(appt.id.getValue());
      expect(persisted).not.toBeNull();
      expect(persisted?.status).toBe('IN_PROGRESS');
    });

    it('should reject session creation when originating appointment was cancelled in Scheduling', async () => {
      const appt = await createSchedulingAppointment(AppointmentTypeEnum.TREATMENT);
      appt.cancel('Client called to cancel', clock);
      await appointmentRepository.save(appt);

      const command = new CreateTreatmentSessionFromAppointmentCommand({
        appointmentId: appt.id.getValue(),
      });

      const result = await createSessionHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain("Appointment is in 'CANCELLED' status");

      const persisted = await sessionRepository.findByAppointmentId(appt.id.getValue());
      expect(persisted).toBeNull();
    });

    it('should reject session creation when originating appointment is in NO_SHOW status', async () => {
      const appt = await createSchedulingAppointment(AppointmentTypeEnum.TREATMENT);
      appt.markNoShow('Client absent', clock);
      await appointmentRepository.save(appt);

      const command = new CreateTreatmentSessionFromAppointmentCommand({
        appointmentId: appt.id.getValue(),
      });

      const result = await createSessionHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain("Appointment is in 'NO_SHOW' status");
    });

    it('should reject session creation when originating appointment is in COMPLETED status', async () => {
      const appt = await createSchedulingAppointment(AppointmentTypeEnum.TREATMENT);
      appt.confirm(clock);
      appt.checkIn(clock);
      appt.start(clock);
      appt.complete(clock);
      await appointmentRepository.save(appt);

      const command = new CreateTreatmentSessionFromAppointmentCommand({
        appointmentId: appt.id.getValue(),
      });

      const result = await createSessionHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain("Appointment is in 'COMPLETED' status");
    });

    it('should reject session creation for non-clinical appointment types (e.g. RENTAL and GROUP_CLASS)', async () => {
      const appt = await createSchedulingAppointment(AppointmentTypeEnum.RENTAL);

      const command = new CreateTreatmentSessionFromAppointmentCommand({
        appointmentId: appt.id.getValue(),
      });

      const result = await createSessionHandler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain(
        "Appointment type 'RENTAL' is not a clinical kinesiology service",
      );
    });
  });

  describe('Idempotency, Retries & Concurrency Boundary', () => {
    it('should enforce sequential idempotency and reject duplicate submissions', async () => {
      const appt = await createSchedulingAppointment(AppointmentTypeEnum.TREATMENT);

      const command = new CreateTreatmentSessionFromAppointmentCommand({
        appointmentId: appt.id.getValue(),
      });

      // First attempt succeeds
      const firstResult = await createSessionHandler.execute(command);
      expect(firstResult.isSuccess).toBe(true);

      // Subsequent identical attempts (simulated frontend double-click or network retry) are rejected
      const secondResult = await createSessionHandler.execute(command);
      expect(secondResult.isFailure).toBe(true);
      expect(secondResult.getError()).toContain(
        `A TreatmentSession already exists for appointment '${appt.id.getValue()}'.`,
      );
    });

    it('should prevent concurrent race conditions from creating duplicate sessions', async () => {
      const appt = await createSchedulingAppointment(AppointmentTypeEnum.TREATMENT);

      const command = new CreateTreatmentSessionFromAppointmentCommand({
        appointmentId: appt.id.getValue(),
      });

      // Execute 5 concurrent creation requests simultaneously
      const results = await Promise.all([
        createSessionHandler.execute(command),
        createSessionHandler.execute(command),
        createSessionHandler.execute(command),
        createSessionHandler.execute(command),
        createSessionHandler.execute(command),
      ]);

      const successes = results.filter((r) => r.isSuccess);
      const failures = results.filter((r) => r.isFailure);

      // Exactly one must succeed
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(4);
    });
  });

  describe('Lifecycle Independence & Non-Corruption', () => {
    it('should ensure rescheduling in Scheduling does not mutate an already active TreatmentSession', async () => {
      // 1. Create and start TreatmentSession from a SCHEDULED appointment
      const appt = await createSchedulingAppointment(AppointmentTypeEnum.TREATMENT);

      const command = new CreateTreatmentSessionFromAppointmentCommand({
        appointmentId: appt.id.getValue(),
        autoStart: true,
      });
      const result = await createSessionHandler.execute(command);
      expect(result.isSuccess).toBe(true);

      const session = await sessionRepository.findByAppointmentId(appt.id.getValue());
      expect(session?.status).toBe('IN_PROGRESS');

      // 2. Front desk reschedules appointment in Scheduling (from SCHEDULED status)
      appt.reschedule(
        TimeRange.create(
          new Date('2026-08-18T14:00:00.000Z'),
          new Date('2026-08-18T15:00:00.000Z'),
        ),
        clock,
      );
      await appointmentRepository.save(appt);

      // 3. Verify Kinesiology TreatmentSession is undisturbed
      const unchangedSession = await sessionRepository.findByAppointmentId(appt.id.getValue());
      expect(unchangedSession?.status).toBe('IN_PROGRESS');
      expect(unchangedSession?.version).toBe(2);
    });
  });
});
