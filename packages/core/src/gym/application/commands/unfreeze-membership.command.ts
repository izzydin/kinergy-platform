import { Command } from '../shared/command.interface';

export interface UnfreezeMembershipInput {
  readonly membershipId: string;
}

export class UnfreezeMembershipCommand implements Command<UnfreezeMembershipInput> {
  constructor(public readonly input: UnfreezeMembershipInput) {
    Object.freeze(this);
  }
}
