import { Controller, Get, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from './platform/rate-limiting';
import { PrismaService } from './platform/persistence/prisma/prisma.service';

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptime: number;
  database?: {
    status: 'connected' | 'disconnected';
    latencyMs?: number;
  };
}

export interface LivenessResponse {
  status: 'ok';
  timestamp: string;
  uptime: number;
}

export interface ReadinessResponse {
  status: 'ok' | 'error';
  timestamp: string;
  database: 'ready' | 'unavailable';
  latencyMs?: number;
}

@ApiTags('Health')
@Controller('health')
export class AppController {
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  @Get()
  @SkipThrottle()
  @ApiOperation({ summary: 'Get application general health status' })
  @ApiResponse({ status: 200, description: 'Application is operational.' })
  @ApiResponse({ status: 503, description: 'Application dependencies degraded.' })
  async getHealth(): Promise<HealthResponse> {
    const uptime = process.uptime();
    const timestamp = new Date().toISOString();

    if (!this.prisma) {
      return {
        status: 'ok',
        timestamp,
        uptime,
      };
    }

    try {
      const start = Date.now();
      await Promise.race([
        this.prisma.$queryRawUnsafe('SELECT 1'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Database ping timeout (2000ms)')), 2000),
        ),
      ]);
      const latencyMs = Date.now() - start;

      return {
        status: 'ok',
        timestamp,
        uptime,
        database: {
          status: 'connected',
          latencyMs,
        },
      };
    } catch {
      return {
        status: 'degraded',
        timestamp,
        uptime,
        database: {
          status: 'disconnected',
        },
      };
    }
  }

  @Get('liveness')
  @SkipThrottle()
  @ApiOperation({ summary: 'Kubernetes/Orchestrator liveness probe' })
  @ApiResponse({ status: 200, description: 'Node.js process is alive.' })
  getLiveness(): LivenessResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get('readiness')
  @SkipThrottle()
  @ApiOperation({ summary: 'Kubernetes/Orchestrator database readiness probe' })
  @ApiResponse({ status: 200, description: 'PostgreSQL database is connected and ready.' })
  @ApiResponse({ status: 503, description: 'PostgreSQL database is unreachable.' })
  async getReadiness(): Promise<ReadinessResponse> {
    const timestamp = new Date().toISOString();

    if (!this.prisma) {
      return {
        status: 'ok',
        timestamp,
        database: 'ready',
      };
    }

    try {
      const start = Date.now();
      await Promise.race([
        this.prisma.$queryRawUnsafe('SELECT 1'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Database readiness check timeout (2000ms)')), 2000),
        ),
      ]);
      const latencyMs = Date.now() - start;

      return {
        status: 'ok',
        timestamp,
        database: 'ready',
        latencyMs,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Database ping failure';
      throw new ServiceUnavailableException({
        status: 'error',
        timestamp,
        database: 'unavailable',
        message: errorMessage,
      });
    }
  }
}
