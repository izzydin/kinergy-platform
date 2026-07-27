import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from './platform/rate-limiting';

export interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
}

@ApiTags('Health')
@Controller('health')
export class AppController {
  @Get()
  @SkipThrottle()
  @ApiOperation({ summary: 'Get application health status' })
  @ApiResponse({ status: 200, description: 'Application is healthy.' })
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
