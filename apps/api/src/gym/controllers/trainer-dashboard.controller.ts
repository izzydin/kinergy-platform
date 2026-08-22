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
import {
  CurrentUser,
  Permissions,
  Roles,
  AuthenticatedUserPayload,
} from '../../platform/identity/decorators';
import {
  GetTrainerDashboardSummaryHandler,
  GetTrainerDashboardSummaryQuery,
  GetAssignedClientMembershipsHandler,
  GetAssignedClientMembershipsQuery,
  GetExpiringMembershipsHandler,
  GetExpiringMembershipsQuery,
  GetDailyAttendanceHandler,
  GetDailyAttendanceQuery,
} from '@kinergy-platform/core';
import {
  TrainerDashboardSummaryResponseDto,
  AssignedClientsQueryDto,
  PaginatedAssignedClientsResponseDto,
  ExpiringMembershipsQueryDto,
  ExpiringMembershipsResponseDto,
  TrainerAttendanceQueryDto,
  TrainerAttendanceResponseDto,
} from '../dto';

@ApiTags('Gym - Trainer Operational Dashboard')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Roles('Trainer', 'Admin', 'Owner')
@Permissions('clients.read')
@Controller('api/v1/gym/trainer-dashboard')
export class TrainerDashboardController {
  constructor(
    private readonly getSummaryHandler: GetTrainerDashboardSummaryHandler,
    private readonly getAssignedClientsHandler: GetAssignedClientMembershipsHandler,
    private readonly getExpiringMembershipsHandler: GetExpiringMembershipsHandler,
    private readonly getDailyAttendanceHandler: GetDailyAttendanceHandler,
  ) {}

  /**
   * Resolves the target trainer ID based on caller identity and administrative privileges.
   */
  private resolveTrainerId(
    currentUser: AuthenticatedUserPayload,
    requestedTrainerId?: string,
  ): string {
    const isElevated = currentUser.roles.includes('Admin') || currentUser.roles.includes('Owner');
    if (isElevated && requestedTrainerId && requestedTrainerId.trim().length > 0) {
      return requestedTrainerId.trim();
    }
    return currentUser.id;
  }

