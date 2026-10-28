import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnprocessableEntityException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { Permissions, Roles } from '../../platform/identity/decorators';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import {
  CreateAppointmentCommand,
  RescheduleAppointmentCommand,
  CancelAppointmentCommand,
  ConfirmAppointmentCommand,
  CheckInAppointmentCommand,
  CompleteAppointmentCommand,
  MarkNoShowCommand,
  AddAppointmentNoteCommand,
  GetAppointmentByIdQuery,
  FindAppointmentsByRangeQuery,
  GetDailyAgendaQuery,
  GetWeeklyAgendaQuery,
  CreateAppointmentHandler,
  RescheduleAppointmentHandler,
  CancelAppointmentHandler,
  ConfirmAppointmentHandler,
  CheckInAppointmentHandler,
  CompleteAppointmentHandler,
  MarkNoShowHandler,
  AddAppointmentNoteHandler,
  GetAppointmentByIdHandler,
  FindAppointmentsByRangeHandler,
  GetDailyAgendaHandler,
  GetWeeklyAgendaHandler,
  ConflictDetectionService,
  SlotFinderEngine,
  SlotSearchQuery,
  MultiResourceSlotSearchQuery,
  DefaultAppointmentDurationPolicy,
  AppointmentMapper,
  AppointmentDTO,
  AppointmentType,
  TimeRange,
  Duration,
  Clock,
  SystemClock,
} from '@kinergy-platform/core';
import { PrismaAppointmentRepository } from '@kinergy-platform/core/server';
import { SchedulingExceptionFilter } from '../filters/scheduling-exception.filter';

export const SCHEDULING_CLOCK_TOKEN = 'SCHEDULING_CLOCK_TOKEN';

@ApiTags('Scheduling & Appointments')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@UseFilters(SchedulingExceptionFilter)
@Controller('api/v1/scheduling')
export class AppointmentsController {
  private readonly clock: Clock;
  private readonly durationPolicy = new DefaultAppointmentDurationPolicy();

  constructor(
    private readonly createAppointmentHandler: CreateAppointmentHandler,
    private readonly rescheduleAppointmentHandler: RescheduleAppointmentHandler,
    private readonly cancelAppointmentHandler: CancelAppointmentHandler,
    private readonly confirmAppointmentHandler: ConfirmAppointmentHandler,
    private readonly checkInAppointmentHandler: CheckInAppointmentHandler,
    private readonly completeAppointmentHandler: CompleteAppointmentHandler,
    private readonly markNoShowHandler: MarkNoShowHandler,
    private readonly addAppointmentNoteHandler: AddAppointmentNoteHandler,
    private readonly getAppointmentByIdHandler: GetAppointmentByIdHandler,
    private readonly findAppointmentsByRangeHandler: FindAppointmentsByRangeHandler,
    private readonly getDailyAgendaHandler: GetDailyAgendaHandler,
    private readonly getWeeklyAgendaHandler: GetWeeklyAgendaHandler,
    private readonly conflictDetectionService: ConflictDetectionService,
    private readonly slotFinderEngine: SlotFinderEngine,
    private readonly appointmentRepository: PrismaAppointmentRepository,
    @Optional()
    @Inject(SCHEDULING_CLOCK_TOKEN)
    clock?: Clock,
  ) {
    this.clock = clock ?? new SystemClock();
  }

  @Get('appointments')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('appointments.read')
  @ApiOperation({ summary: 'List appointments within a UTC date range with optional filters' })
  @ApiResponse({ status: 200, description: 'Appointments retrieved successfully.' })
  public async listAppointments(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('therapistId') therapistId?: string,
    @Query('roomId') roomId?: string,
    @Query('clientId') clientId?: string,
    @Query('status') status?: string,
  ) {
    const resolvedStart = startDate ?? startTime;
    const resolvedEnd = endDate ?? endTime;

    if (!resolvedStart || !resolvedEnd) {
      throw new BadRequestException('Both startDate and endDate query parameters are required.');
    }

    const query = new FindAppointmentsByRangeQuery({
      startTime: resolvedStart,
      endTime: resolvedEnd,
      therapistId,
      roomId,
      clientId,
      status,
    });

    const result = await this.findAppointmentsByRangeHandler.execute(query);
    if (!result.isSuccess) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue().map((dto) => this.enrichAppointmentDto(dto));
  }

