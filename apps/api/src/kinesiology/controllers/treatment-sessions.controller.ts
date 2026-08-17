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
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
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
  appointmentId!: string;
  initialNotes?: string;
  autoStart?: boolean;
}

export class AssignTherapistDto {
  newTherapistId!: string;
}

export class UpdateSessionNotesDto {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  rawText?: string;
}

export class CancelTreatmentSessionDto {
  reason!: string;
}

export class TreatmentHistoryQueryDto {
  page?: number;
  limit?: number;
  status?: string;
  therapistId?: string;
  dateFrom?: string;
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
  @Patch('sessions/:id/therapist')
  @HttpCode(HttpStatus.OK)
  @Permissions('kinesiology.sessions.assign')
  @ApiOperation({ summary: 'Assign practitioner to treatment session' })
  @ApiParam({ name: 'id', description: 'Treatment session unique identifier' })
  @ApiResponse({ status: 200, description: 'Therapist assigned successfully' })
  @ApiResponse({ status: 400, description: 'Invalid therapist ID' })
  @ApiResponse({ status: 404, description: 'Session or therapist not found' })
  @ApiResponse({ status: 422, description: 'Therapist ineligible or invalid transition' })
  public async assignTherapist(@Param('id') sessionId: string, @Body() dto: AssignTherapistDto) {
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

  @Put('sessions/:id/notes')
  @Patch('sessions/:id/notes')
  @HttpCode(HttpStatus.OK)
  @Permissions('kinesiology.sessions.treat')
  @ApiOperation({ summary: 'Update clinical SOAP notes' })
  @ApiParam({ name: 'id', description: 'Treatment session unique identifier' })
  @ApiResponse({ status: 200, description: 'Notes updated successfully' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiResponse({ status: 422, description: 'Attempted edit on signed/completed session' })
  public async updateNotes(@Param('id') sessionId: string, @Body() dto: UpdateSessionNotesDto) {
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

  @Post('sessions/:id/complete')
  @HttpCode(HttpStatus.OK)
  @Permissions('kinesiology.sessions.treat')
  @ApiOperation({ summary: 'Sign and complete treatment session' })
  @ApiParam({ name: 'id', description: 'Treatment session unique identifier' })
  @ApiResponse({ status: 200, description: 'Treatment session signed and completed' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiResponse({ status: 422, description: 'Invalid lifecycle transition' })
  public async completeSession(@Param('id') sessionId: string) {
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
