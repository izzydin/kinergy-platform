import { Injectable, Optional, Inject } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  IDocumentChunkerPort,
  ITokenizerPort,
  NormalizedDocument,
  NormalizedBlock,
  DocumentChunk,
  ChunkingConfig,
  ChunkId,
  ChunkProvenance,
  ExtractedBlockType,
  DocumentValidationException,
  EmptyExtractedDocumentException,
} from '@kinergy-platform/core';
import { TOKENIZER_TOKEN } from '../../ai.tokens';
import { DeterministicBpeTokenizerAdapter } from '../../adapters/tokenizers/deterministic-bpe-tokenizer.adapter';

/**
 * Intermediate structure representing a drafted chunk candidate during the chunking pipeline.
 */
interface ChunkDraft {
  blocks: NormalizedBlock[];
  textParts: string[];
  tokenCount: number;
  sectionPath: readonly string[];
  primaryPage: number | null;
  pageRange: [number, number] | null;
  isTableSplit?: boolean;
  isCodeSplit?: boolean;
  isParagraphSplit?: boolean;
}

/**
 * Service implementing structure-aware, deterministic document chunking.
 *
 * Adheres to strict architectural boundary prioritization:
 * 1. Document section boundaries (no cross-topic bleeding)
 * 2. Heading hierarchy (nested contextual breadcrumbs)
 * 3. Paragraph boundaries
 * 4. List item integrity
 * 5. Sentence boundaries (within oversized paragraphs)
 * 6. Token-level subdivision (safety fallback for single sentences > maximumChunkTokens)
 *
 * Enforces:
 * - Table header row preservation across table sub-chunks
 * - Code block fence preservation across code sub-chunks
 * - Deterministic ~60-token sentence-aligned overlap between contiguous intra-section chunks
 * - Full provenance lineage, section breadcrumbs, and deterministic RFC 4122 UUID chunk identities
 */
@Injectable()
export class StructureAwareChunkerService implements IDocumentChunkerPort {
  private readonly tokenizer: ITokenizerPort;

  // Common Spanish and English clinical / legal / academic abbreviations
  private static readonly ABBREVIATIONS = new Set([
    'dr',
    'dra',
    'sr',
    'sra',
    'srta',
    'lic',
    'prof',
    'art',
    'pag',
    'pág',
    'ej',
    'vs',
    'etc',
    'no',
    'núm',
    'num',
    'inc',
    'corp',
    'co',
    'mr',
    'mrs',
    'ms',
  ]);

  constructor(
    @Optional()
    @Inject(TOKENIZER_TOKEN)
    tokenizer?: ITokenizerPort,
  ) {
    this.tokenizer = tokenizer ?? new DeterministicBpeTokenizerAdapter();
  }

  /**
   * Main entry point for chunking an immutable NormalizedDocument.
   */
  public chunk(document: NormalizedDocument, configOverride?: ChunkingConfig): DocumentChunk[] {
    if (!document) {
      throw new DocumentValidationException('NormalizedDocument is required for chunking.');
    }

    const config = configOverride ?? ChunkingConfig.default();

    // Invariant: Non-empty document content
    const meaningfulBlocks = document.blocks.filter(
      (b) => b.type !== ExtractedBlockType.PAGE_BOUNDARY && b.text.trim().length > 0,
    );

    if (meaningfulBlocks.length === 0) {
      throw new EmptyExtractedDocumentException(document.documentId, document.documentVersionId, {
        reason: 'Cannot chunk document with zero meaningful textual blocks.',
      });
    }

    // Phase 1: Group blocks into coherent semantic sections based on section hierarchy
    const sections = this.partitionIntoSections(meaningfulBlocks);

    // Phase 2: Process each section into drafts satisfying token constraints and structural invariants
    const chunkDrafts: ChunkDraft[] = [];
    for (const sectionBlocks of sections) {
      const sectionDrafts = this.processSection(sectionBlocks, config);
      chunkDrafts.push(...sectionDrafts);
    }

    // Invariant: At least one draft produced
    if (chunkDrafts.length === 0) {
      throw new EmptyExtractedDocumentException(document.documentId, document.documentVersionId, {
        reason: 'Chunking pipeline produced zero chunks from non-empty document.',
      });
    }

    // Phase 3: Apply deterministic overlap (~60 tokens) between contiguous drafts within the same section
    const overlappedDrafts = this.applyIntraSectionOverlap(chunkDrafts, config);

    // Phase 4: Construct immutable DocumentChunk entities with comprehensive provenance & deterministic UUIDs
    return this.materializeChunks(overlappedDrafts, document, config);
  }

