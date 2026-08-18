import { Command } from '../shared/command.interface';
import { MembershipStatus } from '../../domain/membership/membership-status.enum';

export interface CreateMembershipInput {
  clientId: string;
  planId: string;
  startDate?: string | Date;
  assignedTrainerId?: string;
  status?: MembershipStatus | string;
  customId?: string;
}

export class CreateMembershipCommand implements Command<CreateMembershipInput> {
  constructor(public readonly input: CreateMembershipInput) {
    Object.freeze(this);
  }
}
