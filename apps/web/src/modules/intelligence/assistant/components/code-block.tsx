import React, { useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';
import { Button } from '@kinergy-platform/ui';

export interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

/**
 * Accessible Code Block Component.
 *
 * Provides:
 * - Clean pre/code structure with horizontal scroll containment
 * - Language tag indicator
 * - Copy code button with transient visual feedback ("Copiado!")
 * - Screen-reader accessible attributes
 */
export const CodeBlock: React.FC<CodeBlockProps> = React.memo(
  ({ code, language = '', className = '' }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(code);
        }
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      } catch {
        // Graceful fallback if clipboard access is denied
      }
    };

    const displayLanguage = language.trim() || 'código';

    return (
      <div
        role="region"
        aria-label={`Bloque de ${displayLanguage}`}
        className={`my-3 overflow-hidden rounded-lg border border-border/70 bg-muted/40 shadow-2xs ${className}`}
      >
        {/* Code Header Bar */}
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/80 px-3 py-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 font-mono text-[11px] font-medium lowercase">
            <Terminal className="h-3.5 w-3.5 text-primary" />
            <span>{displayLanguage}</span>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            aria-label={copied ? 'Código copiado' : 'Copiar código al portapapeles'}
            className="h-6 gap-1 px-2 text-[11px] border-border/70 hover:bg-background/80 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-hidden"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-500" />
                <span className="text-emerald-500 font-medium">Copiado!</span>
                <span className="sr-only">Código copiado al portapapeles</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copiar</span>
              </>
            )}
          </Button>
        </div>

        {/* Code Content Container with Horizontal Overflow */}
        <pre
          tabIndex={0}
          aria-label={`Contenido de código ${displayLanguage}`}
          className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-foreground/90 selection:bg-primary/20 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-hidden"
        >
          <code>{code}</code>
        </pre>
      </div>
    );
  },
);
