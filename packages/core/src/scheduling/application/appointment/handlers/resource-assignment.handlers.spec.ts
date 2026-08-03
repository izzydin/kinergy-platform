import { AssignTherapistHandler } from './assign-therapist.handler';
import { AssignRoomHandler } from './assign-room.handler';
import { AddAppointmentNoteHandler } from './add-appointment-note.handler';
import { AssignTherapistCommand } from '../commands/assign-therapist.command';
import { AssignRoomCommand } from '../commands/assign-room.command';
import { AddAppointmentNoteCommand } from '../commands/add-appointment-note.command';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { TherapistScheduleRepository } from '../../../domain/repositories/therapist-schedule.repository';
import { RoomRepository } from '../../../domain/repositories/room.repository';
import { ConflictDetectionService } from '../../../domain/services/conflict-detection.service';
import { TherapistAvailabilitySpecification } from '../../../domain/specifications/therapist-availability.specification';
import { RoomAvailabilitySpecification } from '../../../domain/specifications/room-availability.specification';
import { TestClock } from '../../../domain/shared/clock';
import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import {
  AppointmentType,
  AppointmentTypeEnum,
} from '../../../domain/value-objects/appointment-type.vo';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { AppointmentId } from '../../../domain/appointment/appointment-id.vo';
import { Room } from '../../../domain/room/room.aggregate';
import { RoomId } from '../../../domain/room/room-id.vo';
import { RoomStatus } from '../../../domain/value-objects/room-status.enum';

