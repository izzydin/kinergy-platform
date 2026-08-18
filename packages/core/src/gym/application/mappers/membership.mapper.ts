import { Membership } from '../../domain/membership/membership.aggregate';
import { MembershipDTO } from '../dtos/membership.dto';

export class MembershipMapper {
  public static toDTO(membership: Membership): MembershipDTO {
    return {
      id: membership.id.value,
      version: membership.version,
      status: membership.status,
      clientId: membership.clientId,
      planId: membership.planId,
      period: {
        startDate: membership.period.startDate.toISOString(),
        endDate: membership.period.endDate.toISOString(),
        durationDays: membership.period.durationDays,
      },
      assignedTrainerId: membership.trainerAssignment?.trainerId,
      freezeHistory: membership.freezeHistory.map((w) => ({
        startDate: w.startDate.toISOString(),
        endDate: w.endDate.toISOString(),
        durationDays: w.durationDays,
        reason: w.reason,
      })),
      createdAt: membership.createdAt.toISOString(),
      updatedAt: membership.updatedAt.toISOString(),
    };
  }
}
