import { RecurrenceSeries } from '../recurrence/recurrence-series.aggregate';
import { RecurrenceSeriesId } from '../recurrence/value-objects/recurrence-series-id.vo';

export interface RecurrenceSeriesRepository {
  findById(id: RecurrenceSeriesId | string): Promise<RecurrenceSeries | null>;
  findByClientId(clientId: string): Promise<RecurrenceSeries[]>;
  save(series: RecurrenceSeries): Promise<void>;
}
