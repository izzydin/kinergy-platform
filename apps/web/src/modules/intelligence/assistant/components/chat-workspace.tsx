import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useOptionalAuth } from '../../../../app/providers/auth-provider';
import { useConversationDetail, useConversationList } from '../hooks/use-assistant-queries';
import { useDeleteConversationMutation } from '../hooks/use-assistant-mutations';
import { useGenerationLifecycle } from '../hooks/use-generation-lifecycle';
import { ConversationSidebar } from './conversation-sidebar';
import { ChatWorkspaceHeader } from './chat-workspace-header';
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
 * - Real persisted message history display (ADR-AI-09-01)
 * - Safe prompt submission and canonical reconciliation via useGenerationLifecycle
 * - Empty, loading, and not-found error state management
 */
export const ChatWorkspace: React.FC = () => {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const auth = useOptionalAuth();

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Safe partition keys for multi-tenant and user isolation
  const tenantId = auth?.currentUser?.tenantId || 'global';
  const userId = auth?.currentUser?.id || 'anonymous';

  // Active conversation detail query
  const {
    data: activeConversation,
    isLoading: isLoadingConversation,
    isError: isConversationError,
    refetch: refetchConversation,
  } = useConversationDetail(tenantId, userId, conversationId, {
    enabled: Boolean(conversationId),
  });

  // Conversation list query (for sidebar)
  useConversationList(tenantId, userId);

  // Deletion mutation
  const deleteConversationMutation = useDeleteConversationMutation(tenantId, userId);

  // Generation lifecycle state machine
  const { isGenerating, submitMessage, cancelGeneration, state } = useGenerationLifecycle({
    tenantId,
    userId,
    conversationId,
    onConversationCreated: (newId) => {
      navigate(`/intelligence/chat/${newId}`, { replace: true });
    },
  });

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

  const handleDeleteActiveConversation = React.useCallback(() => {
    if (!conversationId) return;
    deleteConversationMutation.mutate(
      { conversationId },
      {
        onSuccess: () => {
          navigate('/intelligence/chat');
        },
      },
    );
  }, [conversationId, deleteConversationMutation, navigate]);

  const handleSendMessage = React.useCallback(
    async (text: string) => {
      try {
        await submitMessage({
          prompt: text,
          searchMode: 'HYBRID',
          topK: 5,
        });
      } catch {
        // Abort or submission failure is managed by lifecycle state machine
      }
    },
    [submitMessage],
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
          const userMsg = msgs
            .slice(0, targetIdx)
            .reverse()
            .find((m) => m.role === 'user');
          if (userMsg) {
            void handleSendMessage(userMsg.content);
          }
        }
      }
    },
    [activeConversation?.messages, handleSendMessage],
  );

  // Determine current view state
  const isNewThread = !conversationId;
  const isNotFound = Boolean(conversationId && !isLoadingConversation && !activeConversation);

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
      <main
        role="region"
        aria-label="Área de conversación activa"
        className="flex flex-1 min-w-0 min-h-0 flex-col bg-background/50 overflow-hidden"
      >
        <ChatWorkspaceHeader
          title={isNewThread ? 'Nueva Conversación' : activeConversation?.title}
          conversationId={conversationId}
          messageCount={activeConversation?.messages.length ?? 0}
          isNewThread={isNewThread}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onDeleteConversation={handleDeleteActiveConversation}
          isDeleting={deleteConversationMutation.isPending}
        />

        {/* View States */}
        {isLoadingConversation && (
          <div className="flex flex-1 items-center justify-center p-6">
            <IntelligenceLoadingState
              variant="chat"
              message="Cargando conversación y mensajes almacenados..."
            />
          </div>
        )}

        {!isLoadingConversation && isNotFound && (
          <div className="flex flex-1 items-center justify-center p-6">
            <IntelligenceErrorState
              title="Conversación no encontrada"
              error="La sesión solicitada no existe o fue eliminada de este navegador."
              onRetry={handleNewConversation}
              retryLabel="Iniciar nueva conversación"
            />
          </div>
        )}

        {!isLoadingConversation && isConversationError && (
          <div className="flex flex-1 items-center justify-center p-6">
            <IntelligenceErrorState
              title="Error al cargar conversación"
              error="No se pudieron recuperar los mensajes del almacenamiento."
              onRetry={() => {
                void refetchConversation();
              }}
            />
          </div>
        )}

        {!isLoadingConversation && !isNotFound && !isConversationError && (
          <>
            <ChatMessageFeed
              messages={activeConversation?.messages ?? []}
              onPromptSuggestionClick={(prompt) => {
                void handleSendMessage(prompt);
              }}
              onRetryMessage={handleRetryMessage}
            />

            <ChatComposer
              onSend={handleSendMessage}
              onCancel={() => cancelGeneration()}
              isSubmitting={isGenerating}
              disabled={isNotFound}
            />
          </>
        )}
      </main>
    </div>
  );
};
