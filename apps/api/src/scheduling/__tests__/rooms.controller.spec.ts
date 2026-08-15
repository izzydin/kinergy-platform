import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RoomsController } from '../controllers/rooms.controller';
import {
  CreateRoomHandler,
  EditRoomHandler,
  ActivateRoomHandler,
  DeactivateRoomHandler,
  ScheduleMaintenanceHandler,
  CancelMaintenanceHandler,
  GetRoomHandler,
  ListRoomsHandler,
  CheckRoomAvailabilityHandler,
  ApplicationResult,
} from '@kinergy-platform/core';

describe('RoomsController Unit Tests', () => {
  let controller: RoomsController;
  let createRoomHandler: jest.Mocked<CreateRoomHandler>;
  let editRoomHandler: jest.Mocked<EditRoomHandler>;
  let activateRoomHandler: jest.Mocked<ActivateRoomHandler>;
  let deactivateRoomHandler: jest.Mocked<DeactivateRoomHandler>;
  let scheduleMaintenanceHandler: jest.Mocked<ScheduleMaintenanceHandler>;
  let cancelMaintenanceHandler: jest.Mocked<CancelMaintenanceHandler>;
  let getRoomHandler: jest.Mocked<GetRoomHandler>;
  let listRoomsHandler: jest.Mocked<ListRoomsHandler>;
  let checkRoomAvailabilityHandler: jest.Mocked<CheckRoomAvailabilityHandler>;

  const mockRoomDto = {
    id: 'room_123',
    name: 'Hydrotherapy Suite 1',
    capacity: 2,
    status: 'AVAILABLE',
    resourceType: 'ROOM',
    features: ['hydrotherapy_tub'],
    maintenanceWindows: [],
    version: 1,
    createdAt: '2026-08-15T08:00:00.000Z',
    updatedAt: '2026-08-15T08:00:00.000Z',
  };

  beforeEach(() => {
    createRoomHandler = {
      execute: jest.fn().mockResolvedValue(ApplicationResult.ok(mockRoomDto)),
    } as unknown as jest.Mocked<CreateRoomHandler>;

    editRoomHandler = {
      execute: jest.fn().mockResolvedValue(ApplicationResult.ok(mockRoomDto)),
    } as unknown as jest.Mocked<EditRoomHandler>;

    activateRoomHandler = {
      execute: jest.fn().mockResolvedValue(ApplicationResult.ok(mockRoomDto)),
    } as unknown as jest.Mocked<ActivateRoomHandler>;

    deactivateRoomHandler = {
      execute: jest
        .fn()
        .mockResolvedValue(ApplicationResult.ok({ ...mockRoomDto, status: 'UNAVAILABLE' })),
    } as unknown as jest.Mocked<DeactivateRoomHandler>;

    scheduleMaintenanceHandler = {
      execute: jest.fn().mockResolvedValue(ApplicationResult.ok(mockRoomDto)),
    } as unknown as jest.Mocked<ScheduleMaintenanceHandler>;

    cancelMaintenanceHandler = {
      execute: jest.fn().mockResolvedValue(ApplicationResult.ok(mockRoomDto)),
    } as unknown as jest.Mocked<CancelMaintenanceHandler>;

    getRoomHandler = {
      execute: jest.fn().mockResolvedValue(ApplicationResult.ok(mockRoomDto)),
    } as unknown as jest.Mocked<GetRoomHandler>;

    listRoomsHandler = {
      execute: jest.fn().mockResolvedValue(ApplicationResult.ok([mockRoomDto])),
    } as unknown as jest.Mocked<ListRoomsHandler>;

    checkRoomAvailabilityHandler = {
      execute: jest.fn().mockResolvedValue(
        ApplicationResult.ok({
          isAvailable: true,
          roomId: 'room_123',
          availableRooms: [mockRoomDto],
          conflicts: [],
        }),
      ),
    } as unknown as jest.Mocked<CheckRoomAvailabilityHandler>;

    controller = new RoomsController(
      createRoomHandler,
      editRoomHandler,
      activateRoomHandler,
      deactivateRoomHandler,
      scheduleMaintenanceHandler,
      cancelMaintenanceHandler,
      getRoomHandler,
      listRoomsHandler,
      checkRoomAvailabilityHandler,
    );
  });

  describe('createRoom', () => {
    it('successfully delegates creation to CreateRoomHandler', async () => {
      const result = await controller.createRoom({
        name: 'Hydrotherapy Suite 1',
        capacity: 2,
        features: ['hydrotherapy_tub'],
      });

      expect(result.id).toBe('room_123');
      expect(createRoomHandler.execute).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequestException when handler fails', async () => {
      createRoomHandler.execute.mockResolvedValueOnce(
        ApplicationResult.fail('Room name cannot be empty.'),
      );

      await expect(controller.createRoom({ name: '', capacity: 1 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('editRoom', () => {
    it('successfully delegates edit to EditRoomHandler', async () => {
      const result = await controller.editRoom('room_123', {
        name: 'Suite Renamed',
        expectedVersion: 1,
      });

      expect(result.id).toBe('room_123');
      expect(editRoomHandler.execute).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when room does not exist', async () => {
      editRoomHandler.execute.mockResolvedValueOnce(
        ApplicationResult.fail("Room with id 'missing' not found."),
      );

      await expect(controller.editRoom('missing', { name: 'Suite' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('activateRoom & deactivateRoom', () => {
    it('activates a room', async () => {
      const result = await controller.activateRoom('room_123', {});
      expect(result.status).toBe('AVAILABLE');
      expect(activateRoomHandler.execute).toHaveBeenCalledTimes(1);
    });

    it('deactivates a room', async () => {
      const result = await controller.deactivateRoom('room_123', { reason: 'Sanitization' });
      expect(result.status).toBe('UNAVAILABLE');
      expect(deactivateRoomHandler.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('scheduleMaintenance & cancelMaintenance', () => {
    it('schedules a maintenance window', async () => {
      const result = await controller.scheduleMaintenance('room_123', {
        startTime: '2026-09-01T12:00:00.000Z',
        endTime: '2026-09-01T14:00:00.000Z',
        reason: 'Filter replacement',
      });

      expect(result.id).toBe('room_123');
      expect(scheduleMaintenanceHandler.execute).toHaveBeenCalledTimes(1);
    });

    it('cancels a maintenance window', async () => {
      const result = await controller.cancelMaintenance('room_123', 'mw_1');
      expect(result.id).toBe('room_123');
      expect(cancelMaintenanceHandler.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRoom & listRooms', () => {
    it('retrieves room details by id', async () => {
      const result = await controller.getRoom('room_123');
      expect(result.id).toBe('room_123');
      expect(getRoomHandler.execute).toHaveBeenCalledTimes(1);
    });

    it('lists rooms matching filter query', async () => {
      const result = await controller.listRooms({ status: 'AVAILABLE' });
      expect(result).toHaveLength(1);
      expect(listRoomsHandler.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('checkAvailability', () => {
    it('evaluates room availability', async () => {
      const result = await controller.checkAvailability({
        startTime: '2026-09-01T10:00:00.000Z',
        endTime: '2026-09-01T11:00:00.000Z',
        roomId: 'room_123',
      });

      expect(result.isAvailable).toBe(true);
      expect(checkRoomAvailabilityHandler.execute).toHaveBeenCalledTimes(1);
    });
  });
});
