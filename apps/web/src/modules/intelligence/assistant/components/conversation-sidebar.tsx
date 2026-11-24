import React from 'react';
import { MessageSquare, MessageSquarePlus, Trash2, X, Clock, Sparkles } from 'lucide-react';
import { Button } from '@kinergy-platform/ui';
import type { ConversationSummary } from '../types/assistant.types';
import { useConversationList } from '../hooks/use-assistant-queries';
import { useDeleteConversationMutation } from '../hooks/use-assistant-mutations';
import { IntelligenceLoadingState } from '../../components/intelligence-loading-state';
import { IntelligenceErrorState } from '../../components/intelligence-error-state';

export interface ConversationSidebarProps {
  activeConversationId?: string;
  isOpenOnMobile: boolean;
  onCloseMobile: () => void;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  tenantId: string;
  userId: string;
}

/**
 * Conversation Sidebar Navigation Component.
 *
 * Provides:
 * - Conversation history listing partitioned by tenant and user
 * - New conversation trigger action
 * - Active thread indication
 * - Loading, error, and empty history states
 * - Mobile overlay / drawer behavior
 */
export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  activeConversationId,
  isOpenOnMobile,
  onCloseMobile,
  onSelectConversation,
  onNewConversation,
  tenantId,
  userId,
}) => {
  const {
    data: conversations = [],
    isLoading,
    isError,
    refetch,
  } = useConversationList(tenantId, userId);

  const deleteMutation = useDeleteConversationMutation(tenantId, userId);

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteMutation.mutate({ conversationId: id });
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="p-4 flex-1">
          <IntelligenceLoadingState
            variant="page"
            message="Cargando historial de conversaciones..."
          />
        </div>
      );
    }

    if (isError) {
      return (
        <div className="p-4 flex-1">
          <IntelligenceErrorState
            title="Error al cargar historial"
            error="No se pudo sincronizar el historial local."
            onRetry={() => {
              void refetch();
            }}
          />
        </div>
      );
    }

    if (conversations.length === 0) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
            <MessageSquare className="h-5 w-5 opacity-60" />
          </div>
          <p className="text-sm font-medium text-foreground">Sin conversaciones</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Inicia un nuevo chat para consultar protocolos y manuales clínicos.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onNewConversation}
            className="mt-4 gap-1.5 text-xs"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            Nueva Conversación
          </Button>
        </div>
      );
    }

    return (
      <nav
        role="navigation"
        aria-label="Historial de conversaciones"
        className="flex-1 overflow-y-auto px-2 py-2 space-y-1"
      >
        {conversations.map((conv: ConversationSummary) => {
          const isActive = conv.id === activeConversationId;
          const formattedDate = new Date(conv.updatedAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          });

          return (
            <div
              key={conv.id}
              role="button"
              tabIndex={0}
              aria-current={isActive ? 'true' : undefined}
              onClick={() => {
                onSelectConversation(conv.id);
                onCloseMobile();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectConversation(conv.id);
                  onCloseMobile();
                }
              }}
              className={`group flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-xs transition-colors cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-hidden ${
                isActive
                  ? 'bg-primary/10 text-primary font-medium border-l-2 border-primary shadow-2xs'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium text-foreground/90">
                  {conv.title || 'Nueva Conversación'}
                </span>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formattedDate}
                  </span>
                  <span>•</span>
                  <span>{conv.messageCount} msgs</span>
                </div>
              </div>

              <button
                type="button"
                aria-label={`Eliminar conversación ${conv.title}`}
                onClick={(e) => handleDelete(e, conv.id)}
                className="opacity-0 group-hover:opacity-100 hover:text-destructive focus:opacity-100 rounded p-1 transition-opacity text-muted-foreground/60"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </nav>
    );
  };

  const sidebarContent = (
    <aside
      data-testid="conversation-sidebar"
      className="flex h-full w-72 flex-col border-r border-border/50 bg-card/40 backdrop-blur-xs"
    >
      {/* Sidebar Header & New Chat Action */}
      <div className="flex items-center justify-between border-b border-border/40 p-3">
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            onNewConversation();
            onCloseMobile();
          }}
          className="flex-1 gap-2 text-xs font-semibold shadow-xs"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Nueva Conversación
        </Button>

        {/* Mobile close button */}
        <button
          type="button"
          aria-label="Cerrar panel de conversaciones"
          onClick={onCloseMobile}
          className="md:hidden ml-2 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Conversations List / States */}
      {renderContent()}

      {/* Sidebar Footer Info */}
      <div className="border-t border-border/40 p-3 text-[11px] text-muted-foreground/70 flex items-center justify-between">
        <span className="flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-primary" />
          RAG Local
        </span>
        <span>Persistencia Local (ADR-01)</span>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <div className="hidden md:flex h-full shrink-0">{sidebarContent}</div>

      {/* Mobile Modal Drawer */}
      {isOpenOnMobile && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Historial de conversaciones"
          className="fixed inset-0 z-50 flex md:hidden"
        >
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 flex h-full w-4/5 max-w-xs flex-col shadow-xl animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
