import { PrismaClient } from '@prisma/client';
import { PrismaRoomRepository } from './prisma-room.repository';
import { PrismaAppointmentRepository } from './prisma-appointment.repository';
import { Room } from '../../../../domain/room/room.aggregate';
import { RoomId } from '../../../../domain/room/room-id.vo';
import { Appointment } from '../../../../domain/appointment/appointment.aggregate';

import { AppointmentId } from '../../../../domain/appointment/appointment-id.vo';
import {
  AppointmentType,
  AppointmentTypeEnum,
} from '../../../../domain/value-objects/appointment-type.vo';
import { TimeRange } from '../../../../domain/value-objects/time-range.vo';
import { TestClock } from '../../../../domain/shared/clock';
import { OptimisticLockException } from '../../../../domain/exceptions/optimistic-lock.exception';

describe('Prisma Room & Schedulable Resource Persistence Guarantees', () => {
  let mockPrisma: jest.Mocked<PrismaClient>;
  let roomRepo: PrismaRoomRepository;
  let apptRepo: PrismaAppointmentRepository;
  let testClock: TestClock;

  const mondayDate = '2026-08-03';

  beforeEach(() => {
    testClock = new TestClock(new Date(`${mondayDate}T08:00:00.000Z`), 'UTC');

    mockPrisma = {
      room: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ id: 'room_1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      maintenanceWindow: {
        findMany: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ id: 'mw_1' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      appointment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ id: 'appt_1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      appointmentNote: {
        upsert: jest.fn().mockResolvedValue({ id: 'note_1' }),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(mockPrisma);
      }),
    } as unknown as jest.Mocked<PrismaClient>;

    roomRepo = new PrismaRoomRepository(mockPrisma);
    apptRepo = new PrismaAppointmentRepository(mockPrisma);
  });

  describe('1. Room CRUD & Aggregate Reconstitution', () => {
    it('creates and persists a new Room aggregate with default features and version 1', async () => {
      const room = Room.create({
        id: RoomId.create('room_suite_1'),
        name: 'Hydrotherapy Suite 1',
        capacity: 2,
        features: ['hydrotherapy_tub', 'soundproof'],
      });

      await roomRepo.save(room);

      expect(mockPrisma.room.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'room_suite_1' },
          create: expect.objectContaining({
            id: 'room_suite_1',
            name: 'Hydrotherapy Suite 1',
            capacity: 2,
            status: 'AVAILABLE',
            resourceType: 'ROOM',
            features: ['hydrotherapy_tub', 'soundproof'],
            version: 1,
          }),
        }),
      );
    });

    it('reconstitutes a Room aggregate with scheduled maintenance windows from persistence', async () => {
      const rawRoom = {
        id: 'room_suite_1',
        name: 'Hydrotherapy Suite 1',
        capacity: 2,
        status: 'AVAILABLE',
        resourceType: 'ROOM',
        features: ['hydrotherapy_tub'],
        maintenanceReason: null,
        version: 1,
        createdAt: new Date(`${mondayDate}T08:00:00.000Z`),
        updatedAt: new Date(`${mondayDate}T08:00:00.000Z`),
        maintenanceWindows: [
          {
            id: 'maint_1',
            roomId: 'room_suite_1',
            startTime: new Date(`${mondayDate}T13:00:00.000Z`),
            endTime: new Date(`${mondayDate}T15:00:00.000Z`),
            reason: 'Ozone water purification',
            createdAt: new Date(`${mondayDate}T08:00:00.000Z`),
            updatedAt: new Date(`${mondayDate}T08:00:00.000Z`),
          },
        ],
      };

      (mockPrisma.room.findUnique as jest.Mock).mockResolvedValueOnce(rawRoom);

      const room = await roomRepo.findById('room_suite_1');

      expect(room).not.toBeNull();
      expect(room!.id.getValue()).toBe('room_suite_1');
      expect(room!.maintenanceWindows).toHaveLength(1);
      expect(room!.maintenanceWindows[0]!.reason).toBe('Ozone water purification');

      expect(
        room!.isUnderMaintenance(
          TimeRange.create(
            new Date(`${mondayDate}T13:30:00.000Z`),
            new Date(`${mondayDate}T14:30:00.000Z`),
          ),
        ),
      ).toBe(true);
    });
  });

  describe('2. Maintenance Windows Synchronization & Cascade Deletion', () => {
    it('persists scheduled maintenance windows and synchronizes removed windows', async () => {
      const room = Room.create({
        id: RoomId.create('room_suite_1'),
        name: 'Suite 1',
        capacity: 1,
      });

      // Schedule 2 maintenance windows
      const mw1 = room.scheduleMaintenance({
        timeRange: TimeRange.create(
          new Date(`${mondayDate}T10:00:00.000Z`),
          new Date(`${mondayDate}T12:00:00.000Z`),
        ),
        reason: 'Window 1',
      });
      room.scheduleMaintenance({
        timeRange: TimeRange.create(
          new Date(`${mondayDate}T14:00:00.000Z`),
          new Date(`${mondayDate}T16:00:00.000Z`),
        ),
        reason: 'Window 2',
      });

      // Advance version to simulate update
      room.deactivate('Maintenance day');
      expect(room.version).toBe(4);

      await roomRepo.save(room);

      // Verify deleteMany called with activeIds
      expect(mockPrisma.maintenanceWindow.deleteMany).toHaveBeenCalledWith({
        where: {
          roomId: 'room_suite_1',
          id: { notIn: expect.arrayContaining([mw1.id]) },
        },
      });

      // Verify upsert called for maintenance windows
      expect(mockPrisma.maintenanceWindow.upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('3. Concurrency Protection & Optimistic Locking', () => {
    it('rejects stale Room mutations when expected version mismatches with OptimisticLockException', async () => {
      const room = Room.create({
        id: RoomId.create('room_concurrency_1'),
        name: 'Suite 1',
        capacity: 1,
      });

      room.deactivate('Electrical work');
      expect(room.version).toBe(2);

      // Database returns count 0 (concurrent request already updated version)
      (mockPrisma.room.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

      await expect(roomRepo.save(room)).rejects.toThrow(OptimisticLockException);
    });
  });

  describe('4. Availability Queries & Feature Filtering', () => {
    it('queries available rooms filtering out maintenance overlaps and matching required features', async () => {
      const queryRange = TimeRange.create(
        new Date(`${mondayDate}T10:00:00.000Z`),
        new Date(`${mondayDate}T11:00:00.000Z`),
      );

      (mockPrisma.room.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: 'room_1',
          name: 'Hydro Suite',
          capacity: 2,
          status: 'AVAILABLE',
          resourceType: 'ROOM',
          features: ['hydrotherapy_tub'],
          maintenanceReason: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          maintenanceWindows: [],
        },
      ]);

      const rooms = await roomRepo.findAvailableRooms(queryRange, ['hydrotherapy_tub']);

      expect(rooms).toHaveLength(1);
      expect(rooms[0]!.name).toBe('Hydro Suite');

      expect(mockPrisma.room.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'AVAILABLE',
            features: {
              hasEvery: ['hydrotherapy_tub'],
            },
            maintenanceWindows: {
              none: {
                startTime: { lt: queryRange.end },
                endTime: { gt: queryRange.start },
              },
            },
          }),
        }),
      );
    });
  });

  describe('5. Appointment Resource Assignment & Cancellation Release', () => {
    it('persists an appointment referencing roomId and releases the room naturally on cancellation', async () => {
      const appt = Appointment.create(
        {
          id: AppointmentId.create('appt_room_test_1'),
          clientId: 'client_1',
          therapistId: 'therapist_1',
          roomId: 'room_1',
          type: AppointmentType.create(AppointmentTypeEnum.ASSESSMENT),
          timeRange: TimeRange.create(
            new Date(`${mondayDate}T10:00:00.000Z`),
            new Date(`${mondayDate}T11:00:00.000Z`),
          ),
        },
        testClock,
      );

      await apptRepo.save(appt);

      expect(mockPrisma.appointment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            roomId: 'room_1',
            status: 'SCHEDULED',
          }),
        }),
      );

      // Cancel appointment
      appt.cancel('Client rescheduled', testClock);
      expect(appt.version).toBe(2);

      await apptRepo.save(appt);

      expect(mockPrisma.appointment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'appt_room_test_1', version: 1 },
          data: expect.objectContaining({
            status: 'CANCELLED',
            cancellationReason: 'Client rescheduled',
            version: 2,
          }),
        }),
      );
    });
  });
});
