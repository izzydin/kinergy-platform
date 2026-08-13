import { RecurrenceSeries } from '../../../domain/recurrence/recurrence-series.aggregate';
import { RecurrenceSeriesDTO } from '../dtos/recurrence-series.dto';

export class RecurrenceSeriesMapper {
  public static toDTO(series: RecurrenceSeries): RecurrenceSeriesDTO {
    const patVal = series.pattern.getValue();

    return {
      id: series.id.toString(),
      clientId: series.clientId,
      therapistId: series.therapistId,
      roomId: series.roomId,
      serviceType: series.serviceType,
      pattern: {
        frequency: patVal.frequency,
        startDate: patVal.startDate.toISOString(),
        endDate: patVal.endDate?.toISOString(),
        maxOccurrences: patVal.maxOccurrences,
        localStartTime: {
          hour: patVal.localStartTime.hour,
          minute: patVal.localStartTime.minute,
        },
        durationMinutes: patVal.durationMinutes,
        timezone: patVal.timezone,
      },
      exceptions: series.exceptions.map((exc) => ({
        occurrenceIndex: exc.occurrenceIndex,
        date: exc.date.toISOString(),
        type: exc.type,
        reason: exc.reason,
      })),
      status: series.status,
      cancellationReason: series.cancellationReason,
      version: series.version,
      createdAt: series.createdAt.toISOString(),
      updatedAt: series.updatedAt.toISOString(),
    };
  }

  public static toDTOList(seriesList: Iterable<RecurrenceSeries>): RecurrenceSeriesDTO[] {
    return Array.from(seriesList).map((s) => RecurrenceSeriesMapper.toDTO(s));
  }
}
