import {
  AttendanceRecord as PrismaAttendanceRecordModel,
  CheckInMethod as PrismaCheckInMethod,
  AccessResult as PrismaAccessResult,
} from '@prisma/client';
import { AttendanceRecord } from '../../../../domain/attendance/attendance-record.aggregate';
import { AttendanceId } from '../../../../domain/attendance/attendance-id.vo';
import { CheckInMethod } from '../../../../domain/attendance/check-in-method.enum';
import { AccessResult } from '../../../../domain/attendance/access-result.enum';
import { GymDay } from '../../../../domain/attendance/gym-day.vo';

export class PrismaAttendanceRecordMapper {
  public static toDomain(raw: PrismaAttendanceRecordModel): AttendanceRecord {
    return AttendanceRecord.reconstitute({
      id: AttendanceId.create(raw.id),
      clientId: raw.clientId,
      membershipId: raw.membershipId ?? null,
      checkInTime: raw.checkInTime,
      gymDay: GymDay.fromString(raw.gymDay),
      method: raw.method as unknown as CheckInMethod,
      result: raw.result as unknown as AccessResult,
      gateId: raw.gateId ?? null,
      receptionistId: raw.receptionistId ?? null,
      notes: raw.notes ?? null,
      createdAt: raw.createdAt,
    });
  }

  public static toPersistence(
    record: AttendanceRecord,
  ): Omit<PrismaAttendanceRecordModel, 'createdAt'> {
    return {
      id: record.id.value,
      clientId: record.clientId,
      membershipId: record.membershipId ?? null,
      checkInTime: record.checkInTime,
      gymDay: record.gymDay.toString(),
      method: record.method as unknown as PrismaCheckInMethod,
      result: record.result as unknown as PrismaAccessResult,
      gateId: record.gateId ?? null,
      receptionistId: record.receptionistId ?? null,
      notes: record.notes ?? null,
    };
  }
}
