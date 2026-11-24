import React from 'react';
import { Bot, Menu, Sparkles, Trash2 } from 'lucide-react';
import { Badge, Button } from '@kinergy-platform/ui';

export interface ChatWorkspaceHeaderProps {
  title?: string;
  conversationId?: string;
  messageCount?: number;
  isNewThread?: boolean;
  onToggleMobileSidebar?: () => void;
  onDeleteConversation?: () => void;
  isDeleting?: boolean;
}

/**
 * Chat Workspace Header Component.
 *
 * Provides:
 * - Thread title, conversation ID, and message count metadata
 * - Mobile sidebar drawer toggle trigger
 * - RAG status badge indicator
 * - Thread deletion / reset action
 */
export const ChatWorkspaceHeader: React.FC<ChatWorkspaceHeaderProps> = ({
  title = 'Nueva Conversación',
  conversationId,
  messageCount = 0,
  isNewThread = false,
  onToggleMobileSidebar,
  onDeleteConversation,
  isDeleting = false,
}) => {
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
            className="md:hidden rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}

        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Bot className="h-4 w-4" />
        </div>

        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
            <Badge variant="secondary" className="hidden sm:inline-flex text-[11px] font-medium">
              <Sparkles className="mr-1 h-3 w-3 text-primary" />
              RAG Conectado
            </Badge>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isNewThread ? (
              <span>Sesión no iniciada</span>
            ) : (
              <>
                <span>
                  {messageCount} {messageCount === 1 ? 'mensaje' : 'mensajes'}
                </span>
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
