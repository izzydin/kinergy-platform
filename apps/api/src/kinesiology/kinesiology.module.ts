import { Module } from '@nestjs/common';
import {
  CreateTreatmentSessionFromAppointmentHandler,
  GetTreatmentSessionByIdHandler,
  StartTreatmentSessionHandler,
  AssignTherapistToSessionHandler,
  UpdateSessionNotesHandler,
  CompleteTreatmentSessionHandler,
  CancelTreatmentSessionHandler,
  GetClientTreatmentHistoryHandler,
  SchedulingAppointmentLookupAdapter,
  GetAppointmentByIdHandler,
  PrismaAppointmentRepository,
  SystemClock,
  Clock,
  ITreatmentSessionRepository,
  ISchedulingAppointmentLookupPort,
} from '@kinergy-platform/core';
import { TreatmentSessionsController } from './controllers/treatment-sessions.controller';
import {
  TREATMENT_SESSION_REPOSITORY_TOKEN,
  SCHEDULING_APPOINTMENT_LOOKUP_PORT_TOKEN,
  KINESIOLOGY_CLOCK_TOKEN,
} from './kinesiology.tokens';
import {
  PrismaTreatmentSessionRepository,
  InMemoryTreatmentSessionRepository,
} from './infrastructure';
import { SchedulingModule } from '../scheduling';

@Module({
  imports: [SchedulingModule],
  controllers: [TreatmentSessionsController],
  providers: [
    PrismaTreatmentSessionRepository,
    {
      provide: TREATMENT_SESSION_REPOSITORY_TOKEN,
      useExisting: PrismaTreatmentSessionRepository,
    },
    {
      provide: KINESIOLOGY_CLOCK_TOKEN,
      useClass: SystemClock,
    },
    {
      provide: SCHEDULING_APPOINTMENT_LOOKUP_PORT_TOKEN,
      useFactory: (apptRepo: PrismaAppointmentRepository) =>
        new SchedulingAppointmentLookupAdapter(new GetAppointmentByIdHandler(apptRepo)),
      inject: [PrismaAppointmentRepository],
    },
    // CQRS Handlers injected into TreatmentSessionsController
    {
      provide: CreateTreatmentSessionFromAppointmentHandler,
      useFactory: (
        lookupPort: ISchedulingAppointmentLookupPort,
        sessionRepo: ITreatmentSessionRepository,
        clock: Clock,
      ) => new CreateTreatmentSessionFromAppointmentHandler(lookupPort, sessionRepo, clock),
      inject: [
        SCHEDULING_APPOINTMENT_LOOKUP_PORT_TOKEN,
        TREATMENT_SESSION_REPOSITORY_TOKEN,
        KINESIOLOGY_CLOCK_TOKEN,
      ],
    },
    {
      provide: GetTreatmentSessionByIdHandler,
      useFactory: (sessionRepo: ITreatmentSessionRepository) =>
        new GetTreatmentSessionByIdHandler(sessionRepo),
      inject: [TREATMENT_SESSION_REPOSITORY_TOKEN],
    },
    {
      provide: StartTreatmentSessionHandler,
      useFactory: (sessionRepo: ITreatmentSessionRepository, clock: Clock) =>
        new StartTreatmentSessionHandler(sessionRepo, undefined, clock),
      inject: [TREATMENT_SESSION_REPOSITORY_TOKEN, KINESIOLOGY_CLOCK_TOKEN],
    },
    {
      provide: AssignTherapistToSessionHandler,
      useFactory: (sessionRepo: ITreatmentSessionRepository, clock: Clock) =>
        new AssignTherapistToSessionHandler(sessionRepo, undefined, clock),
      inject: [TREATMENT_SESSION_REPOSITORY_TOKEN, KINESIOLOGY_CLOCK_TOKEN],
    },
    {
      provide: UpdateSessionNotesHandler,
      useFactory: (sessionRepo: ITreatmentSessionRepository, clock: Clock) =>
        new UpdateSessionNotesHandler(sessionRepo, clock),
      inject: [TREATMENT_SESSION_REPOSITORY_TOKEN, KINESIOLOGY_CLOCK_TOKEN],
    },
    {
      provide: CompleteTreatmentSessionHandler,
      useFactory: (sessionRepo: ITreatmentSessionRepository, clock: Clock) =>
        new CompleteTreatmentSessionHandler(sessionRepo, undefined, clock),
      inject: [TREATMENT_SESSION_REPOSITORY_TOKEN, KINESIOLOGY_CLOCK_TOKEN],
    },
    {
      provide: CancelTreatmentSessionHandler,
      useFactory: (sessionRepo: ITreatmentSessionRepository, clock: Clock) =>
        new CancelTreatmentSessionHandler(sessionRepo, undefined, clock),
      inject: [TREATMENT_SESSION_REPOSITORY_TOKEN, KINESIOLOGY_CLOCK_TOKEN],
    },
    {
      provide: GetClientTreatmentHistoryHandler,
      useFactory: (sessionRepo: ITreatmentSessionRepository) =>
        new GetClientTreatmentHistoryHandler(sessionRepo),
      inject: [TREATMENT_SESSION_REPOSITORY_TOKEN],
    },
  ],
  exports: [
    GetTreatmentSessionByIdHandler,
    CreateTreatmentSessionFromAppointmentHandler,
    GetClientTreatmentHistoryHandler,
    TREATMENT_SESSION_REPOSITORY_TOKEN,
    PrismaTreatmentSessionRepository,
  ],
})
export class KinesiologyModule {}
export {
  TREATMENT_SESSION_REPOSITORY_TOKEN,
  SCHEDULING_APPOINTMENT_LOOKUP_PORT_TOKEN,
  KINESIOLOGY_CLOCK_TOKEN,
  PrismaTreatmentSessionRepository,
  InMemoryTreatmentSessionRepository,
};
