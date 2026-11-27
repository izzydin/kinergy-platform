import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import {
  IRAGContextBuilderPort,
  BuildContextCommand,
  ContextBudgetOptions,
  RAGConstructedContext,
  RAGEvidenceChunk,
  RetrievedChunk,
  ChatMessage,
  ITokenizerPort,
  SuspiciousContentDetector,
  SuspiciousContentSeverity,
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
  private readonly logger = new Logger(RAGContextBuilderService.name);
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
    const normalizedEvidence = this.normalizeAndDeduplicate(command.evidenceChunks, opts);

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
   * Validates, filters, deduplicates, and bounds candidate evidence chunks.
   *
   * Security & Provenance Controls:
   * 1. Rejects empty, whitespace-only, or oversized (>10,000 char) chunks.
   * 2. Enforces non-empty chunkId, documentId, and positive documentVersionNumber.
   * 3. Prevents Cross-Tenant Leakage: drops chunks where metadata.tenantId !== options.tenantId.
   * 4. Enforces RBAC Clearance: drops chunks where metadata.visibilityScope violates options.allowedVisibilityScopes.
   * 5. Enforces Lifecycle Status: drops chunks from QUARANTINED, FAILED, PROCESSING, ARCHIVED, or soft-deleted documents.
   * 6. Prevents Version Contamination: drops superseded versions if a newer version of the same document is present.
   * 7. Context Diversity Bounds: enforces maxSources (distinct documents) and maxChunksPerSource.
   */
  private normalizeAndDeduplicate(
    chunks: readonly (RetrievedChunk | RAGEvidenceChunk)[],
    options?: ContextBudgetOptions,
  ): RAGEvidenceChunk[] {
    const maxSources = options?.maxSources ?? 10;
    const maxChunksPerSource = options?.maxChunksPerSource ?? 10;
    const maxChunkLength = options?.maxChunkContentLength ?? 10000;
    const expectedTenantId = options?.tenantId?.trim();
    const allowedScopes = options?.allowedVisibilityScopes;

    const DISALLOWED_STATUSES = new Set([
      'QUARANTINED',
      'FAILED',
      'PROCESSING',
      'UPLOADED',
      'ARCHIVED',
      'DELETED',
    ]);

    // Pass 1: Hydrate, validate basic types, extract highest version per document
    const validCandidates: {
      raw: RetrievedChunk | RAGEvidenceChunk;
      evidence: RAGEvidenceChunk;
    }[] = [];
    const highestVersionPerDoc = new Map<string, number>();

    for (let i = 0; i < chunks.length; i++) {
      const raw = chunks[i];
      if (!raw) continue;

      if (!raw.content || raw.content.trim().length === 0 || raw.content.length > maxChunkLength) {
        continue;
      }

      const evidence =
        raw instanceof RAGEvidenceChunk ? raw : RAGEvidenceChunk.fromRetrievedChunk(raw, i + 1);

      if (!evidence.content || evidence.content.trim().length === 0) {
        continue;
      }

      if (!evidence.chunkId || evidence.chunkId.trim().length === 0) {
        throw new Error('RAGEvidenceChunk must possess a non-empty chunkId.');
      }

      if (!evidence.documentId || evidence.documentId.trim().length === 0) {
        throw new Error('RAGEvidenceChunk must possess a non-empty documentId.');
      }

      const versionNum = evidence.documentVersionNumber;
      if (typeof versionNum !== 'number' || versionNum < 1 || !Number.isInteger(versionNum)) {
        throw new Error(`RAGEvidenceChunk has invalid documentVersionNumber: ${versionNum}`);
      }

      // Check chunk metadata for security filters (tenant, status, visibility, soft-delete)
      const meta =
        raw instanceof RetrievedChunk
          ? (raw.metadata as Record<string, unknown> | undefined)
          : undefined;

      if (meta) {
        // Tenant check
        const chunkTenant = typeof meta.tenantId === 'string' ? meta.tenantId.trim() : undefined;
        if (expectedTenantId && chunkTenant && chunkTenant !== expectedTenantId) {
          continue;
        }

        // Status check
        const docStatus = typeof meta.status === 'string' ? meta.status.toUpperCase() : undefined;
        if (docStatus && DISALLOWED_STATUSES.has(docStatus)) {
          continue;
        }

        // Soft-delete check
        if (meta.deletedAt !== null && meta.deletedAt !== undefined) {
          continue;
        }

        // Visibility scope check
        const chunkScope =
          typeof meta.visibilityScope === 'string' ? meta.visibilityScope : undefined;
        if (allowedScopes && allowedScopes.length > 0 && chunkScope) {
          if (!allowedScopes.includes(chunkScope)) {
            continue;
          }
        }
      }

      // Security check: Scan for suspicious content / adversarial injection in chunk text
      const shouldFilterSuspicious =
        options?.filterSuspiciousContent ?? expectedTenantId !== undefined;

      if (shouldFilterSuspicious) {
        const scan = SuspiciousContentDetector.scan(evidence.content);
        if (scan.severity === SuspiciousContentSeverity.SUSPICIOUS_HIGH) {
          this.logger.warn(
            `[Security Audit] Dropping high-severity suspicious chunk '${evidence.chunkId}' from doc '${evidence.documentId}'. Category: ${scan.category}, Rules: ${scan.matchedRules.join(', ')}`,
          );
          continue;
        } else if (scan.severity === SuspiciousContentSeverity.SUSPICIOUS_LOW) {
          this.logger.log(
            `[Security Audit] Admitting informational chunk '${evidence.chunkId}' with audit. Category: ${scan.category}, Rules: ${scan.matchedRules.join(', ')}`,
          );
        }
      }

      // Track highest version for this document
      const currentHighest = highestVersionPerDoc.get(evidence.documentId) ?? 0;
      if (evidence.documentVersionNumber > currentHighest) {
        highestVersionPerDoc.set(evidence.documentId, evidence.documentVersionNumber);
      }

      validCandidates.push({ raw, evidence });
    }

    // Pass 2: Filter superseded versions, deduplicate, and enforce source diversity bounds
    const seenChunkIds = new Set<string>();
    const admittedSources = new Set<string>();
    const chunksPerSource = new Map<string, number>();
    const normalized: RAGEvidenceChunk[] = [];

    for (const { evidence } of validCandidates) {
      // 1. Prevent Version Contamination: drop superseded versions if a newer version of same doc exists
      const highestVersion = highestVersionPerDoc.get(evidence.documentId) ?? 1;
      if (evidence.documentVersionNumber < highestVersion) {
        continue;
      }

      // 2. Deduplicate exact chunk ID
      if (seenChunkIds.has(evidence.chunkId)) {
        continue;
      }

      // 3. Source diversity bounds: max distinct documents
      if (!admittedSources.has(evidence.documentId)) {
        if (admittedSources.size >= maxSources) {
          continue;
        }
        admittedSources.add(evidence.documentId);
      }

      // 4. Per-source chunk ceiling
      const currentDocChunks = chunksPerSource.get(evidence.documentId) ?? 0;
      if (currentDocChunks >= maxChunksPerSource) {
        continue;
      }

      chunksPerSource.set(evidence.documentId, currentDocChunks + 1);
      seenChunkIds.add(evidence.chunkId);
      normalized.push(evidence);
    }

    return normalized;
  }

  /**
   * Formats an individual chunk into untrusted XML format with comprehensive metadata attributes.
   * Sanitizes potential prompt-injection breakout closing tags, truncates oversized metadata,
   * and validates chunk provenance.
   */
  private formatChunkXml(chunk: RAGEvidenceChunk, escapeDelimiters = true): string {
    if (!chunk.chunkId || chunk.chunkId.trim().length === 0) {
      throw new Error('RAGEvidenceChunk must possess a non-empty chunkId.');
    }
    if (!chunk.documentId || chunk.documentId.trim().length === 0) {
      throw new Error('RAGEvidenceChunk must possess a non-empty documentId.');
    }

    let sanitizedContent = chunk.content;

    if (escapeDelimiters) {
      sanitizedContent = this.escapeUntrustedContent(sanitizedContent);
    }

    // Sanitize and cap document title (max 255 chars)
    const rawTitle = chunk.documentTitle || 'Untitled Document';
    const cleanTitle = rawTitle.length > 255 ? `${rawTitle.slice(0, 252)}...` : rawTitle;

    const attrs: string[] = [
      `id="${this.escapeAttribute(chunk.chunkId)}"`,
      `document_id="${this.escapeAttribute(chunk.documentId)}"`,
      `title="${this.escapeAttribute(cleanTitle)}"`,
      `version="${chunk.documentVersionNumber ?? 1}"`,
    ];

    if (
      chunk.pageNumber !== undefined &&
      chunk.pageNumber !== null &&
      Number.isInteger(chunk.pageNumber) &&
      chunk.pageNumber > 0
    ) {
      attrs.push(`page="${chunk.pageNumber}"`);
    }

    const sections =
      chunk.sectionHierarchy && chunk.sectionHierarchy.length > 0
        ? chunk.sectionHierarchy
        : chunk.headingPath && chunk.headingPath.length > 0
          ? chunk.headingPath
          : undefined;

    if (sections) {
      // Bound section hierarchy: max 5 levels, max 100 chars per item, max 300 chars total
      const cleanSections = sections
        .slice(0, 5)
        .map((s) => (s.length > 100 ? `${s.slice(0, 97)}...` : s))
        .join(' > ');
      const boundedSection =
        cleanSections.length > 300 ? `${cleanSections.slice(0, 297)}...` : cleanSections;
      attrs.push(`section="${this.escapeAttribute(boundedSection)}"`);
    }

    return `  <evidence_chunk ${attrs.join(' ')}>\n${sanitizedContent}\n  </evidence_chunk>`;
  }

  /**
   * Neutralizes prompt-injection tag breakouts inside untrusted document chunks.
   * Encodes XML delimiters to prevent breaking out of <evidence_chunk> boundaries.
   */
  private escapeUntrustedContent(content: string): string {
    if (!content) return '';
    return content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * Escapes attribute values, neutralizing quotes, angle brackets, and newline injection.
   */
  private escapeAttribute(value: string): string {
    if (!value) return '';
    return (
      value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/[\r\n\t]/g, ' ')
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x1F\x7F]/g, '')
    );
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
