import { Module } from '@nestjs/common';
import { PrismaService } from '../platform/persistence/prisma/prisma.service';
import {
  PrismaAppointmentRepository,
  PrismaRecurrenceSeriesRepository,
  PrismaRoomRepository,
  ConflictDetectionService,
  CreateRecurrenceSeriesHandler,
  GenerateRecurringOccurrencesHandler,
  SkipRecurrenceOccurrenceHandler,
  EditSingleOccurrenceHandler,
  EditFutureOccurrencesHandler,
  CancelRecurrenceSeriesHandler,
  BusinessCalendarService,
  TherapistScheduleRepository,
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
import { RecurringAppointmentsController, RoomsController } from './controllers';

class InMemoryTherapistScheduleRepository implements TherapistScheduleRepository {
  async findByTherapistId() {
    return null;
  }
  async save() {}
}

@Module({
  controllers: [RecurringAppointmentsController, RoomsController],
  providers: [
    {
      provide: PrismaAppointmentRepository,
      useFactory: (prisma: PrismaService) => new PrismaAppointmentRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: PrismaRecurrenceSeriesRepository,
      useFactory: (prisma: PrismaService) => new PrismaRecurrenceSeriesRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: PrismaRoomRepository,
      useFactory: (prisma: PrismaService) => new PrismaRoomRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: ConflictDetectionService,
      useFactory: (apptRepo: PrismaAppointmentRepository, roomRepo: PrismaRoomRepository) =>
        new ConflictDetectionService(
          new BusinessCalendarService(),
          apptRepo,
          new InMemoryTherapistScheduleRepository(),
          roomRepo,
        ),
      inject: [PrismaAppointmentRepository, PrismaRoomRepository],
    },
    {
      provide: GenerateRecurringOccurrencesHandler,
      useFactory: (
        seriesRepo: PrismaRecurrenceSeriesRepository,
        apptRepo: PrismaAppointmentRepository,
        conflictService: ConflictDetectionService,
      ) => new GenerateRecurringOccurrencesHandler(seriesRepo, apptRepo, conflictService),
      inject: [
        PrismaRecurrenceSeriesRepository,
        PrismaAppointmentRepository,
        ConflictDetectionService,
      ],
    },
    {
      provide: CreateRecurrenceSeriesHandler,
      useFactory: (
        seriesRepo: PrismaRecurrenceSeriesRepository,
        genHandler: GenerateRecurringOccurrencesHandler,
      ) => new CreateRecurrenceSeriesHandler(seriesRepo, genHandler),
      inject: [PrismaRecurrenceSeriesRepository, GenerateRecurringOccurrencesHandler],
    },
    {
      provide: SkipRecurrenceOccurrenceHandler,
      useFactory: (
        seriesRepo: PrismaRecurrenceSeriesRepository,
        apptRepo: PrismaAppointmentRepository,
      ) => new SkipRecurrenceOccurrenceHandler(seriesRepo, apptRepo),
      inject: [PrismaRecurrenceSeriesRepository, PrismaAppointmentRepository],
    },
    {
      provide: EditSingleOccurrenceHandler,
      useFactory: (
        apptRepo: PrismaAppointmentRepository,
        seriesRepo: PrismaRecurrenceSeriesRepository,
        conflictService: ConflictDetectionService,
      ) => new EditSingleOccurrenceHandler(apptRepo, seriesRepo, conflictService),
      inject: [
        PrismaAppointmentRepository,
        PrismaRecurrenceSeriesRepository,
        ConflictDetectionService,
      ],
    },
    {
      provide: EditFutureOccurrencesHandler,
      useFactory: (
        seriesRepo: PrismaRecurrenceSeriesRepository,
        apptRepo: PrismaAppointmentRepository,
        genHandler: GenerateRecurringOccurrencesHandler,
      ) => new EditFutureOccurrencesHandler(seriesRepo, apptRepo, genHandler),
      inject: [
        PrismaRecurrenceSeriesRepository,
        PrismaAppointmentRepository,
        GenerateRecurringOccurrencesHandler,
      ],
    },
    {
      provide: CancelRecurrenceSeriesHandler,
      useFactory: (
        seriesRepo: PrismaRecurrenceSeriesRepository,
        apptRepo: PrismaAppointmentRepository,
      ) => new CancelRecurrenceSeriesHandler(seriesRepo, apptRepo),
      inject: [PrismaRecurrenceSeriesRepository, PrismaAppointmentRepository],
    },
    {
      provide: CreateRoomHandler,
      useFactory: (roomRepo: PrismaRoomRepository) => new CreateRoomHandler(roomRepo),
      inject: [PrismaRoomRepository],
    },
    {
      provide: EditRoomHandler,
      useFactory: (roomRepo: PrismaRoomRepository) => new EditRoomHandler(roomRepo),
      inject: [PrismaRoomRepository],
    },
    {
      provide: ActivateRoomHandler,
      useFactory: (roomRepo: PrismaRoomRepository) => new ActivateRoomHandler(roomRepo),
      inject: [PrismaRoomRepository],
    },
    {
      provide: DeactivateRoomHandler,
      useFactory: (roomRepo: PrismaRoomRepository) => new DeactivateRoomHandler(roomRepo),
      inject: [PrismaRoomRepository],
    },
    {
      provide: ScheduleMaintenanceHandler,
      useFactory: (roomRepo: PrismaRoomRepository) => new ScheduleMaintenanceHandler(roomRepo),
      inject: [PrismaRoomRepository],
    },
    {
      provide: CancelMaintenanceHandler,
      useFactory: (roomRepo: PrismaRoomRepository) => new CancelMaintenanceHandler(roomRepo),
      inject: [PrismaRoomRepository],
    },
    {
      provide: GetRoomHandler,
      useFactory: (roomRepo: PrismaRoomRepository) => new GetRoomHandler(roomRepo),
      inject: [PrismaRoomRepository],
    },
    {
      provide: ListRoomsHandler,
      useFactory: (roomRepo: PrismaRoomRepository) => new ListRoomsHandler(roomRepo),
      inject: [PrismaRoomRepository],
    },
    {
      provide: CheckRoomAvailabilityHandler,
      useFactory: (roomRepo: PrismaRoomRepository, apptRepo: PrismaAppointmentRepository) =>
        new CheckRoomAvailabilityHandler(roomRepo, apptRepo),
      inject: [PrismaRoomRepository, PrismaAppointmentRepository],
    },
  ],
  exports: [
    PrismaAppointmentRepository,
    PrismaRecurrenceSeriesRepository,
    PrismaRoomRepository,
    CreateRecurrenceSeriesHandler,
    GenerateRecurringOccurrencesHandler,
    SkipRecurrenceOccurrenceHandler,
    EditSingleOccurrenceHandler,
    EditFutureOccurrencesHandler,
    CancelRecurrenceSeriesHandler,
    CreateRoomHandler,
    EditRoomHandler,
    ActivateRoomHandler,
    DeactivateRoomHandler,
    ScheduleMaintenanceHandler,
    CancelMaintenanceHandler,
    GetRoomHandler,
    ListRoomsHandler,
    CheckRoomAvailabilityHandler,
  ],
})
export class SchedulingModule {}
