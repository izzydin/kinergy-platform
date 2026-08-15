import { Room } from '../../../domain/room/room.aggregate';
import { RoomId } from '../../../domain/room/room-id.vo';
import { RoomRepository } from '../../../domain/repositories/room.repository';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import { AppointmentId } from '../../../domain/appointment/appointment-id.vo';
import {
  AppointmentType,
  AppointmentTypeEnum,
} from '../../../domain/value-objects/appointment-type.vo';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { TestClock } from '../../../domain/shared/clock';
import { OptimisticLockException } from '../../../domain/exceptions/optimistic-lock.exception';

// Handlers
import { CreateRoomHandler } from './create-room.handler';
import { EditRoomHandler } from './edit-room.handler';
import { ActivateRoomHandler } from './activate-room.handler';
import { DeactivateRoomHandler } from './deactivate-room.handler';
import { ScheduleMaintenanceHandler } from './schedule-maintenance.handler';
import { CancelMaintenanceHandler } from './cancel-maintenance.handler';
import { GetRoomHandler } from './get-room.handler';
import { ListRoomsHandler } from './list-rooms.handler';
import { CheckRoomAvailabilityHandler } from './check-room-availability.handler';

// Commands & Queries
import { CreateRoomCommand } from '../commands/create-room.command';
import { EditRoomCommand } from '../commands/edit-room.command';
import { ActivateRoomCommand } from '../commands/activate-room.command';
import { DeactivateRoomCommand } from '../commands/deactivate-room.command';
import { ScheduleMaintenanceCommand } from '../commands/schedule-maintenance.command';
import { CancelMaintenanceCommand } from '../commands/cancel-maintenance.command';
import { GetRoomQuery } from '../queries/get-room.query';
import { ListRoomsQuery } from '../queries/list-rooms.query';
import { CheckRoomAvailabilityQuery } from '../queries/check-room-availability.query';

