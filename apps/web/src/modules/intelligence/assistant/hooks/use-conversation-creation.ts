import { useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { conversationApi } from '../api/conversation.api';
import { conversationCachePolicies } from '../api/conversation-cache-policies';
import { useResolvedConversationScope, type QueryScopeOptions } from './use-conversation-queries';
import type {
  CreateConversationRequest,
  CreateConversationResponse,
} from '../types/conversation-contract.types';
import { normalizeConversationApiError } from '../api/conversation-api.errors';

/**
 * Creation status state machine values.
 */
export type ConversationCreationStatus = 'idle' | 'creating' | 'success' | 'error';

/**
 * Configuration options for the useConversationCreation hook.
 */
export interface UseConversationCreationOptions extends QueryScopeOptions {
  /** Optional callback invoked immediately upon successful creation with authoritative response */
  readonly onSuccess?: (response: CreateConversationResponse) => void | Promise<void>;
  /** Optional callback invoked if creation fails */
  readonly onError?: (error: Error) => void | Promise<void>;
}

/**
 * Parameters for creating a conversation.
 */
export interface CreateConversationParams {
  readonly prompt: string;
  readonly title?: string;
  readonly clientTurnId?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Result object returned by useConversationCreation.
 */
export interface UseConversationCreationResult {
  readonly status: ConversationCreationStatus;
  readonly isCreating: boolean;
  readonly isSuccess: boolean;
  readonly isError: boolean;
  readonly error: Error | null;
  readonly createdConversation: CreateConversationResponse | null;
  readonly createConversation: (
    params: CreateConversationParams,
  ) => Promise<CreateConversationResponse>;
  readonly retry: () => Promise<CreateConversationResponse | null>;
  readonly reset: () => void;
}

/**
 * Custom React Hook: Governs persistent conversation creation with authoritative backend reconciliation.
 *
 * Guarantees:
 * - Single-flight mutex lock preventing duplicate creations from rapid clicks or concurrent events.
 * - Idempotent turn ID stability across retries (`clientTurnId` preserved on retry).
 * - Direct query cache invalidation reconciling conversation collections across the workspace.
 * - Rollback on failure with error preservation so composer can retain draft text.
 * - Never generates or trusts authoritative conversation IDs in the browser.
 */
export function useConversationCreation(
  options?: UseConversationCreationOptions,
): UseConversationCreationResult {
  const queryClient = useQueryClient();
  const scope = useResolvedConversationScope(options?.scope);

  const [status, setStatus] = useState<ConversationCreationStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [createdConversation, setCreatedConversation] = useState<CreateConversationResponse | null>(
    null,
  );

  // Mutex lock ref ensuring atomic single-flight execution
  const isCreatingMutexRef = useRef<boolean>(false);
  // Preserved parameters for retry without duplicate key regeneration
  const lastParamsRef = useRef<CreateConversationRequest | null>(null);

  const reset = useCallback(() => {
    isCreatingMutexRef.current = false;
    lastParamsRef.current = null;
    setStatus('idle');
    setError(null);
    setCreatedConversation(null);
  }, []);

  const executeCreation = useCallback(
    async (request: CreateConversationRequest): Promise<CreateConversationResponse> => {
      // 1. Mutex Check: Prevent concurrent execution
      if (isCreatingMutexRef.current) {
        throw new Error('Ya existe una creación de conversación en curso.');
      }

      isCreatingMutexRef.current = true;
      setStatus('creating');
      setError(null);

      try {
        // 2. Dispatch to backend API
        const response = await conversationApi.createConversation(request);

        // 3. Reconcile TanStack Query Cache
        await conversationCachePolicies.invalidateConversationLists(queryClient, scope);

        // 4. Update Hook State
        setCreatedConversation(response);
        setStatus('success');

        // 5. Trigger Success Callback
        if (options?.onSuccess) {
          await options.onSuccess(response);
        }

        return response;
      } catch (rawError: unknown) {
        const normalized = normalizeConversationApiError(rawError, 'createConversation');
        setError(normalized);
        setStatus('error');

        if (options?.onError) {
          void options.onError(normalized);
        }

        throw normalized;
      } finally {
        isCreatingMutexRef.current = false;
      }
    },
    [options, queryClient, scope],
  );

  const createConversation = useCallback(
    async (params: CreateConversationParams): Promise<CreateConversationResponse> => {
      const prompt = params.prompt.trim();
      if (prompt.length === 0) {
        const err = new Error('El prompt de usuario no puede estar vacío.');
        setError(err);
        setStatus('error');
        throw err;
      }

      // Generate or reuse client-side turn idempotency identifier
      const clientTurnId =
        params.clientTurnId ||
        (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `turn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);

      const request: CreateConversationRequest = {
        clientTurnId,
        userPrompt: prompt,
        title: params.title || (prompt.length > 45 ? `${prompt.slice(0, 45)}...` : prompt),
        metadata: params.metadata,
      };

      lastParamsRef.current = request;
      return executeCreation(request);
    },
    [executeCreation],
  );

  const retry = useCallback(async (): Promise<CreateConversationResponse | null> => {
    if (!lastParamsRef.current) {
      return null;
    }
    // Re-execute with exact same clientTurnId to guarantee backend idempotency recovery
    return executeCreation(lastParamsRef.current);
  }, [executeCreation]);

  return {
    status,
    isCreating: status === 'creating',
    isSuccess: status === 'success',
    isError: status === 'error',
    error,
    createdConversation,
    createConversation,
    retry,
    reset,
  };
}
