export interface ConsumeStockInput {
  itemId: string;
  quantity: number;
  referenceId?: string; // Optional TreatmentSession.id or clinical correlation
  reason: string;
  actorId: string;
  tenantId?: string;
}

export class ConsumeStockCommand {
  constructor(public readonly input: ConsumeStockInput) {
    Object.freeze(this);
  }
}
