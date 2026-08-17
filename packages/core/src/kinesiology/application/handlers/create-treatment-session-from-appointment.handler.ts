import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { CreateTreatmentSessionFromAppointmentCommand } from '../commands/create-treatment-session-from-appointment.command';
import { TreatmentSessionDTO } from '../dtos/treatment-session.dto';
import { TreatmentSessionMapper } from '../mappers/treatment-session.mapper';
import { ISchedulingAppointmentLookupPort } from '../ports/scheduling-appointment-lookup.port';
import { ITreatmentSessionRepository } from '../../domain/repositories/treatment-session.repository';
import { TreatmentSession } from '../../domain/treatment-session/treatment-session.aggregate';
import { SessionNotes } from '../../domain/treatment-session/session-notes.vo';
import { Clock } from '../../domain/shared/clock';

/**
 * CQRS Command Handler orchestrating cross-context appointment lookup,
 * eligibility validation, duplicate prevention, and TreatmentSession instantiation.
 */
export class CreateTreatmentSessionFromAppointmentHandler implements CommandHandler<
  CreateTreatmentSessionFromAppointmentCommand,
  ApplicationResult<TreatmentSessionDTO>
> {
  constructor(
    private readonly appointmentLookupPort: ISchedulingAppointmentLookupPort,
    private readonly sessionRepository: ITreatmentSessionRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * Executes the use case to create a TreatmentSession from a scheduled Appointment.
   */
  public async execute(
    command: CreateTreatmentSessionFromAppointmentCommand,
  ): Promise<ApplicationResult<TreatmentSessionDTO>> {
    try {
      const { input } = command;

      if (!input.appointmentId || input.appointmentId.trim().length === 0) {
        return ApplicationResult.fail('Appointment ID cannot be empty.');
      }

      // 1. Cross-Context Lookup via Anti-Corruption Layer Port
      const appointmentRef = await this.appointmentLookupPort.getAppointmentReference(
        input.appointmentId,
      );

      if (!appointmentRef) {
        return ApplicationResult.fail(
          `Appointment with ID '${input.appointmentId}' was not found.`,
        );
      }

      // 2. Business Eligibility Validation
      if (!appointmentRef.isEligibleForSession) {
        return ApplicationResult.fail(
          appointmentRef.ineligibilityReason ??
            `Appointment with ID '${input.appointmentId}' is not eligible for treatment.`,
        );
      }

      // 3. Duplicate Prevention Check
      const existingSession = await this.sessionRepository.findByAppointmentId(input.appointmentId);
      if (existingSession) {
        return ApplicationResult.fail(
          `A TreatmentSession already exists for appointment '${input.appointmentId}'.`,
        );
      }

      // 4. Instantiate Domain Aggregate
      const initialNotes = input.initialNotes
        ? SessionNotes.create({ rawText: input.initialNotes })
        : undefined;

      const session = TreatmentSession.create(
        {
          clientId: appointmentRef.clientId,
          therapistId: appointmentRef.therapistId,
          appointmentId: appointmentRef.appointmentId,
          notes: initialNotes,
        },
        this.clock,
      );

      // 5. Optional Immediate Auto-Start Transition
      if (input.autoStart) {
        session.start(this.clock);
      }

      // 6. Persistence
      await this.sessionRepository.save(session);

      // 7. Return Result DTO
      return ApplicationResult.ok(TreatmentSessionMapper.toDTO(session));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
