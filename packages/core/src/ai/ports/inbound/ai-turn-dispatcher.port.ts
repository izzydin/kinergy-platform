export const AI_TURN_DISPATCHER_PORT = Symbol('IAiTurnDispatcherPort');

/**
 * Command representing a turn generation execution request to be dispatched.
 */
export interface TurnDispatchCommand {
  readonly tenantId: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly turnId: string;
  readonly attemptId: string;
  readonly attemptNumber: number;
  readonly actorContext: {
    readonly roles: readonly string[];
    readonly permissions: readonly string[];
  };
  readonly requestId?: string;
  readonly correlationId?: string;
}

/**
 * Outcome of attempting to dispatch a turn to the execution pipeline.
 */
export type TurnDispatchStatus =
  'DISPATCHED' | 'ALREADY_COMPLETED' | 'ALREADY_ACTIVE' | 'SKIPPED' | 'FAILED';

export interface TurnDispatchResult {
  readonly turnId: string;
  readonly dispatched: boolean;
  readonly status: TurnDispatchStatus;
  readonly message?: string;
}

/**
 * Inbound port for reliable generation dispatch and in-flight cancellation signaling.
 *
 * Guarantees:
 * - A newly reserved turn is dispatched exactly once logically.
 * - Duplicate reservation retries do not trigger duplicate logical work.
 * - Bridges turn reservation to the AI-08 execution pipeline without executing RAG inside HTTP controllers.
 * - Connects cancellation requests to active worker execution via AbortSignal.
 */
export interface IAiTurnDispatcherPort {
  /**
   * Dispatches a reserved turn for execution through the background worker.
   */
  dispatchTurn(command: TurnDispatchCommand): Promise<TurnDispatchResult>;

  /**
   * Signals cancellation of an active in-flight turn generation.
   *
   * @param tenantId Tenant boundary
   * @param conversationId Conversation unique identifier
   * @param turnId Turn unique identifier
   * @param reason Optional human-readable cancellation reason
   * @returns true if an in-flight execution was active and signaled, false otherwise
   */
  cancelTurn?(
    tenantId: string,
    conversationId: string,
    turnId: string,
    reason?: string,
  ): Promise<boolean>;

  /**
   * Checks if a turn is currently actively executing on this worker instance.
   */
  isTurnActive?(tenantId: string, conversationId: string, turnId: string): boolean;
}
