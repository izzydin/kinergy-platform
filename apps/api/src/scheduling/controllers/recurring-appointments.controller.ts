import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UnprocessableEntityException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { Permissions, Roles } from '../../platform/identity/decorators';
import {
  CreateRecurrenceSeriesCommand,
  SkipRecurrenceOccurrenceCommand,
  EditSingleOccurrenceCommand,
  EditFutureOccurrencesCommand,
  CancelRecurrenceSeriesCommand,
  CreateRecurrenceSeriesHandler,
  SkipRecurrenceOccurrenceHandler,
  EditSingleOccurrenceHandler,
  EditFutureOccurrencesHandler,
  CancelRecurrenceSeriesHandler,
} from '@kinergy-platform/core';
import {
  CreateRecurrenceSeriesRequestDto,
  SkipOccurrenceRequestDto,
  EditSingleOccurrenceRequestDto,
  EditFutureOccurrencesRequestDto,
  CancelRecurrenceSeriesRequestDto,
  CreateRecurrenceSeriesResponseDto,
  SkipOccurrenceResponseDto,
  EditFutureOccurrencesResponseDto,
  CancelRecurrenceSeriesResponseDto,
} from '../dto';
import { SchedulingExceptionFilter } from '../filters/scheduling-exception.filter';

@ApiTags('Recurring Appointments')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@UseFilters(SchedulingExceptionFilter)
@Controller('api/v1/scheduling/recurring-appointments')
export class RecurringAppointmentsController {
  constructor(
    private readonly createSeriesHandler: CreateRecurrenceSeriesHandler,
    private readonly skipOccurrenceHandler: SkipRecurrenceOccurrenceHandler,
    private readonly editSingleOccurrenceHandler: EditSingleOccurrenceHandler,
    private readonly editFutureOccurrencesHandler: EditFutureOccurrencesHandler,
    private readonly cancelSeriesHandler: CancelRecurrenceSeriesHandler,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('appointments.create')
  @ApiOperation({
    summary: 'Create recurring appointment series and generate initial rolling window',
    description:
      'Instantiates a new RecurrenceSeries aggregate, persists it, and deterministically generates initial unconflicted occurrences for the horizon window.',
  })
  @ApiResponse({
    status: 201,
    description: 'Series created successfully with initial generation metrics.',
    type: CreateRecurrenceSeriesResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request payload or malformed arguments.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Insufficient privileges.' })
  @ApiResponse({ status: 409, description: 'Conflict detected during occurrence generation.' })
  @ApiResponse({ status: 422, description: 'Booking policy or duration violation.' })
  public async createSeries(
    @Body() dto: CreateRecurrenceSeriesRequestDto,
  ): Promise<CreateRecurrenceSeriesResponseDto> {
    const command = new CreateRecurrenceSeriesCommand({
      clientId: dto.clientId,
      therapistId: dto.therapistId,
      roomId: dto.roomId,
      serviceType: dto.serviceType,
      frequency: dto.frequency,
      startDate: dto.startDate,
      endDate: dto.endDate,
      maxOccurrences: dto.maxOccurrences,
      localStartTime: dto.localStartTime,
      durationMinutes: dto.durationMinutes,
      timezone: dto.timezone,
      horizonDays: dto.horizonDays,
    });

    const result = await this.createSeriesHandler.execute(command);

    if (!result.isSuccess) {
      const err = result.getError();
      if (err.toLowerCase().includes('conflict')) {
        throw new ConflictException(err);
      }
      throw new BadRequestException(err);
    }

    return result.getValue() as unknown as CreateRecurrenceSeriesResponseDto;
  }

  @Post(':seriesId/skip')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('appointments.update')
  @ApiOperation({
    summary: 'Skip a specific recurrence occurrence slot',
    description:
      'Records a SKIPPED exception on the parent series and automatically cancels any materialized appointment aggregate for that occurrence slot.',
  })
  @ApiParam({ name: 'seriesId', description: 'ID of the recurrence series', type: String })
  @ApiResponse({
    status: 200,
    description: 'Occurrence slot skipped successfully.',
    type: SkipOccurrenceResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Insufficient privileges.' })
  @ApiResponse({ status: 404, description: 'Recurrence series not found.' })
  @ApiResponse({ status: 422, description: 'Cannot skip occurrence on non-active series.' })
  public async skipOccurrence(
    @Param('seriesId') seriesId: string,
    @Body() dto: SkipOccurrenceRequestDto,
  ): Promise<SkipOccurrenceResponseDto> {
    const command = new SkipRecurrenceOccurrenceCommand({
      seriesId,
      occurrenceIndex: dto.occurrenceIndex,
      reason: dto.reason,
    });

    const result = await this.skipOccurrenceHandler.execute(command);

    if (!result.isSuccess) {
      const err = result.getError();
      if (err.toLowerCase().includes('not found')) {
        throw new NotFoundException(err);
      }
      if (err.toLowerCase().includes('non-active') || err.toLowerCase().includes('cancelled')) {
        throw new UnprocessableEntityException(err);
      }
      throw new BadRequestException(err);
    }

    return result.getValue() as unknown as SkipOccurrenceResponseDto;
  }

  @Patch('occurrences/:appointmentId')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('appointments.update')
  @ApiOperation({
    summary: 'Edit and detach a single materialized occurrence',
    description:
      'Detaches the specific appointment aggregate from the recurring series (isDetachedFromSeries = true), records a MODIFIED exception on the parent series, and applies requested schedule/resource changes with full conflict detection.',
  })
  @ApiParam({
    name: 'appointmentId',
    description: 'ID of the materialized appointment occurrence',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Appointment detached and updated successfully.',
  })
  @ApiResponse({ status: 400, description: 'Invalid request payload.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Insufficient privileges.' })
  @ApiResponse({ status: 404, description: 'Appointment or parent series not found.' })
  @ApiResponse({ status: 409, description: 'Rescheduling conflict detected.' })
  public async editSingleOccurrence(
    @Param('appointmentId') appointmentId: string,
    @Body() dto: EditSingleOccurrenceRequestDto,
  ) {
    const command = new EditSingleOccurrenceCommand({
      appointmentId,
      startTime: dto.newStartTime ? new Date(dto.newStartTime) : undefined,
      therapistId: dto.newTherapistId,
      roomId: dto.newRoomId,
      reason: dto.rescheduleReason,
    });

    const result = await this.editSingleOccurrenceHandler.execute(command);

    if (!result.isSuccess) {
      const err = result.getError();
      if (err.toLowerCase().includes('not found')) {
        throw new NotFoundException(err);
      }
      if (err.toLowerCase().includes('conflict')) {
        throw new ConflictException(err);
      }
      throw new BadRequestException(err);
    }

    return result.getValue();
  }

  @Post(':seriesId/edit-future')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('appointments.update')
  @ApiOperation({
    summary: 'Edit future recurrence occurrences (Cutoff-and-Fork)',
    description:
      'Terminates the existing series at the cutoff date, cancels future unmaterialized/scheduled appointments of the old series, creates a new series aggregate starting at the cutoff date with updated parameters, and immediately materializes the new initial rolling window.',
  })
  @ApiParam({ name: 'seriesId', description: 'ID of the existing recurrence series', type: String })
  @ApiResponse({
    status: 200,
    description: 'Future series branch created and initialized.',
    type: EditFutureOccurrencesResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request payload.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Insufficient privileges.' })
  @ApiResponse({ status: 404, description: 'Recurrence series not found.' })
  @ApiResponse({ status: 422, description: 'Cannot edit future occurrences on non-active series.' })
  public async editFutureOccurrences(
    @Param('seriesId') seriesId: string,
    @Body() dto: EditFutureOccurrencesRequestDto,
  ): Promise<EditFutureOccurrencesResponseDto> {
    const command = new EditFutureOccurrencesCommand({
      seriesId,
      fromOccurrenceIndex: dto.fromOccurrenceIndex ?? 0,
      fromDate: new Date(dto.cutoffDate),
      newFrequency: dto.newFrequency,
      newLocalStartTime: dto.newLocalStartTime,
      newDurationMinutes: dto.newDurationMinutes,
      newTherapistId: dto.newTherapistId,
      newRoomId: dto.newRoomId,
      newEndDate: dto.newEndDate ? new Date(dto.newEndDate) : undefined,
      newMaxOccurrences: dto.newMaxOccurrences,
    });

    const result = await this.editFutureOccurrencesHandler.execute(command);

    if (!result.isSuccess) {
      const err = result.getError();
      if (err.toLowerCase().includes('not found')) {
        throw new NotFoundException(err);
      }
      if (err.toLowerCase().includes('non-active') || err.toLowerCase().includes('cancelled')) {
        throw new UnprocessableEntityException(err);
      }
      throw new BadRequestException(err);
    }

    return result.getValue() as unknown as EditFutureOccurrencesResponseDto;
  }

  @Post(':seriesId/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('appointments.delete')
  @ApiOperation({
    summary: 'Cancel recurring appointment series',
    description:
      'Marks the RecurrenceSeries as CANCELLED, cancels all future non-detached materialized appointments, and cleanly preserves past completed appointments.',
  })
  @ApiParam({ name: 'seriesId', description: 'ID of the recurrence series', type: String })
  @ApiResponse({
    status: 200,
    description: 'Series cancelled successfully.',
    type: CancelRecurrenceSeriesResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request payload.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Insufficient privileges.' })
  @ApiResponse({ status: 404, description: 'Recurrence series not found.' })
  public async cancelSeries(
    @Param('seriesId') seriesId: string,
    @Body() dto: CancelRecurrenceSeriesRequestDto,
  ): Promise<CancelRecurrenceSeriesResponseDto> {
    const command = new CancelRecurrenceSeriesCommand({
      seriesId,
      reason: dto.reason ?? 'Cancelled via Recurring Appointments API',
    });

    const result = await this.cancelSeriesHandler.execute(command);

    if (!result.isSuccess) {
      const err = result.getError();
      if (err.toLowerCase().includes('not found')) {
        throw new NotFoundException(err);
      }
      throw new BadRequestException(err);
    }

    return result.getValue() as unknown as CancelRecurrenceSeriesResponseDto;
  }
}
