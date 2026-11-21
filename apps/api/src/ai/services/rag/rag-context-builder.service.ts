import { Injectable, Inject, Optional } from '@nestjs/common';
import {
  IRAGContextBuilderPort,
  BuildContextCommand,
  RAGConstructedContext,
  RAGEvidenceChunk,
  RetrievedChunk,
  ChatMessage,
  ITokenizerPort,
} from '@kinergy-platform/core';
import { AI_CONFIG_TOKEN, TOKENIZER_TOKEN } from '../../ai.tokens';
import { AiConfiguration, DEFAULT_AI_CONFIG } from '../../config/ai.config';

/**
 * Production implementation of IRAGContextBuilderPort.
 *
 * Responsibilities:
 * 1. Sanitizes untrusted knowledge chunks with XML boundaries to prevent prompt injection breakouts.
 * 2. Deduplicates chunks by unique chunkId, preserving the highest-ranked instance.
 * 3. Filters out empty or whitespace-only chunks.
 * 4. Preserves ranking order, document boundaries, page numbers, and section hierarchy.
 * 5. Budgets tokens strictly within the model context window.
 * 6. Never silently slices or substring-truncates text (preserving clinical negations like "no realizar carga").
 *    Drops complete lower-ranked chunks when the evidence budget is exceeded.
 */
@Injectable()
export class RAGContextBuilderService implements IRAGContextBuilderPort {
  private readonly config: AiConfiguration;

  constructor(
    @Optional()
    @Inject(TOKENIZER_TOKEN)
    private readonly tokenizer?: ITokenizerPort,
    @Optional()
    @Inject(AI_CONFIG_TOKEN)
    config?: AiConfiguration,
  ) {
    this.config = { ...DEFAULT_AI_CONFIG, ...config };
  }

  public async buildContext(command: BuildContextCommand): Promise<RAGConstructedContext> {
    const opts = command.options ?? {};

    // 1. Resolve token allocation budgets
    const maxTotalTokens = opts.maxTotalContextTokens ?? this.config.chatContextWindow ?? 4096;
    const reservedCompletionTokens =
      opts.reservedCompletionTokens ?? this.config.chatMaxTokens ?? 512;
    const systemPromptTokens = opts.systemPromptEstimatedTokens ?? 450;
    const safetyMarginTokens = opts.safetyMarginTokens ?? 200;
    const maxHistoryTokens = opts.maxHistoryTokens ?? 500;

    // 2. Estimate query tokens
    const queryTokens = this.countTokens(command.query);

    // 3. Process conversation history (budgeted backwards from most recent turn)
    const { historyTokens } = this.budgetConversationHistory(
      command.conversationHistory ?? [],
      maxHistoryTokens,
    );

    // 4. Calculate available token budget for retrieved evidence
    const staticOverhead =
      reservedCompletionTokens +
      systemPromptTokens +
      safetyMarginTokens +
      queryTokens +
      historyTokens;

    const availableEvidenceTokens = Math.max(
      0,
      opts.maxEvidenceTokens !== undefined
        ? Math.min(opts.maxEvidenceTokens, maxTotalTokens - staticOverhead)
        : maxTotalTokens - staticOverhead,
    );

    // 5. Deduplicate and normalize evidence chunks
    const normalizedEvidence = this.normalizeAndDeduplicate(command.evidenceChunks);

    if (normalizedEvidence.length === 0) {
      return RAGConstructedContext.empty(systemPromptTokens + queryTokens, maxTotalTokens);
    }

    // 6. Assemble evidence context within available token budget
    const includedChunks: RAGEvidenceChunk[] = [];
    const excludedChunks: RAGEvidenceChunk[] = [];
    const formattedBlocks: string[] = [];
    let currentEvidenceTokens = this.countTokens('<retrieved_evidence>\n</retrieved_evidence>\n');

    for (const chunk of normalizedEvidence) {
      const formattedBlock = this.formatChunkXml(chunk, opts.escapeUntrustedDelimiters !== false);
      const chunkTokens = this.countTokens(formattedBlock);

      if (currentEvidenceTokens + chunkTokens <= availableEvidenceTokens) {
        includedChunks.push(chunk);
        formattedBlocks.push(formattedBlock);
        currentEvidenceTokens += chunkTokens;
      } else {
        // Complete chunk dropping policy: never truncate mid-text to preserve negations
        excludedChunks.push(chunk);
      }
    }

    const formattedContext =
      formattedBlocks.length > 0
        ? `<retrieved_evidence>\n${formattedBlocks.join('\n')}\n</retrieved_evidence>`
        : '<retrieved_evidence>\n</retrieved_evidence>';

    const totalContextTokens =
      systemPromptTokens + queryTokens + historyTokens + currentEvidenceTokens;
    const budgetRemaining = Math.max(
      0,
      maxTotalTokens - totalContextTokens - reservedCompletionTokens,
    );

    return RAGConstructedContext.create({
      formattedContext,
      includedChunks,
      excludedChunks,
      totalContextTokens,
      evidenceTokens: currentEvidenceTokens,
      historyTokens,
      systemPromptTokens,
      budgetRemaining,
      omittedChunkCount: excludedChunks.length,
    });
  }

