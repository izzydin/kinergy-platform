import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import {
  CurrentUser,
  Permissions,
  Roles,
  AuthenticatedUserPayload,
} from '../../platform/identity/decorators';
import {
  RecordCheckInCommand,
  RecordCheckInHandler,
  GetDailyAttendanceQuery,
  GetDailyAttendanceHandler,
  GetClientAttendanceHistoryQuery,
  GetClientAttendanceHistoryHandler,
  GetAttendanceSummaryQuery,
  GetAttendanceSummaryHandler,
  SearchAttendanceQuery,
  SearchAttendanceHandler,
  AttendanceRangeSummaryDTO,
  CheckInMethod,
} from '@kinergy-platform/core';
import {
  RecordCheckInRequestDto,
  DailyAttendanceQueryDto,
  ClientAttendanceHistoryQueryDto,
  AttendanceSummaryQueryDto,
  SearchAttendanceQueryDto,
  RecordCheckInResponseDto,
  PaginatedAttendanceResponseDto,
} from '../dto';

@ApiTags('Gym - Attendance & Admission')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('api/v1/gym/attendance')
export class AttendanceController {
  constructor(
    private readonly recordCheckInHandler: RecordCheckInHandler,
    private readonly getDailyAttendanceHandler: GetDailyAttendanceHandler,
    private readonly getClientHistoryHandler: GetClientAttendanceHistoryHandler,
    private readonly getAttendanceSummaryHandler: GetAttendanceSummaryHandler,
    private readonly searchAttendanceHandler: SearchAttendanceHandler,
  ) {}

  @Post('check-in')
  @HttpCode(HttpStatus.OK)
  @Roles('Admin', 'Owner', 'Receptionist')
  @Permissions('attendance.create')
  @ApiOperation({ summary: 'Record and authorize a physical check-in entry attempt for a client' })
  @ApiResponse({ status: HttpStatus.OK, type: RecordCheckInResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input parameters' })
  public async checkIn(
    @Body() dto: RecordCheckInRequestDto,
    @CurrentUser() user: AuthenticatedUserPayload,
  ): Promise<RecordCheckInResponseDto> {
    const command = new RecordCheckInCommand({
      clientId: dto.clientId,
      method: dto.method ?? CheckInMethod.QR_CODE,
      gateId: dto.gateId,
      receptionistId: user.id,
      notes: dto.notes,
      idempotencyKey: dto.idempotencyKey,
    });

    const result = await this.recordCheckInHandler.execute(command);
    if (result.isFailure) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue();
  }

  @Get('today')
  @HttpCode(HttpStatus.OK)
  @Roles('Admin', 'Owner', 'Receptionist')
  @Permissions('attendance.read')
  @ApiOperation({
    summary: "Retrieve today's facility-local operational check-in log and summary KPIs",
  })
  @ApiResponse({ status: HttpStatus.OK, type: PaginatedAttendanceResponseDto })
  public async getToday(
    @Query() queryDto: DailyAttendanceQueryDto,
  ): Promise<PaginatedAttendanceResponseDto> {
    const query = new GetDailyAttendanceQuery({
      date: queryDto.date,
      facilityId: queryDto.facilityId,
      result: queryDto.result,
      method: queryDto.method,
      page: queryDto.page,
      limit: queryDto.limit,
    });

    const result = await this.getDailyAttendanceHandler.execute(query);
    if (result.isFailure) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue();
  }

  @Get('summary')
  @HttpCode(HttpStatus.OK)
  @Roles('Admin', 'Owner', 'Receptionist')
  @Permissions('attendance.read')
  @ApiOperation({
    summary:
      'Retrieve aggregated attendance KPIs and hourly traffic distribution across date range',
  })
  @ApiResponse({ status: HttpStatus.OK })
  public async getSummary(
    @Query() queryDto: AttendanceSummaryQueryDto,
  ): Promise<AttendanceRangeSummaryDTO> {
    const query = new GetAttendanceSummaryQuery({
      startDate: queryDto.startDate,
      endDate: queryDto.endDate,
      facilityId: queryDto.facilityId,
    });

    const result = await this.getAttendanceSummaryHandler.execute(query);
    if (result.isFailure) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue();
  }

  @Get('client/:clientId')
  @HttpCode(HttpStatus.OK)
  @Roles('Admin', 'Owner', 'Receptionist', 'Trainer', 'Client')
  @Permissions('attendance.read')
  @ApiOperation({
    summary: 'Retrieve chronological attendance history and visit stats for a specific client',
  })
  @ApiParam({ name: 'clientId', description: 'Client master ID' })
  @ApiResponse({ status: HttpStatus.OK, type: PaginatedAttendanceResponseDto })
  public async getClientHistory(
    @Param('clientId') clientId: string,
    @Query() queryDto: ClientAttendanceHistoryQueryDto,
  ): Promise<PaginatedAttendanceResponseDto> {
    const query = new GetClientAttendanceHistoryQuery({
      clientId,
      dateFrom: queryDto.dateFrom,
      dateTo: queryDto.dateTo,
      page: queryDto.page,
      limit: queryDto.limit,
    });

    const result = await this.getClientHistoryHandler.execute(query);
    if (result.isFailure) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue();
  }

  @Get('search')
  @HttpCode(HttpStatus.OK)
  @Roles('Admin', 'Owner', 'Receptionist')
  @Permissions('attendance.read')
  @ApiOperation({ summary: 'Multi-criteria paginated search across historical attendance records' })
  @ApiResponse({ status: HttpStatus.OK, type: PaginatedAttendanceResponseDto })
  public async search(
    @Query() queryDto: SearchAttendanceQueryDto,
  ): Promise<PaginatedAttendanceResponseDto> {
    const query = new SearchAttendanceQuery({
      clientId: queryDto.clientId,
      gymDay: queryDto.gymDay,
      dateFrom: queryDto.dateFrom,
      dateTo: queryDto.dateTo,
      facilityId: queryDto.facilityId,
      result: queryDto.result,
      method: queryDto.method,
      page: queryDto.page,
      limit: queryDto.limit,
    });

    const result = await this.searchAttendanceHandler.execute(query);
    if (result.isFailure) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue();
  }
}
