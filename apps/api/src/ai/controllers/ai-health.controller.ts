import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '../../platform/rate-limiting';
import { AiHealthService, AiSubsystemHealth } from '../services/ai-health.service';

@ApiTags('AI Intelligence')
@Controller('ai')
export class AiHealthController {
  constructor(private readonly aiHealthService: AiHealthService) {}

  @Get('health')
  @SkipThrottle()
  @ApiOperation({ summary: 'Get Kynergy Intelligence runtime health and model readiness' })
  @ApiResponse({ status: 200, description: 'AI runtime health report.' })
  public async getHealth(): Promise<AiSubsystemHealth> {
    return this.aiHealthService.getHealthReport();
  }
}
