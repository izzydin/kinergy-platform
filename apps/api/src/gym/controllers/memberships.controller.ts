import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { Permissions, Roles } from '../../platform/identity/decorators';
import {
  CreateMembershipCommand,
  CreateMembershipHandler,
  RenewMembershipCommand,
  RenewMembershipHandler,
  FreezeMembershipCommand,
  FreezeMembershipHandler,
  UnfreezeMembershipCommand,
  UnfreezeMembershipHandler,
  CancelMembershipCommand,
  CancelMembershipHandler,
  ExpireMembershipsCommand,
  ExpireMembershipsHandler,
  GetMembershipByIdQuery,
  GetMembershipByIdHandler,
  ListMembershipsQuery,
  ListMembershipsHandler,
  ListExpiredMembershipsQuery,
  ListExpiredMembershipsHandler,
  GetExpiringMembershipsQuery,
  GetExpiringMembershipsHandler,
  CheckMembershipEligibilityQuery,
  CheckMembershipEligibilityHandler,
} from '@kinergy-platform/core';
import {
  CreateMembershipRequestDto,
  RenewMembershipRequestDto,
  FreezeMembershipRequestDto,
  CancelMembershipRequestDto,
  ExpireMembershipsBatchRequestDto,
  ListMembershipsQueryDto,
  CheckEligibilityQueryDto,
  MembershipResponseDto,
  PaginatedMembershipsResponseDto,
  MembershipEligibilityResponseDto,
  ExpireMembershipsBatchResponseDto,
  ExpiringMembershipsResponseDto,
} from '../dto';

