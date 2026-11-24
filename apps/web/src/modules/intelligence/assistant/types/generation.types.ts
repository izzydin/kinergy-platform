import type { RAGAnswerResponseDto } from './assistant.types';

/**
 * Explicit Frontend Generation Lifecycle Status.
 *
 * Models the full lifecycle of an assistant message request:
 * - IDLE: No active generation. Ready to accept new user prompts.
 * - PENDING: Request initiated, awaiting backend first token or completed answer.
 * - STREAMING: First token received, incremental chunks arriving (reserved for AI-09.2.05).
 * - COMPLETED: Full response received, citations verified, turn persisted.
 * - FAILED: Terminal error occurred (network, 5xx, 4xx, rate-limiting).
 * - CANCELLED: Request was explicitly aborted by user action or view teardown.
 * - INTERRUPTED: Stream was disconnected prematurely before canonical completion.
 */
export type GenerationStatus =
  'IDLE' | 'PENDING' | 'STREAMING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';

/**
 * Valid state transition map ensuring strict state machine progression.
 * Protects against invalid transitions silently overwriting authoritative states.
 */
export const VALID_GENERATION_TRANSITIONS: Readonly<
  Record<GenerationStatus, readonly GenerationStatus[]>
> = {
  IDLE: ['PENDING'],
  PENDING: ['STREAMING', 'COMPLETED', 'FAILED', 'CANCELLED', 'INTERRUPTED'],
  STREAMING: ['COMPLETED', 'INTERRUPTED', 'CANCELLED', 'FAILED'],
  COMPLETED: ['IDLE', 'PENDING'],
  FAILED: ['IDLE', 'PENDING'],
  CANCELLED: ['IDLE', 'PENDING'],
  INTERRUPTED: ['IDLE', 'PENDING'],
};

/**
 * Validates whether a proposed status transition is legal.
 */
export function isValidGenerationTransition(from: GenerationStatus, to: GenerationStatus): boolean {
  if (from === to) return true;
  const allowed = VALID_GENERATION_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * State snapshot of the active generation lifecycle.
 */
export interface GenerationState {
  readonly status: GenerationStatus;
  readonly conversationId: string | null;
  readonly userMessageId: string | null;
  readonly assistantMessageId: string | null;
  readonly error: Error | null;
  readonly completedAt: string | null;
}

/**
 * Initial idle state.
 */
export const INITIAL_GENERATION_STATE: GenerationState = {
  status: 'IDLE',
  conversationId: null,
  userMessageId: null,
  assistantMessageId: null,
  error: null,
  completedAt: null,
};

/**
 * Generation state machine events.
 */
export type GenerationEvent =
  | {
      readonly type: 'SUBMIT';
      readonly conversationId: string;
      readonly userMessageId: string;
      readonly assistantMessageId: string;
    }
  | { readonly type: 'STREAM_START' }
  | { readonly type: 'COMPLETE'; readonly response?: RAGAnswerResponseDto }
  | { readonly type: 'FAIL'; readonly error: Error }
  | { readonly type: 'CANCEL' }
  | { readonly type: 'INTERRUPT' }
  | { readonly type: 'RESET' };

/**
 * Pure reducer function governing generation state transitions.
 * Enforces transition validity and guarantees state consistency.
 */
export function generationStateReducer(
  state: GenerationState,
  event: GenerationEvent,
): GenerationState {
  switch (event.type) {
    case 'SUBMIT': {
      if (!isValidGenerationTransition(state.status, 'PENDING')) {
        return state;
      }
      return {
        status: 'PENDING',
        conversationId: event.conversationId,
        userMessageId: event.userMessageId,
        assistantMessageId: event.assistantMessageId,
        error: null,
        completedAt: null,
      };
    }

    case 'STREAM_START': {
      if (!isValidGenerationTransition(state.status, 'STREAMING')) {
        return state;
      }
      return {
        ...state,
        status: 'STREAMING',
        error: null,
      };
    }

    case 'COMPLETE': {
      if (!isValidGenerationTransition(state.status, 'COMPLETED')) {
        return state;
      }
      return {
        ...state,
        status: 'COMPLETED',
        error: null,
        completedAt: new Date().toISOString(),
      };
    }

    case 'FAIL': {
      if (!isValidGenerationTransition(state.status, 'FAILED')) {
        return state;
      }
      return {
        ...state,
        status: 'FAILED',
        error: event.error,
        completedAt: new Date().toISOString(),
      };
    }

    case 'CANCEL': {
      if (!isValidGenerationTransition(state.status, 'CANCELLED')) {
        return state;
      }
      return {
        ...state,
        status: 'CANCELLED',
        completedAt: new Date().toISOString(),
      };
    }

    case 'INTERRUPT': {
      if (!isValidGenerationTransition(state.status, 'INTERRUPTED')) {
        return state;
      }
      return {
        ...state,
        status: 'INTERRUPTED',
        completedAt: new Date().toISOString(),
      };
    }

    case 'RESET': {
      return INITIAL_GENERATION_STATE;
    }

    default:
      return state;
  }
}
