import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
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
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { GlobalSanitizationValidationPipe } from '../../common/pipes';
import { SchedulingExceptionFilter } from '../filters/scheduling-exception.filter';

describe('Rooms & Maintenance API Integration Tests (HTTP Pipeline Flow)', () => {
  let app: INestApplication;
  let mockCreateHandler: jest.Mocked<CreateRoomHandler>;
  let mockEditHandler: jest.Mocked<EditRoomHandler>;
  let mockActivateHandler: jest.Mocked<ActivateRoomHandler>;
  let mockDeactivateHandler: jest.Mocked<DeactivateRoomHandler>;
  let mockScheduleMaintenanceHandler: jest.Mocked<ScheduleMaintenanceHandler>;
  let mockCancelMaintenanceHandler: jest.Mocked<CancelMaintenanceHandler>;
  let mockGetRoomHandler: jest.Mocked<GetRoomHandler>;
  let mockListRoomsHandler: jest.Mocked<ListRoomsHandler>;
  let mockCheckAvailabilityHandler: jest.Mocked<CheckRoomAvailabilityHandler>;

  const mockRoomDto = {
    id: 'room_integ_1',
    name: 'Hydrotherapy Suite 1',
    capacity: 2,
    status: 'AVAILABLE',
    resourceType: 'ROOM',
    features: ['hydrotherapy_tub', 'soundproof'],
    maintenanceWindows: [],
    version: 1,
    createdAt: '2026-08-15T08:00:00.000Z',
    updatedAt: '2026-08-15T08:00:00.000Z',
  };

  beforeAll(async () => {
    mockCreateHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateRoomHandler>;
    mockEditHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<EditRoomHandler>;
    mockActivateHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ActivateRoomHandler>;
    mockDeactivateHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<DeactivateRoomHandler>;
    mockScheduleMaintenanceHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ScheduleMaintenanceHandler>;
    mockCancelMaintenanceHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CancelMaintenanceHandler>;
    mockGetRoomHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetRoomHandler>;
    mockListRoomsHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListRoomsHandler>;
    mockCheckAvailabilityHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CheckRoomAvailabilityHandler>;

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [RoomsController],
      providers: [
        { provide: CreateRoomHandler, useValue: mockCreateHandler },
        { provide: EditRoomHandler, useValue: mockEditHandler },
        { provide: ActivateRoomHandler, useValue: mockActivateHandler },
        { provide: DeactivateRoomHandler, useValue: mockDeactivateHandler },
        { provide: ScheduleMaintenanceHandler, useValue: mockScheduleMaintenanceHandler },
        { provide: CancelMaintenanceHandler, useValue: mockCancelMaintenanceHandler },
        { provide: GetRoomHandler, useValue: mockGetRoomHandler },
        { provide: ListRoomsHandler, useValue: mockListRoomsHandler },
        { provide: CheckRoomAvailabilityHandler, useValue: mockCheckAvailabilityHandler },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new SchedulingExceptionFilter());
    app.useGlobalPipes(new GlobalSanitizationValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/scheduling/rooms', () => {
    it('returns 201 Created on valid room creation payload', async () => {
      mockCreateHandler.execute.mockResolvedValueOnce(ApplicationResult.ok(mockRoomDto));

      const response = await request(app.getHttpServer())
        .post('/api/v1/scheduling/rooms')
        .send({
          name: 'Hydrotherapy Suite 1',
          capacity: 2,
          features: ['hydrotherapy_tub', 'soundproof'],
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBe('room_integ_1');
      expect(response.body.name).toBe('Hydrotherapy Suite 1');
    });

    it('returns 400 Bad Request on empty room name', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/scheduling/rooms').send({
        name: '',
        capacity: 2,
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/scheduling/rooms', () => {
    it('returns 200 OK with list of rooms', async () => {
      mockListRoomsHandler.execute.mockResolvedValueOnce(ApplicationResult.ok([mockRoomDto]));

      const response = await request(app.getHttpServer())
        .get('/api/v1/scheduling/rooms')
        .query({ status: 'AVAILABLE' });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body[0].id).toBe('room_integ_1');
    });
  });

  describe('GET /api/v1/scheduling/rooms/availability', () => {
    it('returns 200 OK with availability report', async () => {
      mockCheckAvailabilityHandler.execute.mockResolvedValueOnce(
        ApplicationResult.ok({
          isAvailable: true,
          roomId: 'room_integ_1',
          availableRooms: [mockRoomDto],
          conflicts: [],
        }),
      );

      const response = await request(app.getHttpServer())
        .get('/api/v1/scheduling/rooms/availability')
        .query({
          startTime: '2026-09-01T10:00:00.000Z',
          endTime: '2026-09-01T11:00:00.000Z',
          roomId: 'room_integ_1',
        });

      expect(response.status).toBe(200);
      expect(response.body.isAvailable).toBe(true);
      expect(response.body.availableRooms).toHaveLength(1);
    });
  });

  describe('POST /api/v1/scheduling/rooms/:id/maintenance', () => {
    it('returns 201 Created on scheduling maintenance', async () => {
      const roomWithMaintenance = {
        ...mockRoomDto,
        maintenanceWindows: [
          {
            id: 'maint_1',
            roomId: 'room_integ_1',
            startTime: '2026-09-01T12:00:00.000Z',
            endTime: '2026-09-01T14:00:00.000Z',
            reason: 'Deep sanitization',
            createdAt: '2026-08-15T08:00:00.000Z',
          },
        ],
      };
      mockScheduleMaintenanceHandler.execute.mockResolvedValueOnce(
        ApplicationResult.ok(roomWithMaintenance),
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/scheduling/rooms/room_integ_1/maintenance')
        .send({
          startTime: '2026-09-01T12:00:00.000Z',
          endTime: '2026-09-01T14:00:00.000Z',
          reason: 'Deep sanitization',
        });

      expect(response.status).toBe(201);
      expect(response.body.maintenanceWindows).toHaveLength(1);
    });
  });

  describe('DELETE /api/v1/scheduling/rooms/:id/maintenance/:maintenanceId', () => {
    it('returns 200 OK when cancelling maintenance', async () => {
      mockCancelMaintenanceHandler.execute.mockResolvedValueOnce(ApplicationResult.ok(mockRoomDto));

      const response = await request(app.getHttpServer()).delete(
        '/api/v1/scheduling/rooms/room_integ_1/maintenance/maint_1',
      );

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('room_integ_1');
    });
  });
});
