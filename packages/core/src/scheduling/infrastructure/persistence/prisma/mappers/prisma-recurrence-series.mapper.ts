import {
  RecurrenceSeries as PrismaRecurrenceSeriesModel,
  RecurrenceException as PrismaRecurrenceExceptionModel,
  RecurrenceFrequency as PrismaRecurrenceFrequency,
  SeriesStatus as PrismaSeriesStatus,
} from '@prisma/client';
import { RecurrenceSeries } from '../../../../domain/recurrence/recurrence-series.aggregate';
import { RecurrenceSeriesId } from '../../../../domain/recurrence/value-objects/recurrence-series-id.vo';
import { RecurrencePattern } from '../../../../domain/recurrence/value-objects/recurrence-pattern.vo';
import { RecurrenceFrequency } from '../../../../domain/recurrence/value-objects/recurrence-frequency.enum';
import {
  RecurrenceException,
  ExceptionType,
} from '../../../../domain/recurrence/value-objects/recurrence-exception.vo';
import { SeriesStatus } from '../../../../domain/recurrence/value-objects/series-status.enum';

export type PrismaRecurrenceSeriesWithRelations = PrismaRecurrenceSeriesModel & {
  exceptions?: PrismaRecurrenceExceptionModel[];
};

export class PrismaRecurrenceSeriesMapper {
  public static toDomain(raw: PrismaRecurrenceSeriesWithRelations): RecurrenceSeries {
    const pattern = RecurrencePattern.create({
      frequency: raw.frequency as unknown as RecurrenceFrequency,
      startDate: raw.startDate,
      endDate: raw.endDate ?? undefined,
      maxOccurrences: raw.maxOccurrences ?? undefined,
      localStartTime: {
        hour: raw.localStartHour,
        minute: raw.localStartMinute,
      },
      durationMinutes: raw.durationMinutes,
      timezone: raw.timezone,
    });

    const exceptions = (raw.exceptions ?? []).map((e) =>
      RecurrenceException.create({
        occurrenceIndex: e.occurrenceIndex,
        date: e.date,
        type: e.type as unknown as ExceptionType,
        reason: e.reason ?? undefined,
      }),
    );

    return RecurrenceSeries.reconstitute({
      id: RecurrenceSeriesId.create(raw.id),
      clientId: raw.clientId,
      therapistId: raw.therapistId,
      roomId: raw.roomId,
      serviceType: raw.serviceType,
      pattern,
      exceptions,
      status: raw.status as unknown as SeriesStatus,
      cancellationReason: raw.cancellationReason ?? undefined,
      version: raw.version,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  public static toPersistence(
    series: RecurrenceSeries,
  ): Omit<PrismaRecurrenceSeriesModel, 'createdAt' | 'updatedAt'> {
    const patVal = series.pattern.getValue();

    return {
      id: series.id.toString(),
      clientId: series.clientId,
      therapistId: series.therapistId,
      roomId: series.roomId,
      serviceType: series.serviceType,
      frequency: patVal.frequency as unknown as PrismaRecurrenceFrequency,
      startDate: patVal.startDate,
      endDate: patVal.endDate ?? null,
      maxOccurrences: patVal.maxOccurrences ?? null,
      localStartHour: patVal.localStartTime.hour,
      localStartMinute: patVal.localStartTime.minute,
      durationMinutes: patVal.durationMinutes,
      timezone: patVal.timezone ?? 'UTC',
      status: series.status as unknown as PrismaSeriesStatus,
      cancellationReason: series.cancellationReason ?? null,
      version: series.version,
    };
  }
}
