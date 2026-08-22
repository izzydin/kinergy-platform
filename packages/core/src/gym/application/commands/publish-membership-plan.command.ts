import { Command } from '../shared/command.interface';

export interface PublishMembershipPlanInput {
  readonly planId: string;
}

export class PublishMembershipPlanCommand implements Command<PublishMembershipPlanInput> {
  constructor(public readonly input: PublishMembershipPlanInput) {
    Object.freeze(this);
  }
}
