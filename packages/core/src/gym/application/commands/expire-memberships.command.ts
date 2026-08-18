import { Command } from '../shared/command.interface';

export interface ExpireMembershipsInput {
  /**
   * Optional evaluation timestamp threshold.
   * If omitted, defaults to clock.now().
   */
  readonly asOfDate?: Date | string;

  /**
   * Maximum number of candidate memberships to process in this execution chunk.
   * Defaults to 500.
   */
  readonly batchSize?: number;

  /**
   * If true, simulates expiration evaluation and returns candidate details without
   * mutating aggregate state, persisting changes, or publishing domain events.
   */
  readonly dryRun?: boolean;
}

/**
 * Command requesting batch reconciliation and materialization of expired memberships.
 */
export class ExpireMembershipsCommand implements Command<ExpireMembershipsInput> {
  readonly type = 'ExpireMembershipsCommand';

  constructor(public readonly input: ExpireMembershipsInput = {}) {}
}
