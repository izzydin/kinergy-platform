import type { RAGSourceCitationDto } from '../types/assistant.types';

export interface FormatMessageForCopyOptions {
  /**
   * Whether to append a formatted bibliography block when verified citations exist.
   * Defaults to true.
   */
  readonly includeCitations?: boolean;
}

/**
 * Formats an assistant message for clipboard copying.
 *
 * Requirements (AI-09.5 - FB.04):
 * - Preserves complete response text structure (Markdown headers, bold, lists, code blocks, paragraphs)
 * - Avoids copying internal UI elements, action buttons, telemetry, or internal IDs
 * - Preserves useful citation references in human-readable bibliographic format without raw UI artifacts
 * - Formats document title, page number, and heading hierarchy cleanly
 */
export function formatMessageForCopy(
  content: string,
  sources?: readonly RAGSourceCitationDto[],
  options?: FormatMessageForCopyOptions,
): string {
  if (!content) {
    return '';
  }

  const trimmedContent = content.trim();
  const includeCitations = options?.includeCitations ?? true;

  if (!includeCitations || !sources || sources.length === 0) {
    return trimmedContent;
  }

  // Deduplicate sources by documentTitle and pageNumber to avoid redundant entries
  const uniqueSources: { title: string; pageNumber?: number; heading?: string }[] = [];
  const seenKeys = new Set<string>();

  for (const src of sources) {
    const title =
      src.documentTitle?.trim() || src.originalFileName?.trim() || 'Documento de referencia';
    const page = src.pageNumber;
    const heading =
      src.headingPath && src.headingPath.length > 0 ? src.headingPath.join(' > ') : undefined;
    const key = `${title}::${page ?? 'all'}::${heading ?? 'none'}`;

    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueSources.push({ title, pageNumber: page, heading });
    }
  }

  if (uniqueSources.length === 0) {
    return trimmedContent;
  }

  const citationsBlock = uniqueSources
    .map((src, index) => {
      let line = `[${index + 1}] ${src.title}`;
      if (src.pageNumber != null) {
        line += ` (p. ${src.pageNumber})`;
      }
      if (src.heading) {
        line += ` - Sección: ${src.heading}`;
      }
      return line;
    })
    .join('\n');

  return `${trimmedContent}\n\n---\nFuentes consultadas:\n${citationsBlock}`;
}
