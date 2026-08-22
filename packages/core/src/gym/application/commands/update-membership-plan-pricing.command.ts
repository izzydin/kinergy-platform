import { Command } from '../shared/command.interface';

export interface UpdateMembershipPlanPricingInput {
  readonly planId: string;
  readonly newPriceAmount: number;
  readonly currency?: string;
}

export class UpdateMembershipPlanPricingCommand implements Command<UpdateMembershipPlanPricingInput> {
  constructor(public readonly input: UpdateMembershipPlanPricingInput) {
    Object.freeze(this);
  }
}
