import { Command } from '../shared/command.interface';

/**
 * Command payload to assign or reassign a therapist to an existing TreatmentSession.
 */
export interface AssignTherapistToSessionInput {
  /** The unique scalar identifier of the TreatmentSession */
  readonly sessionId: string;
  /** The unique scalar identifier of the new Therapist */
  readonly newTherapistId: string;
}

/**
 * CQRS Command to reassign the practitioner conducting a clinical TreatmentSession.
 */
export class AssignTherapistToSessionCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly input: AssignTherapistToSessionInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
