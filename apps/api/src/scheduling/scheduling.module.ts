import { Module } from '@nestjs/common';
import { PrismaService } from '../platform/persistence/prisma/prisma.service';
import {
  PrismaAppointmentRepository,
  PrismaRecurrenceSeriesRepository,
  PrismaRoomRepository,
} from '@kinergy-platform/core/server';
import {
  ConflictDetectionService,
  SlotFinderEngine,
  BookingWindowPolicy,
  DefaultAppointmentDurationPolicy,
  BookingIdempotencyPolicy,
  CancellationPolicy,
  ReschedulePolicy,
  CreateAppointmentHandler,
  UpdateAppointmentHandler,
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
  CreateRecurrenceSeriesHandler,
  GenerateRecurringOccurrencesHandler,
  SkipRecurrenceOccurrenceHandler,
  EditSingleOccurrenceHandler,
  EditFutureOccurrencesHandler,
  CancelRecurrenceSeriesHandler,
  BusinessCalendarService,
  TherapistScheduleRepository,
  TherapistSchedule,
  WorkingHours,
  Clock,
  SystemClock,
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
  AppointmentsController,
  RecurringAppointmentsController,
  RoomsController,
  SCHEDULING_CLOCK_TOKEN,
} from './controllers';

export const THERAPIST_SCHEDULE_REPOSITORY_TOKEN = 'THERAPIST_SCHEDULE_REPOSITORY_TOKEN';

export class DefaultTherapistScheduleRepository implements TherapistScheduleRepository {
  private readonly schedules = new Map<string, TherapistSchedule>();

  async findByTherapistId(therapistId: string): Promise<TherapistSchedule | null> {
    const existing = this.schedules.get(therapistId);
    if (existing) {
      return existing;
    }

    // Default active schedule across all days of the week so standard therapists are bookable
    // unless blocked by explicit schedule overrides, vacations, breaks, or overlapping appointments.
    return TherapistSchedule.create({
      therapistId,
      workingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => WorkingHours.create(day, 0, 1440)),
      timezone: 'UTC',
    });
  }

  async save(schedule: TherapistSchedule): Promise<void> {
    this.schedules.set(schedule.therapistId, schedule);
  }
}

