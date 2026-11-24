import React from 'react';
import type { ChatMessage } from '../types/assistant.types';

export interface MessageMetadataProps {
  createdAt: string;
  metadata?: ChatMessage['metadata'];
  grounded?: boolean;
}

/**
 * Message Metadata Presentation Component.
 *
 * Displays:
 * - Localized message creation time
 * - Model identifier badge
 * - Generation latency in ms
 * - Verified RAG status tag
 */
export const MessageMetadata: React.FC<MessageMetadataProps> = ({
  createdAt,
  metadata,
  grounded,
}) => {
  const formattedTime = new Date(createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <footer
      aria-label="Metadatos del mensaje"
      className="flex flex-wrap items-center gap-2 px-1 text-[11px] text-muted-foreground/70"
    >
      <time dateTime={createdAt}>{formattedTime}</time>

      {metadata?.model && (
        <>
          <span aria-hidden="true">•</span>
          <span className="font-mono text-muted-foreground/80">{metadata.model}</span>
        </>
      )}

      {metadata?.latencyMs !== undefined && (
        <>
          <span aria-hidden="true">•</span>
          <span>{metadata.latencyMs}ms</span>
        </>
      )}

      {grounded && (
        <>
          <span aria-hidden="true">•</span>
          <span className="text-primary font-medium">Fundamentado</span>
        </>
      )}
    </footer>
  );
};
