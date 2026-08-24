import { PrismaClient, AccessResult as PrismaAccessResult } from '@prisma/client';
import { AttendanceRecordRepository } from '../../../../domain/repositories/attendance-record.repository';
import { AttendanceRecord } from '../../../../domain/attendance/attendance-record.aggregate';
import { PrismaAttendanceRecordMapper } from '../mappers/prisma-attendance-record.mapper';

export class PrismaAttendanceRecordRepository implements AttendanceRecordRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async append(record: AttendanceRecord): Promise<void> {
    const data = PrismaAttendanceRecordMapper.toPersistence(record);
    await this.prisma.attendanceRecord.create({
      data,
    });
  }

  async findById(id: string): Promise<AttendanceRecord | null> {
    const raw = await this.prisma.attendanceRecord.findUnique({
      where: { id },
    });
    return raw ? PrismaAttendanceRecordMapper.toDomain(raw) : null;
  }

  async findByClientId(clientId: string, limit?: number): Promise<AttendanceRecord[]> {
    const list = await this.prisma.attendanceRecord.findMany({
      where: { clientId },
      orderBy: { checkInTime: 'desc' },
      take: limit,
    });
    return list.map(PrismaAttendanceRecordMapper.toDomain);
  }

  async findRecentByClientId(clientId: string, since: Date): Promise<AttendanceRecord[]> {
    const list = await this.prisma.attendanceRecord.findMany({
      where: {
        clientId,
        checkInTime: { gte: since },
      },
      orderBy: { checkInTime: 'desc' },
    });
    return list.map(PrismaAttendanceRecordMapper.toDomain);
  }

  async findByGymDay(gymDay: string, facilityId?: string): Promise<AttendanceRecord[]> {
    const list = await this.prisma.attendanceRecord.findMany({
      where: {
        gymDay: { contains: gymDay },
      },
      orderBy: { checkInTime: 'desc' },
    });

    const mapped = list.map(PrismaAttendanceRecordMapper.toDomain);
    if (!facilityId) return mapped;
    return mapped.filter((r) => r.gymDay.facilityId === facilityId);
  }

  async countGrantedByGymDay(gymDay: string, facilityId?: string): Promise<number> {
    const records = await this.findByGymDay(gymDay, facilityId);
    return records.filter((r) => r.isGranted()).length;
  }

  async countGrantedByClientAndGymDay(clientId: string, gymDay: string): Promise<number> {
    const count = await this.prisma.attendanceRecord.count({
      where: {
        clientId,
        gymDay: { contains: gymDay },
        result: PrismaAccessResult.GRANTED,
      },
    });
    return count;
  }
}
