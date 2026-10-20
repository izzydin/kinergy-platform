import {
  Controller,
  Post,
  Put,
  Patch,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UnprocessableEntityException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { Permissions } from '../../platform/identity/decorators';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import {
  CreateTreatmentSessionFromAppointmentHandler,
  CreateTreatmentSessionFromAppointmentCommand,
  GetTreatmentSessionByIdHandler,
  GetTreatmentSessionByIdQuery,
  StartTreatmentSessionHandler,
  StartTreatmentSessionCommand,
  AssignTherapistToSessionHandler,
  AssignTherapistToSessionCommand,
  UpdateSessionNotesHandler,
  UpdateSessionNotesCommand,
  CompleteTreatmentSessionHandler,
  CompleteTreatmentSessionCommand,
  CancelTreatmentSessionHandler,
  CancelTreatmentSessionCommand,
  GetClientTreatmentHistoryHandler,
  GetClientTreatmentHistoryQuery,
  SessionStatus,
} from '@kinergy-platform/core';

export class CreateTreatmentSessionDto {
  @ApiProperty({ description: 'Scheduled appointment unique identifier' })
  @IsString()
  @IsNotEmpty({ message: 'appointmentId is required.' })
  appointmentId!: string;

  @ApiPropertyOptional({ description: 'Optional initial clinical notes' })
  @IsOptional()
  @IsString()
  initialNotes?: string;

  @ApiPropertyOptional({ description: 'Optionally transition immediately to in-progress' })
  @IsOptional()
  @IsBoolean()
  autoStart?: boolean;
}

export class AssignTherapistDto {
  @ApiProperty({ description: 'Unique identifier of the newly assigned practitioner' })
  @IsString()
  @IsNotEmpty({ message: 'newTherapistId is required.' })
  newTherapistId!: string;
}

export class UpdateSessionNotesDto {
  @ApiPropertyOptional({ description: 'Subjective client report' })
  @IsOptional()
  @IsString()
  subjective?: string;

  @ApiPropertyOptional({ description: 'Objective clinical observations' })
  @IsOptional()
  @IsString()
  objective?: string;

  @ApiPropertyOptional({ description: 'Assessment and diagnosis' })
  @IsOptional()
  @IsString()
  assessment?: string;

  @ApiPropertyOptional({ description: 'Treatment and follow-up plan' })
  @IsOptional()
  @IsString()
  plan?: string;

  @ApiPropertyOptional({ description: 'Free-form clinical notes' })
  @IsOptional()
  @IsString()
  rawText?: string;
}

export class CancelTreatmentSessionDto {
  @ApiProperty({ description: 'Mandatory explanation for treatment session cancellation' })
  @IsString()
  @IsNotEmpty({ message: 'Cancellation reason is required.' })
  reason!: string;
}

export class TreatmentHistoryQueryDto {
  @ApiPropertyOptional({ description: 'Page number for pagination (1-indexed)', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Page size limit (min: 1, max: 100)', example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Filter by session lifecycle status', enum: SessionStatus })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by practitioner ID' })
  @IsOptional()
  @IsString()
  therapistId?: string;

  @ApiPropertyOptional({ description: 'Filter by start date ISO string' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter by end date ISO string' })
  @IsOptional()
  @IsString()
  dateTo?: string;
}

@ApiTags('Kinesiology - Treatment Sessions')
@Controller('kinesiology')
@UseGuards(AuthorizationGuard)
export class TreatmentSessionsController {
  constructor(
    private readonly createSessionHandler: CreateTreatmentSessionFromAppointmentHandler,
    private readonly getSessionByIdHandler: GetTreatmentSessionByIdHandler,
    private readonly startSessionHandler: StartTreatmentSessionHandler,
    private readonly assignTherapistHandler: AssignTherapistToSessionHandler,
    private readonly updateNotesHandler: UpdateSessionNotesHandler,
    private readonly completeSessionHandler: CompleteTreatmentSessionHandler,
    private readonly cancelSessionHandler: CancelTreatmentSessionHandler,
    private readonly getHistoryHandler: GetClientTreatmentHistoryHandler,
  ) {}

  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  @Permissions('kinesiology.sessions.treat')
  @ApiOperation({ summary: 'Create treatment session from appointment' })
  @ApiResponse({ status: 201, description: 'Treatment session created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Appointment not found' })
  @ApiResponse({ status: 409, description: 'Session already exists for appointment' })
  @ApiResponse({ status: 422, description: 'Appointment ineligible for treatment' })
  public async createSession(@Body() dto: CreateTreatmentSessionDto) {
    if (!dto?.appointmentId || dto.appointmentId.trim().length === 0) {
      throw new BadRequestException('appointmentId is required.');
    }

    const command = new CreateTreatmentSessionFromAppointmentCommand({
      appointmentId: dto.appointmentId,
      initialNotes: dto.initialNotes,
      autoStart: dto.autoStart,
    });

    const result = await this.createSessionHandler.execute(command);

    if (result.isFailure) {
      const error = result.getError();
      if (error.includes('already exists')) {
        throw new ConflictException(error);
      }
      if (error.includes('not found')) {
        throw new NotFoundException(error);
      }
      if (error.includes('empty')) {
        throw new BadRequestException(error);
      }
      throw new UnprocessableEntityException(error);
    }

    return result.getValue();
  }

  @Get('sessions/:id')
  @HttpCode(HttpStatus.OK)
  @Permissions('kinesiology.sessions.read')
  @ApiOperation({ summary: 'Get treatment session by ID' })
  @ApiParam({ name: 'id', description: 'Treatment session unique identifier' })
  @ApiResponse({ status: 200, description: 'Treatment session retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Treatment session not found' })
  public async getSessionById(@Param('id') sessionId: string) {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new BadRequestException('Session ID cannot be empty.');
    }

    const query = new GetTreatmentSessionByIdQuery({ sessionId });
    const result = await this.getSessionByIdHandler.execute(query);

    if (result.isFailure) {
      const error = result.getError();
      if (error.includes('not found')) {
        throw new NotFoundException(error);
      }
      throw new BadRequestException(error);
    }

    return result.getValue();
  }

  @Post('sessions/:id/start')
  @HttpCode(HttpStatus.OK)
  @Permissions('kinesiology.sessions.treat')
  @ApiOperation({ summary: 'Start scheduled treatment session' })
  @ApiParam({ name: 'id', description: 'Treatment session unique identifier' })
  @ApiResponse({ status: 200, description: 'Treatment session started' })
  @ApiResponse({ status: 404, description: 'Treatment session not found' })
  @ApiResponse({ status: 422, description: 'Invalid state transition' })
  public async startSession(@Param('id') sessionId: string) {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new BadRequestException('Session ID cannot be empty.');
    }

    const command = new StartTreatmentSessionCommand({ sessionId });
    const result = await this.startSessionHandler.execute(command);

    if (result.isFailure) {
      const error = result.getError();
      if (error.includes('not found')) {
        throw new NotFoundException(error);
      }
      if (error.includes('empty')) {
        throw new BadRequestException(error);
      }
      throw new UnprocessableEntityException(error);
    }

    return result.getValue();
  }

  @Post('sessions/:id/assign-therapist')
  @HttpCode(HttpStatus.OK)
  @Permissions('kinesiology.sessions.assign')
  @ApiOperation({ summary: 'Assign practitioner to treatment session' })
  @ApiParam({ name: 'id', description: 'Treatment session unique identifier' })
  @ApiResponse({ status: 200, description: 'Therapist assigned successfully' })
  @ApiResponse({ status: 400, description: 'Invalid therapist ID' })
  @ApiResponse({ status: 404, description: 'Session or therapist not found' })
  @ApiResponse({ status: 422, description: 'Therapist ineligible or invalid transition' })
  public async assignTherapist(@Param('id') sessionId: string, @Body() dto: AssignTherapistDto) {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new BadRequestException('Session ID cannot be empty.');
    }
    if (!dto?.newTherapistId) {
      throw new BadRequestException('newTherapistId is required.');
    }

    const command = new AssignTherapistToSessionCommand({
      sessionId,
      newTherapistId: dto.newTherapistId,
    });

    const result = await this.assignTherapistHandler.execute(command);

    if (result.isFailure) {
      const error = result.getError();
      if (error.includes('not found')) {
        throw new NotFoundException(error);
      }
      if (error.includes('empty')) {
        throw new BadRequestException(error);
      }
      throw new UnprocessableEntityException(error);
    }

    return result.getValue();
  }

  @Patch('sessions/:id/therapist')
  @HttpCode(HttpStatus.OK)
  @Permissions('kinesiology.sessions.assign')
  @ApiOperation({ summary: 'Update practitioner assigned to treatment session (alias)' })
  @ApiParam({ name: 'id', description: 'Treatment session unique identifier' })
  @ApiResponse({ status: 200, description: 'Therapist assigned successfully' })
  public async patchTherapist(@Param('id') sessionId: string, @Body() dto: AssignTherapistDto) {
    return this.assignTherapist(sessionId, dto);
  }

  @Put('sessions/:id/notes')
  @HttpCode(HttpStatus.OK)
  @Permissions('kinesiology.sessions.treat')
  @ApiOperation({ summary: 'Update clinical SOAP notes' })
  @ApiParam({ name: 'id', description: 'Treatment session unique identifier' })
  @ApiResponse({ status: 200, description: 'Notes updated successfully' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiResponse({ status: 422, description: 'Attempted edit on signed/completed session' })
  public async updateNotes(@Param('id') sessionId: string, @Body() dto: UpdateSessionNotesDto) {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new BadRequestException('Session ID cannot be empty.');
    }

    const command = new UpdateSessionNotesCommand({
      sessionId,
      notes: dto,
    });

    const result = await this.updateNotesHandler.execute(command);

    if (result.isFailure) {
      const error = result.getError();
      if (error.includes('not found')) {
        throw new NotFoundException(error);
      }
      if (error.includes('empty')) {
        throw new BadRequestException(error);
      }
      throw new UnprocessableEntityException(error);
    }

    return result.getValue();
  }

  @Patch('sessions/:id/notes')
  @HttpCode(HttpStatus.OK)
  @Permissions('kinesiology.sessions.treat')
  @ApiOperation({ summary: 'Patch clinical SOAP notes (alias)' })
  @ApiParam({ name: 'id', description: 'Treatment session unique identifier' })
  @ApiResponse({ status: 200, description: 'Notes updated successfully' })
  public async patchNotes(@Param('id') sessionId: string, @Body() dto: UpdateSessionNotesDto) {
    return this.updateNotes(sessionId, dto);
  }

  @Post('sessions/:id/complete')
  @HttpCode(HttpStatus.OK)
  @Permissions('kinesiology.sessions.treat')
  @ApiOperation({ summary: 'Sign and complete treatment session' })
  @ApiParam({ name: 'id', description: 'Treatment session unique identifier' })
  @ApiResponse({ status: 200, description: 'Treatment session signed and completed' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiResponse({ status: 422, description: 'Invalid lifecycle transition' })
  public async completeSession(@Param('id') sessionId: string) {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new BadRequestException('Session ID cannot be empty.');
    }

    const command = new CompleteTreatmentSessionCommand({
      sessionId,
    });

    const result = await this.completeSessionHandler.execute(command);

    if (result.isFailure) {
      const error = result.getError();
      if (error.includes('not found')) {
        throw new NotFoundException(error);
      }
      if (error.includes('empty')) {
        throw new BadRequestException(error);
      }
      throw new UnprocessableEntityException(error);
    }

    return result.getValue();
  }

  @Post('sessions/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @Permissions('kinesiology.sessions.treat')
  @ApiOperation({ summary: 'Cancel treatment session with reason' })
  @ApiParam({ name: 'id', description: 'Treatment session unique identifier' })
  @ApiResponse({ status: 200, description: 'Treatment session cancelled' })
  @ApiResponse({ status: 400, description: 'Missing cancellation reason' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiResponse({ status: 422, description: 'Invalid cancellation transition' })
  public async cancelSession(
    @Param('id') sessionId: string,
    @Body() dto: CancelTreatmentSessionDto,
  ) {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new BadRequestException('Session ID cannot be empty.');
    }
    if (!dto?.reason || dto.reason.trim().length === 0) {
      throw new BadRequestException('Cancellation reason is required.');
    }

    const command = new CancelTreatmentSessionCommand({
      sessionId,
      reason: dto.reason,
    });

    const result = await this.cancelSessionHandler.execute(command);

    if (result.isFailure) {
      const error = result.getError();
      if (error.includes('not found')) {
        throw new NotFoundException(error);
      }
      if (error.includes('empty')) {
        throw new BadRequestException(error);
      }
      throw new UnprocessableEntityException(error);
    }

    return result.getValue();
  }

  @Get('clients/:clientId/treatment-history')
  @HttpCode(HttpStatus.OK)
  @Permissions('kinesiology.sessions.read')
  @ApiOperation({ summary: 'Get client treatment history and clinical notes' })
  @ApiParam({ name: 'clientId', description: 'Client unique identifier' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Treatment history retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  public async getTreatmentHistory(
    @Param('clientId') clientId: string,
    @Query() queryDto: TreatmentHistoryQueryDto,
  ) {
    if (!clientId || clientId.trim().length === 0) {
      throw new BadRequestException('Client ID cannot be empty.');
    }

    const dateFrom = queryDto.dateFrom ? new Date(queryDto.dateFrom) : undefined;
    const dateTo = queryDto.dateTo ? new Date(queryDto.dateTo) : undefined;

    if (dateFrom && isNaN(dateFrom.getTime())) {
      throw new BadRequestException('Invalid dateFrom parameter.');
    }
    if (dateTo && isNaN(dateTo.getTime())) {
      throw new BadRequestException('Invalid dateTo parameter.');
    }

    let statusEnum: SessionStatus | undefined;
    if (queryDto.status) {
      if (!Object.values(SessionStatus).includes(queryDto.status as SessionStatus)) {
        throw new BadRequestException(`Invalid session status: '${queryDto.status}'.`);
      }
      statusEnum = queryDto.status as SessionStatus;
    }

    const query = new GetClientTreatmentHistoryQuery({
      clientId,
      page: queryDto.page ? Number(queryDto.page) : undefined,
      limit: queryDto.limit ? Number(queryDto.limit) : undefined,
      status: statusEnum,
      therapistId: queryDto.therapistId,
      dateFrom,
      dateTo,
    });

    const result = await this.getHistoryHandler.execute(query);

    if (result.isFailure) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue();
  }
}
