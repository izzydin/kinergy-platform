import React, { useEffect, useRef, useState, useMemo } from 'react';
import { ArrowDown, Bot, Sparkles } from 'lucide-react';
import { Button } from '@kinergy-platform/ui';
import type { ChatMessage } from '../types/assistant.types';
import { ChatMessageItem } from './chat-message-item';

export interface ChatMessageFeedProps {
  messages: readonly ChatMessage[];
  isLoading?: boolean;
  onPromptSuggestionClick?: (prompt: string) => void;
  onRetryMessage?: (messageId: string) => void;
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
 * - Canonical message ordering: deduplicated by message.id and sorted by createdAt ascending
 * - Predictable scroll management: auto-scroll to bottom only when user is near bottom
 * - Preservation of scroll position when user browses historical content
 * - Floating "Scroll to bottom" button when user scrolls up
 * - Welcoming empty state with clinical suggestions
 */
export const ChatMessageFeed: React.FC<ChatMessageFeedProps> = React.memo(
  ({ messages, isLoading = false, onPromptSuggestionClick, onRetryMessage }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [showScrollBottom, setShowScrollBottom] = useState(false);

    // 1. Canonical Ordering: deduplicate by ID and sort ascending by createdAt
    const orderedMessages = useMemo(() => {
      const seen = new Set<string>();
      const unique: ChatMessage[] = [];

      for (const msg of messages) {
        if (!seen.has(msg.id)) {
          seen.add(msg.id);
          unique.push(msg);
        }
      }

      return unique.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    }, [messages]);

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

    // Latest message content and status tracking for responsive auto-scrolling
    const latestMessage = orderedMessages[orderedMessages.length - 1];
    const latestMessageContentLength = latestMessage?.content?.length ?? 0;
    const latestMessageStatus = latestMessage?.status;

    // Auto-scroll to bottom when new messages arrive or when active message expands, if user is already near bottom
    useEffect(() => {
      if (!showScrollBottom) {
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
          {orderedMessages.map((msg) => (
            <ChatMessageItem
              key={msg.id}
              message={msg}
              onRetry={onRetryMessage ? handleItemRetry : undefined}
            />
          ))}
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
