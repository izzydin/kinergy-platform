import { Command } from '../shared/command.interface';

export interface ArchiveMembershipPlanInput {
  readonly planId: string;
}

export class ArchiveMembershipPlanCommand implements Command<ArchiveMembershipPlanInput> {
  constructor(public readonly input: ArchiveMembershipPlanInput) {
    Object.freeze(this);
  }
}