  /**
   * Partitions blocks by section boundaries. A new section is formed when
   * a major heading appears or the top-level sectionPath changes.
   */
  private partitionIntoSections(blocks: readonly NormalizedBlock[]): NormalizedBlock[][] {
    const sections: NormalizedBlock[][] = [];
    let currentSection: NormalizedBlock[] = [];
    let currentTopSection: string | null = null;

    for (const block of blocks) {
      const blockTopSection = block.sectionPath.length > 0 ? block.sectionPath[0] : null;
      const isMajorHeading =
        block.type === ExtractedBlockType.HEADING &&
        (block.headingLevel === 1 || block.headingLevel === null);

      if (
        currentSection.length > 0 &&
        (isMajorHeading || (blockTopSection !== null && blockTopSection !== currentTopSection))
      ) {
        sections.push(currentSection);
        currentSection = [];
      }

      currentSection.push(block);
      if (blockTopSection) {
        currentTopSection = blockTopSection;
      }
    }

    if (currentSection.length > 0) {
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * Processes a single semantic section into one or more ChunkDrafts within min/max token limits.
   */
  private processSection(blocks: readonly NormalizedBlock[], config: ChunkingConfig): ChunkDraft[] {
    const drafts: ChunkDraft[] = [];
    let currentDraft: ChunkDraft | null = null;

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (!block) continue;

      // Special handling for Tables
      if (block.type === ExtractedBlockType.TABLE) {
        const tableTokens = this.tokenizer.countTokens(block.text);

        if (tableTokens > config.maximumChunkTokens) {
          // Flush existing draft if any
          if (currentDraft && currentDraft.textParts.length > 0) {
            drafts.push(currentDraft);
            currentDraft = null;
          }
          // Split oversized table with header preservation
          const tableSplitDrafts = this.splitOversizedTable(block, config);
          drafts.push(...tableSplitDrafts);
          continue;
        }
      }

      // Special handling for Code Blocks
      if (block.type === ExtractedBlockType.CODE_BLOCK) {
        const codeTokens = this.tokenizer.countTokens(block.text);

        if (codeTokens > config.maximumChunkTokens) {
          if (currentDraft && currentDraft.textParts.length > 0) {
            drafts.push(currentDraft);
            currentDraft = null;
          }
          const codeSplitDrafts = this.splitOversizedCodeBlock(block, config);
          drafts.push(...codeSplitDrafts);
          continue;
        }
      }

      const blockTokens = this.tokenizer.countTokens(block.text);

      // Oversized individual block (e.g. large paragraph > maximumChunkTokens)
      if (blockTokens > config.maximumChunkTokens) {
        if (currentDraft && currentDraft.textParts.length > 0) {
          drafts.push(currentDraft);
          currentDraft = null;
        }
        const paragraphSubDrafts = this.splitOversizedParagraph(block, config);
        drafts.push(...paragraphSubDrafts);
        continue;
      }

      // Standard block accumulation
      if (!currentDraft) {
        currentDraft = this.createNewDraft(block, blockTokens);
      } else {
        const candidateText = [...currentDraft.textParts, block.text].join('\n\n');
        const candidateTokens = this.tokenizer.countTokens(candidateText);

        if (candidateTokens <= config.targetChunkTokens) {
          // Fits comfortably within target window
          this.appendBlockToDraft(currentDraft, block, candidateTokens);
        } else if (candidateTokens <= config.maximumChunkTokens) {
          // Slightly exceeds target but within maximum ceiling: accept to prevent orphan fragments
          this.appendBlockToDraft(currentDraft, block, candidateTokens);
          drafts.push(currentDraft);
          currentDraft = null;
        } else {
          // Exceeds maximum: flush current draft and start a new one
          drafts.push(currentDraft);
          currentDraft = this.createNewDraft(block, blockTokens);
        }
      }
    }

    if (currentDraft && currentDraft.textParts.length > 0) {
      drafts.push(currentDraft);
    }

    return drafts;
  }

  /**
   * Splits an oversized table by data rows, reproducing table header rows across each sub-chunk.
   */
  private splitOversizedTable(block: NormalizedBlock, config: ChunkingConfig): ChunkDraft[] {
    const lines = block.text.split('\n');
    if (lines.length < 3) {
      // Not a standard markdown table; fallback to line-level splitting
      return this.splitOversizedParagraph(block, config);
    }

    // First two lines are column headers and delimiter separator
    const headerLines = [lines[0] || '', lines[1] || ''];
    const headerPrefix = headerLines.join('\n') + '\n';
    const headerTokens = this.tokenizer.countTokens(headerPrefix);

    const dataRows = lines.slice(2);
    const tableDrafts: ChunkDraft[] = [];

    let currentRows: string[] = [];
    let currentTokens = headerTokens;

    for (const row of dataRows) {
      if (row.trim().length === 0) continue;
      const rowTokens = this.tokenizer.countTokens(row + '\n');

      if (currentTokens + rowTokens > config.maximumChunkTokens && currentRows.length > 0) {
        const tableText = headerPrefix + currentRows.join('\n');
        tableDrafts.push({
          blocks: [block],
          textParts: [tableText],
          tokenCount: this.tokenizer.countTokens(tableText),
          sectionPath: block.sectionPath,
          primaryPage: block.pageNumber,
          pageRange: block.pageNumber ? [block.pageNumber, block.pageNumber] : null,
          isTableSplit: true,
        });
        currentRows = [];
        currentTokens = headerTokens;
      }

      currentRows.push(row);
      currentTokens += rowTokens;
    }

    if (currentRows.length > 0) {
      const tableText = headerPrefix + currentRows.join('\n');
      tableDrafts.push({
        blocks: [block],
        textParts: [tableText],
        tokenCount: this.tokenizer.countTokens(tableText),
        sectionPath: block.sectionPath,
        primaryPage: block.pageNumber,
        pageRange: block.pageNumber ? [block.pageNumber, block.pageNumber] : null,
        isTableSplit: true,
      });
    }

    return tableDrafts;
  }

  /**
   * Splits an oversized code block by lines, preserving ```lang fences on all resulting chunks.
   */
  private splitOversizedCodeBlock(block: NormalizedBlock, config: ChunkingConfig): ChunkDraft[] {
    const lang = block.codeLanguage ?? '';
    const openFence = `\`\`\`${lang}\n`;
    const closeFence = '\n```';
    const fenceTokens = this.tokenizer.countTokens(openFence + closeFence);

    // Remove opening and closing fence if present in block.text
    let codeContent = block.text.trim();
    if (codeContent.startsWith('```')) {
      const firstLineEnd = codeContent.indexOf('\n');
      if (firstLineEnd !== -1) {
        codeContent = codeContent.substring(firstLineEnd + 1);
      }
    }
    if (codeContent.endsWith('```')) {
      codeContent = codeContent.substring(0, codeContent.length - 3).trimEnd();
    }

    const lines = codeContent.split('\n');
    const codeDrafts: ChunkDraft[] = [];

    let currentLines: string[] = [];
    let currentTokens = fenceTokens;

    for (const line of lines) {
      const lineTokens = this.tokenizer.countTokens(line + '\n');

      if (currentTokens + lineTokens > config.maximumChunkTokens && currentLines.length > 0) {
        const fullCodeText = `${openFence}${currentLines.join('\n')}${closeFence}`;
        codeDrafts.push({
          blocks: [block],
          textParts: [fullCodeText],
          tokenCount: this.tokenizer.countTokens(fullCodeText),
          sectionPath: block.sectionPath,
          primaryPage: block.pageNumber,
          pageRange: block.pageNumber ? [block.pageNumber, block.pageNumber] : null,
          isCodeSplit: true,
        });
        currentLines = [];
        currentTokens = fenceTokens;
      }

      currentLines.push(line);
      currentTokens += lineTokens;
    }

    if (currentLines.length > 0) {
      const fullCodeText = `${openFence}${currentLines.join('\n')}${closeFence}`;
      codeDrafts.push({
        blocks: [block],
        textParts: [fullCodeText],
        tokenCount: this.tokenizer.countTokens(fullCodeText),
        sectionPath: block.sectionPath,
        primaryPage: block.pageNumber,
        pageRange: block.pageNumber ? [block.pageNumber, block.pageNumber] : null,
        isCodeSplit: true,
      });
    }

    return codeDrafts;
  }

  /**
   * Splits an oversized paragraph or block into sentence-level semantic units,
   * with token-level fallback for giant single sentences.
   */
  private splitOversizedParagraph(block: NormalizedBlock, config: ChunkingConfig): ChunkDraft[] {
    const sentences = this.splitIntoSentences(block.text);
    const drafts: ChunkDraft[] = [];

    let currentDraft: ChunkDraft | null = null;

    for (const sentence of sentences) {
      const sentenceTokens = this.tokenizer.countTokens(sentence);

      if (sentenceTokens > config.maximumChunkTokens) {
        // Giant single sentence: token-level subdivision fallback
        if (currentDraft && currentDraft.textParts.length > 0) {
          drafts.push(currentDraft);
          currentDraft = null;
        }
        const subSentenceDrafts = this.splitGiantSentence(sentence, block, config);
        drafts.push(...subSentenceDrafts);
        continue;
      }

      if (!currentDraft) {
        currentDraft = {
          blocks: [block],
          textParts: [sentence],
          tokenCount: sentenceTokens,
          sectionPath: block.sectionPath,
          primaryPage: block.pageNumber,
          pageRange: block.pageNumber ? [block.pageNumber, block.pageNumber] : null,
          isParagraphSplit: true,
        };
      } else {
        const candidateSentences = [...currentDraft.textParts, sentence].join(' ');
        const candidateTokens = this.tokenizer.countTokens(candidateSentences);

        if (candidateTokens <= config.targetChunkTokens) {
          currentDraft.textParts.push(sentence);
          currentDraft.tokenCount = candidateTokens;
        } else {
          drafts.push(currentDraft);
          currentDraft = {
            blocks: [block],
            textParts: [sentence],
            tokenCount: sentenceTokens,
            sectionPath: block.sectionPath,
            primaryPage: block.pageNumber,
            pageRange: block.pageNumber ? [block.pageNumber, block.pageNumber] : null,
            isParagraphSplit: true,
          };
        }
      }
    }

    if (currentDraft && currentDraft.textParts.length > 0) {
      drafts.push(currentDraft);
    }

    return drafts;
  }

  /**
   * Token-level subdivision fallback for rare sentences exceeding maximumChunkTokens.
   */
  private splitGiantSentence(
    sentence: string,
    block: NormalizedBlock,
    config: ChunkingConfig,
  ): ChunkDraft[] {
    const drafts: ChunkDraft[] = [];
    const words = sentence.split(/\s+/);
    let currentWords: string[] = [];
    let currentTokens = 0;

    for (const word of words) {
      if (!word) continue;
      const wordTokens = this.tokenizer.countTokens(word + ' ');

      if (currentTokens + wordTokens > config.targetChunkTokens && currentWords.length > 0) {
        const text = currentWords.join(' ');
        drafts.push({
          blocks: [block],
          textParts: [text],
          tokenCount: this.tokenizer.countTokens(text),
          sectionPath: block.sectionPath,
          primaryPage: block.pageNumber,
          pageRange: block.pageNumber ? [block.pageNumber, block.pageNumber] : null,
        });
        currentWords = [];
        currentTokens = 0;
      }

      currentWords.push(word);
      currentTokens += wordTokens;
    }

    if (currentWords.length > 0) {
      const text = currentWords.join(' ');
      drafts.push({
        blocks: [block],
        textParts: [text],
        tokenCount: this.tokenizer.countTokens(text),
        sectionPath: block.sectionPath,
        primaryPage: block.pageNumber,
        pageRange: block.pageNumber ? [block.pageNumber, block.pageNumber] : null,
      });
    }

    return drafts;
  }

  /**
   * Decomposes text into sentences respecting abbreviations, decimal numbers, and Spanish punctuation.
   */
  private splitIntoSentences(text: string): string[] {
    if (!text || text.trim().length === 0) return [];

    const raw = text.trim();
    const sentences: string[] = [];
    let startIdx = 0;

    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];

      // Check sentence terminal punctuation
      if (ch === '.' || ch === '?' || ch === '!') {
        const nextChar = i + 1 < raw.length ? raw[i + 1] : '';

        // Case 1: Decimal number e.g. 10.5 or 3.14
        if (ch === '.' && /\d/.test(raw[i - 1] ?? '') && /\d/.test(nextChar ?? '')) {
          continue;
        }

        // Case 2: Abbreviation check (e.g. Dr., Sr., Art., pág.)
        if (ch === '.') {
          const priorWordMatch = raw.substring(Math.max(0, i - 10), i).match(/[\p{L}]+$/u);
          if (priorWordMatch) {
            const word = priorWordMatch[0].toLowerCase();
            if (StructureAwareChunkerService.ABBREVIATIONS.has(word)) {
              continue;
            }
          }
        }

        // Case 3: Sentence boundary detected if followed by whitespace/newline or end of text
        if (i === raw.length - 1 || /\s/.test(nextChar ?? '')) {
          const candidate = raw.substring(startIdx, i + 1).trim();
          if (candidate.length > 0) {
            sentences.push(candidate);
          }
          // Advance past whitespace
          while (i + 1 < raw.length && /\s/.test(raw[i + 1] ?? '')) {
            i++;
          }
          startIdx = i + 1;
        }
      }
    }

