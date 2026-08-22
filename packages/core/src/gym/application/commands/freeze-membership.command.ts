import { Command } from '../shared/command.interface';

export interface FreezeMembershipInput {
  readonly membershipId: string;
  readonly startDate: string | Date;
  readonly endDate: string | Date;
  readonly reason?: string;
}

export class FreezeMembershipCommand implements Command<FreezeMembershipInput> {
  constructor(public readonly input: FreezeMembershipInput) {
    Object.freeze(this);
  }
}
