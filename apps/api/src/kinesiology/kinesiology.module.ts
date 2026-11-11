import { Module, forwardRef } from '@nestjs/common';
import {
  CreateTreatmentSessionFromAppointmentHandler,
  GetTreatmentSessionByIdHandler,
  StartTreatmentSessionHandler,
  AssignTherapistToSessionHandler,
  UpdateSessionNotesHandler,
  CompleteTreatmentSessionHandler,
  CancelTreatmentSessionHandler,
  GetClientTreatmentHistoryHandler,
  GetAppointmentByIdHandler,
  SystemClock,
  Clock,
  ITreatmentSessionRepository,
  ISchedulingAppointmentLookupPort,
} from '@kinergy-platform/core';
import {
  SchedulingAppointmentLookupAdapter,
  PrismaAppointmentRepository,
} from '@kinergy-platform/core/server';
import { TreatmentSessionsController } from './controllers/treatment-sessions.controller';
import {
  TREATMENT_SESSION_REPOSITORY_TOKEN,
  SCHEDULING_APPOINTMENT_LOOKUP_PORT_TOKEN,
  KINESIOLOGY_CLOCK_TOKEN,
  KINESIOLOGY_DOMAIN_EVENT_PUBLISHER_TOKEN,
} from './kinesiology.tokens';
import {
  PrismaTreatmentSessionRepository,
  InMemoryTreatmentSessionRepository,
  KinesiologyEventPublisherAdapter,
} from './infrastructure';
import { SchedulingModule } from '../scheduling';
import { SalesModule } from '../sales/sales.module';
import { TherapistTreatmentCheckoutService } from './application/therapist-treatment-checkout.service';

@Module({
  imports: [SchedulingModule, forwardRef(() => SalesModule)],
  controllers: [TreatmentSessionsController],
  providers: [
    PrismaTreatmentSessionRepository,
    KinesiologyEventPublisherAdapter,
    TherapistTreatmentCheckoutService,
    {
      provide: KINESIOLOGY_DOMAIN_EVENT_PUBLISHER_TOKEN,
      useExisting: KinesiologyEventPublisherAdapter,
    },
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
        eventPublisher: KinesiologyEventPublisherAdapter,
      ) =>
        new CreateTreatmentSessionFromAppointmentHandler(
          lookupPort,
          sessionRepo,
          clock,
          eventPublisher,
        ),
      inject: [
        SCHEDULING_APPOINTMENT_LOOKUP_PORT_TOKEN,
        TREATMENT_SESSION_REPOSITORY_TOKEN,
        KINESIOLOGY_CLOCK_TOKEN,
        KINESIOLOGY_DOMAIN_EVENT_PUBLISHER_TOKEN,
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
      useFactory: (
        sessionRepo: ITreatmentSessionRepository,
        clock: Clock,
        eventPublisher: KinesiologyEventPublisherAdapter,
      ) => new StartTreatmentSessionHandler(sessionRepo, eventPublisher, clock),
      inject: [
        TREATMENT_SESSION_REPOSITORY_TOKEN,
        KINESIOLOGY_CLOCK_TOKEN,
        KINESIOLOGY_DOMAIN_EVENT_PUBLISHER_TOKEN,
      ],
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
      useFactory: (
        sessionRepo: ITreatmentSessionRepository,
        clock: Clock,
        eventPublisher: KinesiologyEventPublisherAdapter,
      ) => new CompleteTreatmentSessionHandler(sessionRepo, eventPublisher, clock),
      inject: [
        TREATMENT_SESSION_REPOSITORY_TOKEN,
        KINESIOLOGY_CLOCK_TOKEN,
        KINESIOLOGY_DOMAIN_EVENT_PUBLISHER_TOKEN,
      ],
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
    SCHEDULING_APPOINTMENT_LOOKUP_PORT_TOKEN,
    KINESIOLOGY_DOMAIN_EVENT_PUBLISHER_TOKEN,
    PrismaTreatmentSessionRepository,
    KinesiologyEventPublisherAdapter,
    TherapistTreatmentCheckoutService,
  ],
})
export class KinesiologyModule {}
export {
  TREATMENT_SESSION_REPOSITORY_TOKEN,
  SCHEDULING_APPOINTMENT_LOOKUP_PORT_TOKEN,
  KINESIOLOGY_CLOCK_TOKEN,
  KINESIOLOGY_DOMAIN_EVENT_PUBLISHER_TOKEN,
  PrismaTreatmentSessionRepository,
  InMemoryTreatmentSessionRepository,
  KinesiologyEventPublisherAdapter,
  TherapistTreatmentCheckoutService,
};
