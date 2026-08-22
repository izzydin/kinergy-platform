import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { Permissions, Roles } from '../../platform/identity/decorators';
import {
  CreateMembershipPlanCommand,
  CreateMembershipPlanHandler,
  UpdateMembershipPlanPricingCommand,
  UpdateMembershipPlanPricingHandler,
  PublishMembershipPlanCommand,
  PublishMembershipPlanHandler,
  ArchiveMembershipPlanCommand,
  ArchiveMembershipPlanHandler,
  GetMembershipPlanByIdQuery,
  GetMembershipPlanByIdHandler,
  ListMembershipPlansQuery,
  ListMembershipPlansHandler,
} from '@kinergy-platform/core';
import {
  CreateMembershipPlanRequestDto,
  UpdateMembershipPlanPricingRequestDto,
  ListMembershipPlansQueryDto,
  MembershipPlanResponseDto,
  PaginatedMembershipPlansResponseDto,
} from '../dto';

@ApiTags('Gym - Membership Plans')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('api/v1/gym/membership-plans')
export class MembershipPlansController {
  constructor(
    private readonly createPlanHandler: CreateMembershipPlanHandler,
    private readonly updatePricingHandler: UpdateMembershipPlanPricingHandler,
    private readonly publishPlanHandler: PublishMembershipPlanHandler,
    private readonly archivePlanHandler: ArchiveMembershipPlanHandler,
    private readonly getPlanByIdHandler: GetMembershipPlanByIdHandler,
    private readonly listPlansHandler: ListMembershipPlansHandler,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('Admin', 'Owner')
  @Permissions('plans.create')
  @ApiOperation({ summary: 'Create a new commercial membership plan (starts in DRAFT status)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: MembershipPlanResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed or duplicate code',
  })
  public async createPlan(
    @Body() dto: CreateMembershipPlanRequestDto,
  ): Promise<MembershipPlanResponseDto> {
    const command = new CreateMembershipPlanCommand({
      code: dto.code,
      name: dto.name,
      description: dto.description,
      durationInDays: dto.durationInDays,
      priceAmount: dto.priceAmount,
      priceCurrency: dto.priceCurrency,
      visitQuota: dto.visitQuota,
    });

    const result = await this.createPlanHandler.execute(command);
    if (result.isFailure) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue();
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get details of a specific membership plan by ID' })
  @ApiParam({ name: 'id', description: 'Plan ID' })
  @ApiResponse({ status: HttpStatus.OK, type: MembershipPlanResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Plan not found' })
  public async getPlan(@Param('id') id: string): Promise<MembershipPlanResponseDto> {
    const query = new GetMembershipPlanByIdQuery({ planId: id });
    const result = await this.getPlanByIdHandler.execute(query);

    if (result.isFailure) {
      throw new NotFoundException(result.getError());
    }

    return result.getValue();
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List and search membership plans with pagination and status filters' })
  @ApiResponse({ status: HttpStatus.OK, type: PaginatedMembershipPlansResponseDto })
  public async listPlans(
    @Query() queryDto: ListMembershipPlansQueryDto,
  ): Promise<PaginatedMembershipPlansResponseDto> {
    const query = new ListMembershipPlansQuery({
      activeOnly: queryDto.activeOnly,
      status: queryDto.status,
      search: queryDto.search,
      page: queryDto.page,
      limit: queryDto.limit,
    });

    const result = await this.listPlansHandler.execute(query);
    if (result.isFailure) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue();
  }

  @Patch(':id/pricing')
  @HttpCode(HttpStatus.OK)
  @Roles('Admin', 'Owner')
  @Permissions('plans.update')
  @ApiOperation({
    summary: 'Update pricing for future sales of this plan without altering historical memberships',
  })
  @ApiParam({ name: 'id', description: 'Plan ID' })
  @ApiResponse({ status: HttpStatus.OK, type: MembershipPlanResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed or archived plan',
  })
  public async updatePricing(
    @Param('id') id: string,
    @Body() dto: UpdateMembershipPlanPricingRequestDto,
  ): Promise<MembershipPlanResponseDto> {
    const command = new UpdateMembershipPlanPricingCommand({
      planId: id,
      newPriceAmount: dto.priceAmount,
      currency: dto.currency,
    });

    const result = await this.updatePricingHandler.execute(command);
    if (result.isFailure) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue();
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @Roles('Admin', 'Owner')
  @Permissions('plans.update')
  @ApiOperation({ summary: 'Publish a draft plan to ACTIVE status for commercial sale' })
  @ApiParam({ name: 'id', description: 'Plan ID' })
  @ApiResponse({ status: HttpStatus.OK, type: MembershipPlanResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Cannot publish archived plan' })
  public async publishPlan(@Param('id') id: string): Promise<MembershipPlanResponseDto> {
    const command = new PublishMembershipPlanCommand({ planId: id });
    const result = await this.publishPlanHandler.execute(command);

    if (result.isFailure) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue();
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @Roles('Admin', 'Owner')
  @Permissions('plans.update')
  @ApiOperation({ summary: 'Archive an active plan to remove it from future commercial sales' })
  @ApiParam({ name: 'id', description: 'Plan ID' })
  @ApiResponse({ status: HttpStatus.OK, type: MembershipPlanResponseDto })
  public async archivePlan(@Param('id') id: string): Promise<MembershipPlanResponseDto> {
    const command = new ArchiveMembershipPlanCommand({ planId: id });
    const result = await this.archivePlanHandler.execute(command);

    if (result.isFailure) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue();
  }
}
