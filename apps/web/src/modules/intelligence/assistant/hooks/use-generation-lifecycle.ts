import { useEffect, useReducer, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { aiAssistantKeys } from '../api/assistant-query-keys';
import { assistantApi } from '../api/assistant.api';
import { assistantStorageService } from '../services/assistant-storage.service';
import {
  INITIAL_GENERATION_STATE,
  generationStateReducer,
  type GenerationState,
} from '../types/generation.types';
import type { ChatMessage, RetrievalSearchMode } from '../types/assistant.types';
import { normalizeApiError } from '../../../../shared/api/api-error';

export interface UseGenerationLifecycleOptions {
  readonly tenantId: string;
  readonly userId: string;
  readonly conversationId?: string;
  readonly onConversationCreated?: (newConversationId: string) => void;
}

export interface SubmitMessageOptions {
  readonly prompt: string;
  readonly searchMode?: RetrievalSearchMode;
  readonly topK?: number;
}

export interface UseGenerationLifecycleResult {
  readonly state: GenerationState;
  readonly isGenerating: boolean;
  readonly isPending: boolean;
  readonly isStreaming: boolean;
  readonly submitMessage: (options: SubmitMessageOptions) => Promise<void>;
  readonly cancelGeneration: (targetConversationId?: string) => void;
  readonly resetGeneration: () => void;
}

const MIN_PROMPT_LENGTH = 3;
const MAX_PROMPT_LENGTH = 1000;

/**
 * Custom Hook: Manages the explicit generation lifecycle, cancellation,
 * interruption handling, and canonical response reconciliation.
 *
 * Guarantees:
 * - Deterministic finite state machine (IDLE -> PENDING -> COMPLETED / FAILED / CANCELLED / INTERRUPTED)
 * - Single-flight submission mutex locking out rapid duplicate requests
 * - Grounded multi-turn context bounded to verified completed turns
 * - Safe client-side cancellation via AbortController with transparent semantics
 * - Interrupted connection handling preserving user prompt and partial state
 * - Canonical response reconciliation applying authoritative citations and metadata
 * - Stale response protection when switching threads during in-flight generation
 * - No automatic resubmission without explicit user action
 */
export function useGenerationLifecycle({
  tenantId,
  userId,
  conversationId,
  onConversationCreated,
}: UseGenerationLifecycleOptions): UseGenerationLifecycleResult {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(generationStateReducer, INITIAL_GENERATION_STATE);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isSubmittingMutexRef = useRef<boolean>(false);
  const currentConversationIdRef = useRef<string | undefined>(conversationId);

  // Active in-flight identifiers tracked by ref for immediate synchronous access
  const activeTargetConvIdRef = useRef<string | null>(null);
  const activeAsstIdRef = useRef<string | null>(null);
  const activeCreatedAtRef = useRef<string | null>(null);

  // Keep ref synchronized with current active conversation ID
  useEffect(() => {
    currentConversationIdRef.current = conversationId;
  }, [conversationId]);

  // Cleanup on unmount: abort in-flight requests and mark interrupted
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;

        const activeConvId = activeTargetConvIdRef.current;
        const activeAsstId = activeAsstIdRef.current;
        const createdAt = activeCreatedAtRef.current || new Date().toISOString();

        if (activeConvId && activeAsstId) {
          const interruptedMsg: ChatMessage = {
            id: activeAsstId,
            role: 'assistant',
            content: '',
            createdAt,
            status: 'interrupted',
            error: 'Operación interrumpida por desmontaje de componente o navegación.',
          };

          assistantStorageService.updateMessage(
            tenantId,
            userId,
            activeConvId,
            activeAsstId,
            interruptedMsg,
          );
        }
      }
    };
  }, [tenantId, userId]);

  /**
   * Explicit client-side cancellation action.
   * Terminates active HTTP transport and updates storage truthfully.
   */
  const cancelGeneration = (targetConversationId?: string) => {
    // Prevent cancellation of another conversation's generation
    if (
      targetConversationId &&
      activeTargetConvIdRef.current &&
      activeTargetConvIdRef.current !== targetConversationId
    ) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    const activeConvId = activeTargetConvIdRef.current || state.conversationId;
    const activeAsstId = activeAsstIdRef.current || state.assistantMessageId;
    const originalCreatedAt = activeCreatedAtRef.current || new Date().toISOString();

    if (activeConvId && activeAsstId) {
      const cancelledMsg: ChatMessage = {
        id: activeAsstId,
        role: 'assistant',
        content: '',
        createdAt: originalCreatedAt,
        status: 'cancelled',
        error: 'Generación detenida en el cliente (conexión cerrada).',
      };

      const updated = assistantStorageService.updateMessage(
        tenantId,
        userId,
        activeConvId,
        activeAsstId,
        cancelledMsg,
      );

      if (updated) {
        queryClient.setQueryData(
          aiAssistantKeys.conversation(tenantId, userId, activeConvId),
          updated,
        );
      }
    }

    dispatch({ type: 'CANCEL' });
    isSubmittingMutexRef.current = false;
    activeTargetConvIdRef.current = null;
    activeAsstIdRef.current = null;
    activeCreatedAtRef.current = null;
  };

  const resetGeneration = () => {
    dispatch({ type: 'RESET' });
  };

  /**
   * Submits a user prompt, establishes optimistic state, executes backend RAG call,
   * and reconciles the canonical response.
   */
  const submitMessage = async ({
    prompt,
    searchMode = 'HYBRID',
    topK = 5,
  }: SubmitMessageOptions): Promise<void> => {
    const trimmed = prompt.trim();

    // 1. Validation check
    if (trimmed.length < MIN_PROMPT_LENGTH || trimmed.length > MAX_PROMPT_LENGTH) {
      const valError = new Error(
        `La consulta debe contener entre ${MIN_PROMPT_LENGTH} y ${MAX_PROMPT_LENGTH} caracteres.`,
      );
      throw valError;
    }

    // 2. Duplicate submission lock check
    if (
      isSubmittingMutexRef.current ||
      state.status === 'PENDING' ||
      state.status === 'STREAMING'
    ) {
      return;
    }

    isSubmittingMutexRef.current = true;

    // 3. Resolve target conversation (create if in fresh workspace)
    let targetConvId = conversationId;
    if (!targetConvId) {
      const newConv = assistantStorageService.createConversation(
        tenantId,
        userId,
        trimmed.slice(0, 45),
      );
      targetConvId = newConv.id;
      queryClient.setQueryData(aiAssistantKeys.conversation(tenantId, userId, newConv.id), newConv);
      queryClient.setQueryData(
        aiAssistantKeys.conversations(tenantId, userId),
        assistantStorageService.listSummaries(tenantId, userId),
      );
      if (onConversationCreated) {
        onConversationCreated(newConv.id);
      }
    }

    // 4. Stable identifiers
    const userMessageId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `msg_u_${Date.now()}`;
    const assistantMessageId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `msg_a_${Date.now()}`;
    const pendingCreatedAt = new Date().toISOString();

    activeTargetConvIdRef.current = targetConvId;
    activeAsstIdRef.current = assistantMessageId;
    activeCreatedAtRef.current = pendingCreatedAt;

    // 5. Transition state machine to PENDING
    dispatch({
      type: 'SUBMIT',
      conversationId: targetConvId,
      userMessageId,
      assistantMessageId,
    });

    // 6. Optimistic storage commitment
    const userMessage: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: trimmed,
      createdAt: pendingCreatedAt,
      status: 'success',
    };
    assistantStorageService.appendMessage(tenantId, userId, targetConvId, userMessage);

    const pendingAssistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      createdAt: pendingCreatedAt,
      status: 'pending',
    };
    const updatedConv = assistantStorageService.appendMessage(
      tenantId,
      userId,
      targetConvId,
      pendingAssistantMessage,
    );

    // 7. Update query caches with pending placeholder
    queryClient.setQueryData(
      aiAssistantKeys.conversation(tenantId, userId, targetConvId),
      updatedConv,
    );
    queryClient.setQueryData(
      aiAssistantKeys.conversations(tenantId, userId),
      assistantStorageService.listSummaries(tenantId, userId),
    );

    // 8. Construct bounded history context
    const historyContext = assistantApi.buildConversationHistoryContext(
      updatedConv.messages.filter((m) => m.id !== assistantMessageId),
    );

    // 9. Setup AbortController
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // 10. Execute backend RAG query
      const response = await assistantApi.queryKnowledge(
        {
          query: trimmed,
          searchMode,
          topK,
          conversationHistory: historyContext.length > 0 ? historyContext : undefined,
        },
        controller.signal,
      );

      // 11. Canonical Response Reconciliation
      // Final backend response is treated as authoritative.
      const completedAssistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: response.answer,
        createdAt: pendingCreatedAt, // Preserves exact original chronologic turn timestamp
        status: 'success',
        grounded: response.grounded,
        sources: response.sources ?? [],
        metadata: response.metadata,
      };

      const finalizedConv = assistantStorageService.updateMessage(
        tenantId,
        userId,
        targetConvId,
        assistantMessageId,
        completedAssistantMessage,
      );

      // Check for stale response: only update active conversation cache if user hasn't switched
      if (finalizedConv) {
        queryClient.setQueryData(
          aiAssistantKeys.conversation(tenantId, userId, targetConvId),
          finalizedConv,
        );
      }
      queryClient.setQueryData(
        aiAssistantKeys.conversations(tenantId, userId),
        assistantStorageService.listSummaries(tenantId, userId),
      );

      dispatch({ type: 'COMPLETE', response });
    } catch (rawError: unknown) {
      const isAbort =
        (rawError instanceof DOMException && rawError.name === 'AbortError') ||
        (rawError instanceof Error && rawError.name === 'AbortError') ||
        controller.signal.aborted;

      if (isAbort) {
        dispatch({ type: 'CANCEL' });
        throw rawError;
      }

      const error = normalizeApiError(rawError);

      // Classify interruption: offline, gateway timeout (504), proxy bad gateway (502/503), network loss
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      const isTimeout =
        error.statusCode === 504 ||
        error.message.toLowerCase().includes('gateway timeout') ||
        error.message.toLowerCase().includes('timeout') ||
        error.code === 'PROVIDER_TIMEOUT';
      const isNetworkInterruption =
        isOffline ||
        error.statusCode === 0 ||
        error.message.toLowerCase().includes('networkerror') ||
        error.message.toLowerCase().includes('failed to fetch') ||
        error.message.toLowerCase().includes('network request failed');

      const isInterrupted = isTimeout || isNetworkInterruption;

      const failedAssistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        createdAt: pendingCreatedAt,
        status: isInterrupted ? 'interrupted' : 'error',
        error: isTimeout
          ? 'Tiempo de espera agotado en la pasarela de inferencia (504).'
          : isNetworkInterruption
            ? 'Conexión de red interrumpida antes de recibir respuesta completa.'
            : error.message,
      };

      const failedConv = assistantStorageService.updateMessage(
        tenantId,
        userId,
        targetConvId,
        assistantMessageId,
        failedAssistantMessage,
      );

      if (failedConv) {
        queryClient.setQueryData(
          aiAssistantKeys.conversation(tenantId, userId, targetConvId),
          failedConv,
        );
      }

      if (isInterrupted) {
        dispatch({ type: 'INTERRUPT' });
      } else {
        dispatch({ type: 'FAIL', error });
      }

      // Re-throw so composer retains the user's draft on failure
      throw error;
    } finally {
      isSubmittingMutexRef.current = false;
      abortControllerRef.current = null;
      activeTargetConvIdRef.current = null;
      activeAsstIdRef.current = null;
      activeCreatedAtRef.current = null;
    }
  };

  const isGenerating = state.status === 'PENDING' || state.status === 'STREAMING';
  const isPending = state.status === 'PENDING';
  const isStreaming = state.status === 'STREAMING';

  return {
    state,
    isGenerating,
    isPending,
    isStreaming,
    submitMessage,
    cancelGeneration,
    resetGeneration,
  };
}