@Module({
  controllers: [AppointmentsController, RecurringAppointmentsController, RoomsController],
  providers: [
    {
      provide: SCHEDULING_CLOCK_TOKEN,
      useFactory: () => new SystemClock(),
    },
    {
      provide: BusinessCalendarService,
      useFactory: () => new BusinessCalendarService(),
    },
    {
      provide: THERAPIST_SCHEDULE_REPOSITORY_TOKEN,
      useFactory: () => new DefaultTherapistScheduleRepository(),
    },
    {
      provide: BookingWindowPolicy,
      useFactory: () => new BookingWindowPolicy(),
    },
    {
      provide: DefaultAppointmentDurationPolicy,
      useFactory: () => new DefaultAppointmentDurationPolicy(),
    },
    {
      provide: BookingIdempotencyPolicy,
      useFactory: () => new BookingIdempotencyPolicy(),
    },
    {
      provide: CancellationPolicy,
      useFactory: () => new CancellationPolicy(),
    },
    {
      provide: ReschedulePolicy,
      useFactory: () => new ReschedulePolicy(),
    },
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
      useFactory: (
        calendarService: BusinessCalendarService,
        apptRepo: PrismaAppointmentRepository,
        scheduleRepo: TherapistScheduleRepository,
        roomRepo: PrismaRoomRepository,
      ) => new ConflictDetectionService(calendarService, apptRepo, scheduleRepo, roomRepo),
      inject: [
        BusinessCalendarService,
        PrismaAppointmentRepository,
        THERAPIST_SCHEDULE_REPOSITORY_TOKEN,
        PrismaRoomRepository,
      ],
    },
    {
      provide: SlotFinderEngine,
      useFactory: (conflictService: ConflictDetectionService, roomRepo: PrismaRoomRepository) =>
        new SlotFinderEngine(conflictService, roomRepo),
      inject: [ConflictDetectionService, PrismaRoomRepository],
    },
    {
      provide: CreateAppointmentHandler,
      useFactory: (
        apptRepo: PrismaAppointmentRepository,
        conflictService: ConflictDetectionService,
        windowPolicy: BookingWindowPolicy,
        durationPolicy: DefaultAppointmentDurationPolicy,
        idempotencyPolicy: BookingIdempotencyPolicy,
        clock: Clock,
      ) =>
        new CreateAppointmentHandler(
          apptRepo,
          conflictService,
          windowPolicy,
          durationPolicy,
          idempotencyPolicy,
          clock,
        ),
      inject: [
        PrismaAppointmentRepository,
        ConflictDetectionService,
        BookingWindowPolicy,
        DefaultAppointmentDurationPolicy,
        BookingIdempotencyPolicy,
        SCHEDULING_CLOCK_TOKEN,
      ],
    },
    {
      provide: UpdateAppointmentHandler,
      useFactory: (
        apptRepo: PrismaAppointmentRepository,
        conflictService: ConflictDetectionService,
        clock: Clock,
      ) => new UpdateAppointmentHandler(apptRepo, conflictService, clock),
      inject: [PrismaAppointmentRepository, ConflictDetectionService, SCHEDULING_CLOCK_TOKEN],
    },
    {
      provide: RescheduleAppointmentHandler,
      useFactory: (
        apptRepo: PrismaAppointmentRepository,
        conflictService: ConflictDetectionService,
        reschedulePolicy: ReschedulePolicy,
        clock: Clock,
      ) => new RescheduleAppointmentHandler(apptRepo, conflictService, reschedulePolicy, clock),
      inject: [
        PrismaAppointmentRepository,
        ConflictDetectionService,
        ReschedulePolicy,
        SCHEDULING_CLOCK_TOKEN,
      ],
    },
    {
      provide: CancelAppointmentHandler,
      useFactory: (
        apptRepo: PrismaAppointmentRepository,
        cancellationPolicy: CancellationPolicy,
        clock: Clock,
      ) => new CancelAppointmentHandler(apptRepo, cancellationPolicy, clock),
      inject: [PrismaAppointmentRepository, CancellationPolicy, SCHEDULING_CLOCK_TOKEN],
    },
    {
      provide: ConfirmAppointmentHandler,
      useFactory: (apptRepo: PrismaAppointmentRepository, clock: Clock) =>
        new ConfirmAppointmentHandler(apptRepo, clock),
      inject: [PrismaAppointmentRepository, SCHEDULING_CLOCK_TOKEN],
    },
    {
      provide: CheckInAppointmentHandler,
      useFactory: (apptRepo: PrismaAppointmentRepository, clock: Clock) =>
        new CheckInAppointmentHandler(apptRepo, clock),
      inject: [PrismaAppointmentRepository, SCHEDULING_CLOCK_TOKEN],
    },
    {
      provide: CompleteAppointmentHandler,
      useFactory: (apptRepo: PrismaAppointmentRepository, clock: Clock) =>
        new CompleteAppointmentHandler(apptRepo, clock),
      inject: [PrismaAppointmentRepository, SCHEDULING_CLOCK_TOKEN],
    },
    {
      provide: MarkNoShowHandler,
      useFactory: (apptRepo: PrismaAppointmentRepository, clock: Clock) =>
        new MarkNoShowHandler(apptRepo, clock),
      inject: [PrismaAppointmentRepository, SCHEDULING_CLOCK_TOKEN],
    },
    {
      provide: AddAppointmentNoteHandler,
      useFactory: (apptRepo: PrismaAppointmentRepository, clock: Clock) =>
        new AddAppointmentNoteHandler(apptRepo, clock),
      inject: [PrismaAppointmentRepository, SCHEDULING_CLOCK_TOKEN],
    },
    {
      provide: GetAppointmentByIdHandler,
      useFactory: (apptRepo: PrismaAppointmentRepository) =>
        new GetAppointmentByIdHandler(apptRepo),
      inject: [PrismaAppointmentRepository],
    },
    {
      provide: FindAppointmentsByRangeHandler,
      useFactory: (apptRepo: PrismaAppointmentRepository) =>
        new FindAppointmentsByRangeHandler(apptRepo),
      inject: [PrismaAppointmentRepository],
    },
    {
      provide: GetDailyAgendaHandler,
      useFactory: (apptRepo: PrismaAppointmentRepository, clock: Clock) =>
        new GetDailyAgendaHandler(undefined, apptRepo, clock),
      inject: [PrismaAppointmentRepository, SCHEDULING_CLOCK_TOKEN],
    },
    {
      provide: GetWeeklyAgendaHandler,
      useFactory: (apptRepo: PrismaAppointmentRepository, clock: Clock) =>
        new GetWeeklyAgendaHandler(undefined, apptRepo, clock),
      inject: [PrismaAppointmentRepository, SCHEDULING_CLOCK_TOKEN],
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
    SCHEDULING_CLOCK_TOKEN,
    THERAPIST_SCHEDULE_REPOSITORY_TOKEN,
    PrismaAppointmentRepository,
    PrismaRecurrenceSeriesRepository,
    PrismaRoomRepository,
    ConflictDetectionService,
    SlotFinderEngine,
    CreateAppointmentHandler,
    UpdateAppointmentHandler,
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
export { SCHEDULING_CLOCK_TOKEN };
