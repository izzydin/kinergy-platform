import React from 'react';
import { ExternalLink } from 'lucide-react';
import { CodeBlock } from './code-block';

export interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Validates whether an URL is safe to open in the browser.
 * Disallows javascript:, data:, and other dangerous protocols.
 */
function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vbscript:')
  ) {
    return false;
  }
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('/')
  );
}

/**
 * Render inline markdown features: bold, italic, inline code, and safe links.
 */
function renderInlineContent(text: string): React.ReactNode[] {
  // Regex to match inline tokens:
  // 1: `code`
  // 2: **bold** or __bold__
  // 3: *italic* or _italic_
  // 4: [link text](url)
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (!part) return null;

    // Inline code
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={index}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] font-semibold text-primary break-all"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Bold
    if (
      (part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
      (part.startsWith('__') && part.endsWith('__') && part.length >= 4)
    ) {
      return (
        <strong key={index} className="font-semibold break-words">
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Italic
    if (
      (part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
      (part.startsWith('_') && part.endsWith('_') && part.length >= 2)
    ) {
      return (
        <em key={index} className="italic break-words">
          {part.slice(1, -1)}
        </em>
      );
    }

    // Link: [text](url)
    const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (linkMatch) {
      const linkText = linkMatch[1] ?? '';
      const linkUrl = linkMatch[2] ?? '';

      if (isSafeUrl(linkUrl)) {
        return (
          <a
            key={index}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-1 font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary break-all"
          >
            <span className="break-all">{linkText}</span>
            <ExternalLink className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
          </a>
        );
      }

      // If unsafe URL protocol, neutralize and render plain text
      return (
        <span key={index} className="text-muted-foreground break-all">
          {linkText}
        </span>
      );
    }

    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

/**
 * Checks if a block of lines represents a markdown table.
 */
function isTableBlock(lines: string[]): boolean {
  if (lines.length < 2) return false;
  const first = lines[0]?.trim() ?? '';
  const second = lines[1]?.trim() ?? '';
  const hasPipe = first.startsWith('|') && first.endsWith('|');
  const hasSeparator = second.startsWith('|') && /^[|:\-\s]+$/.test(second);
  return hasPipe && hasSeparator;
}

/**
 * Render a parsed table block into accessible HTML table markup.
 */
function renderTable(lines: string[], keyPrefix: number | string): React.ReactNode {
  const headerLine = lines[0] ?? '';
  const headerCells = headerLine
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());
  const bodyRows = lines.slice(2).map((row) =>
    row
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim()),
  );

  return (
    <div
      key={keyPrefix}
      tabIndex={0}
      role="region"
      aria-label="Tabla de datos markdown"
      className="my-3 overflow-x-auto rounded-lg border border-border/70 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
    >
      <table className="min-w-full divide-y divide-border/60 text-xs">
        <thead className="bg-muted/70">
          <tr>
            {headerCells.map((cell, idx) => (
              <th
                key={idx}
                scope="col"
                className="px-3 py-2 text-left font-semibold text-foreground/90 break-words whitespace-normal"
              >
                {renderInlineContent(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40 bg-card/40">
          {bodyRows.map((row, rowIdx) => (
            <tr key={rowIdx} className="hover:bg-muted/30 transition-colors">
              {row.map((cell, colIdx) => (
                <td
                  key={colIdx}
                  className="px-3 py-2 text-foreground/80 break-words whitespace-normal"
                >
                  {renderInlineContent(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Pure AST/block-based Markdown Renderer for Assistant Messages.
 *
 * Safe rendering without dangerouslySetInnerHTML:
 * - Code blocks with copy action (via CodeBlock component)
 * - Tables with accessible headers
 * - Headings (h3 to h6)
 * - Ordered & unordered lists
 * - Blockquotes
 * - Inline formatting (bold, italic, code, safe external links)
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = React.memo(
  ({ content, className = '' }) => {
    const blocks = React.useMemo(() => {
      if (!content) return [];

      // 1. Separate fenced code blocks from prose
      const parsedBlocks: React.ReactNode[] = [];
      const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      let blockIndex = 0;

      while ((match = codeBlockRegex.exec(content)) !== null) {
        const textBefore = content.substring(lastIndex, match.index);
        if (textBefore.trim()) {
          parsedBlocks.push(...parseProseBlocks(textBefore, `prose-${blockIndex++}`));
        }

        const language = match[1] || '';
        const code = match[2] ?? '';
        parsedBlocks.push(
          <CodeBlock key={`code-${blockIndex++}`} language={language} code={code} />,
        );

        lastIndex = match.index + match[0].length;
      }

      const remainingText = content.substring(lastIndex);
      if (remainingText.trim()) {
        parsedBlocks.push(...parseProseBlocks(remainingText, `prose-${blockIndex}`));
      }

      return parsedBlocks;
    }, [content]);

    if (!content) return null;

    return (
      <div
        data-testid="markdown-content"
        className={`prose prose-sm dark:prose-invert max-w-none space-y-2 leading-relaxed break-words ${className}`}
      >
        {blocks}
      </div>
    );
  },
);

/**
 * Parse standard text blocks (headings, lists, quotes, tables, paragraphs).
 */
function parseProseBlocks(prose: string, prefix: string): React.ReactNode[] {
  const lines = prose.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) {
      i++;
      continue;
    }
    const trimmed = line.trim();

    // Empty lines
    if (!trimmed) {
      i++;
      continue;
    }

    // Markdown Table Detection
    const nextLine = lines[i + 1];
    if (trimmed.startsWith('|') && nextLine !== undefined && nextLine.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length) {
        const currentTableLine = lines[i];
        if (currentTableLine !== undefined && currentTableLine.trim().startsWith('|')) {
          tableLines.push(currentTableLine);
          i++;
        } else {
          break;
        }
      }
      if (isTableBlock(tableLines)) {
        elements.push(renderTable(tableLines, `${prefix}-table-${i}`));
        continue;
      }
    }

    // Headings
    if (trimmed.startsWith('#### ')) {
      elements.push(
        <h6
          key={`${prefix}-h6-${i}`}
          className="text-xs font-semibold text-foreground/90 mt-3 mb-1 break-words"
        >
          {renderInlineContent(trimmed.substring(5))}
        </h6>,
      );
      i++;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h5
          key={`${prefix}-h5-${i}`}
          className="text-sm font-semibold text-foreground/95 mt-3 mb-1 break-words"
        >
          {renderInlineContent(trimmed.substring(4))}
        </h5>,
      );
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h4
          key={`${prefix}-h4-${i}`}
          className="text-sm font-bold text-foreground mt-4 mb-1.5 break-words"
        >
          {renderInlineContent(trimmed.substring(3))}
        </h4>,
      );
      i++;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      elements.push(
        <h3
          key={`${prefix}-h3-${i}`}
          className="text-base font-bold text-foreground mt-4 mb-2 break-words"
        >
          {renderInlineContent(trimmed.substring(2))}
        </h3>,
      );
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length) {
        const currentQuoteLine = lines[i];
        if (currentQuoteLine !== undefined && currentQuoteLine.trim().startsWith('>')) {
          quoteLines.push(currentQuoteLine.trim().replace(/^>\s?/, ''));
          i++;
        } else {
          break;
        }
      }
      elements.push(
        <blockquote
          key={`${prefix}-quote-${i}`}
          className="border-l-3 border-primary/50 bg-muted/20 py-1.5 pl-3 pr-2 my-2.5 rounded-r text-xs italic text-muted-foreground break-words"
        >
          {quoteLines.map((q, qIdx) => (
            <p key={qIdx} className="break-words">
              {renderInlineContent(q)}
            </p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // Unordered List (- or *)
    if (/^[-*]\s+/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length) {
        const currentListLine = lines[i];
        if (currentListLine !== undefined && /^[-*]\s+/.test(currentListLine.trim())) {
          listItems.push(currentListLine.trim().replace(/^[-*]\s+/, ''));
          i++;
        } else {
          break;
        }
      }
      elements.push(
        <ul
          key={`${prefix}-ul-${i}`}
          className="my-2 list-disc pl-5 space-y-1 text-xs sm:text-sm break-words"
        >
          {listItems.map((item, itemIdx) => (
            <li key={itemIdx} className="break-words">
              {renderInlineContent(item)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered List (1. 2. etc.)
    if (/^\d+\.\s+/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length) {
        const currentListLine = lines[i];
        if (currentListLine !== undefined && /^\d+\.\s+/.test(currentListLine.trim())) {
          listItems.push(currentListLine.trim().replace(/^\d+\.\s+/, ''));
          i++;
        } else {
          break;
        }
      }
      elements.push(
        <ol
          key={`${prefix}-ol-${i}`}
          className="my-2 list-decimal pl-5 space-y-1 text-xs sm:text-sm break-words"
        >
          {listItems.map((item, itemIdx) => (
            <li key={itemIdx} className="break-words">
              {renderInlineContent(item)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // Standard Paragraph
    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const currentParaLine = lines[i];
      if (
        currentParaLine !== undefined &&
        currentParaLine.trim() &&
        !currentParaLine.trim().startsWith('#') &&
        !currentParaLine.trim().startsWith('>') &&
        !currentParaLine.trim().startsWith('|') &&
        !/^[-*]\s+/.test(currentParaLine.trim()) &&
        !/^\d+\.\s+/.test(currentParaLine.trim())
      ) {
        paragraphLines.push(currentParaLine);
        i++;
      } else {
        break;
      }
    }

    elements.push(
      <p key={`${prefix}-p-${i}`} className="text-xs sm:text-sm leading-relaxed my-1.5 break-words">
        {renderInlineContent(paragraphLines.join(' '))}
      </p>,
    );
  }

  return elements;
}
