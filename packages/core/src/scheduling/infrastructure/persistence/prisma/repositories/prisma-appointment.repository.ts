import { Injectable } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { Appointment } from '../../../../domain/appointment/appointment.aggregate';
import { AppointmentId } from '../../../../domain/appointment/appointment-id.vo';
import { TimeRange } from '../../../../domain/value-objects/time-range.vo';
import {
  AppointmentRepository,
  FindAppointmentsOptions,
} from '../../../../domain/repositories/appointment.repository';
import { PrismaAppointmentMapper } from '../mappers/prisma-appointment.mapper';
import { OptimisticLockException } from '../../../../domain/exceptions/optimistic-lock.exception';

interface PrismaClientProvider {
  getClient?: () => PrismaClient;
}

@Injectable()
export class PrismaAppointmentRepository implements AppointmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db(): PrismaClient {
    const provider = this.prisma as unknown as PrismaClientProvider;
    if (typeof provider.getClient === 'function') {
      return provider.getClient() as PrismaClient;
    }
    return this.prisma;
  }

  public async findById(id: AppointmentId | string): Promise<Appointment | null> {
    const key = typeof id === 'string' ? id : id.getValue();
    const raw = await this.db.appointment.findUnique({
      where: { id: key },
      include: { notes: true },
    });

    if (!raw) return null;
    return PrismaAppointmentMapper.toDomain(raw);
  }

  public async findBySeriesId(seriesId: string): Promise<Appointment[]> {
    const rawList = await this.db.appointment.findMany({
      where: {
        seriesId,
        status: { not: 'CANCELLED' },
      },
      include: { notes: true },
      orderBy: { startTime: 'asc' },
    });

    return rawList.map((raw) => PrismaAppointmentMapper.toDomain(raw));
  }

  public async findConflictingAppointments(
    therapistId: string,
    roomId: string,
    clientId: string,
    range: TimeRange,
    excludeAppointmentId?: string,
  ): Promise<Appointment[]> {
    const rawList = await this.db.appointment.findMany({
      where: {
        status: { not: 'CANCELLED' },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
        startTime: { lt: range.end },
        endTime: { gt: range.start },
        OR: [{ therapistId }, { roomId }, { clientId }],
      },
      include: { notes: true },
    });

    return rawList.map((raw) => PrismaAppointmentMapper.toDomain(raw));
  }

  public async findAppointmentsForTherapist(
    therapistId: string,
    range: TimeRange,
  ): Promise<Appointment[]> {
    const rawList = await this.db.appointment.findMany({
      where: {
        therapistId,
        startTime: { lt: range.end },
        endTime: { gt: range.start },
      },
      include: { notes: true },
      orderBy: { startTime: 'asc' },
    });

    return rawList.map((raw) => PrismaAppointmentMapper.toDomain(raw));
  }

  public async findAppointmentsForRoom(roomId: string, range: TimeRange): Promise<Appointment[]> {
    const rawList = await this.db.appointment.findMany({
      where: {
        roomId,
        startTime: { lt: range.end },
        endTime: { gt: range.start },
      },
      include: { notes: true },
      orderBy: { startTime: 'asc' },
    });

    return rawList.map((raw) => PrismaAppointmentMapper.toDomain(raw));
  }

  public async findAppointmentsForClient(
    clientId: string,
    range: TimeRange,
  ): Promise<Appointment[]> {
    const rawList = await this.db.appointment.findMany({
      where: {
        clientId,
        startTime: { lt: range.end },
        endTime: { gt: range.start },
      },
      include: { notes: true },
      orderBy: { startTime: 'asc' },
    });

    return rawList.map((raw) => PrismaAppointmentMapper.toDomain(raw));
  }

  public async findAppointmentsByRange(
    range: TimeRange,
    options?: FindAppointmentsOptions,
  ): Promise<Appointment[]> {
    const where: Prisma.AppointmentWhereInput = {
      startTime: { lt: range.end },
      endTime: { gt: range.start },
    };

    if (options?.therapistId) where.therapistId = options.therapistId;
    if (options?.roomId) where.roomId = options.roomId;
    if (options?.clientId) where.clientId = options.clientId;
    if (options?.seriesId) where.seriesId = options.seriesId;
    if (options?.status)
      where.status = options.status as Prisma.EnumAppointmentStatusFilter<'Appointment'>;

    const rawList = await this.db.appointment.findMany({
      where,
      include: { notes: true },
      orderBy: { startTime: 'asc' },
    });

    return rawList.map((raw) => PrismaAppointmentMapper.toDomain(raw));
  }

  public async save(appointment: Appointment): Promise<void> {
    const data = PrismaAppointmentMapper.toPersistence(appointment);

    if (appointment.version === 1) {
      try {
        await this.db.appointment.upsert({
          where: { id: appointment.id.getValue() },
          create: data,
          update: data,
        });
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new Error(
            `Database constraint violation: duplicate occurrence '${appointment.occurrenceIndex}' for series '${appointment.seriesId}'.`,
            { cause: error },
          );
        }
        throw error;
      }
    } else {
      const priorVersion = appointment.version - 1;
      const result = await this.db.appointment.updateMany({
        where: {
          id: appointment.id.getValue(),
          version: priorVersion,
        },
        data,
      });

      if (result.count === 0) {
        throw new OptimisticLockException('Appointment', appointment.id.getValue(), priorVersion);
      }
    }

    // Synchronize Appointment Notes
    for (const note of appointment.notes) {
      await this.db.appointmentNote.upsert({
        where: { id: note.id },
        create: {
          id: note.id,
          appointmentId: appointment.id.getValue(),
          authorId: note.authorId,
          noteText: note.noteText,
          createdAt: note.createdAt,
        },
        update: {
          noteText: note.noteText,
        },
      });
    }
  }
}
