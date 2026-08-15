import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { Permissions, Roles } from '../../platform/identity/decorators';
import {
  CreateRoomCommand,
  EditRoomCommand,
  ActivateRoomCommand,
  DeactivateRoomCommand,
  ScheduleMaintenanceCommand,
  CancelMaintenanceCommand,
  GetRoomQuery,
  ListRoomsQuery,
  CheckRoomAvailabilityQuery,
  CreateRoomHandler,
  EditRoomHandler,
  ActivateRoomHandler,
  DeactivateRoomHandler,
  ScheduleMaintenanceHandler,
  CancelMaintenanceHandler,
  GetRoomHandler,
  ListRoomsHandler,
  CheckRoomAvailabilityHandler,
} from '@kinergy-platform/core';
import {
  CreateRoomRequestDto,
  EditRoomRequestDto,
  ActivateRoomRequestDto,
  DeactivateRoomRequestDto,
  ScheduleMaintenanceRequestDto,
  CheckRoomAvailabilityQueryDto,
  ListRoomsQueryDto,
  RoomResponseDto,
  RoomAvailabilityResponseDto,
} from '../dto';
import { SchedulingExceptionFilter } from '../filters/scheduling-exception.filter';

@ApiTags('Rooms & Schedulable Resources')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@UseFilters(SchedulingExceptionFilter)
@Controller('api/v1/scheduling/rooms')
export class RoomsController {
  constructor(
    private readonly createRoomHandler: CreateRoomHandler,
    private readonly editRoomHandler: EditRoomHandler,
    private readonly activateRoomHandler: ActivateRoomHandler,
    private readonly deactivateRoomHandler: DeactivateRoomHandler,
    private readonly scheduleMaintenanceHandler: ScheduleMaintenanceHandler,
    private readonly cancelMaintenanceHandler: CancelMaintenanceHandler,
    private readonly getRoomHandler: GetRoomHandler,
    private readonly listRoomsHandler: ListRoomsHandler,
    private readonly checkRoomAvailabilityHandler: CheckRoomAvailabilityHandler,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('settings.read')
  @ApiOperation({
    summary: 'List all rooms and schedulable spatial resources',
    description:
      'Retrieves all registered rooms with optional status, capacity, and feature filtering.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of rooms retrieved successfully.',
    type: [RoomResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Insufficient privileges.' })
  public async listRooms(@Query() queryDto: ListRoomsQueryDto): Promise<RoomResponseDto[]> {
    const query = new ListRoomsQuery({
      status: queryDto.status,
      requiredFeatures: queryDto.features,
      minCapacity: queryDto.minCapacity,
    });

    const result = await this.listRoomsHandler.execute(query);

    if (!result.isSuccess) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue() as unknown as RoomResponseDto[];
  }

  @Get('availability')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('appointments.read')
  @ApiOperation({
    summary: 'Check room availability or list available room candidates for a target time window',
    description:
      'Evaluates room availability against existing bookings, maintenance windows, status, and feature requirements.',
  })
  @ApiResponse({
    status: 200,
    description: 'Availability evaluation completed successfully.',
    type: RoomAvailabilityResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters or date range.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Insufficient privileges.' })
  public async checkAvailability(
    @Query() queryDto: CheckRoomAvailabilityQueryDto,
  ): Promise<RoomAvailabilityResponseDto> {
    const query = new CheckRoomAvailabilityQuery({
      startTime: queryDto.startTime,
      endTime: queryDto.endTime,
      roomId: queryDto.roomId,
      requiredFeatures: queryDto.requiredFeatures,
      requiredCapacity: queryDto.requiredCapacity,
    });

    const result = await this.checkRoomAvailabilityHandler.execute(query);

    if (!result.isSuccess) {
      const err = result.getError();
      if (err.toLowerCase().includes('not found')) {
        throw new NotFoundException(err);
      }
      throw new BadRequestException(err);
    }

    return result.getValue() as unknown as RoomAvailabilityResponseDto;
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST')
  @Permissions('settings.read')
  @ApiOperation({
    summary: 'Get room details by identifier',
    description:
      'Retrieves complete metadata, capacity, features, and active maintenance windows for a specific room.',
  })
  @ApiParam({ name: 'id', description: 'Unique Room ID' })
  @ApiResponse({
    status: 200,
    description: 'Room details retrieved successfully.',
    type: RoomResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Insufficient privileges.' })
  @ApiResponse({ status: 404, description: 'Room not found.' })
  public async getRoom(@Param('id') id: string): Promise<RoomResponseDto> {
    const result = await this.getRoomHandler.execute(new GetRoomQuery({ roomId: id }));

    if (!result.isSuccess) {
      throw new NotFoundException(result.getError());
    }

    return result.getValue() as unknown as RoomResponseDto;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Permissions('settings.write')
  @ApiOperation({
    summary: 'Create and register a new room',
    description:
      'Instantiates and persists a new Room aggregate with specified capacity and equipment feature tags.',
  })
  @ApiResponse({
    status: 201,
    description: 'Room created successfully.',
    type: RoomResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation failure.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Insufficient privileges.' })
  public async createRoom(@Body() dto: CreateRoomRequestDto): Promise<RoomResponseDto> {
    const command = new CreateRoomCommand({
      name: dto.name,
      capacity: dto.capacity,
      features: dto.features,
    });

    const result = await this.createRoomHandler.execute(command);

    if (!result.isSuccess) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue() as unknown as RoomResponseDto;
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Permissions('settings.write')
  @ApiOperation({
    summary: 'Edit room metadata, capacity, and feature tags',
    description: 'Atomically updates room details with optimistic concurrency version control.',
  })
  @ApiParam({ name: 'id', description: 'Unique Room ID' })
  @ApiResponse({
    status: 200,
    description: 'Room updated successfully.',
    type: RoomResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation failure.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Insufficient privileges.' })
  @ApiResponse({ status: 404, description: 'Room not found.' })
  @ApiResponse({ status: 409, description: 'Optimistic lock version conflict.' })
  public async editRoom(
    @Param('id') id: string,
    @Body() dto: EditRoomRequestDto,
  ): Promise<RoomResponseDto> {
    const command = new EditRoomCommand({
      roomId: id,
      name: dto.name,
      capacity: dto.capacity,
      features: dto.features,
      expectedVersion: dto.expectedVersion,
    });

    const result = await this.editRoomHandler.execute(command);

    if (!result.isSuccess) {
      const err = result.getError();
      if (err.toLowerCase().includes('not found')) {
        throw new NotFoundException(err);
      }
      throw new BadRequestException(err);
    }

    return result.getValue() as unknown as RoomResponseDto;
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Permissions('settings.write')
  @ApiOperation({
    summary: 'Activate a room for booking',
    description:
      'Transitions room status back to AVAILABLE and clears any maintenance explanations.',
  })
  @ApiParam({ name: 'id', description: 'Unique Room ID' })
  @ApiResponse({
    status: 200,
    description: 'Room activated successfully.',
    type: RoomResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Insufficient privileges.' })
  @ApiResponse({ status: 404, description: 'Room not found.' })
  @ApiResponse({ status: 409, description: 'Optimistic lock version conflict.' })
  public async activateRoom(
    @Param('id') id: string,
    @Body() dto: ActivateRoomRequestDto,
  ): Promise<RoomResponseDto> {
    const command = new ActivateRoomCommand({
      roomId: id,
      expectedVersion: dto.expectedVersion,
    });

    const result = await this.activateRoomHandler.execute(command);

    if (!result.isSuccess) {
      const err = result.getError();
      if (err.toLowerCase().includes('not found')) {
        throw new NotFoundException(err);
      }
      throw new BadRequestException(err);
    }

    return result.getValue() as unknown as RoomResponseDto;
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Permissions('settings.write')
  @ApiOperation({
    summary: 'Deactivate a room with optional explanation reason',
    description:
      'Transitions room status to UNAVAILABLE to prevent new reservations without invalidating existing appointments.',
  })
  @ApiParam({ name: 'id', description: 'Unique Room ID' })
  @ApiResponse({
    status: 200,
    description: 'Room deactivated successfully.',
    type: RoomResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Insufficient privileges.' })
  @ApiResponse({ status: 404, description: 'Room not found.' })
  @ApiResponse({ status: 409, description: 'Optimistic lock version conflict.' })
  public async deactivateRoom(
    @Param('id') id: string,
    @Body() dto: DeactivateRoomRequestDto,
  ): Promise<RoomResponseDto> {
    const command = new DeactivateRoomCommand({
      roomId: id,
      reason: dto.reason,
      expectedVersion: dto.expectedVersion,
    });

    const result = await this.deactivateRoomHandler.execute(command);

    if (!result.isSuccess) {
      const err = result.getError();
      if (err.toLowerCase().includes('not found')) {
        throw new NotFoundException(err);
      }
      throw new BadRequestException(err);
    }

    return result.getValue() as unknown as RoomResponseDto;
  }

  @Post(':id/maintenance')
  @HttpCode(HttpStatus.CREATED)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Permissions('settings.write')
  @ApiOperation({
    summary: 'Schedule a temporal maintenance window on a room',
    description:
      'Creates a time-ranged maintenance block that prevents overlapping appointment bookings.',
  })
  @ApiParam({ name: 'id', description: 'Unique Room ID' })
  @ApiResponse({
    status: 201,
    description: 'Maintenance window scheduled successfully.',
    type: RoomResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation failure or invalid time window.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Insufficient privileges.' })
  @ApiResponse({ status: 404, description: 'Room not found.' })
  @ApiResponse({ status: 409, description: 'Optimistic lock version conflict.' })
  public async scheduleMaintenance(
    @Param('id') id: string,
    @Body() dto: ScheduleMaintenanceRequestDto,
  ): Promise<RoomResponseDto> {
    const command = new ScheduleMaintenanceCommand({
      roomId: id,
      startTime: dto.startTime,
      endTime: dto.endTime,
      reason: dto.reason,
      expectedVersion: dto.expectedVersion,
    });

    const result = await this.scheduleMaintenanceHandler.execute(command);

    if (!result.isSuccess) {
      const err = result.getError();
      if (err.toLowerCase().includes('not found')) {
        throw new NotFoundException(err);
      }
      throw new BadRequestException(err);
    }

    return result.getValue() as unknown as RoomResponseDto;
  }

  @Delete(':id/maintenance/:maintenanceId')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Permissions('settings.write')
  @ApiOperation({
    summary: 'Cancel and remove a scheduled maintenance window',
    description:
      'Deletes a scheduled maintenance block from the room, freeing up the time window for reservations.',
  })
  @ApiParam({ name: 'id', description: 'Unique Room ID' })
  @ApiParam({ name: 'maintenanceId', description: 'Unique Maintenance Window ID' })
  @ApiResponse({
    status: 200,
    description: 'Maintenance window cancelled successfully.',
    type: RoomResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Insufficient privileges.' })
  @ApiResponse({ status: 404, description: 'Room or maintenance window not found.' })
  @ApiResponse({ status: 409, description: 'Optimistic lock version conflict.' })
  public async cancelMaintenance(
    @Param('id') id: string,
    @Param('maintenanceId') maintenanceId: string,
  ): Promise<RoomResponseDto> {
    const command = new CancelMaintenanceCommand({
      roomId: id,
      maintenanceWindowId: maintenanceId,
    });

    const result = await this.cancelMaintenanceHandler.execute(command);

    if (!result.isSuccess) {
      const err = result.getError();
      if (err.toLowerCase().includes('not found')) {
        throw new NotFoundException(err);
      }
      throw new BadRequestException(err);
    }

    return result.getValue() as unknown as RoomResponseDto;
  }
}
