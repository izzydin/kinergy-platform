import React, { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { ArrowDown, Bot, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@kinergy-platform/ui';
import type { ChatMessage } from '../types/assistant.types';
import { ChatMessageItem } from './chat-message-item';

export interface ChatMessageFeedProps {
  messages: readonly ChatMessage[];
  conversationId?: string;
  isLoading?: boolean;
  isGenerating?: boolean;
  onPromptSuggestionClick?: (prompt: string) => void;
  onRetryMessage?: (messageId: string) => void;
  onRegenerateMessage?: (messageId: string) => void;
  hasMoreMessages?: boolean;
  isLoadingMore?: boolean;
  onLoadMoreMessages?: () => void;
  onPreviewDocument?: (
    documentId: string,
    pageNumber?: number | null,
    citationId?: string | null,
    messageId?: string | null,
  ) => void;
}

const CLINICAL_SUGGESTIONS = [
  '¿Cuáles son las contraindicaciones absolutas del vendaje neuromuscular?',
  '¿Cuál es el protocolo de ejercicios recomendados para dolor cervical agudo?',
  '¿Cómo evaluar la movilidad articular en hombro congelado?',
  '¿Cuáles son las pautas de crioterapia en tendinitis rotuliana?',
];

/**
 * Chat Message Feed Component.
 *
 * Implements:
 * - Canonical message ordering: deduplicated by message.id and sorted by sequenceNumber / createdAt
 * - Predictable scroll management: auto-scroll to bottom only when user is near bottom
 * - Preservation of scroll position when user browses historical content or loads older messages
 * - Floating "Scroll to bottom" button when user scrolls up
 * - Incremental history pagination with "Cargar mensajes anteriores" action
 * - Welcoming empty state with clinical suggestions
 */
export const ChatMessageFeed: React.FC<ChatMessageFeedProps> = React.memo(
  ({
    messages,
    conversationId,
    isLoading = false,
    isGenerating = false,
    onPromptSuggestionClick,
    onRetryMessage,
    onRegenerateMessage,
    hasMoreMessages = false,
    isLoadingMore = false,
    onLoadMoreMessages,
    onPreviewDocument,
  }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [showScrollBottom, setShowScrollBottom] = useState(false);
    const prevScrollHeightRef = useRef<number | null>(null);
    const prevScrollTopRef = useRef<number | null>(null);

    // 1. Canonical Ordering: deduplicate by ID and sort ascending by sequenceNumber (if available) or createdAt
    const orderedMessages = useMemo(() => {
      const seen = new Set<string>();
      const unique: ChatMessage[] = [];

      for (const msg of messages) {
        if (!seen.has(msg.id)) {
          seen.add(msg.id);
          unique.push(msg);
        }
      }

      return unique.sort((a, b) => {
        if (typeof a.sequenceNumber === 'number' && typeof b.sequenceNumber === 'number') {
          return a.sequenceNumber - b.sequenceNumber;
        }
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
    }, [messages]);

    // Identify latest assistant message for regeneration eligibility (FB.05)
    const latestAssistantMessageId = useMemo(() => {
      for (let i = orderedMessages.length - 1; i >= 0; i--) {
        const item = orderedMessages[i];
        if (item && item.role === 'assistant') {
          return item.id;
        }
      }
      return null;
    }, [orderedMessages]);

    // Stable retry handler passed to memoized children
    const handleItemRetry = React.useCallback(
      (messageId: string) => {
        onRetryMessage?.(messageId);
      },
      [onRetryMessage],
    );

    // Detect user preference for reduced motion
    const prefersReducedMotion = useMemo(() => {
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      }
      return false;
    }, []);

    const getScrollBehavior = (): ScrollBehavior => (prefersReducedMotion ? 'auto' : 'smooth');

    // Scroll detection handler
    const handleScroll = () => {
      if (!containerRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollBottom(!isNearBottom);
    };

    const scrollToBottom = (behavior?: ScrollBehavior) => {
      if (containerRef.current) {
        const targetBehavior = behavior ?? getScrollBehavior();
        if (typeof containerRef.current.scrollTo === 'function') {
          containerRef.current.scrollTo({
            top: containerRef.current.scrollHeight,
            behavior: targetBehavior,
          });
        } else {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      }
    };

    // Incremental load trigger with scroll measurement
    const handleLoadMore = () => {
      if (containerRef.current) {
        prevScrollHeightRef.current = containerRef.current.scrollHeight;
        prevScrollTopRef.current = containerRef.current.scrollTop;
      }
      onLoadMoreMessages?.();
    };

    // Viewport scroll preservation when older messages are loaded into the feed
    useLayoutEffect(() => {
      if (
        containerRef.current &&
        prevScrollHeightRef.current !== null &&
        prevScrollTopRef.current !== null
      ) {
        const heightDifference = containerRef.current.scrollHeight - prevScrollHeightRef.current;
        if (heightDifference > 0) {
          containerRef.current.scrollTop = prevScrollTopRef.current + heightDifference;
        }
        prevScrollHeightRef.current = null;
        prevScrollTopRef.current = null;
      }
    }, [orderedMessages.length]);

    // Latest message content and status tracking for responsive auto-scrolling
    const latestMessage = orderedMessages[orderedMessages.length - 1];
    const latestMessageContentLength = latestMessage?.content?.length ?? 0;
    const latestMessageStatus = latestMessage?.status;

    // Auto-scroll to bottom when new messages arrive or when active message expands, if user is already near bottom
    useEffect(() => {
      if (!showScrollBottom && prevScrollHeightRef.current === null) {
        scrollToBottom();
      }
    }, [orderedMessages.length, latestMessageContentLength, latestMessageStatus]);

    return (
      <div className="relative flex-1 min-h-0">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          data-testid="chat-message-feed"
          tabIndex={0}
          role="log"
          aria-live="polite"
          aria-label="Feed de mensajes"
          className="h-full overflow-y-auto px-4 py-4 md:px-6 md:py-6 space-y-3 focus-visible:outline-hidden"
        >
          {/* Incremental History Loading: Load Older Messages */}
          {hasMoreMessages && (
            <div
              className="flex justify-center pb-2 pt-1"
              data-testid="load-more-messages-container"
            >
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="text-xs gap-1.5 h-7 px-3 cursor-pointer shadow-2xs"
                data-testid="load-more-messages-button"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Cargando mensajes anteriores...</span>
                  </>
                ) : (
                  <span>Cargar mensajes anteriores</span>
                )}
              </Button>
            </div>
          )}

          {/* Empty Conversation Welcome State */}
          {orderedMessages.length === 0 && !isLoading && (
            <div
              data-testid="chat-empty-state"
              className="flex h-full flex-col items-center justify-center text-center p-6 max-w-lg mx-auto"
            >
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs">
                <Bot className="h-7 w-7" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                ¿En qué puedo ayudarte hoy?
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Consulta información clínica, pautas de kinesiología y normativas verificadas en la
                base de conocimiento de Kynergy.
              </p>

              {/* Prompt Suggestions */}
              {onPromptSuggestionClick && (
                <div className="mt-6 flex flex-col gap-2 w-full text-left">
                  <span className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider">
                    Consultas sugeridas
                  </span>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {CLINICAL_SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => onPromptSuggestionClick(suggestion)}
                        className="flex items-start gap-2 rounded-lg border border-border/60 bg-card/60 p-2.5 text-left text-xs text-foreground/90 hover:bg-accent/40 hover:border-primary/40 transition-colors shadow-2xs focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-hidden"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{suggestion}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Render Canonical Messages */}
          {orderedMessages.map((msg) => {
            const isLatestAssistant = msg.id === latestAssistantMessageId;
            const isEligibleForRegeneration = isLatestAssistant && msg.status !== 'pending';

            return (
              <ChatMessageItem
                key={msg.id}
                message={msg}
                conversationId={conversationId}
                onRetry={onRetryMessage ? handleItemRetry : undefined}
                onRegenerate={isEligibleForRegeneration ? onRegenerateMessage : undefined}
                isRegenerating={isGenerating}
                onPreviewDocument={onPreviewDocument}
              />
            );
          })}
        </div>

        {/* Floating Scroll-to-Bottom Button */}
        {showScrollBottom && (
          <div className="absolute bottom-4 right-6 z-20">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => scrollToBottom()}
              aria-label="Desplazar al último mensaje"
              className="h-8 gap-1.5 rounded-full px-3 text-xs shadow-md border border-border/60 backdrop-blur-xs focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-hidden"
            >
              <ArrowDown className="h-3.5 w-3.5" />
              <span>Último mensaje</span>
            </Button>
          </div>
        )}
      </div>
    );
  },
);
