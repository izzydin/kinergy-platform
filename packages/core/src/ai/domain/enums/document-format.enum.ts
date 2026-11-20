/**
 * Initial supported document formats for ingestion in Milestone AI-03.
 * Supported: PDF, DOCX, Markdown, Plain Text.
 */
export enum DocumentFormat {
  PDF = 'application/pdf',
  DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  MARKDOWN = 'text/markdown',
  TXT = 'text/plain',
}

export const SUPPORTED_MIME_TYPES: readonly string[] = Object.freeze([
  DocumentFormat.PDF,
  DocumentFormat.DOCX,
  DocumentFormat.MARKDOWN,
  DocumentFormat.TXT,
  'text/x-markdown', // Common variant for markdown
]);

export function isSupportedMimeType(mimeType: string): boolean {
  if (!mimeType) return false;
  return SUPPORTED_MIME_TYPES.includes(mimeType.toLowerCase().trim());
}
