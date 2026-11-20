/**
 * Structural element types representing extracted content blocks across documents.
 * Sufficient to represent hierarchical structures from PDF, DOCX, Markdown, and TXT.
 */
export enum ExtractedBlockType {
  /**
   * Section heading (e.g. H1 through H6, DOCX Heading 1..3, Markdown #..######).
   */
  HEADING = 'HEADING',

  /**
   * Standard prose text paragraph.
   */
  PARAGRAPH = 'PARAGRAPH',

  /**
   * Ordered or unordered list item.
   */
  LIST_ITEM = 'LIST_ITEM',

  /**
   * Tabular data container or block.
   */
  TABLE = 'TABLE',

  /**
   * Individual table row with ordered cell values.
   */
  TABLE_ROW = 'TABLE_ROW',

  /**
   * Individual table cell with text and optional header flag.
   */
  TABLE_CELL = 'TABLE_CELL',

  /**
   * Preformatted source code block or monospace snippet.
   */
  CODE_BLOCK = 'CODE_BLOCK',

  /**
   * Blockquote or callout section.
   */
  BLOCKQUOTE = 'BLOCKQUOTE',

  /**
   * Logical or physical page boundary (e.g. PDF page transition).
   */
  PAGE_BOUNDARY = 'PAGE_BOUNDARY',

  /**
   * Horizontal separator or thematic divider.
   */
  DIVIDER = 'DIVIDER',

  /**
   * Machine-readable metadata block (e.g. frontmatter or document header).
   */
  METADATA_BLOCK = 'METADATA_BLOCK',
}
