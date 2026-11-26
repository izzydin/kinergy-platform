import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useOptionalAuth } from '../../../../app/providers/auth-provider';
import { assistantStorageService } from '../services/assistant-storage.service';
import {
  useConversation,
  useInfiniteConversationMessages,
} from '../hooks/use-conversation-queries';
import {
  useArchiveConversationMutation,
  useRenameConversationMutation,
} from '../hooks/use-conversation-mutations';
import { useConversationDetail, useConversationList } from '../hooks/use-assistant-queries';
import {
  useDeleteConversationMutation,
  useUpdateConversationTitleMutation,
} from '../hooks/use-assistant-mutations';
import { useGenerationLifecycle } from '../hooks/use-generation-lifecycle';
import { toDomainChatMessage } from '../adapters/conversation-status.adapter';
import type { ChatMessage } from '../types/assistant.types';
import type { ApiError } from '../../../../shared/api/api-error';
import { ConversationSidebar } from './conversation-sidebar';
import { ChatWorkspaceHeader } from './chat-workspace-header';
import { DeleteConversationDialog } from './delete-conversation-dialog';
import { DocumentPreview } from './document-preview';
import { ChatMessageFeed } from './chat-message-feed';
import { ChatComposer } from './chat-composer';
import { IntelligenceLoadingState } from '../../components/intelligence-loading-state';
import { IntelligenceErrorState } from '../../components/intelligence-error-state';

/**
 * AI Assistant Chat Workspace.
 *
 * Implements the complete conversation lifecycle:
 * - Route-driven conversation loading (`/intelligence/chat` vs `/intelligence/chat/:conversationId`)
 * - Responsive conversation sidebar drawer
 * - Real persisted message history display and deterministic sequence reconstruction (FE.05)
 * - Safe prompt submission and canonical reconciliation via useGenerationLifecycle
 * - Empty, loading, network error, and not-found error state management
 * - Strict prevention of stale-message leakage across conversation switches
 */