  @Get('summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Retrieve top-line KPI summary counts for the Trainer Dashboard',
    description:
      'Projects aggregated counts of active clients, expiring agreements, and today check-ins for the authenticated trainer.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'KPI summary retrieved successfully',
    type: TrainerDashboardSummaryResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Insufficient permissions or role' })
  public async getSummary(
    @CurrentUser() currentUser: AuthenticatedUserPayload,
    @Query('trainerId') requestedTrainerId?: string,
    @Query('asOfDate') asOfDate?: string,
    @Query('horizonDays') horizonDays?: number,
    @Query('timezone') timezone?: string,
    @Query('facilityId') facilityId?: string,
  ): Promise<TrainerDashboardSummaryResponseDto> {
    const targetTrainerId = this.resolveTrainerId(currentUser, requestedTrainerId);

    const query = new GetTrainerDashboardSummaryQuery({
      trainerId: targetTrainerId,
      asOfDate,
      horizonDays: horizonDays ? Number(horizonDays) : undefined,
      timezone,
      facilityId,
    });

    const result = await this.getSummaryHandler.execute(query);
    if (!result.isSuccess) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue();
  }

  @Get('clients')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Retrieve paginated assigned client memberships roster',
    description:
      'Returns operational read models for memberships assigned to the authenticated trainer with deterministic pagination and sorting.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Assigned clients roster retrieved successfully',
    type: PaginatedAssignedClientsResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Insufficient permissions or role' })
  public async getAssignedClients(
    @CurrentUser() currentUser: AuthenticatedUserPayload,
    @Query() queryDto: AssignedClientsQueryDto,
    @Query('trainerId') requestedTrainerId?: string,
  ): Promise<PaginatedAssignedClientsResponseDto> {
    const targetTrainerId = this.resolveTrainerId(currentUser, requestedTrainerId);

    const page = queryDto.page ? Math.max(1, Number(queryDto.page)) : 1;
    const limit = queryDto.limit ? Math.min(100, Math.max(1, Number(queryDto.limit))) : 20;

    // Fetch all assigned clients for counting totalItems
    const allQuery = new GetAssignedClientMembershipsQuery({
      trainerId: targetTrainerId,
      statuses: queryDto.statuses,
      asOfDate: queryDto.asOfDate,
      horizonDays: queryDto.horizonDays,
      sortBy: queryDto.sortBy,
      sortOrder: queryDto.sortOrder,
    });

    const allResult = await this.getAssignedClientsHandler.execute(allQuery);
    if (!allResult.isSuccess) {
      throw new BadRequestException(allResult.getError());
    }

    const allItems = allResult.getValue();
    const totalItems = allItems.length;
    const totalPages = Math.ceil(totalItems / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedItems = allItems.slice(startIndex, startIndex + limit);

    return {
      items: paginatedItems,
      totalItems,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  @Get('expiring-memberships')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Retrieve assigned memberships expiring soon',
    description:
      'Returns memberships assigned to the authenticated trainer that expire within the configured lookahead horizon.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Expiring memberships retrieved successfully',
    type: ExpiringMembershipsResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Insufficient permissions or role' })
  public async getExpiringMemberships(
    @CurrentUser() currentUser: AuthenticatedUserPayload,
    @Query() queryDto: ExpiringMembershipsQueryDto,
    @Query('trainerId') requestedTrainerId?: string,
  ): Promise<ExpiringMembershipsResponseDto> {
    const targetTrainerId = this.resolveTrainerId(currentUser, requestedTrainerId);
    const horizonDays = queryDto.horizonDays ? Number(queryDto.horizonDays) : 7;

    const query = new GetExpiringMembershipsQuery({
      horizonDays,
      asOfDate: queryDto.asOfDate,
      trainerId: targetTrainerId,
    });

    const result = await this.getExpiringMembershipsHandler.execute(query);
    if (!result.isSuccess) {
      throw new BadRequestException(result.getError());
    }

    const items = result.getValue();
    return {
      items,
      total: items.length,
      horizonDays,
    };
  }

  @Get('attendance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Retrieve today's attendance arrivals for assigned clients",
    description:
      "Returns check-in history scoped strictly to the authenticated trainer's assigned clients for operational awareness.",
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Assigned clients attendance retrieved successfully',
    type: TrainerAttendanceResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Insufficient permissions or role' })
  public async getAttendance(
    @CurrentUser() currentUser: AuthenticatedUserPayload,
    @Query() queryDto: TrainerAttendanceQueryDto,
    @Query('trainerId') requestedTrainerId?: string,
  ): Promise<TrainerAttendanceResponseDto> {
    const targetTrainerId = this.resolveTrainerId(currentUser, requestedTrainerId);

    // 1. Get assigned clients list to construct whitelist filter
    const assignedQuery = new GetAssignedClientMembershipsQuery({
      trainerId: targetTrainerId,
    });
    const assignedResult = await this.getAssignedClientsHandler.execute(assignedQuery);
    if (!assignedResult.isSuccess) {
      throw new BadRequestException(assignedResult.getError());
    }

    const assignedClientIds = assignedResult.getValue().map((c) => c.clientId);

    // 2. Fetch daily attendance scoped by assigned client whitelist
    const attendanceQuery = new GetDailyAttendanceQuery({
      date: queryDto.date,
      facilityId: queryDto.facilityId,
      assignedClientIds,
      page: queryDto.page ? Number(queryDto.page) : 1,
      limit: queryDto.limit ? Number(queryDto.limit) : 20,
    });

    const attendanceResult = await this.getDailyAttendanceHandler.execute(attendanceQuery);
    if (!attendanceResult.isSuccess) {
      throw new BadRequestException(attendanceResult.getError());
    }

    const attendanceData = attendanceResult.getValue();
    return {
      items: attendanceData.items.map((item) => ({
        id: item.id,
        clientId: item.clientId,
        membershipId: item.membershipId,
        checkInTime: item.checkInTime,
        gymDay: item.gymDay,
        method: item.method,
        result: item.result,
        gateId: item.gateId,
      })),
      total: attendanceData.pagination.totalItems,
      grantedCount:
        attendanceData.dailySummary?.grantedCount ?? attendanceData.pagination.totalItems,
      page: attendanceData.pagination.page,
      limit: attendanceData.pagination.limit,
      totalPages: attendanceData.pagination.totalPages,
    };
  }
}
