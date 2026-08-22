import { Command } from '../shared/command.interface';

export interface CreateMembershipPlanInput {
  readonly code: string;
  readonly name: string;
  readonly description?: string;
  readonly durationInDays: number;
  readonly priceAmount: number;
  readonly priceCurrency?: string;
  readonly visitQuota?: number;
  readonly customId?: string;
}

export class CreateMembershipPlanCommand implements Command<CreateMembershipPlanInput> {
  constructor(public readonly input: CreateMembershipPlanInput) {
    Object.freeze(this);
  }
}
