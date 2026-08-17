import { CreateTreatmentSessionFromAppointmentHandler } from './create-treatment-session-from-appointment.handler';
import { CreateTreatmentSessionFromAppointmentCommand } from '../commands/create-treatment-session-from-appointment.command';
import { ISchedulingAppointmentLookupPort } from '../ports/scheduling-appointment-lookup.port';
import { AppointmentReferenceDTO } from '../dtos/appointment-reference.dto';
import { ITreatmentSessionRepository } from '../../domain/repositories/treatment-session.repository';
import { TreatmentSession } from '../../domain/treatment-session/treatment-session.aggregate';
import { SessionId } from '../../domain/treatment-session/session-id.vo';
import { TestClock } from '../../domain/shared/clock';

class InMemoryTreatmentSessionRepository implements ITreatmentSessionRepository {
  private sessions = new Map<string, TreatmentSession>();

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
    this.sessions.set(session.id.getValue(), session);
  }
}

class MockSchedulingAppointmentLookupPort implements ISchedulingAppointmentLookupPort {
  public mockReference: AppointmentReferenceDTO | null = null;

  async getAppointmentReference(appointmentId: string): Promise<AppointmentReferenceDTO | null> {
    if (this.mockReference && this.mockReference.appointmentId === appointmentId) {
      return this.mockReference;
    }
    return null;
  }
}

describe('CreateTreatmentSessionFromAppointmentHandler', () => {
  let repository: InMemoryTreatmentSessionRepository;
  let lookupPort: MockSchedulingAppointmentLookupPort;
  let clock: TestClock;
  let handler: CreateTreatmentSessionFromAppointmentHandler;
  const now = new Date('2026-08-17T10:00:00.000Z');

  beforeEach(() => {
    repository = new InMemoryTreatmentSessionRepository();
    lookupPort = new MockSchedulingAppointmentLookupPort();
    clock = new TestClock(now);
    handler = new CreateTreatmentSessionFromAppointmentHandler(lookupPort, repository, clock);
  });

  it('should successfully create a TreatmentSession in SCHEDULED status from an eligible appointment', async () => {
    lookupPort.mockReference = {
      appointmentId: 'appt_123',
      clientId: 'client_456',
      therapistId: 'therapist_789',
      scheduledAt: new Date('2026-08-17T11:00:00.000Z'),
      isEligibleForSession: true,
    };

    const command = new CreateTreatmentSessionFromAppointmentCommand({
      appointmentId: 'appt_123',
      initialNotes: 'Client presenting with acute left shoulder pain.',
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.appointmentId).toBe('appt_123');
    expect(dto.clientId).toBe('client_456');
    expect(dto.therapistId).toBe('therapist_789');
    expect(dto.status).toBe('SCHEDULED');
    expect(dto.version).toBe(1);
    expect(dto.notes.rawText).toBe('Client presenting with acute left shoulder pain.');

    const saved = await repository.findByAppointmentId('appt_123');
    expect(saved).not.toBeNull();
    expect(saved?.id.getValue()).toBe(dto.id);
  });

  it('should successfully auto-start the session into IN_PROGRESS status when autoStart is true', async () => {
    lookupPort.mockReference = {
      appointmentId: 'appt_123',
      clientId: 'client_456',
      therapistId: 'therapist_789',
      scheduledAt: new Date('2026-08-17T11:00:00.000Z'),
      isEligibleForSession: true,
    };

    const command = new CreateTreatmentSessionFromAppointmentCommand({
      appointmentId: 'appt_123',
      autoStart: true,
    });

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.status).toBe('IN_PROGRESS');
    expect(dto.version).toBe(2); // create (v1) -> start (v2)
  });

  it('should reject creation when appointment ID is empty', async () => {
    const command = new CreateTreatmentSessionFromAppointmentCommand({
      appointmentId: '   ',
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toContain('Appointment ID cannot be empty');
  });

  it('should reject creation when appointment is not found in Scheduling', async () => {
    lookupPort.mockReference = null;

    const command = new CreateTreatmentSessionFromAppointmentCommand({
      appointmentId: 'appt_non_existent',
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBe("Appointment with ID 'appt_non_existent' was not found.");
  });

  it('should reject creation when appointment is ineligible (e.g. cancelled or rental)', async () => {
    lookupPort.mockReference = {
      appointmentId: 'appt_123',
      clientId: 'client_456',
      therapistId: 'therapist_789',
      scheduledAt: new Date('2026-08-17T11:00:00.000Z'),
      isEligibleForSession: false,
      ineligibilityReason:
        "Appointment is in 'CANCELLED' status and cannot initiate a treatment session.",
    };

    const command = new CreateTreatmentSessionFromAppointmentCommand({
      appointmentId: 'appt_123',
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBe(
      "Appointment is in 'CANCELLED' status and cannot initiate a treatment session.",
    );
  });

  it('should reject duplicate creation when a TreatmentSession already exists for the appointment', async () => {
    lookupPort.mockReference = {
      appointmentId: 'appt_123',
      clientId: 'client_456',
      therapistId: 'therapist_789',
      scheduledAt: new Date('2026-08-17T11:00:00.000Z'),
      isEligibleForSession: true,
    };

    // Pre-populate repository with existing session
    const existing = TreatmentSession.create(
      {
        clientId: 'client_456',
        therapistId: 'therapist_789',
        appointmentId: 'appt_123',
      },
      clock,
    );
    await repository.save(existing);

    const command = new CreateTreatmentSessionFromAppointmentCommand({
      appointmentId: 'appt_123',
    });

    const result = await handler.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBe("A TreatmentSession already exists for appointment 'appt_123'.");
  });
});
