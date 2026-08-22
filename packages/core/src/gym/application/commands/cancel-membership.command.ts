import { Command } from '../shared/command.interface';

export interface CancelMembershipInput {
  readonly membershipId: string;
  readonly reason?: string;
}

export class CancelMembershipCommand implements Command<CancelMembershipInput> {
  constructor(public readonly input: CancelMembershipInput) {
    Object.freeze(this);
  }
}