describe('Room & Resource Management Application Layer Use Cases', () => {
  let roomRepo: jest.Mocked<RoomRepository>;
  let apptRepo: jest.Mocked<AppointmentRepository>;
  let clock: TestClock;

  const baseDate = '2026-08-10';

  beforeEach(() => {
    clock = new TestClock(new Date(`${baseDate}T08:00:00.000Z`), 'UTC');

    roomRepo = {
      findById: jest.fn(),
      findAvailableRooms: jest.fn(),
      findAll: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };

    apptRepo = {
      findById: jest.fn(),
      findAppointmentsForTherapist: jest.fn().mockResolvedValue([]),
      findAppointmentsForRoom: jest.fn().mockResolvedValue([]),
      findAppointmentsForClient: jest.fn().mockResolvedValue([]),
      findConflictingAppointments: jest.fn().mockResolvedValue([]),
      findAppointmentsByRange: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue(undefined),
    };
  });

  describe('1. CreateRoomHandler', () => {
    it('successfully creates and saves a new Room aggregate with DTO mapping', async () => {
      const handler = new CreateRoomHandler(roomRepo);
      const command = new CreateRoomCommand({
        name: 'Cryotherapy Chamber 1',
        capacity: 2,
        features: ['cryo_pod', 'monitoring'],
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const val = result.getValue();
      expect(val.name).toBe('Cryotherapy Chamber 1');
      expect(val.capacity).toBe(2);
      expect(val.features).toEqual(expect.arrayContaining(['cryo_pod', 'monitoring']));
      expect(val.status).toBe('AVAILABLE');
      expect(roomRepo.save).toHaveBeenCalledTimes(1);
    });

    it('fails when room name is empty', async () => {
      const handler = new CreateRoomHandler(roomRepo);
      const result = await handler.execute(new CreateRoomCommand({ name: '   ', capacity: 1 }));

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toContain('Room name cannot be empty.');
      expect(roomRepo.save).not.toHaveBeenCalled();
    });

    it('fails when capacity is not a positive integer', async () => {
      const handler = new CreateRoomHandler(roomRepo);
      const result = await handler.execute(new CreateRoomCommand({ name: 'Suite', capacity: 0 }));

      expect(result.isSuccess).toBe(false);
      expect(result.getError()).toContain('positive integer');
      expect(roomRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('2. EditRoomHandler', () => {
    it('successfully modifies name, capacity, and features', async () => {
      const room = Room.create({
        id: RoomId.create('room_edit_1'),
        name: 'Initial Name',
        capacity: 1,
        features: ['hydrotherapy'],
      });
      roomRepo.findById.mockResolvedValueOnce(room);

      const handler = new EditRoomHandler(roomRepo);
      const command = new EditRoomCommand({
        roomId: 'room_edit_1',
        name: 'Updated Suite Name',
        capacity: 3,
        features: ['hydrotherapy', 'soundproof'],
        expectedVersion: 1,
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const val = result.getValue();
      expect(val.name).toBe('Updated Suite Name');
      expect(val.capacity).toBe(3);
      expect(val.features).toHaveLength(2);
      expect(val.version).toBe(2);
      expect(roomRepo.save).toHaveBeenCalledWith(room);
    });

    it('throws OptimisticLockException on version mismatch', async () => {
      const room = Room.create({
        id: RoomId.create('room_edit_1'),
        name: 'Initial Name',
        capacity: 1,
      });
      roomRepo.findById.mockResolvedValueOnce(room);

      const handler = new EditRoomHandler(roomRepo);
      const command = new EditRoomCommand({
        roomId: 'room_edit_1',
        name: 'Concurrent Edit',
        expectedVersion: 99,
      });

      await expect(handler.execute(command)).rejects.toThrow(OptimisticLockException);
    });
  });

  describe('3. Activate & Deactivate Room Handlers', () => {
    it('deactivates an active room with an explanation reason', async () => {
      const room = Room.create({
        id: RoomId.create('room_status_1'),
        name: 'Suite A',
        capacity: 1,
      });
      roomRepo.findById.mockResolvedValueOnce(room);

      const handler = new DeactivateRoomHandler(roomRepo);
      const result = await handler.execute(
        new DeactivateRoomCommand({
          roomId: 'room_status_1',
          reason: 'Deep sanitization',
        }),
      );

      expect(result.isSuccess).toBe(true);
      const val = result.getValue();
      expect(val.status).toBe('UNAVAILABLE');
      expect(val.maintenanceReason).toBe('Deep sanitization');
      expect(roomRepo.save).toHaveBeenCalledTimes(1);
    });

    it('activates an unavailable room back to AVAILABLE status', async () => {
      const room = Room.create({
        id: RoomId.create('room_status_1'),
        name: 'Suite A',
        capacity: 1,
      });
      room.deactivate('Renovation');
      roomRepo.findById.mockResolvedValueOnce(room);

      const handler = new ActivateRoomHandler(roomRepo);
      const result = await handler.execute(
        new ActivateRoomCommand({
          roomId: 'room_status_1',
        }),
      );

      expect(result.isSuccess).toBe(true);
      const val = result.getValue();
      expect(val.status).toBe('AVAILABLE');
      expect(val.maintenanceReason).toBeUndefined();
      expect(roomRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. Maintenance Scheduling & Cancellation Handlers', () => {
    it('schedules a temporal maintenance window on a room', async () => {
      const room = Room.create({
        id: RoomId.create('room_maint_1'),
        name: 'Hydrotherapy Suite',
        capacity: 1,
      });
      roomRepo.findById.mockResolvedValueOnce(room);

      const handler = new ScheduleMaintenanceHandler(roomRepo);
      const result = await handler.execute(
        new ScheduleMaintenanceCommand({
          roomId: 'room_maint_1',
          startTime: `${baseDate}T12:00:00.000Z`,
          endTime: `${baseDate}T14:00:00.000Z`,
          reason: 'Filter replacement',
        }),
      );

      expect(result.isSuccess).toBe(true);
      const val = result.getValue();
      expect(val.maintenanceWindows).toHaveLength(1);
      expect(val.maintenanceWindows[0]!.reason).toBe('Filter replacement');
      expect(roomRepo.save).toHaveBeenCalledWith(room);
    });

    it('cancels an existing scheduled maintenance window', async () => {
      const room = Room.create({
        id: RoomId.create('room_maint_1'),
        name: 'Hydrotherapy Suite',
        capacity: 1,
      });
      const mw = room.scheduleMaintenance({
        timeRange: TimeRange.create(
          new Date(`${baseDate}T12:00:00.000Z`),
          new Date(`${baseDate}T14:00:00.000Z`),
        ),
        reason: 'Filter replacement',
      });
      roomRepo.findById.mockResolvedValueOnce(room);

      const handler = new CancelMaintenanceHandler(roomRepo);
      const result = await handler.execute(
        new CancelMaintenanceCommand({
          roomId: 'room_maint_1',
          maintenanceWindowId: mw.id,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const val = result.getValue();
      expect(val.maintenanceWindows).toHaveLength(0);
      expect(roomRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('5. Get & List Room Handlers', () => {
    it('retrieves room details by id', async () => {
      const room = Room.create({
        id: RoomId.create('room_query_1'),
        name: 'Suite 1',
        capacity: 2,
      });
      roomRepo.findById.mockResolvedValueOnce(room);

      const handler = new GetRoomHandler(roomRepo);
      const result = await handler.execute(new GetRoomQuery({ roomId: 'room_query_1' }));

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().id).toBe('room_query_1');
    });

    it('lists rooms applying status and feature filters', async () => {
      const roomA = Room.create({
        id: RoomId.create('room_a'),
        name: 'Suite A',
        capacity: 2,
        features: ['tub'],
      });
      const roomB = Room.create({
        id: RoomId.create('room_b'),
        name: 'Suite B',
        capacity: 1,
        features: ['shower'],
      });
      roomB.deactivate('Maintenance');

      roomRepo.findAll.mockResolvedValueOnce([roomA, roomB]);

      const handler = new ListRoomsHandler(roomRepo);
      const result = await handler.execute(
        new ListRoomsQuery({
          status: 'AVAILABLE',
          requiredFeatures: ['tub'],
        }),
      );

      expect(result.isSuccess).toBe(true);
      const val = result.getValue();
      expect(val).toHaveLength(1);
      expect(val[0]!.name).toBe('Suite A');
    });
  });

  describe('6. CheckRoomAvailabilityHandler', () => {
    it('evaluates a single room as available when clear of maintenance and bookings', async () => {
      const room = Room.create({
        id: RoomId.create('room_check_1'),
        name: 'Suite 1',
        capacity: 2,
        features: ['tub'],
      });
      roomRepo.findById.mockResolvedValueOnce(room);
      apptRepo.findAppointmentsForRoom.mockResolvedValueOnce([]);

      const handler = new CheckRoomAvailabilityHandler(roomRepo, apptRepo);
      const result = await handler.execute(
        new CheckRoomAvailabilityQuery({
          roomId: 'room_check_1',
          startTime: `${baseDate}T10:00:00.000Z`,
          endTime: `${baseDate}T11:00:00.000Z`,
          requiredCapacity: 2,
          requiredFeatures: ['tub'],
        }),
      );

      expect(result.isSuccess).toBe(true);
      const val = result.getValue();
      expect(val.isAvailable).toBe(true);
      expect(val.conflicts).toHaveLength(0);
      expect(val.availableRooms).toHaveLength(1);
    });

    it('detects conflicts when room has overlapping maintenance', async () => {
      const room = Room.create({
        id: RoomId.create('room_check_1'),
        name: 'Suite 1',
        capacity: 2,
      });
      room.scheduleMaintenance({
        timeRange: TimeRange.create(
          new Date(`${baseDate}T10:30:00.000Z`),
          new Date(`${baseDate}T12:00:00.000Z`),
        ),
        reason: 'Ozone clean',
      });
      roomRepo.findById.mockResolvedValueOnce(room);
      apptRepo.findAppointmentsForRoom.mockResolvedValueOnce([]);

      const handler = new CheckRoomAvailabilityHandler(roomRepo, apptRepo);
      const result = await handler.execute(
        new CheckRoomAvailabilityQuery({
          roomId: 'room_check_1',
          startTime: `${baseDate}T10:00:00.000Z`,
          endTime: `${baseDate}T11:00:00.000Z`,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const val = result.getValue();
      expect(val.isAvailable).toBe(false);
      expect(val.conflicts).toEqual(
        expect.arrayContaining([expect.stringContaining('Ozone clean')]),
      );
    });

    it('detects conflicts when room is already reserved by another active appointment', async () => {
      const room = Room.create({
        id: RoomId.create('room_check_1'),
        name: 'Suite 1',
        capacity: 2,
      });
      const activeAppt = Appointment.create(
        {
          id: AppointmentId.create('appt_conflict_1'),
          clientId: 'client_1',
          therapistId: 'therapist_1',
          roomId: 'room_check_1',
          type: AppointmentType.create(AppointmentTypeEnum.TREATMENT),
          timeRange: TimeRange.create(
            new Date(`${baseDate}T10:00:00.000Z`),
            new Date(`${baseDate}T11:00:00.000Z`),
          ),
        },
        clock,
      );

      roomRepo.findById.mockResolvedValueOnce(room);
      apptRepo.findAppointmentsForRoom.mockResolvedValueOnce([activeAppt]);

      const handler = new CheckRoomAvailabilityHandler(roomRepo, apptRepo);
      const result = await handler.execute(
        new CheckRoomAvailabilityQuery({
          roomId: 'room_check_1',
          startTime: `${baseDate}T10:30:00.000Z`,
          endTime: `${baseDate}T11:30:00.000Z`,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const val = result.getValue();
      expect(val.isAvailable).toBe(false);
      expect(val.conflicts).toEqual(
        expect.arrayContaining([expect.stringContaining('already reserved')]),
      );
    });

    it('discovers all unreserved rooms matching capacity and feature constraints', async () => {
      const roomA = Room.create({
        id: RoomId.create('room_a'),
        name: 'Suite A',
        capacity: 2,
        features: ['tub'],
      });
      const roomB = Room.create({
        id: RoomId.create('room_b'),
        name: 'Suite B',
        capacity: 2,
        features: ['tub'],
      });

      roomRepo.findAvailableRooms.mockResolvedValueOnce([roomA, roomB]);

      // Room A is free, Room B has active appointment
      const activeAppt = Appointment.create(
        {
          id: AppointmentId.create('appt_b'),
          clientId: 'client_1',
          therapistId: 'therapist_1',
          roomId: 'room_b',
          type: AppointmentType.create(AppointmentTypeEnum.TREATMENT),
          timeRange: TimeRange.create(
            new Date(`${baseDate}T10:00:00.000Z`),
            new Date(`${baseDate}T11:00:00.000Z`),
          ),
        },
        clock,
      );

      apptRepo.findAppointmentsForRoom.mockImplementation(
        async (roomId: string, _range: TimeRange): Promise<Appointment[]> => {
          if (roomId === 'room_b') return [activeAppt];
          return [];
        },
      );

      const handler = new CheckRoomAvailabilityHandler(roomRepo, apptRepo);
      const result = await handler.execute(
        new CheckRoomAvailabilityQuery({
          startTime: `${baseDate}T10:00:00.000Z`,
          endTime: `${baseDate}T11:00:00.000Z`,
          requiredCapacity: 2,
          requiredFeatures: ['tub'],
        }),
      );

      expect(result.isSuccess).toBe(true);
      const val = result.getValue();
      expect(val.isAvailable).toBe(true);
      expect(val.availableRooms).toHaveLength(1);
      expect(val.availableRooms[0]!.id).toBe('room_a');
    });
  });
});
