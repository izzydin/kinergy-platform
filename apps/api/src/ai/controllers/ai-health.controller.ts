import { Controller, Get, UseFilters } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '../../platform/rate-limiting';
import { Public } from '../../platform/identity/decorators/public.decorator';
import { AiHealthService, AiSubsystemHealth } from '../services/ai-health.service';
import { AiExceptionFilter } from '../filters/ai-exception.filter';

@ApiTags('AI Intelligence')
@Controller('ai')
@UseFilters(AiExceptionFilter)
export class AiHealthController {
  constructor(private readonly aiHealthService: AiHealthService) {}

  @Get('health')
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Get Kynergy Intelligence runtime health and model readiness' })
  @ApiResponse({ status: 200, description: 'AI runtime health report.' })
  public async getHealth(): Promise<AiSubsystemHealth> {
    return this.aiHealthService.getHealthReport();
  }
}