export const ChatWorkspace: React.FC = () => {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const auth = useOptionalAuth();

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Safe partition keys for multi-tenant and user isolation
  const tenantId = auth?.currentUser?.tenantId || 'global';
  const userId = auth?.currentUser?.id || 'anonymous';

  // 1. Persistent backend conversation query
  const {
    data: persistentConversation,
    isLoading: isLoadingPersistentConv,
    error: persistentConvError,
    refetch: refetchPersistentConv,
  } = useConversation(conversationId, {
    scope: { tenantId, userId },
    enabled: Boolean(conversationId),
  });

  // 2. Persistent backend canonical message history query with infinite scroll support
  const {
    data: infiniteMessagesData,
    isLoading: isLoadingPersistentMessages,
    error: persistentMessagesError,
    refetch: refetchPersistentMessages,
    hasNextPage: hasMoreMessages,
    fetchNextPage: fetchMoreMessages,
    isFetchingNextPage: isLoadingMoreMessages,
  } = useInfiniteConversationMessages(conversationId, undefined, {
    scope: { tenantId, userId },
    enabled: Boolean(conversationId),
  });

  // 3. Fallback to local storage (for offline or ADR-01 legacy tests)
  const {
    data: localConversation,
    isLoading: isLoadingLocalConv,
    isError: isLocalConvError,
    refetch: refetchLocalConv,
  } = useConversationDetail(tenantId, userId, conversationId, {
    enabled: Boolean(conversationId),
  });

  // Generation lifecycle state machine
  const {
    isGenerating,
    isCancelling,
    submitMessage,
    regenerateMessage,
    cancelGeneration,
    reconcileGeneration,
    state,
  } = useGenerationLifecycle({
    tenantId,
    userId,
    conversationId,
    onConversationCreated: (newId) => {
      navigate(`/intelligence/chat/${newId}`, { replace: true });
    },
  });

  // Reconcile authoritative backend persistence with local fallback and active generation
  const activeConversation = useMemo(() => {
    if (!conversationId) return null;

    if (persistentConversation && persistentConversation.id === conversationId) {
      const persistedMessages = (
        infiniteMessagesData?.pages.flatMap((page) => page.messages) ?? []
      ).map(toDomainChatMessage);
      const persistedIds = new Set(persistedMessages.map((m) => m.id));

      const inFlightMessages: ChatMessage[] = [];

      // Immediate in-flight turn messages directly from active generation state machine
      if (
        state.conversationId === persistentConversation.id &&
        (state.status === 'PENDING' ||
          state.status === 'STREAMING' ||
          state.status === 'CANCELLING')
      ) {
        if (state.userMessageId && !persistedIds.has(state.userMessageId)) {
          inFlightMessages.push({
            id: state.userMessageId,
            role: 'user',
            content: state.userPrompt || '',
            createdAt: new Date().toISOString(),
            status: 'success',
          });
        }
        if (state.assistantMessageId && !persistedIds.has(state.assistantMessageId)) {
          inFlightMessages.push({
            id: state.assistantMessageId,
            role: 'assistant',
            content: '',
            createdAt: new Date().toISOString(),
            status:
              state.status === 'CANCELLING'
                ? 'cancelling'
                : state.status === 'STREAMING'
                  ? 'generating'
                  : 'pending',
          });
        }
      }

      // Merge any local storage messages not yet in persisted history
      const localMsgs = localConversation?.messages ?? [];
      for (const m of localMsgs) {
        const isDuplicateRoleAndPending =
          m.role === 'assistant' &&
          m.status === 'pending' &&
          inFlightMessages.some((ifm) => ifm.role === 'assistant' && ifm.status === 'pending');

        if (
          !persistedIds.has(m.id) &&
          !inFlightMessages.some((ifm) => ifm.id === m.id) &&
          !isDuplicateRoleAndPending
        ) {
          inFlightMessages.push(m);
        }
      }

      return {
        id: persistentConversation.id,
        title: persistentConversation.title,
        createdAt: persistentConversation.createdAt,
        updatedAt: persistentConversation.updatedAt,
        messages: [...persistedMessages, ...inFlightMessages],
        tenantId,
        userId,
      };
    }

    if (localConversation && localConversation.id === conversationId) {
      return localConversation;
    }

    return null;
  }, [
    conversationId,
    persistentConversation,
    infiniteMessagesData,
    localConversation,
    state.status,
    state.conversationId,
    state.userMessageId,
    state.assistantMessageId,
    state.userPrompt,
    tenantId,
    userId,
  ]);

  // Loading state: active when switching or fetching without having current conversation data
  const isFetchingPersistent = Boolean(
    conversationId && (isLoadingPersistentConv || isLoadingPersistentMessages),
  );
  const isFetchingLocal = Boolean(conversationId && isLoadingLocalConv);

  const isLoadingConversation = Boolean(
    conversationId && !activeConversation && (isFetchingPersistent || isFetchingLocal),
  );

  const isRefreshing = Boolean(
    activeConversation && (isFetchingPersistent || isLoadingMoreMessages),
  );

  // Error categorization: 403 (unauthorized), 404 (not found), 503 (unavailable), 500 / network
  const is403 = Boolean(
    (persistentConvError as { statusCode?: number; status?: number })?.statusCode === 403 ||
    (persistentConvError as { statusCode?: number; status?: number })?.status === 403 ||
    (persistentMessagesError as { statusCode?: number; status?: number })?.statusCode === 403 ||
    (persistentMessagesError as { statusCode?: number; status?: number })?.status === 403,
  );

  // Authorization revocation guarantee: purge protected local conversation cache immediately on 403
  useEffect(() => {
    if (is403 && conversationId) {
      assistantStorageService.deleteConversation(tenantId, userId, conversationId);
    }
  }, [is403, conversationId, tenantId, userId]);

  const is503 = Boolean(
    (persistentConvError as { statusCode?: number; status?: number })?.statusCode === 503 ||
    (persistentConvError as { statusCode?: number; status?: number })?.status === 503 ||
    (persistentMessagesError as { statusCode?: number; status?: number })?.statusCode === 503 ||
    (persistentMessagesError as { statusCode?: number; status?: number })?.status === 503,
  );

  const is404 = Boolean(
    (persistentConvError as { statusCode?: number; status?: number })?.statusCode === 404 ||
    (persistentConvError as { statusCode?: number; status?: number })?.status === 404 ||
    (persistentMessagesError as { statusCode?: number; status?: number })?.statusCode === 404 ||
    (persistentMessagesError as { statusCode?: number; status?: number })?.status === 404,
  );

  const hasNetworkError =
    Boolean(
      persistentConvError && (persistentConvError as ApiError)?.statusCode !== 404 && !is403,
    ) ||
    Boolean(
      persistentMessagesError &&
      (persistentMessagesError as ApiError)?.statusCode !== 404 &&
      !is403,
    );

  const isNotFound = Boolean(
    conversationId &&
    !isLoadingConversation &&
    !activeConversation &&
    (is404 || (!hasNetworkError && !isLocalConvError && !is403 && !is503)),
  );

  const isConversationError = Boolean(
    conversationId &&
    !isLoadingConversation &&
    !activeConversation &&
    (hasNetworkError || is503) &&
    !localConversation &&
    !is404 &&
    !is403,
  );

  // Refetch action combining both backend and local retry
  const handleRefetch = useCallback(async () => {
    await Promise.all([refetchPersistentConv(), refetchPersistentMessages(), refetchLocalConv()]);
  }, [refetchPersistentConv, refetchPersistentMessages, refetchLocalConv]);

  // Conversation list query (for sidebar)
  useConversationList(tenantId, userId);

  // Deletion, Archive, and Renaming mutations
  const deleteConversationMutation = useDeleteConversationMutation(tenantId, userId);
  const archiveMutation = useArchiveConversationMutation({ scope: { tenantId, userId } });
  const renameMutation = useRenameConversationMutation({ scope: { tenantId, userId } });
  const localRenameMutation = useUpdateConversationTitleMutation(tenantId, userId);

  // Screen reader status announcement without token-level flood
  const statusAnnouncement = React.useMemo(() => {
    switch (state.status) {
      case 'PENDING':
        return 'Generando respuesta clínica...';
      case 'STREAMING':
        return 'Recibiendo respuesta clínica...';
      case 'COMPLETED':
        return 'Respuesta clínica generada con éxito.';
      case 'CANCELLED':
        return 'Generación cancelada por el usuario.';
      case 'INTERRUPTED':
        return 'Conexión interrumpida antes de completar respuesta.';
      case 'UNKNOWN':
        return 'Estado de generación indeterminado. Verificando con el servidor...';
      case 'FAILED':
        return 'Error al generar la respuesta.';
      default:
        return '';
    }
  }, [state.status]);

  // Actions
  const handleSelectConversation = React.useCallback(
    (id: string) => {
      navigate(`/intelligence/chat/${id}`);
    },
    [navigate],
  );

  const handleNewConversation = React.useCallback(() => {
    navigate('/intelligence/chat');
  }, [navigate]);

  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = React.useState(false);
  const [previewTarget, setPreviewTarget] = React.useState<{
    isOpen: boolean;
    documentId?: string;
    pageNumber?: number | null;
    citationId?: string | null;
    messageId?: string | null;
  } | null>(null);

  // URL-addressable preview state synchronization (CIT.07)
  const urlPreviewCitationId = searchParams.get('preview') || searchParams.get('citationId');
  const urlMessageId = searchParams.get('messageId');
  const urlDocumentId = searchParams.get('doc') || searchParams.get('documentId');
  const urlPageParam = searchParams.get('page');
  const urlPageNumber =
    urlPageParam && !Number.isNaN(Number(urlPageParam)) ? Number(urlPageParam) : undefined;

  // Sync URL search params with local previewTarget (supports Back/Forward navigation, Refresh, Direct Link)
  React.useEffect(() => {
    if (urlPreviewCitationId) {
      setPreviewTarget((prev) => {
        if (
          prev?.isOpen &&
          prev.citationId === urlPreviewCitationId &&
          prev.messageId === (urlMessageId || undefined) &&
          prev.documentId === (urlDocumentId || undefined) &&
          prev.pageNumber === urlPageNumber
        ) {
          return prev;
        }
        return {
          isOpen: true,
          citationId: urlPreviewCitationId,
          messageId: urlMessageId || undefined,
          documentId: urlDocumentId || undefined,
          pageNumber: urlPageNumber,
        };
      });
    } else {
      setPreviewTarget((prev) => (prev?.isOpen ? null : prev));
    }
  }, [urlPreviewCitationId, urlMessageId, urlDocumentId, urlPageNumber]);

  const handlePreviewDocument = React.useCallback(
    (
      documentId: string,
      pageNumber?: number | null,
      citationId?: string | null,
      messageId?: string | null,
    ) => {
      setPreviewTarget({
        isOpen: true,
        documentId,
        pageNumber,
        citationId,
        messageId,
      });

      setSearchParams(
        (prev) => {
          const updated = new URLSearchParams(prev);
          if (citationId) updated.set('preview', citationId);
          if (messageId) updated.set('messageId', messageId);
          if (documentId) updated.set('doc', documentId);
          if (typeof pageNumber === 'number' && pageNumber > 0) {
            updated.set('page', String(pageNumber));
          }
          return updated;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  const handleClosePreview = React.useCallback(() => {
    setPreviewTarget(null);
    setSearchParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        updated.delete('preview');
        updated.delete('citationId');
        updated.delete('messageId');
        updated.delete('doc');
        updated.delete('documentId');
        updated.delete('page');
        return updated;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const handleDeleteActiveConversation = React.useCallback(() => {
    if (!conversationId) return;
    setIsConfirmDeleteOpen(true);
  }, [conversationId]);

  const handleConfirmDeleteActive = React.useCallback(async () => {
    if (!conversationId) return;
    await archiveMutation.mutateAsync(conversationId);
    deleteConversationMutation.mutate({ conversationId });
    navigate('/intelligence/chat', { replace: true });
  }, [conversationId, archiveMutation, deleteConversationMutation, navigate]);

  const handleSendMessage = React.useCallback(
    async (text: string) => {
      await submitMessage({
        prompt: text,
        searchMode: 'HYBRID',
        topK: 5,
      });
    },
    [submitMessage],
  );

  const handleRegenerateMessage = React.useCallback(
    async (messageId: string) => {
      await regenerateMessage({
        messageId,
        searchMode: 'HYBRID',
        topK: 5,
      });
    },
    [regenerateMessage],
  );

  const handleRetryMessage = React.useCallback(
    (msgId: string) => {
      const msgs = activeConversation?.messages ?? [];
      const targetIdx = msgs.findIndex((m) => m.id === msgId);
      if (targetIdx !== -1) {
        const targetMsg = msgs[targetIdx];
        if (targetMsg && targetMsg.role === 'user') {
          void handleSendMessage(targetMsg.content);
        } else {
          void handleRegenerateMessage(msgId);
        }
      }
    },
    [activeConversation?.messages, handleSendMessage, handleRegenerateMessage],
  );

  // Determine current view state
  const isNewThread = !conversationId;

  return (
    <div
      data-testid="chat-workspace"
      className="flex h-full w-full flex-1 min-h-0 overflow-hidden rounded-xl border border-border/40 bg-card/20 shadow-xs"
    >
      {/* Screen Reader Live Region for Generation Lifecycle Announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="generation-live-region"
      >
        {statusAnnouncement}
      </div>

      {/* Conversation Sidebar (Desktop & Mobile Drawer) */}
      <ConversationSidebar
        activeConversationId={conversationId}
        isOpenOnMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        tenantId={tenantId}
        userId={userId}
      />

      {/* Main Conversation Region */}
      <section
        role="region"
        aria-label="Área de conversación activa"
        className="flex flex-1 min-w-0 min-h-0 flex-col bg-background/50 overflow-hidden"
      >
        <ChatWorkspaceHeader
          title={isNewThread ? 'Nueva Conversación' : activeConversation?.title}
          conversationId={conversationId}
          messageCount={activeConversation?.messages.length ?? 0}
          createdAt={activeConversation?.createdAt}
          lastActivityAt={activeConversation?.updatedAt}
          isNewThread={isNewThread}
          isRefreshing={isRefreshing}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen(true)}
          isMobileSidebarOpen={isMobileSidebarOpen}
          onDeleteConversation={handleDeleteActiveConversation}
          isDeleting={deleteConversationMutation.isPending || archiveMutation.isPending}
          onRename={async (newTitle) => {
            if (conversationId) {
              await renameMutation.mutateAsync({
                conversationId,
                request: { title: newTitle },
              });
              localRenameMutation.mutate({ conversationId, title: newTitle });
            }
          }}
          isRenaming={renameMutation.isPending}
        />

        {/* View States */}
        {isLoadingConversation && (
          <div
            className="flex flex-1 items-center justify-center p-6"
            data-testid="chat-loading-container"
          >
            <IntelligenceLoadingState
              variant="chat"
              message="Cargando conversación y mensajes almacenados..."
            />
          </div>
        )}

        {!isLoadingConversation && is403 && (
          <div
            className="flex flex-1 items-center justify-center p-6"
            data-testid="chat-forbidden-container"
          >
            <IntelligenceErrorState
              title="Acceso no autorizado"
              error="No cuentas con la autorización de sede requerida para consultar esta conversación."
              onRetry={handleNewConversation}
              retryLabel="Nueva conversación"
              testId="chat-forbidden-state"
            />
          </div>
        )}

        {!isLoadingConversation && !is403 && isNotFound && (
          <div
            className="flex flex-1 items-center justify-center p-6"
            data-testid="chat-not-found-container"
          >
            <IntelligenceErrorState
              title="Conversación no encontrada"
              error="La sesión solicitada no existe o fue eliminada de este navegador."
              onRetry={handleNewConversation}
              retryLabel="Iniciar nueva conversación"
              testId="chat-not-found-state"
            />
          </div>
        )}

        {!isLoadingConversation && !is403 && !isNotFound && isConversationError && (
          <div
            className="flex flex-1 items-center justify-center p-6"
            data-testid="chat-error-container"
          >
            <IntelligenceErrorState
              title={
                is503 ? 'Servicio temporalmente no disponible' : 'Error al cargar conversación'
              }
              error={
                is503
                  ? 'El servicio de persistencia no está disponible en este momento. Intenta nuevamente.'
                  : 'No se pudieron recuperar los mensajes del almacenamiento.'
              }
              onRetry={() => {
                void handleRefetch();
              }}
              testId="chat-error-state"
            />
          </div>
        )}

        {!isLoadingConversation && !is403 && !isNotFound && !isConversationError && (
          <>
            <ChatMessageFeed
              key={conversationId ?? 'new'}
              conversationId={conversationId}
              isNewThread={isNewThread}
              messages={activeConversation?.messages ?? []}
              hasMoreMessages={hasMoreMessages}
              isLoadingMore={isLoadingMoreMessages}
              onLoadMoreMessages={() => void fetchMoreMessages()}
              onPromptSuggestionClick={(prompt) => {
                void handleSendMessage(prompt);
              }}
              onRetryMessage={handleRetryMessage}
              onReconcileMessage={() => void reconcileGeneration()}
              onRegenerateMessage={handleRegenerateMessage}
              isGenerating={isGenerating}
              onPreviewDocument={handlePreviewDocument}
            />

            <ChatComposer
              onSend={handleSendMessage}
              onCancel={() => void cancelGeneration()}
              isSubmitting={isGenerating}
              isCancelling={isCancelling}
              disabled={isNotFound}
            />
          </>
        )}
      </section>

      {/* Delete Confirmation Dialog */}
      <DeleteConversationDialog
        open={isConfirmDeleteOpen}
        onOpenChange={setIsConfirmDeleteOpen}
        conversationTitle={activeConversation?.title}
        onConfirm={handleConfirmDeleteActive}
        isDeleting={archiveMutation.isPending || deleteConversationMutation.isPending}
      />

      {/* Document Preview Modal */}
      {previewTarget?.isOpen && (
        <DocumentPreview
          isOpen={previewTarget.isOpen}
          onClose={handleClosePreview}
          conversationId={conversationId}
          messageId={previewTarget.messageId ?? undefined}
          citationId={previewTarget.citationId ?? undefined}
          documentId={previewTarget.documentId}
          initialPageNumber={previewTarget.pageNumber}
        />
      )}
    </div>
  );
};