    if (startIdx < raw.length) {
      const remaining = raw.substring(startIdx).trim();
      if (remaining.length > 0) {
        sentences.push(remaining);
      }
    }

    return sentences.length > 0 ? sentences : [raw];
  }

  /**
   * Creates a fresh draft container from an initial block.
   */
  private createNewDraft(block: NormalizedBlock, blockTokens: number): ChunkDraft {
    return {
      blocks: [block],
      textParts: [block.text],
      tokenCount: blockTokens,
      sectionPath: block.sectionPath,
      primaryPage: block.pageNumber,
      pageRange: block.pageNumber ? [block.pageNumber, block.pageNumber] : null,
    };
  }

  /**
   * Appends a block to an existing draft, updating page range and token count.
   */
  private appendBlockToDraft(
    draft: ChunkDraft,
    block: NormalizedBlock,
    exactTokenCount?: number,
  ): void {
    draft.blocks.push(block);
    draft.textParts.push(block.text);
    draft.tokenCount =
      exactTokenCount ??
      this.tokenizer.countTokens(draft.textParts.join(draft.isParagraphSplit ? ' ' : '\n\n'));

    if (draft.sectionPath.length === 0 && block.sectionPath.length > 0) {
      draft.sectionPath = block.sectionPath;
    }

    if (block.pageNumber !== null && block.pageNumber !== undefined) {
      if (draft.primaryPage === null) {
        draft.primaryPage = block.pageNumber;
      }
      if (!draft.pageRange) {
        draft.pageRange = [block.pageNumber, block.pageNumber];
      } else {
        draft.pageRange[1] = Math.max(draft.pageRange[1], block.pageNumber);
      }
    }
  }

  /**
   * Applies deterministic overlap (~60 tokens) between consecutive drafts within the same section.
   * Never carries overlap across unrelated top-level sections or into table/code splits.
   */
  private applyIntraSectionOverlap(
    drafts: ChunkDraft[],
    config: ChunkingConfig,
  ): Array<ChunkDraft & { overlapPrefix?: string; overlapTokens?: number }> {
    if (drafts.length <= 1 || config.overlapTokens <= 0) {
      return drafts;
    }

    const result: Array<ChunkDraft & { overlapPrefix?: string; overlapTokens?: number }> = [];

    for (let i = 0; i < drafts.length; i++) {
      const current = drafts[i];
      if (!current) continue;

      if (i === 0) {
        result.push(current);
        continue;
      }

      const previous = drafts[i - 1];
      if (!previous) {
        result.push(current);
        continue;
      }

      // Check if both drafts belong to the same section hierarchy
      const sameTopSection =
        current.sectionPath.length > 0 &&
        previous.sectionPath.length > 0 &&
        current.sectionPath[0] === previous.sectionPath[0];

      // Exclude overlap for specialized table/code splits
      if (
        sameTopSection &&
        !current.isTableSplit &&
        !previous.isTableSplit &&
        !current.isCodeSplit
      ) {
        // Compute available headroom in current draft (reserving 4 tokens for delimiter)
        const maxAllowedOverlap = Math.min(
          Math.round(config.overlapTokens * 1.2),
          Math.max(0, config.maximumChunkTokens - current.tokenCount - 4),
        );

        if (maxAllowedOverlap >= 15) {
          const prevText = previous.textParts.join('\n\n');
          const sentences = this.splitIntoSentences(prevText);

          const overlapSentences: string[] = [];
          let accumulatedOverlap = 0;

          for (let s = sentences.length - 1; s >= 0; s--) {
            const sent = sentences[s];
            if (!sent) continue;
            const sentTokens = this.tokenizer.countTokens(sent);

            if (accumulatedOverlap + sentTokens <= maxAllowedOverlap) {
              overlapSentences.unshift(sent);
              accumulatedOverlap += sentTokens;
              if (accumulatedOverlap >= config.overlapTokens) {
                break;
              }
            } else {
              break;
            }
          }

          if (overlapSentences.length > 0 && accumulatedOverlap > 0) {
            const overlapPrefix = overlapSentences.join(' ');
            result.push({
              ...current,
              overlapPrefix,
              overlapTokens: accumulatedOverlap,
            });
            continue;
          }
        }
      }

      result.push(current);
    }

    return result;
  }

  /**
   * Materializes final DocumentChunk entities with complete provenance, checksums, and deterministic IDs.
   */
  private materializeChunks(
    drafts: Array<ChunkDraft & { overlapPrefix?: string; overlapTokens?: number }>,
    document: NormalizedDocument,
    config: ChunkingConfig,
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];

    for (let seq = 0; seq < drafts.length; seq++) {
      const draft = drafts[seq];
      if (!draft) continue;

      // Compose chunk content
      const delimiter = draft.isParagraphSplit ? ' ' : '\n\n';
      let content = draft.textParts.join(delimiter).trim();

      // If intra-section overlap prefix exists, prepend cleanly if headroom allows
      if (draft.overlapPrefix && draft.overlapPrefix.length > 0) {
        const potentialContent = `${draft.overlapPrefix}\n\n${content}`.trim();
        const potentialTokens = this.tokenizer.countTokens(potentialContent);
        if (potentialTokens <= config.maximumChunkTokens) {
          content = potentialContent;
        }
      }

      // Compute final exact token count using tokenizer
      const tokenCount = this.tokenizer.countTokens(content);

      // Determine chunk language from contributing blocks or fall back to document language
      const language = this.determineChunkLanguage(draft.blocks, document);

      // Determine source block IDs
      const sourceBlockIds = Array.from(new Set(draft.blocks.map((b) => b.sourceBlockId)));

      // Determine effective section hierarchy
      let effectiveSectionHierarchy = draft.sectionPath;
      if (effectiveSectionHierarchy.length === 0) {
        const blockWithPath = draft.blocks.find((b) => b.sectionPath.length > 0);
        if (blockWithPath) {
          effectiveSectionHierarchy = blockWithPath.sectionPath;
        } else {
          const headingBlock = draft.blocks.find(
            (b) => b.type === ExtractedBlockType.HEADING && b.text.trim().length > 0,
          );
          if (headingBlock) {
            effectiveSectionHierarchy = [headingBlock.text.trim()];
          } else if (document.title && document.title.trim().length > 0) {
            effectiveSectionHierarchy = [document.title.trim()];
          }
        }
      }

      // Provenance calculation
      const checksum = createHash('sha256').update(content, 'utf8').digest('hex');

      // Calculate start and end offsets if present
      let startOffset: number | null = null;
      let endOffset: number | null = null;
      let startLine: number | null = null;
      let endLine: number | null = null;

      for (const b of draft.blocks) {
        if (b.location) {
          if (b.location.startOffset !== null) {
            startOffset =
              startOffset === null
                ? b.location.startOffset
                : Math.min(startOffset, b.location.startOffset);
          }
          if (b.location.endOffset !== null) {
            endOffset =
              endOffset === null ? b.location.endOffset : Math.max(endOffset, b.location.endOffset);
          }
          if (b.location.startLine !== null) {
            startLine =
              startLine === null ? b.location.startLine : Math.min(startLine, b.location.startLine);
          }
          if (b.location.endLine !== null) {
            endLine = endLine === null ? b.location.endLine : Math.max(endLine, b.location.endLine);
          }
        }
      }

      const provenance = ChunkProvenance.create({
        documentId: document.documentId,
        documentVersionId: document.documentVersionId,
        chunkIndex: seq,
        pageNumber: draft.primaryPage,
        sectionHierarchy: effectiveSectionHierarchy,
        sourceBlockIds,
        startOffset,
        endOffset,
        startLine,
        endLine,
        language,
        checksum,
        configurationVersion: config.version,
      });

      // Deterministic RFC 4122 UUID Chunk ID
      const chunkId = ChunkId.createDeterministic(
        document.documentId,
        document.documentVersionId,
        seq,
        content,
        config.version,
      );

      // Metadata enrichment
      const blockTypes = Array.from(new Set(draft.blocks.map((b) => b.type)));
      const sectionBreadcrumb = draft.sectionPath.length > 0 ? draft.sectionPath.join(' > ') : null;

      const metadata: Record<string, unknown> = {
        strategy: config.strategy,
        blockTypes,
        sectionBreadcrumb,
        hasOverlap: !!draft.overlapPrefix,
        overlapTokens: draft.overlapTokens ?? 0,
        isTableSplit: !!draft.isTableSplit,
        isCodeSplit: !!draft.isCodeSplit,
        pageRange: draft.pageRange,
      };

      const chunk = DocumentChunk.create({
        id: chunkId,
        documentId: document.documentId,
        documentVersionId: document.documentVersionId,
        sequence: seq,
        content,
        tokenCount: Math.max(1, tokenCount),
        language,
        provenance,
        metadata,
      });

      chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * Resolves language for the chunk based on contributing blocks and document defaults.
   */
  private determineChunkLanguage(blocks: NormalizedBlock[], document: NormalizedDocument): string {
    for (const b of blocks) {
      if (b.detectedLanguage && b.detectedLanguage.language !== 'unknown') {
        return b.detectedLanguage.language;
      }
    }
    return document.documentLanguage.language;
  }
}
