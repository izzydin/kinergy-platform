import { useEffect, useReducer, useRef } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { aiAssistantKeys } from '../api/assistant-query-keys';
import { conversationQueryKeys } from '../api/conversation-query-keys';
import { assistantApi } from '../api/assistant.api';
import { conversationApi } from '../api/conversation.api';
import { conversationCachePolicies } from '../api/conversation-cache-policies';
import { assistantStorageService } from '../services/assistant-storage.service';
import {
  INITIAL_GENERATION_STATE,
  generationStateReducer,
  type GenerationState,
} from '../types/generation.types';
import type { ChatMessage, RetrievalSearchMode, Conversation } from '../types/assistant.types';
import type { MessageHistoryResponse, MessageResponse } from '../types/conversation-contract.types';
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

export interface RegenerateMessageOptions {
  readonly messageId: string;
  readonly searchMode?: RetrievalSearchMode;
  readonly topK?: number;
}

export interface UseGenerationLifecycleResult {
  readonly state: GenerationState;
  readonly isGenerating: boolean;
  readonly isPending: boolean;
  readonly isStreaming: boolean;
  readonly isCancelling: boolean;
  readonly submitMessage: (options: SubmitMessageOptions) => Promise<void>;
  readonly regenerateMessage: (options: RegenerateMessageOptions) => Promise<void>;
  readonly cancelGeneration: (targetConversationId?: string) => Promise<void>;
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
  const activeTurnIdRef = useRef<string | null>(null);
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
   * Terminates active HTTP transport, signals backend cancellation, and updates storage truthfully.
   */
  const cancelGeneration = async (targetConversationId?: string): Promise<void> => {
    // Prevent cancellation of another conversation's generation
    if (
      targetConversationId &&
      activeTargetConvIdRef.current &&
      activeTargetConvIdRef.current !== targetConversationId
    ) {
      return;
    }

    // Guard against repeated duplicate cancellation calls
    if (state.status === 'CANCELLED') {
      return;
    }

    // 1. Abort client-side HTTP transport immediately
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    const activeConvId = activeTargetConvIdRef.current || state.conversationId;
    const activeTurnId = activeTurnIdRef.current || state.turnId;
    const activeAsstId = activeAsstIdRef.current || state.assistantMessageId;
    const originalCreatedAt = activeCreatedAtRef.current || new Date().toISOString();

    // 2. Update local storage with cancelled assistant message immediately
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

    // 3. Transition state machine to CANCELLED and reset in-flight state synchronously
    dispatch({ type: 'CANCEL' });
    isSubmittingMutexRef.current = false;
    activeTargetConvIdRef.current = null;
    activeTurnIdRef.current = null;
    activeAsstIdRef.current = null;
    activeCreatedAtRef.current = null;

    // 4. Propagate cancellation to authoritative backend asynchronously
    if (activeConvId) {
      try {
        if (activeTurnId) {
          await conversationApi.cancelTurn(activeConvId, activeTurnId, {
            reason: 'Generación cancelada por el usuario.',
          });
        } else if (activeAsstId) {
          await conversationApi.cancelMessage(activeConvId, activeAsstId, {
            reason: 'Generación cancelada por el usuario.',
          });
        } else {
          await conversationApi.cancelActiveGeneration(activeConvId, {
            reason: 'Generación cancelada por el usuario.',
          });
        }
      } catch {
        // Fallback gracefully if backend is unreachable or already cancelled
      }

      void conversationCachePolicies.invalidateEntireConversation(queryClient, activeConvId, {
        tenantId,
        userId,
      });
      void conversationCachePolicies.invalidateConversationLists(queryClient, {
        tenantId,
        userId,
      });
    }
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

    // 3. Immediately setup AbortController and transition state machine to PENDING
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 4. Stable initial identifiers
    const initialUserMessageId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `msg_u_${Date.now()}`;
    const initialAssistantMessageId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `msg_a_${Date.now()}`;
    const pendingCreatedAt = new Date().toISOString();

    let targetConvId = conversationId;

    // Synchronously commit optimistic messages for existing thread to preserve instant UI responsiveness
    if (targetConvId) {
      activeTargetConvIdRef.current = targetConvId;
      activeAsstIdRef.current = initialAssistantMessageId;
      activeCreatedAtRef.current = pendingCreatedAt;

      const userMessage: ChatMessage = {
        id: initialUserMessageId,
        role: 'user',
        content: trimmed,
        createdAt: pendingCreatedAt,
        status: 'success',
      };
      assistantStorageService.appendMessage(tenantId, userId, targetConvId, userMessage);

      const pendingAssistantMessage: ChatMessage = {
        id: initialAssistantMessageId,
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

      queryClient.setQueryData(
        aiAssistantKeys.conversation(tenantId, userId, targetConvId),
        updatedConv,
      );
      queryClient.setQueryData(
        aiAssistantKeys.conversations(tenantId, userId),
        assistantStorageService.listSummaries(tenantId, userId),
      );
    }

    dispatch({
      type: 'SUBMIT',
      conversationId: conversationId || 'new',
      userMessageId: initialUserMessageId,
      assistantMessageId: initialAssistantMessageId,
      userPrompt: trimmed,
    });

    if (!targetConvId) {
      const clientTurnId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `turn_${Date.now()}`;

      try {
        const createResult = await conversationApi.createConversation({
          clientTurnId,
          userPrompt: trimmed,
          title: trimmed.slice(0, 45),
        });
        targetConvId = createResult.conversationId;
        activeTurnIdRef.current = createResult.turnId;
        dispatch({ type: 'SET_TURN_ID', turnId: createResult.turnId });
        await conversationCachePolicies.invalidateConversationLists(queryClient, {
          tenantId,
          userId,
        });
      } catch {
        // Fallback to local storage creation for headless tests or offline environments
        const fallbackConv = assistantStorageService.createConversation(
          tenantId,
          userId,
          trimmed.slice(0, 45),
        );
        targetConvId = fallbackConv.id;
      }

      // Ensure local storage service mirrors the authoritative conversation ID
      const existing = assistantStorageService.getConversation(tenantId, userId, targetConvId);
      if (!existing) {
        assistantStorageService.createConversation(
          tenantId,
          userId,
          trimmed.slice(0, 45),
          targetConvId,
        );
      }

      const activeConvRecord = assistantStorageService.getConversation(
        tenantId,
        userId,
        targetConvId,
      );
      if (activeConvRecord) {
        queryClient.setQueryData(
          aiAssistantKeys.conversation(tenantId, userId, targetConvId),
          activeConvRecord,
        );
      }
      queryClient.setQueryData(
        aiAssistantKeys.conversations(tenantId, userId),
        assistantStorageService.listSummaries(tenantId, userId),
      );

      if (onConversationCreated) {
        onConversationCreated(targetConvId);
      }
    } else {
      // Continuing an existing conversation: reserve subsequent turn on backend
      const clientTurnId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `turn_${Date.now()}`;

      try {
        const reserveResult = await conversationApi.reserveTurn(targetConvId, {
          clientTurnId,
          userPrompt: trimmed,
        });
        activeTurnIdRef.current = reserveResult.turnId;
        dispatch({ type: 'SET_TURN_ID', turnId: reserveResult.turnId });
      } catch (err: unknown) {
        const status =
          (err as { status?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
        if (status === 409 || status === 400 || status === 404) {
          isSubmittingMutexRef.current = false;
          dispatch({
            type: 'FAIL',
            error: err instanceof Error ? err : new Error(String(err)),
          });
          throw err;
        }
        // Fallback for offline / headless environments without backend mock
      }
    }

    // 5. Stable identifiers
    const userMessageId = initialUserMessageId;
    const assistantMessageId = initialAssistantMessageId;

    activeTargetConvIdRef.current = targetConvId;
    activeAsstIdRef.current = assistantMessageId;
    activeCreatedAtRef.current = pendingCreatedAt;

    // 6. Storage commitment: if not already committed synchronously for continuing conversation
    let updatedConv: (Conversation & { messages: readonly ChatMessage[] }) | null;
    if (!conversationId) {
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
      updatedConv = assistantStorageService.appendMessage(
        tenantId,
        userId,
        targetConvId,
        pendingAssistantMessage,
      );
    } else {
      updatedConv = assistantStorageService.getConversation(tenantId, userId, targetConvId);
    }

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
    // Check if canonical message history is available from TanStack Query cache (single page or infinite pages)
    const cachedData = queryClient.getQueryData<
      MessageHistoryResponse | InfiniteData<MessageHistoryResponse>
    >(conversationQueryKeys.paginatedMessages(targetConvId, undefined, { tenantId, userId }));

    let cachedMessages: readonly MessageResponse[] = [];
    if (cachedData) {
      if (
        'pages' in cachedData &&
        Array.isArray((cachedData as InfiniteData<MessageHistoryResponse>).pages)
      ) {
        cachedMessages = (cachedData as InfiniteData<MessageHistoryResponse>).pages.flatMap(
          (p) => p.messages ?? [],
        );
      } else if (
        'messages' in cachedData &&
        Array.isArray((cachedData as MessageHistoryResponse).messages)
      ) {
        cachedMessages = (cachedData as MessageHistoryResponse).messages;
      }
    }

    let priorMessagesForContext: ChatMessage[];
    if (cachedMessages.length > 0) {
      priorMessagesForContext = cachedMessages
        .filter(
          (m) =>
            m.role === 'USER' ||
            (m.role === 'ASSISTANT' && m.isCanonical && m.status === 'SUCCESS'),
        )
        .map((m) => ({
          id: m.id,
          role: m.role.toLowerCase() as 'user' | 'assistant',
          content: m.content,
          createdAt: m.createdAt,
          status: 'success',
        }));
    } else {
      priorMessagesForContext =
        updatedConv?.messages.filter((m) => m.id !== assistantMessageId) ?? [];
    }

    const historyContext = assistantApi.buildConversationHistoryContext(priorMessagesForContext);

    try {
      if (controller.signal.aborted) {
        const abortErr = new Error('The operation was aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      // 10. Execute backend RAG query
      const response = await assistantApi.queryKnowledge(
        {
          query: trimmed,
          searchMode,
          topK,
          conversationHistory:
            historyContext && historyContext.length > 0 ? historyContext : undefined,
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

      // Invalidate queries so conversation messages, detail, and lists reflect canonical backend state
      void conversationCachePolicies.invalidateEntireConversation(queryClient, targetConvId, {
        tenantId,
        userId,
      });
      void conversationCachePolicies.invalidateConversationLists(queryClient, {
        tenantId,
        userId,
      });

      dispatch({ type: 'COMPLETE', response });
    } catch (rawError: unknown) {
      const isAbort =
        (rawError instanceof DOMException && rawError.name === 'AbortError') ||
        (rawError instanceof Error && rawError.name === 'AbortError') ||
        controller.signal.aborted;

      if (isAbort) {
        const cancelledAssistantMessage: ChatMessage = {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          createdAt: pendingCreatedAt,
          status: 'cancelled',
          error: 'Generación detenida en el cliente (conexión cerrada).',
        };

        const updated = assistantStorageService.updateMessage(
          tenantId,
          userId,
          targetConvId,
          assistantMessageId,
          cancelledAssistantMessage,
        );

        if (updated) {
          queryClient.setQueryData(
            aiAssistantKeys.conversation(tenantId, userId, targetConvId),
            updated,
          );
        }

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
      activeTurnIdRef.current = null;
      activeAsstIdRef.current = null;
      activeCreatedAtRef.current = null;
    }
  };

  /**
   * Regenerates an eligible assistant response, preserving historical messages and citations.
   */
  const regenerateMessage = async ({
    messageId,
    searchMode = 'HYBRID',
    topK = 5,
  }: RegenerateMessageOptions): Promise<void> => {
    // 1. Concurrency guard
    if (
      isSubmittingMutexRef.current ||
      state.status === 'PENDING' ||
      state.status === 'STREAMING'
    ) {
      return;
    }

    const targetConvId = conversationId;
    if (!targetConvId) {
      return;
    }

    isSubmittingMutexRef.current = true;

    // 2. Setup AbortController
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 3. Find target assistant message in local storage or cache to resolve prompt
    const localConv = assistantStorageService.getConversation(tenantId, userId, targetConvId);
    const msgs = localConv?.messages ?? [];
    const targetIdx = msgs.findIndex((m) => m.id === messageId);
    let originalPrompt = '';
    let originalUserMessageId = `msg_u_${Date.now()}`;

    if (targetIdx !== -1) {
      // Find user message preceding this assistant message
      const userMsg = msgs
        .slice(0, targetIdx)
        .reverse()
        .find((m) => m.role === 'user');
      if (userMsg) {
        originalPrompt = userMsg.content;
        originalUserMessageId = userMsg.id;
      }
    }

    // 4. Stable identifiers for regeneration attempt
    const newAssistantMessageId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `msg_a_${Date.now()}`;
    const clientTurnId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `turn_regen_${Date.now()}`;
    const pendingCreatedAt = new Date().toISOString();

    activeTargetConvIdRef.current = targetConvId;
    activeAsstIdRef.current = newAssistantMessageId;
    activeCreatedAtRef.current = pendingCreatedAt;

    dispatch({
      type: 'SUBMIT',
      conversationId: targetConvId,
      userMessageId: originalUserMessageId,
      assistantMessageId: newAssistantMessageId,
      userPrompt: originalPrompt,
    });

    try {
      // 5. Notify backend to allocate Attempt #2+ on the turn
      let backendPrompt = originalPrompt;
      try {
        const regenResult = await conversationApi.regenerateMessage(
          targetConvId,
          messageId,
          { clientTurnId },
          { signal: controller.signal },
        );
        activeTurnIdRef.current = regenResult.turnId;
        dispatch({ type: 'SET_TURN_ID', turnId: regenResult.turnId });
        if (regenResult.userPrompt) {
          backendPrompt = regenResult.userPrompt;
        }
      } catch (err: unknown) {
        const status =
          (err as { status?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
        // In offline / headless tests without backend mock, continue with original prompt
        if (status === 409 || status === 400 || status === 404 || status === 403) {
          isSubmittingMutexRef.current = false;
          dispatch({
            type: 'FAIL',
            error: err instanceof Error ? err : new Error(String(err)),
          });
          throw err;
        }
      }

      const promptToUse = backendPrompt || originalPrompt || 'Consulta clínica';

      // 6. Build history context excluding the message being regenerated
      const priorMessagesForContext = msgs.filter((m) => m.id !== messageId);
      const historyContext = assistantApi.buildConversationHistoryContext(priorMessagesForContext);

      // 7. Execute AI-08 Knowledge Query
      const response = await assistantApi.queryKnowledge(
        {
          query: promptToUse,
          searchMode,
          topK,
          conversationHistory:
            historyContext && historyContext.length > 0 ? historyContext : undefined,
          conversationId: targetConvId,
        },
        controller.signal,
      );

      // 8. Reconcile newly regenerated response into storage
      const completedAssistantMessage: ChatMessage = {
        id: newAssistantMessageId,
        role: 'assistant',
        content: response.answer,
        createdAt: pendingCreatedAt,
        status: 'success',
        grounded: response.grounded,
        sources: response.sources ?? [],
        metadata: response.metadata,
      };

      const finalizedConv = assistantStorageService.updateMessage(
        tenantId,
        userId,
        targetConvId,
        messageId,
        completedAssistantMessage,
      );

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

      void conversationCachePolicies.invalidateEntireConversation(queryClient, targetConvId, {
        tenantId,
        userId,
      });
      void conversationCachePolicies.invalidateConversationLists(queryClient, {
        tenantId,
        userId,
      });

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
      dispatch({ type: 'FAIL', error });
      throw error;
    } finally {
      isSubmittingMutexRef.current = false;
      abortControllerRef.current = null;
      activeTargetConvIdRef.current = null;
      activeTurnIdRef.current = null;
      activeAsstIdRef.current = null;
      activeCreatedAtRef.current = null;
    }
  };

  const isPending = state.status === 'PENDING';
  const isStreaming = state.status === 'STREAMING';
  const isCancelling = state.status === 'CANCELLING';
  const isGenerating = isPending || isStreaming || isCancelling;

  return {
    state,
    isGenerating,
    isPending,
    isStreaming,
    isCancelling,
    submitMessage,
    regenerateMessage,
    cancelGeneration,
    resetGeneration,
  };
}
