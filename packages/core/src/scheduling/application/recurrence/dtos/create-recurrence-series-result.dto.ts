import { RecurrenceSeriesDTO } from './recurrence-series.dto';
import { OccurrenceGenerationResultDTO } from './occurrence-generation-result.dto';

export interface CreateRecurrenceSeriesResultDTO {
  readonly series: RecurrenceSeriesDTO;
  readonly initialGeneration: OccurrenceGenerationResultDTO;
}
