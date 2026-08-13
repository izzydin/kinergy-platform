import { RecurrenceSeries, RecurrenceSeriesId } from '../recurrence';

export interface RecurrenceSeriesRepository {
  findById(id: RecurrenceSeriesId | string): Promise<RecurrenceSeries | null>;
  findByClientId(clientId: string): Promise<RecurrenceSeries[]>;
  save(series: RecurrenceSeries): Promise<void>;
}