  @Get('appointments/:id')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('appointments.read')
  @ApiOperation({ summary: 'Retrieve a single appointment by ID' })
  @ApiParam({ name: 'id', description: 'Unique Appointment ID' })
  @ApiResponse({ status: 200, description: 'Appointment retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Appointment not found.' })
  public async getAppointment(@Param('id') id: string) {
    const result = await this.getAppointmentByIdHandler.execute(
      new GetAppointmentByIdQuery({ appointmentId: id }),
    );

    if (!result.isSuccess) {
      throw new NotFoundException(result.getError());
    }

    return this.enrichAppointmentDto(result.getValue());
  }

  @Post('appointments')
  @HttpCode(HttpStatus.CREATED)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('appointments.create')
  @ApiOperation({
    summary: 'Book a new appointment with 4D conflict detection and policy enforcement',
  })
  @ApiResponse({ status: 201, description: 'Appointment created successfully.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 409, description: 'Scheduling conflict detected.' })
  @ApiResponse({ status: 422, description: 'Domain booking window or duration policy violation.' })
  public async createAppointment(@Body() dto: Record<string, unknown>, @Req() req: Request) {
    const clientId = typeof dto?.clientId === 'string' ? dto.clientId.trim() : '';
    const therapistId = typeof dto?.therapistId === 'string' ? dto.therapistId.trim() : '';
    const roomId = typeof dto?.roomId === 'string' ? dto.roomId.trim() : '';
    const type = typeof dto?.type === 'string' ? dto.type.trim() : '';
    const startTime = typeof dto?.startTime === 'string' ? dto.startTime.trim() : '';
    const endTime = typeof dto?.endTime === 'string' ? dto.endTime.trim() : undefined;
    const requestToken =
      typeof dto?.requestToken === 'string' ? dto.requestToken.trim() : undefined;
    const notesText = typeof dto?.notes === 'string' ? dto.notes.trim() : '';

    if (!clientId || !therapistId || !roomId || !type || !startTime) {
      throw new BadRequestException(
        'clientId, therapistId, roomId, type, and startTime are required to create an appointment.',
      );
    }

    const command = new CreateAppointmentCommand({
      clientId,
      therapistId,
      roomId,
      type,
      startTime,
      endTime,
      requestToken,
      requiredCapacity:
        typeof dto?.requiredCapacity === 'number' ? dto.requiredCapacity : undefined,
      requiredFeatures: Array.isArray(dto?.requiredFeatures)
        ? (dto.requiredFeatures as string[])
        : undefined,
    });

    const result = await this.createAppointmentHandler.execute(command);
    if (!result.isSuccess) {
      this.throwMappedError(result.getError());
    }

    let createdDto = result.getValue();

    if (notesText.length > 0) {
      const reqUser = (req as unknown as { user?: AuthenticatedUserContext }).user;
      const authorId = reqUser?.userId ?? 'system';
      const noteResult = await this.addAppointmentNoteHandler.execute(
        new AddAppointmentNoteCommand({
          appointmentId: createdDto.id,
          authorId,
          noteText: notesText,
          expectedVersion: createdDto.version,
        }),
      );
      if (noteResult.isSuccess) {
        createdDto = noteResult.getValue();
      }
    }

    return this.enrichAppointmentDto(createdDto);
  }

  @Patch('appointments/:id/reschedule')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('appointments.create')
  @ApiOperation({ summary: 'Reschedule an existing appointment to a new time window' })
  public async rescheduleAppointment(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
  ) {
    const newStartTime = typeof dto?.newStartTime === 'string' ? dto.newStartTime.trim() : '';
    const newEndTime = typeof dto?.newEndTime === 'string' ? dto.newEndTime.trim() : '';
    const newRoomId = typeof dto?.newRoomId === 'string' ? dto.newRoomId.trim() : undefined;

    if (!newStartTime || !newEndTime) {
      throw new BadRequestException('newStartTime and newEndTime are required for rescheduling.');
    }

    const expectedVersion = await this.resolveExpectedVersion(id, dto?.expectedVersion);

    const command = new RescheduleAppointmentCommand({
      appointmentId: id,
      newStartTime,
      newEndTime,
      newRoomId,
      expectedVersion,
    });

    const result = await this.rescheduleAppointmentHandler.execute(command);
    if (!result.isSuccess) {
      this.throwMappedError(result.getError());
    }

    return this.enrichAppointmentDto(result.getValue());
  }

  @Post('appointments/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('appointments.create')
  @ApiOperation({ summary: 'Cancel an active appointment with a mandatory reason' })
  public async cancelAppointment(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    const reason = typeof dto?.reason === 'string' ? dto.reason.trim() : '';
    if (!reason) {
      throw new BadRequestException('Cancellation reason is required.');
    }

    const expectedVersion = await this.resolveExpectedVersion(id, dto?.expectedVersion);

    const command = new CancelAppointmentCommand({
      appointmentId: id,
      reason,
      expectedVersion,
    });

    const result = await this.cancelAppointmentHandler.execute(command);
    if (!result.isSuccess) {
      this.throwMappedError(result.getError());
    }

    return this.enrichAppointmentDto(result.getValue());
  }

  @Post('appointments/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('appointments.create')
  @ApiOperation({ summary: 'Confirm a scheduled appointment' })
  public async confirmAppointment(@Param('id') id: string, @Body() dto?: Record<string, unknown>) {
    const expectedVersion = await this.resolveExpectedVersion(id, dto?.expectedVersion);

    const result = await this.confirmAppointmentHandler.execute(
      new ConfirmAppointmentCommand({
        appointmentId: id,
        expectedVersion,
      }),
    );

    if (!result.isSuccess) {
      this.throwMappedError(result.getError());
    }

    return this.enrichAppointmentDto(result.getValue());
  }

  @Post('appointments/:id/check-in')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('appointments.create')
  @ApiOperation({ summary: 'Check in client upon arrival for scheduled/confirmed appointment' })
  public async checkInAppointment(@Param('id') id: string, @Body() dto?: Record<string, unknown>) {
    const expectedVersion = await this.resolveExpectedVersion(id, dto?.expectedVersion);

    const result = await this.checkInAppointmentHandler.execute(
      new CheckInAppointmentCommand({
        appointmentId: id,
        expectedVersion,
      }),
    );

    if (!result.isSuccess) {
      this.throwMappedError(result.getError());
    }

    return this.enrichAppointmentDto(result.getValue());
  }

  @Post('appointments/:id/start')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('appointments.create')
  @ApiOperation({ summary: 'Start an appointment (CHECKED_IN -> IN_PROGRESS)' })
  public async startAppointment(@Param('id') id: string, @Body() dto?: Record<string, unknown>) {
    const appointment = await this.appointmentRepository.findById(id);
    if (!appointment) {
      throw new NotFoundException(`Appointment with ID '${id}' not found.`);
    }

    if (typeof dto?.expectedVersion === 'number' && appointment.version !== dto.expectedVersion) {
      throw new ConflictException(
        `Concurrency conflict: Appointment '${id}' is at version ${appointment.version}, expected ${dto.expectedVersion}.`,
      );
    }

    try {
      appointment.start(this.clock);
      await this.appointmentRepository.save(appointment);
      return this.enrichAppointmentDto(AppointmentMapper.toDTO(appointment));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.throwMappedError(message);
    }
  }

  @Post('appointments/:id/complete')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('appointments.create')
  @ApiOperation({ summary: 'Mark an in-progress appointment as completed' })
  public async completeAppointment(@Param('id') id: string, @Body() dto?: Record<string, unknown>) {
    const expectedVersion = await this.resolveExpectedVersion(id, dto?.expectedVersion);

    const result = await this.completeAppointmentHandler.execute(
      new CompleteAppointmentCommand({
        appointmentId: id,
        expectedVersion,
      }),
    );

    if (!result.isSuccess) {
      this.throwMappedError(result.getError());
    }

    return this.enrichAppointmentDto(result.getValue());
  }

  @Post('appointments/:id/no-show')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('appointments.create')
  @ApiOperation({ summary: 'Mark a scheduled or confirmed appointment as NO_SHOW' })
  public async markNoShow(@Param('id') id: string, @Body() dto?: Record<string, unknown>) {
    const expectedVersion = await this.resolveExpectedVersion(id, dto?.expectedVersion);
    const reason = typeof dto?.reason === 'string' ? dto.reason.trim() : undefined;

    const result = await this.markNoShowHandler.execute(
      new MarkNoShowCommand({
        appointmentId: id,
        expectedVersion,
        reason,
      }),
    );

    if (!result.isSuccess) {
      this.throwMappedError(result.getError());
    }

    return this.enrichAppointmentDto(result.getValue());
  }

  @Post('appointments/:id/notes')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('appointments.create')
  @ApiOperation({ summary: 'Append an operational note to an appointment' })
  public async addAppointmentNote(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @Req() req: Request,
  ) {
    const noteText =
      typeof dto?.content === 'string'
        ? dto.content.trim()
        : typeof dto?.noteText === 'string'
          ? dto.noteText.trim()
          : '';

    if (!noteText) {
      throw new BadRequestException('Appointment note content cannot be empty.');
    }

    const expectedVersion = await this.resolveExpectedVersion(id, dto?.expectedVersion);
    const reqUser = (req as unknown as { user?: AuthenticatedUserContext }).user;
    const authorId =
      typeof dto?.authorId === 'string' && dto.authorId.trim()
        ? dto.authorId.trim()
        : (reqUser?.userId ?? 'system');

    const result = await this.addAppointmentNoteHandler.execute(
      new AddAppointmentNoteCommand({
        appointmentId: id,
        authorId,
        noteText,
        expectedVersion,
      }),
    );

    if (!result.isSuccess) {
      this.throwMappedError(result.getError());
    }

    return this.enrichAppointmentDto(result.getValue());
  }

  @Post('availability/check-conflict')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('appointments.read')
  @ApiOperation({ summary: 'Evaluate 4D scheduling conflicts for a proposed appointment window' })
  public async checkConflict(@Body() dto: Record<string, unknown>) {
    const therapistId = typeof dto?.therapistId === 'string' ? dto.therapistId.trim() : '';
    const roomId = typeof dto?.roomId === 'string' ? dto.roomId.trim() : '';
    const clientId = typeof dto?.clientId === 'string' ? dto.clientId.trim() : '';
    const startTime = typeof dto?.startTime === 'string' ? dto.startTime.trim() : '';
    const endTime = typeof dto?.endTime === 'string' ? dto.endTime.trim() : '';
    const appointmentType =
      typeof dto?.appointmentType === 'string' ? dto.appointmentType.trim() : undefined;
    const excludeAppointmentId =
      typeof dto?.excludeAppointmentId === 'string' ? dto.excludeAppointmentId.trim() : undefined;

    if (!therapistId || !roomId || !startTime || !endTime) {
      throw new BadRequestException(
        'therapistId, roomId, startTime, and endTime are required for conflict checking.',
      );
    }

    let requestedRange: TimeRange;
    try {
      requestedRange = TimeRange.create(new Date(startTime), new Date(endTime));
    } catch (err: unknown) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid time range.');
    }

    const parsedApptType = appointmentType ? AppointmentType.create(appointmentType) : undefined;

    const evaluation = await this.conflictDetectionService.evaluateConflicts({
      therapistId,
      roomId,
      clientId,
      requestedRange,
      appointmentType: parsedApptType,
      excludeAppointmentId,
    });

    return {
      hasConflict: evaluation.hasConflicts,
      conflicts: evaluation.conflicts.map((c) => ({
        category: c.conflictType,
        conflictingEntityId: c.conflictingEntityId,
        reason: c.reason,
      })),
    };
  }

  @Get('availability/slots')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('appointments.read')
  @ApiOperation({ summary: 'Find available unconflicted time slots for a date and service type' })
  public async findAvailableSlots(
    @Query('date') date?: string,
    @Query('serviceType') serviceType?: string,
    @Query('therapistId') therapistId?: string,
    @Query('roomId') roomId?: string,
    @Query('clientId') clientId?: string,
  ) {
    if (!date || !serviceType) {
      throw new BadRequestException('Both date and serviceType query parameters are required.');
    }

    const dateStr = date.includes('T') ? date.split('T')[0]! : date;
    const dayStart = new Date(`${dateStr}T08:00:00.000Z`);
    const dayEnd = new Date(`${dateStr}T18:00:00.000Z`);

    if (isNaN(dayStart.getTime()) || isNaN(dayEnd.getTime())) {
      throw new BadRequestException(`Invalid date parameter '${date}'.`);
    }

    let duration: Duration;
    let parsedServiceType: AppointmentType | undefined;
    try {
      parsedServiceType = AppointmentType.create(serviceType);
      duration = this.durationPolicy.getDefaultDuration(parsedServiceType);
    } catch {
      duration = Duration.fromMinutes(60);
    }

    if (therapistId && roomId) {
      const slots = await this.slotFinderEngine.findAvailableSlots(
        new SlotSearchQuery({
          therapistId,
          roomId,
          clientId,
          duration,
          startDate: dayStart,
          endDate: dayEnd,
          appointmentType: parsedServiceType,
          stepIntervalMinutes: 30,
        }),
      );

      return slots.map((slot) => ({
        startTime: slot.timeRange.start.toISOString(),
        endTime: slot.timeRange.end.toISOString(),
        therapistId: slot.therapistId,
        roomId: slot.roomId,
        available: true,
      }));
    }

    const combinations = await this.slotFinderEngine.findCompatibleCombinations(
      new MultiResourceSlotSearchQuery({
        therapistIds: therapistId ? [therapistId] : ['therapist-1'],
        roomIds: roomId ? [roomId] : undefined,
        clientId,
        duration,
        startDate: dayStart,
        endDate: dayEnd,
        appointmentType: parsedServiceType,
        stepIntervalMinutes: 30,
      }),
    );

    return combinations.map((slot) => ({
      startTime: slot.timeRange.start.toISOString(),
      endTime: slot.timeRange.end.toISOString(),
      therapistId: slot.therapistId,
      roomId: slot.roomId,
      available: true,
    }));
  }

  @Get('calendar/agenda')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('appointments.read')
  @ApiOperation({ summary: 'Retrieve daily or weekly calendar agenda projection' })
  public async getCalendarAgenda(
    @Query('view') view?: 'day' | 'week',
    @Query('date') date?: string,
    @Query('therapistId') therapistId?: string,
    @Query('roomId') roomId?: string,
    @Query('timezone') timezone?: string,
  ) {
    const targetDate = date ?? this.clock.now().toISOString().split('T')[0]!;

    if (view === 'week') {
      const result = await this.getWeeklyAgendaHandler.execute(
        new GetWeeklyAgendaQuery({
          startDate: targetDate,
          therapistId,
          roomId,
          timezone,
        }),
      );
      if (!result.isSuccess) {
        throw new BadRequestException(result.getError());
      }
      return result.getValue();
    }

    const result = await this.getDailyAgendaHandler.execute(
      new GetDailyAgendaQuery({
        date: targetDate,
        therapistId,
        roomId,
        timezone,
      }),
    );
    if (!result.isSuccess) {
      throw new BadRequestException(result.getError());
    }
    return result.getValue();
  }

  @Get('service-types')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('appointments.read')
  @ApiOperation({
    summary: 'List supported clinical and scheduling service types with duration policies',
  })
  public getServiceTypes() {
    return [
      {
        type: 'ASSESSMENT',
        label: 'Initial Clinical Assessment',
        standardDurationMinutes: 60,
        minDurationMinutes: 45,
        maxDurationMinutes: 90,
      },
      {
        type: 'TREATMENT',
        label: 'Kinesiology Treatment Session',
        standardDurationMinutes: 45,
        minDurationMinutes: 30,
        maxDurationMinutes: 90,
      },
      {
        type: 'FOLLOW_UP',
        label: 'Follow-Up Session',
        standardDurationMinutes: 30,
        minDurationMinutes: 15,
        maxDurationMinutes: 60,
      },
      {
        type: 'EVALUATION',
        label: 'Functional Re-Evaluation',
        standardDurationMinutes: 60,
        minDurationMinutes: 30,
        maxDurationMinutes: 120,
      },
    ];
  }

  private async resolveExpectedVersion(
    appointmentId: string,
    providedVersion: unknown,
  ): Promise<number> {
    if (typeof providedVersion === 'number') {
      return providedVersion;
    }
    const existingResult = await this.getAppointmentByIdHandler.execute(
      new GetAppointmentByIdQuery({ appointmentId }),
    );
    if (!existingResult.isSuccess) {
      throw new NotFoundException(existingResult.getError());
    }
    return existingResult.getValue().version;
  }

  private enrichAppointmentDto(dto: AppointmentDTO) {
    return {
      ...dto,
      notes: (dto.notes ?? []).map((note) => ({
        ...note,
        content: note.noteText,
      })),
    };
  }

  private throwMappedError(errorMessage: string): never {
    const lower = errorMessage.toLowerCase();
    if (lower.includes('not found')) {
      throw new NotFoundException(errorMessage);
    }
    if (lower.includes('conflict')) {
      throw new ConflictException(errorMessage);
    }
    if (
      lower.includes('cannot transition') ||
      lower.includes('invalid status') ||
      lower.includes('booking window') ||
      lower.includes('duration') ||
      lower.includes('cannot book') ||
      lower.includes('cannot cancel') ||
      lower.includes('cannot reschedule') ||
      lower.includes('cannot add note') ||
      lower.includes('already in') ||
      lower.includes('terminal state') ||
      lower.includes('policy')
    ) {
      throw new UnprocessableEntityException(errorMessage);
    }
    throw new BadRequestException(errorMessage);
  }
}
