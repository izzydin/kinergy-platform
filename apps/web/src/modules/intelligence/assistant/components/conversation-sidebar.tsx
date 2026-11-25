import React from 'react';
import {
  MessageSquare,
  MessageSquarePlus,
  Trash2,
  X,
  Clock,
  Sparkles,
  Pencil,
  Check,
  Loader2,
} from 'lucide-react';
import { Button } from '@kinergy-platform/ui';
import { useConversationList } from '../hooks/use-assistant-queries';
import {
  useDeleteConversationMutation,
  useUpdateConversationTitleMutation,
} from '../hooks/use-assistant-mutations';
import { useInfiniteConversations } from '../hooks/use-conversation-queries';
import {
  useArchiveConversationMutation,
  useRenameConversationMutation,
} from '../hooks/use-conversation-mutations';
import { groupConversationsByDate } from '../utils/conversation-grouping.util';
import { DeleteConversationDialog } from './delete-conversation-dialog';
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
 * - Persistent conversation history listing backed by PostgreSQL
 * - Chronological date grouping (Hoy, Ayer, Últimos 7 días, Anteriores)
 * - Single thread selection and active highlight indicator
 * - New conversation trigger action
 * - Graceful truncation with full title hover tooltip
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
  // 1. Persistent backend query with keyset infinite cursor pagination
  const {
    data: infiniteConversationsData,
    isLoading: isLoadingPersistent,
    isError: isErrorPersistent,
    refetch: refetchPersistent,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteConversations(undefined, {
    scope: { tenantId, userId },
  });

  // 2. Local storage query for offline / test compatibility
  const {
    data: localConversations = [],
    isLoading: isLoadingLocal,
    isError: isErrorLocal,
    refetch: refetchLocal,
  } = useConversationList(tenantId, userId);

  const deleteMutation = useDeleteConversationMutation(tenantId, userId);
  const archiveMutation = useArchiveConversationMutation({ scope: { tenantId, userId } });
  const renameMutation = useRenameConversationMutation({ scope: { tenantId, userId } });
  const localRenameMutation = useUpdateConversationTitleMutation(tenantId, userId);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState<string>('');
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [deletingConversation, setDeletingConversation] = React.useState<{
    id: string;
    title: string;
  } | null>(null);

  const handleStartRename = (e: React.MouseEvent, id: string, currentTitle: string) => {
    e.stopPropagation();
    setEditingId(id);
    setEditingTitle(currentTitle);
    setValidationError(null);
  };

  const handleCancelRename = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingId(null);
    setEditingTitle('');
    setValidationError(null);
  };

  const handleSaveRename = async (e: React.FormEvent | React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    const trimmed = editingTitle.trim();
    if (!trimmed) {
      setValidationError('El título no puede estar vacío');
      return;
    }
    if (trimmed.length > 255) {
      setValidationError('El título no puede superar los 255 caracteres');
      return;
    }

    if (renameMutation.isPending) {
      return;
    }

    try {
      await renameMutation.mutateAsync({
        conversationId: id,
        request: { title: trimmed },
      });
      localRenameMutation.mutate({ conversationId: id, title: trimmed });
      setEditingId(null);
      setEditingTitle('');
      setValidationError(null);
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Error al renombrar la conversación');
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation();
    setDeletingConversation({ id, title });
  };

  const handleConfirmDelete = async () => {
    if (!deletingConversation) return;
    const { id } = deletingConversation;

    await archiveMutation.mutateAsync(id);
    deleteMutation.mutate({ conversationId: id });

    if (activeConversationId === id) {
      onSelectConversation('');
    }
  };

  // Harmonize conversation items with backend precedence and cross-page deduplication
  const conversations = React.useMemo(() => {
    const backendItems = infiniteConversationsData?.pages.flatMap((page) => page.items) ?? [];
    if (backendItems.length > 0) {
      const seen = new Set<string>();
      const uniqueItems: typeof backendItems = [];
      for (const item of backendItems) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          uniqueItems.push(item);
        }
      }
      return uniqueItems.map((item) => ({
        id: item.id,
        title: item.title,
        turnCounter: item.turnCounter,
        lastActivityAt: item.lastActivityAt,
        createdAt: item.createdAt,
        updatedAt: item.lastActivityAt,
        isArchived: item.isArchived,
      }));
    }
    return localConversations.map((item) => ({
      id: item.id,
      title: item.title,
      turnCounter: Math.ceil(item.messageCount / 2),
      lastActivityAt: item.updatedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      isArchived: false,
    }));
  }, [infiniteConversationsData, localConversations]);

  const grouped = React.useMemo(() => groupConversationsByDate(conversations), [conversations]);

  const isLoading = (isLoadingPersistent || isLoadingLocal) && conversations.length === 0;
  const isError = (isErrorPersistent || isErrorLocal) && conversations.length === 0;

  const refetch = React.useCallback(async () => {
    await Promise.all([refetchPersistent(), refetchLocal()]);
  }, [refetchPersistent, refetchLocal]);

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
            error="No se pudo sincronizar el historial de conversaciones."
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
        className="flex-1 overflow-y-auto px-2 py-2 space-y-3"
      >
        {grouped.map((group) => (
          <div key={group.key} className="space-y-1">
            <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground/60 uppercase select-none">
              {group.label}
            </div>
            {group.items.map((conv) => {
              const isActive = conv.id === activeConversationId;
              const isEditingThis = editingId === conv.id;
              const rawDate = conv.lastActivityAt || conv.updatedAt || conv.createdAt;
              const formattedDate = rawDate
                ? new Date(rawDate).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })
                : '';

              if (isEditingThis) {
                return (
                  <div
                    key={conv.id}
                    data-testid={`conversation-item-${conv.id}`}
                    className={`flex flex-col gap-1.5 rounded-lg px-2.5 py-2 text-xs border bg-card/80 shadow-xs ${
                      isActive ? 'border-primary' : 'border-primary/40'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <form
                      data-testid="rename-form"
                      onSubmit={(e) => void handleSaveRename(e, conv.id)}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        type="text"
                        data-testid="rename-input"
                        aria-label="Editar título de conversación"
                        value={editingTitle}
                        maxLength={255}
                        autoFocus
                        disabled={renameMutation.isPending}
                        onChange={(e) => {
                          setEditingTitle(e.target.value);
                          if (validationError) setValidationError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            handleCancelRename();
                          }
                        }}
                        className="flex-1 min-w-0 rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        data-testid="save-rename-button"
                        aria-label="Guardar título"
                        disabled={renameMutation.isPending}
                        className="rounded p-1 text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        {renameMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        data-testid="cancel-rename-button"
                        aria-label="Cancelar edición"
                        disabled={renameMutation.isPending}
                        onClick={handleCancelRename}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </form>
                    {validationError && (
                      <span
                        role="alert"
                        data-testid="rename-error"
                        className="text-[10px] text-destructive font-medium pl-1"
                      >
                        {validationError}
                      </span>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={conv.id}
                  data-testid={`conversation-item-${conv.id}`}
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
                  className={`group flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-hidden ${
                    isActive
                      ? 'bg-primary/10 text-primary font-medium border-l-2 border-primary shadow-2xs'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  }`}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium text-foreground/90" title={conv.title}>
                      {conv.title || 'Nueva Conversación'}
                    </span>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formattedDate}
                      </span>
                      {conv.turnCounter !== undefined && (
                        <>
                          <span>•</span>
                          <span>
                            {conv.turnCounter} {conv.turnCounter === 1 ? 'turno' : 'turnos'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                    <button
                      type="button"
                      aria-label={`Renombrar conversación ${conv.title}`}
                      data-testid={`rename-conversation-${conv.id}`}
                      onClick={(e) => handleStartRename(e, conv.id, conv.title)}
                      className="hover:text-foreground rounded p-1 transition-colors text-muted-foreground/70"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Eliminar conversación ${conv.title}`}
                      data-testid={`delete-conversation-${conv.id}`}
                      onClick={(e) => handleDeleteClick(e, conv.id, conv.title)}
                      className="hover:text-destructive rounded p-1 transition-colors text-muted-foreground/70 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Keyset Cursor Pagination Trigger */}
        {hasNextPage && (
          <div className="pt-1 pb-2 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full text-xs text-muted-foreground hover:text-foreground h-8 gap-1.5 cursor-pointer"
              data-testid="load-more-conversations-button"
            >
              {isFetchingNextPage ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Cargando más conversaciones...</span>
                </>
              ) : (
                <span>Cargar más conversaciones</span>
              )}
            </Button>
          </div>
        )}
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

      {/* Delete Confirmation Dialog */}
      <DeleteConversationDialog
        open={Boolean(deletingConversation)}
        onOpenChange={(open) => {
          if (!open) setDeletingConversation(null);
        }}
        conversationTitle={deletingConversation?.title}
        onConfirm={handleConfirmDelete}
        isDeleting={archiveMutation.isPending || deleteMutation.isPending}
      />
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
