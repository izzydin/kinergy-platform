import { Command } from '../shared/command.interface';

export interface RenewMembershipInput {
  membershipId: string;
  newPlanId?: string;
  idempotencyKey?: string;
  effectiveDate?: string | Date;
}

export class RenewMembershipCommand implements Command<RenewMembershipInput> {
  constructor(public readonly input: RenewMembershipInput) {
    Object.freeze(this);
  }
}
