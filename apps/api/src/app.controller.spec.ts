import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaService } from './platform/persistence/prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  let mockPrismaService: {
    $queryRawUnsafe: jest.Mock;
  };

  beforeEach(async () => {
    mockPrismaService = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('getHealth', () => {
    it('should return status ok and connected database when database ping succeeds', async () => {
      const result = await appController.getHealth();
      expect(result.status).toBe('ok');
      expect(typeof result.timestamp).toBe('string');
      expect(typeof result.uptime).toBe('number');
      expect(result.database?.status).toBe('connected');
      expect(typeof result.database?.latencyMs).toBe('number');
      expect(mockPrismaService.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
    });

    it('should return status degraded when database ping throws error', async () => {
      mockPrismaService.$queryRawUnsafe.mockRejectedValueOnce(new Error('Connection lost'));
      const result = await appController.getHealth();
      expect(result.status).toBe('degraded');
      expect(result.database?.status).toBe('disconnected');
    });

    it('should operate safely if prisma is not injected', async () => {
      const standaloneController = new AppController(undefined);
      const result = await standaloneController.getHealth();
      expect(result.status).toBe('ok');
      expect(result.database).toBeUndefined();
    });
  });

  describe('getLiveness', () => {
    it('should return status ok without pinging database', () => {
      const result = appController.getLiveness();
      expect(result.status).toBe('ok');
      expect(typeof result.timestamp).toBe('string');
      expect(typeof result.uptime).toBe('number');
      expect(mockPrismaService.$queryRawUnsafe).not.toHaveBeenCalled();
    });
  });

  describe('getReadiness', () => {
    it('should return status ok when database is reachable', async () => {
      const result = await appController.getReadiness();
      expect(result.status).toBe('ok');
      expect(result.database).toBe('ready');
      expect(typeof result.latencyMs).toBe('number');
    });

    it('should throw ServiceUnavailableException when database is unreachable', async () => {
      mockPrismaService.$queryRawUnsafe.mockRejectedValueOnce(
        new Error('Database connection refused'),
      );
      await expect(appController.getReadiness()).rejects.toThrow(ServiceUnavailableException);
    });

    it('should return status ok if prisma is not injected', async () => {
      const standaloneController = new AppController(undefined);
      const result = await standaloneController.getReadiness();
      expect(result.status).toBe('ok');
      expect(result.database).toBe('ready');
    });
  });
});
