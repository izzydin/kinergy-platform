import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { Permissions, Roles, CurrentUser } from '../../platform/identity/decorators';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { GetResourceOverviewQuery, GetResourceOverviewHandler } from '@kinergy-platform/core';
import { ResourceOverviewResponseDto, GetResourceOverviewQueryDto } from '../dto';

const getErrorMessage = (error: unknown): string => {
  if (!error) return 'Operation failed';
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
};

@ApiTags('Resources - Overview')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('api/v1/resources/overview')
export class ResourceOverviewController {
  constructor(private readonly getResourceOverviewHandler: GetResourceOverviewHandler) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER')
  @Permissions('inventory.read', 'assets.read', 'billing.read')
  @ApiOperation({
    summary: 'Get enterprise resource overview dashboard metrics',
    description:
      'Provides synthesized executive metrics combining consumable inventory working capital and operational counts with fixed asset carrying values and lifecycle telemetry (ADR-0094). Requires composed permissions inventory.read, assets.read, and billing.read.',
  })
  @ApiResponse({
    status: 200,
    description: 'Resource overview metrics retrieved successfully.',
    type: ResourceOverviewResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: Requires inventory.read, assets.read, and billing.read permissions.',
  })
  public async getOverview(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() queryDto?: GetResourceOverviewQueryDto,
    @Query('includeArchived') rawIncludeArchived?: string,
  ): Promise<ResourceOverviewResponseDto> {
    const rawArchived =
      typeof queryDto === 'string'
        ? queryDto
        : (rawIncludeArchived ?? (queryDto?.includeArchived as unknown));

    const includeArchived = rawArchived === true || rawArchived === 'true' || rawArchived === '1';

    const query = new GetResourceOverviewQuery({
      tenantId: user?.tenantId ?? undefined,
      includeArchived,
    });

    const result = await this.getResourceOverviewHandler.execute(query);
    if (!result.isSuccess) {
      throw new BadRequestException(getErrorMessage(result.error));
    }
    return result.value;
  }
}
