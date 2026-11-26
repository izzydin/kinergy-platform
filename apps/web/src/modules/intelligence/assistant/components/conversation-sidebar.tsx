import React from 'react';
import {
  MessageSquare,
  MessageSquarePlus,
  Trash2,
  X,
  Sparkles,
  Pencil,
  Check,
  Loader2,
  Search,
} from 'lucide-react';
import { Button, Input } from '@kinergy-platform/ui';
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
  referenceDate?: Date;
}

/**
 * Conversation Sidebar Navigation Component.
 *
 * Provides:
 * - Persistent conversation history listing backed by PostgreSQL
 * - In-place title search filtering with dedicated empty-search state
 * - Chronological date grouping (Hoy, Ayer, Últimos 7 días, Anteriores)
 * - Single thread selection and active highlight indicator
 * - New conversation trigger action
 * - Graceful truncation with full title hover tooltip
 * - Dedicated conversation-list skeleton and distinct error/empty states (ER.03)
 * - Subtle non-intrusive background refresh indicators
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
  referenceDate,
}) => {
  const [searchQuery, setSearchQuery] = React.useState('');

  // 1. Persistent backend query with keyset infinite cursor pagination
  const {
    data: infiniteConversationsData,
    isLoading: isLoadingPersistent,
    isFetching: isFetchingPersistent,
    isError: isErrorPersistent,
    error: persistentError,
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
    isFetching: isFetchingLocal,
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

  const mobileDrawerRef = React.useRef<HTMLDivElement>(null);
  const previousActiveElementRef = React.useRef<HTMLElement | null>(null);

  // Focus management, trap, and Escape dismissal when mobile drawer is open
  React.useEffect(() => {
    if (!isOpenOnMobile) {
      if (previousActiveElementRef.current) {
        previousActiveElementRef.current.focus?.();
        previousActiveElementRef.current = null;
      }
      return;
    }

    previousActiveElementRef.current = (document.activeElement as HTMLElement) || null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Auto-focus first focusable element in mobile drawer
    const timer = setTimeout(() => {
      if (mobileDrawerRef.current) {
        const focusable = mobileDrawerRef.current.querySelector<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex="0"]',
        );
        focusable?.focus();
      }
    }, 40);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseMobile();
        return;
      }

      if (e.key === 'Tab' && mobileDrawerRef.current) {
        const focusable = mobileDrawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpenOnMobile, onCloseMobile]);

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

  // Client-side search filtering
  const filteredConversations = React.useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase().trim();
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  const grouped = React.useMemo(
    () => groupConversationsByDate(filteredConversations, referenceDate),
    [filteredConversations, referenceDate],
  );

  const isLoading = (isLoadingPersistent || isLoadingLocal) && conversations.length === 0;
  const isError = (isErrorPersistent || isErrorLocal) && conversations.length === 0;
  const isRefreshing = (isFetchingPersistent || isFetchingLocal) && conversations.length > 0;

  const is403 =
    (persistentError as { statusCode?: number; status?: number })?.statusCode === 403 ||
    (persistentError as { statusCode?: number; status?: number })?.status === 403;

  const is503 =
    (persistentError as { statusCode?: number; status?: number })?.statusCode === 503 ||
    (persistentError as { statusCode?: number; status?: number })?.status === 503;

  const refetch = React.useCallback(async () => {
    await Promise.all([refetchPersistent(), refetchLocal()]);
  }, [refetchPersistent, refetchLocal]);

  const renderContent = () => {
    // 1. Initial Loading Skeleton
    if (isLoading) {
      return (
        <div className="p-3 flex-1 overflow-hidden" data-testid="sidebar-loading-state">
          <IntelligenceLoadingState
            variant="conversation-list"
            message="Cargando historial de conversaciones..."
          />
        </div>
      );
    }

    // 2. Error States (Never display empty state on failure)
    if (isError) {
      if (is403) {
        return (
          <div className="p-4 flex-1 flex items-center justify-center">
            <IntelligenceErrorState
              compact
              title="Acceso no autorizado"
              error="No cuentas con permisos para consultar el historial de conversaciones de esta sede."
              testId="sidebar-forbidden-state"
            />
          </div>
        );
      }

      if (is503) {
        return (
          <div className="p-4 flex-1 flex items-center justify-center">
            <IntelligenceErrorState
              compact
              title="Historial no disponible"
              error="El servicio de conversaciones está temporalmente inaccesible. Por favor intenta nuevamente."
              onRetry={() => {
                void refetch();
              }}
              testId="sidebar-unavailable-state"
            />
          </div>
        );
      }

      return (
        <div className="p-4 flex-1 flex items-center justify-center">
          <IntelligenceErrorState
            compact
            title="Error al cargar historial"
            error="No se pudo sincronizar el historial de conversaciones."
            onRetry={() => {
              void refetch();
            }}
            testId="sidebar-error-state"
          />
        </div>
      );
    }

    // 3. Genuinely Empty History (Zero State)
    if (conversations.length === 0) {
      return (
        <div
          className="flex flex-1 flex-col items-center justify-center p-6 text-center"
          data-testid="sidebar-empty-state"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
            <MessageSquare className="h-5 w-5 opacity-60" aria-hidden="true" />
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

    // 4. Filter Yields Zero Matches
    if (filteredConversations.length === 0) {
      return (
        <div
          className="flex flex-1 flex-col items-center justify-center p-6 text-center"
          data-testid="sidebar-no-search-results"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
            <Search className="h-5 w-5 opacity-60" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-foreground">Sin resultados</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-[200px]">
            No hay conversaciones que coincidan con &quot;{searchQuery}&quot;.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchQuery('')}
            className="mt-3 text-xs h-7 px-3 border border-border/50"
          >
            Limpiar búsqueda
          </Button>
        </div>
      );
    }

    // 5. Loaded Grouped Conversations
    return (
      <nav
        role="navigation"
        aria-label="Historial de conversaciones"
        className="flex-1 overflow-y-auto px-2 py-2 space-y-3"
      >
        {grouped.map((group) => (
          <div key={group.key} className="space-y-1">
            <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase select-none">
              {group.label}
            </div>
            <ul role="list" aria-label={`Conversaciones de ${group.label}`} className="space-y-1">
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
                    <li key={conv.id}>
                      <div
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
                          <Input
                            type="text"
                            data-testid="rename-input"
                            aria-label="Editar título de conversación"
                            aria-invalid={Boolean(validationError)}
                            aria-describedby={
                              validationError ? `rename-error-${conv.id}` : undefined
                            }
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
                            className="flex-1 min-w-0 h-7 px-2 py-0.5 text-xs text-foreground"
                          />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            data-testid="save-rename-button"
                            aria-label="Guardar título"
                            disabled={renameMutation.isPending}
                            className="h-7 w-7 p-0 rounded text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors cursor-pointer"
                          >
                            {renameMutation.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            data-testid="cancel-rename-button"
                            aria-label="Cancelar edición"
                            disabled={renameMutation.isPending}
                            onClick={handleCancelRename}
                            className="h-7 w-7 p-0 rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors cursor-pointer"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </form>
                        {validationError && (
                          <span
                            role="alert"
                            id={`rename-error-${conv.id}`}
                            data-testid="rename-error"
                            className="text-[10px] text-destructive font-medium pl-1"
                          >
                            {validationError}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                }

                return (
                  <li key={conv.id}>
                    <div
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
                        } else if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          const items = Array.from(
                            document.querySelectorAll<HTMLElement>(
                              '[data-testid^="conversation-item-"]',
                            ),
                          );
                          const currentIndex = items.indexOf(e.currentTarget);
                          if (currentIndex >= 0 && currentIndex < items.length - 1) {
                            items[currentIndex + 1]?.focus();
                          }
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          const items = Array.from(
                            document.querySelectorAll<HTMLElement>(
                              '[data-testid^="conversation-item-"]',
                            ),
                          );
                          const currentIndex = items.indexOf(e.currentTarget);
                          if (currentIndex > 0) {
                            items[currentIndex - 1]?.focus();
                          }
                        }
                      }}
                      className={`group relative flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs transition-colors cursor-pointer border focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${
                        isActive
                          ? 'border-primary bg-accent font-medium text-accent-foreground shadow-2xs'
                          : 'border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <MessageSquare
                          className={`h-3.5 w-3.5 shrink-0 ${
                            isActive ? 'text-primary' : 'text-muted-foreground/60'
                          }`}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className="truncate text-xs leading-snug"
                            title={conv.title}
                            data-testid={`conversation-title-${conv.id}`}
                          >
                            {conv.title}
                          </p>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground leading-none mt-0.5">
                            {formattedDate && <span>{formattedDate}</span>}
                            {conv.turnCounter > 0 && (
                              <>
                                {formattedDate && <span>•</span>}
                                <span>
                                  {conv.turnCounter} {conv.turnCounter === 1 ? 'turno' : 'turnos'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions (visible on hover or active) */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                        <button
                          type="button"
                          data-testid={`rename-conversation-${conv.id}`}
                          aria-label={`Renombrar conversación ${conv.title}`}
                          onClick={(e) => handleStartRename(e, conv.id, conv.title)}
                          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          data-testid={`delete-conversation-${conv.id}`}
                          aria-label={`Eliminar conversación ${conv.title}`}
                          onClick={(e) => handleDeleteClick(e, conv.id, conv.title)}
                          className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-background/80 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {/* Keyset Cursor Pagination Trigger */}
        {hasNextPage && (
          <div className="pt-2 pb-1 px-1 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              data-testid="load-more-conversations-button"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
              className="w-full text-xs text-muted-foreground hover:text-foreground h-7 gap-1.5"
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

  const renderSidebarContent = (isMobile = false) => (
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

        {/* Mobile close button: rendered exclusively in mobile drawer */}
        {isMobile && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Cerrar panel de conversaciones"
            onClick={onCloseMobile}
            className="md:hidden ml-2 h-8 w-8 min-h-[32px] min-w-[32px] p-0 rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Search Input Filter (Rendered when conversations exist) */}
      {conversations.length > 0 && !isLoading && !isError && (
        <div className="px-3 pt-2.5 pb-1 border-b border-border/30">
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none z-10" />
            <Input
              type="text"
              data-testid="sidebar-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar conversaciones..."
              aria-label="Buscar en historial de conversaciones"
              className="w-full h-8 pl-8 pr-7 py-1 text-xs bg-background/50"
            />
            {searchQuery && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="clear-sidebar-search-button"
                aria-label="Limpiar búsqueda"
                onClick={() => setSearchQuery('')}
                className="absolute right-1.5 h-6 w-6 p-0 rounded text-muted-foreground hover:text-foreground z-10"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
            {isRefreshing && !searchQuery && (
              <div
                className="absolute right-2"
                title="Sincronizando historial..."
                aria-label="Sincronizando historial..."
              >
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/60" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Conversations List / States */}
      {renderContent()}

      {/* Sidebar Footer Info */}
      <div className="border-t border-border/40 p-3 text-[11px] text-muted-foreground flex items-center justify-between">
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
      <div className="hidden md:flex h-full shrink-0">{renderSidebarContent(false)}</div>

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
          <div
            ref={mobileDrawerRef}
            className="relative z-10 flex h-full w-4/5 max-w-xs flex-col shadow-xl animate-in slide-in-from-left duration-200"
          >
            {renderSidebarContent(true)}
          </div>
        </div>
      )}
    </>
  );
};
