import { Command } from '../shared/command.interface';

export interface BillTreatmentSessionInput {
  readonly sessionId: string;
  readonly expectedClientId?: string;
  readonly tenantId?: string;
  readonly idempotencyKey?: string;
}

/**
 * Command to request commercial billing for an eligible, completed TreatmentSession.
 */
export class BillTreatmentSessionCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly input: BillTreatmentSessionInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
