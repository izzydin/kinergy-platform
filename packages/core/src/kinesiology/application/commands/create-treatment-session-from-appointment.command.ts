import { Command } from '../shared/command.interface';

/**
 * Command payload to initiate a TreatmentSession from a scheduled Appointment.
 */
export interface CreateTreatmentSessionFromAppointmentInput {
  /** The unique scalar identifier of the originating Scheduling Appointment */
  readonly appointmentId: string;
  /** If true, immediately advances session from SCHEDULED to IN_PROGRESS via start() */
  readonly autoStart?: boolean;
  /** Optional initial subjective/raw clinical notes */
  readonly initialNotes?: string;
}

/**
 * CQRS Command to create a clinical TreatmentSession from a scheduled Appointment.
 */
export class CreateTreatmentSessionFromAppointmentCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly input: CreateTreatmentSessionFromAppointmentInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
