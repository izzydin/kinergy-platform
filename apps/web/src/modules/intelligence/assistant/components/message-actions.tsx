import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@kinergy-platform/ui';

export interface MessageActionsProps {
  content: string;
  className?: string;
  label?: string;
}

/**
 * Message Action Region Component.
 *
 * Provides:
 * - Copy message content to clipboard with transient feedback
 * - Screen-reader accessibility labels
 */
export const MessageActions: React.FC<MessageActionsProps> = React.memo(
  ({ content, className = '', label = 'Copiar mensaje' }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(content);
        }
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      } catch {
        // Graceful fallback
      }
    };

    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          aria-label={copied ? 'Mensaje copiado' : label}
          className="h-6 w-6 p-0 text-muted-foreground/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-hidden"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-500" />
              <span className="sr-only">Texto copiado al portapapeles</span>
            </>
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </div>
    );
  },
);
