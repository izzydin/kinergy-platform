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
import {
  GetCombinedResourceValuationQuery,
  GetCombinedResourceValuationHandler,
} from '@kinergy-platform/core';
import { ResourceValuationSummaryResponseDto } from '../dto';

const getErrorMessage = (error: unknown): string => {
  if (!error) return 'Operation failed';
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
};

@ApiTags('Resources - Valuation')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('api/v1/resources/valuation')
export class ResourceValuationController {
  constructor(
    private readonly getCombinedResourceValuationHandler: GetCombinedResourceValuationHandler,
  ) {}

  @Get('summary')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER')
  @Permissions('inventory.read', 'assets.read', 'billing.read')
  @ApiOperation({
    summary: 'Get combined cross-domain resource valuation summary',
    description:
      'Calculates combined enterprise resource balance sheet value by composing consumable inventory working capital and fixed asset carrying value (ADR-0098). Requires composed permissions inventory.read, assets.read, and billing.read.',
  })
  @ApiResponse({
    status: 200,
    description: 'Combined resource valuation summary calculated successfully.',
    type: ResourceValuationSummaryResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: Requires inventory.read, assets.read, and billing.read permissions.',
  })
  public async getCombinedSummary(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query('includeArchived') includeArchived?: string,
    @Query('includeDecommissioned') includeDecommissioned?: string,
  ): Promise<ResourceValuationSummaryResponseDto> {
    const query = new GetCombinedResourceValuationQuery({
      tenantId: user?.tenantId ?? undefined,
      includeArchived: includeArchived === 'true' || includeArchived === '1',
      includeDecommissioned: includeDecommissioned === 'true' || includeDecommissioned === '1',
    });

    const result = await this.getCombinedResourceValuationHandler.execute(query);
    if (!result.isSuccess) {
      throw new BadRequestException(getErrorMessage(result.error));
    }
    return result.value;
  }
}
