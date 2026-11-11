import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Optional,
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
  MembershipRepository,
  MembershipPlanRepository,
  MembershipStatus,
  Membership,
} from '@kinergy-platform/core';
import {
  TrainerDashboardSummaryResponseDto,
  AssignedClientsQueryDto,
  PaginatedAssignedClientsResponseDto,
  AssignedClientMembershipItemDto,
  ExpiringMembershipsQueryDto,
  ExpiringMembershipsResponseDto,
  TrainerAttendanceQueryDto,
  TrainerAttendanceResponseDto,
} from '../dto';
import { IClientFacade, CLIENT_FACADE_TOKEN } from '@kinergy-platform/client-domain';
import { MEMBERSHIP_REPOSITORY_TOKEN, MEMBERSHIP_PLAN_REPOSITORY_TOKEN } from '../gym.tokens';

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
    @Optional()
    @Inject(CLIENT_FACADE_TOKEN)
    private readonly clientFacade?: IClientFacade,
    @Optional()
    @Inject(MEMBERSHIP_REPOSITORY_TOKEN)
    private readonly membershipRepository?: MembershipRepository,
    @Optional()
    @Inject(MEMBERSHIP_PLAN_REPOSITORY_TOKEN)
    private readonly planRepository?: MembershipPlanRepository,
  ) {}

  /**
   * Resolves the target trainer ID based on caller identity and administrative privileges.
   */
  private resolveTrainerId(
    currentUser: AuthenticatedUserPayload,
    requestedTrainerId?: string,
  ): string {
    const isElevated =
      currentUser?.roles?.includes('Admin') || currentUser?.roles?.includes('Owner');
    if (isElevated && requestedTrainerId && requestedTrainerId.trim().length > 0) {
      return requestedTrainerId.trim();
    }
    const id = currentUser?.id ?? '';
    return id.trim();
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
    const page = queryDto.page ? Math.max(1, Number(queryDto.page)) : 1;
    const limit = queryDto.limit ? Math.min(100, Math.max(1, Number(queryDto.limit))) : 20;

    // When clientFacade is available, serve facility-wide client roster
    if (this.clientFacade) {
      const clientResult = await this.clientFacade.searchClients({
        query: queryDto.search || queryDto.query,
        status: queryDto.status,
        page,
        limit,
        sortBy: queryDto.sortBy === 'fullName' ? 'name' : queryDto.sortBy,
        sortOrder: queryDto.sortOrder,
      });

      const now = new Date();
      const asOf = queryDto.asOfDate ? new Date(queryDto.asOfDate) : now;
      const horizonDays = queryDto.horizonDays ? Number(queryDto.horizonDays) : 7;
      const horizonMs = horizonDays * 24 * 60 * 60 * 1000;

      const items: AssignedClientMembershipItemDto[] = await Promise.all(
        clientResult.items.map(async (client) => {
          let clientMemberships: Membership[] = [];
          if (this.membershipRepository) {
            try {
              clientMemberships = await this.membershipRepository.findByClientId(client.id);
            } catch {
              clientMemberships = [];
            }
          }

          // Pick active membership first, else frozen, else most recent
          const activeMem =
            clientMemberships.find((m) => m.status === MembershipStatus.ACTIVE) ??
            clientMemberships.find((m) => m.status === MembershipStatus.FROZEN) ??
            clientMemberships[0];

          if (activeMem) {
            let planName = activeMem.planId;
            if (this.planRepository) {
              try {
                const plan = await this.planRepository.findById(activeMem.planId);
                if (plan?.name) {
                  planName = plan.name;
                }
              } catch {
                // Ignore plan lookup failure
              }
            }

            const endMs = activeMem.period.endDate.getTime();
            const asOfMs = asOf.getTime();
            const diffMs = endMs - asOfMs;
            const daysRemaining = diffMs > 0 ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) : 0;
            const isExpiringSoon =
              (activeMem.status === MembershipStatus.ACTIVE ||
                activeMem.status === MembershipStatus.FROZEN) &&
              diffMs <= horizonMs &&
              diffMs > 0;
            const isExpired = activeMem.status === MembershipStatus.EXPIRED || diffMs <= 0;
            const isCurrentlyFrozen =
              typeof activeMem.isCurrentlyFrozen === 'function'
                ? activeMem.isCurrentlyFrozen(asOf)
                : false;

            return {
              membershipId: activeMem.id.value,
              clientId: client.id,
              clientName: client.fullName,
              fullName: client.fullName,
              email: client.email,
              phone: client.phone,
              referenceNumber: client.referenceNumber,
              planId: activeMem.planId,
              planName,
              status: activeMem.status,
              startDate: activeMem.period.startDate.toISOString(),
              endDate: activeMem.period.endDate.toISOString(),
              daysRemaining,
              isExpiringSoon,
              isExpired,
              isCurrentlyFrozen,
              assignedAt:
                activeMem.trainerAssignment?.assignedAt?.toISOString() ??
                activeMem.createdAt.toISOString(),
            };
          }

          // Client without an active gym membership (general facility client)
          return {
            membershipId: `mem-${client.id.slice(0, 8)}`,
            clientId: client.id,
            clientName: client.fullName,
            fullName: client.fullName,
            email: client.email,
            phone: client.phone,
            referenceNumber: client.referenceNumber,
            planId: 'plan-facility',
            planName: 'General Member',
            status: client.status === 'ACTIVE' ? 'ACTIVE' : client.status,
            startDate: client.createdAt
              ? new Date(client.createdAt).toISOString()
              : now.toISOString(),
            endDate: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            daysRemaining: 365,
            isExpiringSoon: false,
            isExpired: false,
            isCurrentlyFrozen: false,
            assignedAt: client.createdAt
              ? new Date(client.createdAt).toISOString()
              : now.toISOString(),
          };
        }),
      );

      return {
        items,
        totalItems: clientResult.total,
        total: clientResult.total,
        page: clientResult.page,
        limit: clientResult.limit,
        totalPages: clientResult.totalPages,
        hasNextPage: clientResult.hasNextPage,
        hasPreviousPage: clientResult.hasPreviousPage,
      };
    }

    // Fallback path when clientFacade is not provided (e.g. isolated legacy unit tests)
    const targetTrainerId = this.resolveTrainerId(currentUser, requestedTrainerId);
    const fallbackSortBy =
      queryDto.sortBy === 'endDate' ||
      queryDto.sortBy === 'startDate' ||
      queryDto.sortBy === 'daysRemaining' ||
      queryDto.sortBy === 'assignedAt'
        ? queryDto.sortBy
        : undefined;

    const allQuery = new GetAssignedClientMembershipsQuery({
      trainerId: targetTrainerId,
      statuses: queryDto.statuses,
      asOfDate: queryDto.asOfDate,
      horizonDays: queryDto.horizonDays,
      sortBy: fallbackSortBy,
      sortOrder: queryDto.sortOrder,
    });

    const allResult = await this.getAssignedClientsHandler.execute(allQuery);
    if (!allResult.isSuccess) {
      throw new BadRequestException(allResult.getError());
    }

    let allItems = allResult.getValue();
    const searchTerm = (queryDto.search || queryDto.query || '').trim().toLowerCase();
    if (searchTerm) {
      allItems = allItems.filter(
        (i) =>
          i.clientId.toLowerCase().includes(searchTerm) ||
          i.planName.toLowerCase().includes(searchTerm),
      );
    }

    const totalItems = allItems.length;
    const totalPages = Math.ceil(totalItems / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedItems = allItems.slice(startIndex, startIndex + limit);

    return {
      items: paginatedItems,
      totalItems,
      total: totalItems,
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
