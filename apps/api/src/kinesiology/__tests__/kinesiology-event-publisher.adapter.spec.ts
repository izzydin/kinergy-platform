import {
  Appointment,
  AppointmentId,
  AppointmentStatus,
  Clock,
  SystemClock,
  TreatmentSession,
  TreatmentSessionCompletedEvent,
  TreatmentSessionStartedEvent,
  AppointmentType,
  TimeRange,
  ITreatmentSessionRepository,
} from '@kinergy-platform/core';
import { PrismaAppointmentRepository } from '@kinergy-platform/core/server';
import { KinesiologyEventPublisherAdapter } from '../infrastructure/kinesiology-event-publisher.adapter';

describe('KinesiologyEventPublisherAdapter Unit Tests', () => {
  let adapter: KinesiologyEventPublisherAdapter;
  let mockAppointmentRepo: jest.Mocked<PrismaAppointmentRepository>;
  let mockSessionRepo: jest.Mocked<ITreatmentSessionRepository>;
  let clock: Clock;

  const createTestAppointment = (
    status: AppointmentStatus = AppointmentStatus.CONFIRMED,
  ): Appointment => {
    return Appointment.reconstitute({
      id: AppointmentId.create('appt-test-100'),
      clientId: 'client-100',
      therapistId: 'therapist-100',
      roomId: 'room-100',
      type: AppointmentType.create('TREATMENT'),
      status,
      timeRange: TimeRange.create(
        new Date('2026-11-10T10:00:00Z'),
        new Date('2026-11-10T11:00:00Z'),
      ),
      version: 1,
      createdAt: new Date('2026-11-10T08:00:00Z'),
      updatedAt: new Date('2026-11-10T08:00:00Z'),
    });
  };

  beforeEach(() => {
    clock = new SystemClock();
    mockAppointmentRepo = {
      findById: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PrismaAppointmentRepository>;

    mockSessionRepo = {
      findById: jest.fn(),
      findByAppointmentId: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<ITreatmentSessionRepository>;

    adapter = new KinesiologyEventPublisherAdapter(mockAppointmentRepo, mockSessionRepo, clock);
  });

  describe('TreatmentSessionCompletedEvent Handling', () => {
    it('synchronizes a CONFIRMED appointment to COMPLETED state and saves', async () => {
      const appt = createTestAppointment(AppointmentStatus.CONFIRMED);
      mockAppointmentRepo.findById.mockResolvedValueOnce(appt);

      const event = new TreatmentSessionCompletedEvent(
        'sess-1',
        'client-100',
        'therapist-100',
        'appt-test-100',
        2,
        new Date(),
      );

      await adapter.publish(event);

      expect(mockAppointmentRepo.findById).toHaveBeenCalledWith('appt-test-100');
      expect(appt.status).toBe(AppointmentStatus.COMPLETED);
      expect(mockAppointmentRepo.save).toHaveBeenCalled();
    });

    it('synchronizes a SCHEDULED appointment to COMPLETED state and saves', async () => {
      const appt = createTestAppointment(AppointmentStatus.SCHEDULED);
      mockAppointmentRepo.findById.mockResolvedValueOnce(appt);

      const event = new TreatmentSessionCompletedEvent(
        'sess-1',
        'client-100',
        'therapist-100',
        'appt-test-100',
        2,
        new Date(),
      );

      await adapter.publish(event);

      expect(appt.status).toBe(AppointmentStatus.COMPLETED);
      expect(mockAppointmentRepo.save).toHaveBeenCalled();
    });

    it('synchronizes an IN_PROGRESS appointment to COMPLETED state', async () => {
      const appt = createTestAppointment(AppointmentStatus.IN_PROGRESS);
      mockAppointmentRepo.findById.mockResolvedValueOnce(appt);

      const event = new TreatmentSessionCompletedEvent(
        'sess-1',
        'client-100',
        'therapist-100',
        'appt-test-100',
        2,
        new Date(),
      );

      await adapter.publish(event);

      expect(appt.status).toBe(AppointmentStatus.COMPLETED);
      expect(mockAppointmentRepo.save).toHaveBeenCalledTimes(1);
    });

    it('is an idempotent no-op if appointment is already COMPLETED', async () => {
      const appt = createTestAppointment(AppointmentStatus.COMPLETED);
      mockAppointmentRepo.findById.mockResolvedValueOnce(appt);

      const event = new TreatmentSessionCompletedEvent(
        'sess-1',
        'client-100',
        'therapist-100',
        'appt-test-100',
        2,
        new Date(),
      );

      await adapter.publish(event);

      expect(mockAppointmentRepo.save).not.toHaveBeenCalled();
    });

    it('does not complete an appointment in CANCELLED status', async () => {
      const appt = createTestAppointment(AppointmentStatus.CANCELLED);
      mockAppointmentRepo.findById.mockResolvedValueOnce(appt);

      const event = new TreatmentSessionCompletedEvent(
        'sess-1',
        'client-100',
        'therapist-100',
        'appt-test-100',
        2,
        new Date(),
      );

      await adapter.publish(event);

      expect(appt.status).toBe(AppointmentStatus.CANCELLED);
      expect(mockAppointmentRepo.save).not.toHaveBeenCalled();
    });

    it('isolates repository errors and does not throw', async () => {
      mockAppointmentRepo.findById.mockRejectedValueOnce(new Error('Database disconnected'));

      const event = new TreatmentSessionCompletedEvent(
        'sess-1',
        'client-100',
        'therapist-100',
        'appt-test-100',
        2,
        new Date(),
      );

      await expect(adapter.publish(event)).resolves.not.toThrow();
    });
  });

  describe('TreatmentSessionStartedEvent Handling', () => {
    it('synchronizes a CONFIRMED appointment to IN_PROGRESS state', async () => {
      const appt = createTestAppointment(AppointmentStatus.CONFIRMED);
      mockAppointmentRepo.findById.mockResolvedValueOnce(appt);
      mockSessionRepo.findById.mockResolvedValueOnce({
        id: { getValue: () => 'sess-1' },
        appointmentId: 'appt-test-100',
      } as unknown as TreatmentSession);

      const event = new TreatmentSessionStartedEvent(
        'sess-1',
        'client-100',
        'therapist-100',
        1,
        new Date(),
      );

      await adapter.publish(event);

      expect(appt.status).toBe(AppointmentStatus.IN_PROGRESS);
      expect(mockAppointmentRepo.save).toHaveBeenCalled();
    });
  });
});