describe('Resource Assignment & Note Command Handlers', () => {
  let mockApptRepo: jest.Mocked<AppointmentRepository>;
  let mockScheduleRepo: jest.Mocked<TherapistScheduleRepository>;
  let mockRoomRepo: jest.Mocked<RoomRepository>;
  let mockConflictService: jest.Mocked<ConflictDetectionService>;
  let therapistSpec: TherapistAvailabilitySpecification;
  let roomSpec: RoomAvailabilitySpecification;
  const clock = new TestClock(new Date('2026-08-03T10:00:00.000Z'));
  const apptType = AppointmentType.create(AppointmentTypeEnum.TREATMENT);
  const initialTimeRange = TimeRange.create(
    new Date('2026-08-03T11:00:00.000Z'),
    new Date('2026-08-03T12:00:00.000Z'),
  );

  beforeEach(() => {
    mockApptRepo = {
      findById: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      findConflictingAppointments: jest.fn(),
      findAppointmentsForTherapist: jest.fn(),
      findAppointmentsForRoom: jest.fn(),
      findAppointmentsForClient: jest.fn(),
    };

    mockScheduleRepo = {
      findByTherapistId: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };

    mockRoomRepo = {
      findById: jest.fn().mockResolvedValue(null),
      findAvailableRooms: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
    };

    mockConflictService = {
      detectConflicts: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ConflictDetectionService>;

    therapistSpec = new TherapistAvailabilitySpecification();
    roomSpec = new RoomAvailabilitySpecification();
  });

  describe('AssignTherapistHandler', () => {
    it('should reassign therapist and persist aggregate', async () => {
      const appt = Appointment.create(
        {
          id: AppointmentId.create('appt_1'),
          clientId: 'client_1',
          therapistId: 'therapist_old',
          roomId: 'room_1',
          type: apptType,
          timeRange: initialTimeRange,
        },
        clock,
      );

      mockApptRepo.findById.mockResolvedValueOnce(appt);
      const handler = new AssignTherapistHandler(
        mockApptRepo,
        mockScheduleRepo,
        mockConflictService,
        therapistSpec,
        clock,
      );

      const command = new AssignTherapistCommand({
        appointmentId: 'appt_1',
        newTherapistId: 'therapist_new',
        expectedVersion: 1,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().therapistId).toBe('therapist_new');
      expect(mockApptRepo.save).toHaveBeenCalledTimes(1);
    });

    it('should fail on version mismatch', async () => {
      const appt = Appointment.create(
        {
          id: AppointmentId.create('appt_1'),
          clientId: 'client_1',
          therapistId: 'therapist_old',
          roomId: 'room_1',
          type: apptType,
          timeRange: initialTimeRange,
        },
        clock,
      );

      mockApptRepo.findById.mockResolvedValueOnce(appt);
      const handler = new AssignTherapistHandler(
        mockApptRepo,
        mockScheduleRepo,
        mockConflictService,
        therapistSpec,
        clock,
      );

      const command = new AssignTherapistCommand({
        appointmentId: 'appt_1',
        newTherapistId: 'therapist_new',
        expectedVersion: 999,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('Concurrency version mismatch');
    });
  });

  describe('AssignRoomHandler', () => {
    it('should reassign room when room availability spec is satisfied', async () => {
      const appt = Appointment.create(
        {
          id: AppointmentId.create('appt_2'),
          clientId: 'client_1',
          therapistId: 'therapist_1',
          roomId: 'room_old',
          type: apptType,
          timeRange: initialTimeRange,
        },
        clock,
      );

      const room = Room.create({
        id: RoomId.create('room_new'),
        name: 'Deluxe Suite',
        capacity: 5,
        features: ['HYDROMASSAGE'],
        status: RoomStatus.AVAILABLE,
      });

      mockApptRepo.findById.mockResolvedValueOnce(appt);
      mockRoomRepo.findById.mockResolvedValueOnce(room);

      const handler = new AssignRoomHandler(
        mockApptRepo,
        mockRoomRepo,
        mockConflictService,
        roomSpec,
        clock,
      );

      const command = new AssignRoomCommand({
        appointmentId: 'appt_2',
        newRoomId: 'room_new',
        expectedVersion: 1,
        requiredCapacity: 2,
        requiredFeatures: ['HYDROMASSAGE'],
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().roomId).toBe('room_new');
      expect(mockApptRepo.save).toHaveBeenCalledTimes(1);
    });

    it('should fail when room specification is not satisfied (insufficient capacity)', async () => {
      const appt = Appointment.create(
        {
          id: AppointmentId.create('appt_2'),
          clientId: 'client_1',
          therapistId: 'therapist_1',
          roomId: 'room_old',
          type: apptType,
          timeRange: initialTimeRange,
        },
        clock,
      );

      const smallRoom = Room.create({
        id: RoomId.create('room_small'),
        name: 'Small Room',
        capacity: 1,
        features: [],
        status: RoomStatus.AVAILABLE,
      });

      mockApptRepo.findById.mockResolvedValueOnce(appt);
      mockRoomRepo.findById.mockResolvedValueOnce(smallRoom);

      const handler = new AssignRoomHandler(
        mockApptRepo,
        mockRoomRepo,
        mockConflictService,
        roomSpec,
        clock,
      );

      const command = new AssignRoomCommand({
        appointmentId: 'appt_2',
        newRoomId: 'room_small',
        expectedVersion: 1,
        requiredCapacity: 4,
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('does not satisfy availability');
    });
  });

  describe('AddAppointmentNoteHandler', () => {
    it('should append note to appointment and map in return DTO', async () => {
      const appt = Appointment.create(
        {
          id: AppointmentId.create('appt_3'),
          clientId: 'client_1',
          therapistId: 'therapist_1',
          roomId: 'room_1',
          type: apptType,
          timeRange: initialTimeRange,
        },
        clock,
      );

      mockApptRepo.findById.mockResolvedValueOnce(appt);
      const handler = new AddAppointmentNoteHandler(mockApptRepo, clock);

      const command = new AddAppointmentNoteCommand({
        appointmentId: 'appt_3',
        authorId: 'user_receptionist',
        noteText: 'Client requested extra towels',
        expectedVersion: 1,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      const firstNote = dto.notes?.[0];
      expect(firstNote).toBeDefined();
      expect(firstNote?.authorId).toBe('user_receptionist');
      expect(firstNote?.noteText).toBe('Client requested extra towels');
      expect(mockApptRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
