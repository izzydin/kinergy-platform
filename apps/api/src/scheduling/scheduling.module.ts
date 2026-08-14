import { Module } from '@nestjs/common';
import { PrismaService } from '../platform/persistence/prisma/prisma.service';
import {
  PrismaAppointmentRepository,
  PrismaRecurrenceSeriesRepository,
  ConflictDetectionService,
  CreateRecurrenceSeriesHandler,
  GenerateRecurringOccurrencesHandler,
  SkipRecurrenceOccurrenceHandler,
  EditSingleOccurrenceHandler,
  EditFutureOccurrencesHandler,
  CancelRecurrenceSeriesHandler,
  BusinessCalendarService,
  TherapistScheduleRepository,
  RoomRepository,
} from '@kinergy-platform/core';
import { RecurringAppointmentsController } from './controllers/recurring-appointments.controller';

class InMemoryTherapistScheduleRepository implements TherapistScheduleRepository {
  async findByTherapistId() {
    return null;
  }
  async save() {}
}

class InMemoryRoomRepository implements RoomRepository {
  async findById() {
    return null;
  }
  async findAll() {
    return [];
  }
  async findAvailableRooms() {
    return [];
  }
  async save() {}
}

@Module({
  controllers: [RecurringAppointmentsController],
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
      provide: ConflictDetectionService,
      useFactory: (apptRepo: PrismaAppointmentRepository) =>
        new ConflictDetectionService(
          new BusinessCalendarService(),
          apptRepo,
          new InMemoryTherapistScheduleRepository(),
          new InMemoryRoomRepository(),
        ),
      inject: [PrismaAppointmentRepository],
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
  ],
  exports: [
    PrismaAppointmentRepository,
    PrismaRecurrenceSeriesRepository,
    CreateRecurrenceSeriesHandler,
    GenerateRecurringOccurrencesHandler,
    SkipRecurrenceOccurrenceHandler,
    EditSingleOccurrenceHandler,
    EditFutureOccurrencesHandler,
    CancelRecurrenceSeriesHandler,
  ],
})
export class SchedulingModule {}
