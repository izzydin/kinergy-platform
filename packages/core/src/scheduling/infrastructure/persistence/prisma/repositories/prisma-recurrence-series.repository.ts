import { Injectable } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { RecurrenceSeries } from '../../../../domain/recurrence/recurrence-series.aggregate';
import { RecurrenceSeriesId } from '../../../../domain/recurrence/value-objects/recurrence-series-id.vo';
import { RecurrenceSeriesRepository } from '../../../../domain/repositories/recurrence-series.repository';
import { PrismaRecurrenceSeriesMapper } from '../mappers/prisma-recurrence-series.mapper';
import { OptimisticLockException } from '../../../../domain/exceptions/optimistic-lock.exception';

interface PrismaClientProvider {
  getClient?: () => PrismaClient;
}

@Injectable()
export class PrismaRecurrenceSeriesRepository implements RecurrenceSeriesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get db(): PrismaClient {
    const provider = this.prisma as unknown as PrismaClientProvider;
    if (typeof provider.getClient === 'function') {
      return provider.getClient() as PrismaClient;
    }
    return this.prisma;
  }

  public async findById(id: RecurrenceSeriesId | string): Promise<RecurrenceSeries | null> {
    const key = typeof id === 'string' ? id : id.toString();
    const raw = await this.db.recurrenceSeries.findUnique({
      where: { id: key },
      include: { exceptions: true },
    });

    if (!raw) return null;
    return PrismaRecurrenceSeriesMapper.toDomain(raw);
  }

  public async findByClientId(clientId: string): Promise<RecurrenceSeries[]> {
    const rawList = await this.db.recurrenceSeries.findMany({
      where: { clientId },
      include: { exceptions: true },
      orderBy: { createdAt: 'desc' },
    });

    return rawList.map((raw) => PrismaRecurrenceSeriesMapper.toDomain(raw));
  }

  public async save(series: RecurrenceSeries): Promise<void> {
    const data = PrismaRecurrenceSeriesMapper.toPersistence(series);

    await this.db.$transaction(async (tx) => {
      if (series.version === 1) {
        try {
          await tx.recurrenceSeries.upsert({
            where: { id: series.id.toString() },
            create: data,
            update: data,
          });
        } catch (error: unknown) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new Error(`Duplicate recurrence series with ID '${series.id.toString()}'.`, {
              cause: error,
            });
          }
          throw error;
        }
      } else {
        const priorVersion = series.version - 1;
        const result = await tx.recurrenceSeries.updateMany({
          where: {
            id: series.id.toString(),
            version: priorVersion,
          },
          data,
        });

        if (result.count === 0) {
          throw new OptimisticLockException('RecurrenceSeries', series.id.toString(), priorVersion);
        }
      }

      // Synchronize Recurrence Exceptions
      for (const exc of series.exceptions) {
        await tx.recurrenceException.upsert({
          where: {
            unique_series_occurrence_exception: {
              seriesId: series.id.toString(),
              occurrenceIndex: exc.occurrenceIndex,
            },
          },
          create: {
            seriesId: series.id.toString(),
            occurrenceIndex: exc.occurrenceIndex,
            date: exc.date,
            type: exc.type as Prisma.EnumExceptionTypeFieldUpdateOperationsInput['set'] &
              ('SKIPPED' | 'MODIFIED'),
            reason: exc.reason,
          },
          update: {
            date: exc.date,
            type: exc.type as Prisma.EnumExceptionTypeFieldUpdateOperationsInput['set'] &
              ('SKIPPED' | 'MODIFIED'),
            reason: exc.reason,
          },
        });
      }
    });
  }
}
