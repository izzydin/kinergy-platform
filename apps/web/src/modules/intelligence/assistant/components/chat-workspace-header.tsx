import React from 'react';
import { Bot, Check, Loader2, Menu, Pencil, Sparkles, Trash2, X } from 'lucide-react';
import { Badge, Button } from '@kinergy-platform/ui';

export interface ChatWorkspaceHeaderProps {
  title?: string;
  conversationId?: string;
  messageCount?: number;
  createdAt?: string;
  lastActivityAt?: string;
  isNewThread?: boolean;
  onToggleMobileSidebar?: () => void;
  onDeleteConversation?: () => void;
  isDeleting?: boolean;
  onRename?: (newTitle: string) => Promise<void> | void;
  isRenaming?: boolean;
}

function formatLocalizedTimestamp(isoString?: string): string | null {
  if (!isoString) return null;
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return null;
  }
}

/**
 * Chat Workspace Header Component.
 *
 * Provides:
 * - Thread title, conversation ID, and message count metadata
 * - Clearly distinguished creation timestamp and last activity timestamp
 * - In-place title renaming with keyboard shortcuts (Enter/Escape) and validation
 * - Mobile sidebar drawer toggle trigger
 * - RAG status badge indicator
 * - Thread deletion / reset action
 */
export const ChatWorkspaceHeader: React.FC<ChatWorkspaceHeaderProps> = ({
  title = 'Nueva Conversación',
  conversationId,
  messageCount = 0,
  createdAt,
  lastActivityAt,
  isNewThread = false,
  onToggleMobileSidebar,
  onDeleteConversation,
  isDeleting = false,
  onRename,
  isRenaming = false,
}) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [headerTitle, setHeaderTitle] = React.useState(title);
  const [validationError, setValidationError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isEditing) {
      setHeaderTitle(title);
    }
  }, [title, isEditing]);

  const formattedCreated = React.useMemo(() => formatLocalizedTimestamp(createdAt), [createdAt]);
  const formattedActivity = React.useMemo(
    () => formatLocalizedTimestamp(lastActivityAt),
    [lastActivityAt],
  );

  const handleStartEditing = () => {
    setIsEditing(true);
    setHeaderTitle(title);
    setValidationError(null);
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    setHeaderTitle(title);
    setValidationError(null);
  };

  const handleSaveRename = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = headerTitle.trim();
    if (!trimmed) {
      setValidationError('El título no puede estar vacío');
      return;
    }
    if (trimmed.length > 255) {
      setValidationError('El título no puede superar los 255 caracteres');
      return;
    }

    if (onRename && !isRenaming) {
      try {
        await onRename(trimmed);
        setIsEditing(false);
        setValidationError(null);
      } catch (err) {
        setValidationError(err instanceof Error ? err.message : 'Error al actualizar el título');
      }
    }
  };

  return (
    <header
      data-testid="chat-workspace-header"
      className="flex shrink-0 items-center justify-between gap-3 border-b border-border/40 bg-card/20 px-4 py-3 backdrop-blur-xs"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Mobile menu trigger button */}
        {onToggleMobileSidebar && (
          <button
            type="button"
            aria-label="Abrir panel de conversaciones"
            onClick={onToggleMobileSidebar}
            className="md:hidden rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}

        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Bot className="h-4 w-4" />
        </div>

        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            {isEditing ? (
              <form
                onSubmit={handleSaveRename}
                className="flex items-center gap-1.5"
                data-testid="header-rename-form"
              >
                <input
                  type="text"
                  data-testid="header-rename-input"
                  aria-label="Editar título de la conversación"
                  value={headerTitle}
                  maxLength={255}
                  autoFocus
                  disabled={isRenaming}
                  onChange={(e) => {
                    setHeaderTitle(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      handleCancelEditing();
                    }
                  }}
                  className="rounded border border-input bg-background px-2 py-0.5 text-xs text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-primary w-48 sm:w-64"
                />
                <button
                  type="submit"
                  data-testid="header-save-rename-button"
                  aria-label="Guardar título"
                  disabled={isRenaming}
                  className="rounded p-1 text-primary hover:bg-primary/10 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isRenaming ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  data-testid="header-cancel-rename-button"
                  aria-label="Cancelar edición"
                  disabled={isRenaming}
                  onClick={handleCancelEditing}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
                {!isNewThread && onRename && (
                  <button
                    type="button"
                    aria-label="Renombrar conversación actual"
                    data-testid="header-rename-button"
                    onClick={handleStartEditing}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
            <Badge variant="secondary" className="hidden sm:inline-flex text-[11px] font-medium">
              <Sparkles className="mr-1 h-3 w-3 text-primary" />
              RAG Conectado
            </Badge>
          </div>

          {validationError && (
            <span
              role="alert"
              data-testid="header-rename-error"
              className="text-[10px] text-destructive font-medium mt-0.5"
            >
              {validationError}
            </span>
          )}

          {/* Metadata Row */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {isNewThread ? (
              <span>Sesión no iniciada</span>
            ) : (
              <>
                <span data-testid="header-message-count">
                  {messageCount} {messageCount === 1 ? 'mensaje' : 'mensajes'}
                </span>
                {formattedCreated && (
                  <>
                    <span>•</span>
                    <span
                      data-testid="header-created-at"
                      title={createdAt ? `Creado: ${new Date(createdAt).toLocaleString()}` : ''}
                    >
                      Creado: {formattedCreated}
                    </span>
                  </>
                )}
                {formattedActivity && (
                  <>
                    <span>•</span>
                    <span
                      data-testid="header-activity-at"
                      title={
                        lastActivityAt
                          ? `Última actividad: ${new Date(lastActivityAt).toLocaleString()}`
                          : ''
                      }
                    >
                      Actividad: {formattedActivity}
                    </span>
                  </>
                )}
                {conversationId && (
                  <>
                    <span>•</span>
                    <span className="font-mono text-[11px] opacity-80">{conversationId}</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-2">
        {!isNewThread && onDeleteConversation && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDeleteConversation}
            disabled={isDeleting}
            className="text-xs text-muted-foreground hover:text-destructive gap-1.5"
            aria-label="Eliminar conversación actual"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Eliminar</span>
          </Button>
        )}
      </div>
    </header>
  );
};
