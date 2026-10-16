import { Command } from '../shared/command.interface';
import { ActivateOrRenewMembershipInput } from '../ports/gym-membership-activation.port';

export class ActivateOrRenewMembershipCommand implements Command<ActivateOrRenewMembershipInput> {
  constructor(public readonly input: ActivateOrRenewMembershipInput) {
    Object.freeze(this);
  }
}