@ApiTags('Gym - Memberships')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('api/v1/gym/memberships')
export class MembershipsController {
  constructor(
    private readonly createMembershipHandler: CreateMembershipHandler,
    private readonly renewMembershipHandler: RenewMembershipHandler,
    private readonly freezeMembershipHandler: FreezeMembershipHandler,
    private readonly unfreezeMembershipHandler: UnfreezeMembershipHandler,
    private readonly cancelMembershipHandler: CancelMembershipHandler,
    private readonly expireMembershipsHandler: ExpireMembershipsHandler,
    private readonly getMembershipByIdHandler: GetMembershipByIdHandler,
    private readonly listMembershipsHandler: ListMembershipsHandler,
    private readonly listExpiredMembershipsHandler: ListExpiredMembershipsHandler,
    private readonly getExpiringMembershipsHandler: GetExpiringMembershipsHandler,
    private readonly checkEligibilityHandler: CheckMembershipEligibilityHandler,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('Admin', 'Owner', 'Receptionist')
  @Permissions('memberships.create')
  @ApiOperation({
    summary: 'Create and activate a new membership agreement for a registered client',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: MembershipResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Client inactive, invalid plan, or overlapping membership',
  })
  public async createMembership(
    @Body() dto: CreateMembershipRequestDto,
  ): Promise<MembershipResponseDto> {
    const command = new CreateMembershipCommand({
      clientId: dto.clientId,
      planId: dto.planId,
      startDate: dto.startDate,
      assignedTrainerId: dto.assignedTrainerId,
    });

    const result = await this.createMembershipHandler.execute(command);
    if (result.isFailure) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue();
  }

  @Get('expiring')
  @HttpCode(HttpStatus.OK)
  @Roles('Admin', 'Owner', 'Receptionist', 'Trainer')
  @Permissions('memberships.read')
  @ApiOperation({ summary: 'List memberships expiring within a specified lookahead horizon' })
  @ApiResponse({ status: HttpStatus.OK, type: ExpiringMembershipsResponseDto })
  public async getExpiring(
    @Query('horizonDays') horizonDays?: number,
  ): Promise<ExpiringMembershipsResponseDto> {
    const horizon = horizonDays ? Math.max(1, Number(horizonDays)) : 7;
    const query = new GetExpiringMembershipsQuery({ horizonDays: horizon });
    const result = await this.getExpiringMembershipsHandler.execute(query);

    if (result.isFailure) {
      throw new BadRequestException(result.getError());
    }

    return {
      items: result.getValue(),
      total: result.getValue().length,
      horizonDays: horizon,
    };
  }

  @Get('expired')
  @HttpCode(HttpStatus.OK)
  @Roles('Admin', 'Owner', 'Receptionist')
  @Permissions('memberships.read')
  @ApiOperation({ summary: 'List all lapsed/expired memberships with pagination' })
  @ApiResponse({ status: HttpStatus.OK, type: PaginatedMembershipsResponseDto })
  public async getExpired(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('clientId') clientId?: string,
  ): Promise<PaginatedMembershipsResponseDto> {
    const query = new ListExpiredMembershipsQuery({
      clientId,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });

    const result = await this.listExpiredMembershipsHandler.execute(query);
    if (result.isFailure) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue();
  }

  @Get('eligibility/check')
  @HttpCode(HttpStatus.OK)
  @Roles('Admin', 'Owner', 'Receptionist', 'Trainer')
  @Permissions('memberships.read')
  @ApiOperation({ summary: 'Authoritatively evaluate gym admission eligibility for a client' })
  @ApiResponse({ status: HttpStatus.OK, type: MembershipEligibilityResponseDto })
  public async checkEligibility(
    @Query() queryDto: CheckEligibilityQueryDto,
  ): Promise<MembershipEligibilityResponseDto> {
    const asOfDate = queryDto.asOf ? new Date(queryDto.asOf) : undefined;
    const query = new CheckMembershipEligibilityQuery(queryDto.clientId, asOfDate);
    const result = await this.checkEligibilityHandler.execute(query);

    if (result.isFailure) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue();
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('Admin', 'Owner', 'Receptionist', 'Trainer', 'Client')
  @Permissions('memberships.read')
  @ApiOperation({ summary: 'Get details of a specific membership agreement by ID' })
  @ApiParam({ name: 'id', description: 'Membership ID' })
  @ApiResponse({ status: HttpStatus.OK, type: MembershipResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Membership not found' })
  public async getMembership(@Param('id') id: string): Promise<MembershipResponseDto> {
    const query = new GetMembershipByIdQuery({ membershipId: id });
    const result = await this.getMembershipByIdHandler.execute(query);

    if (result.isFailure) {
      throw new NotFoundException(result.getError());
    }

    return result.getValue();
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @Roles('Admin', 'Owner', 'Receptionist')
  @Permissions('memberships.read')
  @ApiOperation({
    summary: 'List and filter all membership agreements with server-side pagination',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PaginatedMembershipsResponseDto })
  public async listMemberships(
    @Query() queryDto: ListMembershipsQueryDto,
  ): Promise<PaginatedMembershipsResponseDto> {
    const query = new ListMembershipsQuery({
      clientId: queryDto.clientId,
      planId: queryDto.planId,
      status: queryDto.status,
      startDateFrom: queryDto.startDateFrom,
      startDateTo: queryDto.startDateTo,
      endDateFrom: queryDto.endDateFrom,
      endDateTo: queryDto.endDateTo,
      page: queryDto.page,
      limit: queryDto.limit,
    });

    const result = await this.listMembershipsHandler.execute(query);
    if (result.isFailure) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue();
  }

  @Post(':id/renew')
  @HttpCode(HttpStatus.OK)
  @Roles('Admin', 'Owner', 'Receptionist')
  @Permissions('memberships.update')
  @ApiOperation({ summary: 'Renew a membership agreement gaplessly or from effective date' })
  @ApiParam({ name: 'id', description: 'Membership ID' })
  @ApiResponse({ status: HttpStatus.OK, type: MembershipResponseDto })
  public async renewMembership(
    @Param('id') id: string,
    @Body() dto: RenewMembershipRequestDto,
  ): Promise<MembershipResponseDto> {
    const command = new RenewMembershipCommand({
      membershipId: id,
      newPlanId: dto.newPlanId,
      effectiveDate: dto.effectiveDate,
    });

    const result = await this.renewMembershipHandler.execute(command);
    if (result.isFailure) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue();
  }

  @Post(':id/freeze')
  @HttpCode(HttpStatus.OK)
  @Roles('Admin', 'Owner', 'Receptionist')
  @Permissions('memberships.update')
  @ApiOperation({
    summary: 'Freeze an active membership agreement for a specified calendar window',
  })
  @ApiParam({ name: 'id', description: 'Membership ID' })
  @ApiResponse({ status: HttpStatus.OK, type: MembershipResponseDto })
  public async freezeMembership(
    @Param('id') id: string,
    @Body() dto: FreezeMembershipRequestDto,
  ): Promise<MembershipResponseDto> {
    const command = new FreezeMembershipCommand({
      membershipId: id,
      startDate: dto.startDate,
      endDate: dto.endDate,
      reason: dto.reason,
    });

    const result = await this.freezeMembershipHandler.execute(command);
    if (result.isFailure) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue();
  }

  @Post(':id/unfreeze')
  @HttpCode(HttpStatus.OK)
  @Roles('Admin', 'Owner', 'Receptionist')
  @Permissions('memberships.update')
  @ApiOperation({ summary: 'Unfreeze a suspended membership and automatically extend validity' })
  @ApiParam({ name: 'id', description: 'Membership ID' })
  @ApiResponse({ status: HttpStatus.OK, type: MembershipResponseDto })
  public async unfreezeMembership(@Param('id') id: string): Promise<MembershipResponseDto> {
    const command = new UnfreezeMembershipCommand({ membershipId: id });
    const result = await this.unfreezeMembershipHandler.execute(command);

    if (result.isFailure) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue();
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('Admin', 'Owner', 'Receptionist')
  @Permissions('memberships.update')
  @ApiOperation({ summary: 'Voluntarily terminate a membership agreement with reason audit' })
  @ApiParam({ name: 'id', description: 'Membership ID' })
  @ApiResponse({ status: HttpStatus.OK, type: MembershipResponseDto })
  public async cancelMembership(
    @Param('id') id: string,
    @Body() dto: CancelMembershipRequestDto,
  ): Promise<MembershipResponseDto> {
    const command = new CancelMembershipCommand({
      membershipId: id,
      reason: dto.reason,
    });

    const result = await this.cancelMembershipHandler.execute(command);
    if (result.isFailure) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue();
  }

  @Post('expire-batch')
  @HttpCode(HttpStatus.OK)
  @Roles('Admin', 'Owner')
  @Permissions('memberships.update')
  @ApiOperation({ summary: 'Deterministic batch process expiring overdue memberships' })
  @ApiResponse({ status: HttpStatus.OK, type: ExpireMembershipsBatchResponseDto })
  public async expireBatch(
    @Body() dto: ExpireMembershipsBatchRequestDto,
  ): Promise<ExpireMembershipsBatchResponseDto> {
    const command = new ExpireMembershipsCommand({
      asOfDate: dto.asOfDate ? new Date(dto.asOfDate) : undefined,
      batchSize: dto.batchSize,
      dryRun: dto.dryRun,
    });

    const result = await this.expireMembershipsHandler.execute(command);
    if (result.isFailure) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue();
  }
}
