import {
  Membership as PrismaMembershipModel,
  MembershipStatus as PrismaMembershipStatus,
  Prisma,
} from '@prisma/client';
import { Membership } from '../../../../domain/membership/membership.aggregate';
import { MembershipId } from '../../../../domain/membership/membership-id.vo';
import { MembershipStatus } from '../../../../domain/membership/membership-status.enum';
import { MembershipPeriod } from '../../../../domain/membership/membership-period.vo';
import { FreezeWindow } from '../../../../domain/membership/freeze-window.vo';
import { TrainerAssignment } from '../../../../domain/membership/trainer-assignment.vo';

interface FreezeRecordJson {
  startDate?: string;
  endDate?: string;
  frozenAt?: string;
  resumesAt?: string;
  reason?: string;
  durationDays?: number;
}

export class PrismaMembershipMapper {
  public static toDomain(raw: PrismaMembershipModel): Membership {
    const freezeHistoryRaw = (raw.freezeHistory as unknown as FreezeRecordJson[]) || [];
    const freezeHistory = Array.isArray(freezeHistoryRaw)
      ? freezeHistoryRaw.map((f) => {
          const startStr = f?.startDate ?? f?.frozenAt;
          const endStr = f?.endDate ?? f?.resumesAt;
          const startDate = startStr ? new Date(startStr) : (undefined as unknown as Date);
          const endDate = endStr ? new Date(endStr) : (undefined as unknown as Date);
          return FreezeWindow.create(startDate, endDate, f?.reason);
        })
      : [];

    return Membership.reconstitute({
      id: MembershipId.create(raw.id),
      clientId: raw.clientId,
      planId: raw.planId,
      status: raw.status as unknown as MembershipStatus,
      period: MembershipPeriod.create(raw.startDate, raw.endDate),
      trainerAssignment: raw.assignedTrainerId
        ? TrainerAssignment.create(raw.assignedTrainerId)
        : undefined,
      freezeHistory,
      cancellationReason: raw.cancellationReason ?? undefined,
      terminationReason: raw.terminationReason ?? undefined,
      version: raw.version,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  public static toPersistence(
    membership: Membership,
  ): Omit<PrismaMembershipModel, 'createdAt' | 'updatedAt'> {
    const freezeHistoryJson = membership.freezeHistory.map((f) => ({
      startDate: f.startDate.toISOString(),
      endDate: f.endDate.toISOString(),
      reason: f.reason,
      durationDays: f.durationDays,
    }));

    return {
      id: membership.id.getValue(),
      clientId: membership.clientId,
      planId: membership.planId,
      status: membership.status as unknown as PrismaMembershipStatus,
      startDate: membership.period.startDate,
      endDate: membership.period.endDate,
      assignedTrainerId: membership.trainerAssignment?.trainerId ?? null,
      freezeHistory: freezeHistoryJson as unknown as Prisma.JsonValue,
      cancellationReason: membership.cancellationReason ?? null,
      terminationReason: membership.terminationReason ?? null,
      version: membership.version,
    };
  }
}