  /**
   * Deduplicates candidate chunks by chunkId, preserving the highest-ranked instance.
   * Rejects empty or whitespace-only chunks.
   */
  private normalizeAndDeduplicate(
    chunks: readonly (RetrievedChunk | RAGEvidenceChunk)[],
  ): RAGEvidenceChunk[] {
    const seenChunkIds = new Set<string>();
    const normalized: RAGEvidenceChunk[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const raw = chunks[i];
      if (!raw) continue;

      if (!raw.content || raw.content.trim().length === 0) {
        continue;
      }

      const evidence =
        raw instanceof RAGEvidenceChunk ? raw : RAGEvidenceChunk.fromRetrievedChunk(raw, i + 1);

      if (!evidence.content || evidence.content.trim().length === 0) {
        continue;
      }

      if (seenChunkIds.has(evidence.chunkId)) {
        continue;
      }

      seenChunkIds.add(evidence.chunkId);
      normalized.push(evidence);
    }

    return normalized;
  }

  /**
   * Formats an individual chunk into untrusted XML format with comprehensive metadata attributes.
   * Sanitizes potential prompt-injection breakout closing tags.
   */
  private formatChunkXml(chunk: RAGEvidenceChunk, escapeDelimiters = true): string {
    let sanitizedContent = chunk.content;

    if (escapeDelimiters) {
      sanitizedContent = this.escapeUntrustedContent(sanitizedContent);
    }

    const attrs: string[] = [
      `id="${this.escapeAttribute(chunk.chunkId)}"`,
      `document_id="${this.escapeAttribute(chunk.documentId)}"`,
      `title="${this.escapeAttribute(chunk.documentTitle)}"`,
      `version="${chunk.documentVersionNumber}"`,
    ];

    if (chunk.pageNumber !== undefined && chunk.pageNumber !== null) {
      attrs.push(`page="${chunk.pageNumber}"`);
    }

    if (chunk.sectionHierarchy && chunk.sectionHierarchy.length > 0) {
      attrs.push(`section="${this.escapeAttribute(chunk.sectionHierarchy.join(' > '))}"`);
    } else if (chunk.headingPath && chunk.headingPath.length > 0) {
      attrs.push(`section="${this.escapeAttribute(chunk.headingPath.join(' > '))}"`);
    }

    return `  <evidence_chunk ${attrs.join(' ')}>\n${sanitizedContent}\n  </evidence_chunk>`;
  }

  /**
   * Neutralizes prompt-injection tag breakouts inside untrusted document chunks.
   */
  private escapeUntrustedContent(content: string): string {
    return content
      .replace(/<\/evidence_chunk>/gi, '&lt;/evidence_chunk&gt;')
      .replace(/<evidence_chunk/gi, '&lt;evidence_chunk')
      .replace(/<\/retrieved_evidence>/gi, '&lt;/retrieved_evidence&gt;')
      .replace(/<retrieved_evidence/gi, '&lt;retrieved_evidence')
      .replace(/<system>/gi, '&lt;system&gt;')
      .replace(/<\/system>/gi, '&lt;/system&gt;')
      .replace(/<instruction>/gi, '&lt;instruction&gt;')
      .replace(/<\/instruction>/gi, '&lt;/instruction&gt;');
  }

  private escapeAttribute(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Budgets conversation history turns starting from the most recent.
   */
  private budgetConversationHistory(
    history: readonly ChatMessage[],
    maxHistoryTokens: number,
  ): { historyTokens: number; includedMessages: ChatMessage[] } {
    let historyTokens = 0;
    const includedMessages: ChatMessage[] = [];

    // Traverse in reverse (most recent turns take precedence)
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      if (!msg) continue;
      const tokens = this.countTokens(`${msg.role}: ${msg.content}\n`);
      if (historyTokens + tokens <= maxHistoryTokens) {
        includedMessages.unshift(msg);
        historyTokens += tokens;
      } else {
        break;
      }
    }

    return { historyTokens, includedMessages };
  }

  /**
   * Deterministic token counter. Uses injected ITokenizerPort if present;
   * otherwise uses a calibrated conservative multiplier for Spanish/English texts.
   */
  public countTokens(text: string): number {
    if (!text || text.length === 0) return 0;
    if (this.tokenizer) {
      return this.tokenizer.countTokens(text);
    }
    // Conservative fallback estimation: ~1.4 tokens per word plus whitespace/punctuation overhead
    const words = text.trim().split(/\s+/).length;
    return Math.ceil(words * 1.4) + Math.ceil(text.length / 50);
  }
}
