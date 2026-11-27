import { Injectable, Logger } from '@nestjs/common';
import {
  ICitationValidatorPort,
  ValidateCitationsCommand,
  CitationValidationResult,
  RAGSourceCitation,
  RAGEvidenceChunk,
  ClaimAttribution,
} from '@kinergy-platform/core';

/**
 * Production implementation of ICitationValidatorPort.
 *
 * Responsibilities:
 * 1. Request-scoped citation validation against authorized included chunks.
 * 2. Rejection of fabricated, cross-request, or budget-excluded chunk IDs.
 * 3. Authoritative metadata resolution: source titles, page numbers, and scores
 *    are populated strictly from stored evidence, preventing LLM tampering.
 * 4. Claim-level attribution parsing and verification.
 * 5. Groundedness consistency enforcement (never equate valid JSON or citations with groundedness).
 * 6. Explicit abstention detection and conflict preservation.
 */
@Injectable()
export class CitationValidatorService implements ICitationValidatorPort {
  private readonly logger = new Logger(CitationValidatorService.name);

  // Common patterns indicating the model is expressing abstention or lack of verified evidence
  private static readonly ABSTENTION_PATTERNS = [
    /no se encontr[oó]/i,
    /no se dispone de informaci[oó]n/i,
    /no existe informaci[oó]n verificada/i,
    /no hay informaci[oó]n disponible/i,
    /i couldn't find/i,
    /could not find any verified/i,
    /no verified (?:policy|documentation|information)/i,
    /information is not available/i,
  ];

  public validateResponse(command: ValidateCitationsCommand): CitationValidationResult {
    const { query, constructedContext, generationResult } = command;
    const inconsistencies: string[] = [];

    // 1. Build lookup tables for the current request's context boundary
    const includedMap = new Map<string, RAGEvidenceChunk>();
    for (const chunk of constructedContext.includedChunks) {
      includedMap.set(chunk.chunkId, chunk);
    }

    const excludedMap = new Map<string, RAGEvidenceChunk>();
    for (const chunk of constructedContext.excludedChunks) {
      excludedMap.set(chunk.chunkId, chunk);
    }

    // 2. Validate cited chunk IDs
    const verifiedSourcesMap = new Map<string, RAGSourceCitation>();
    const unverifiedChunkIds: string[] = [];

    for (const rawId of generationResult.citedChunkIds) {
      const chunkId = rawId.trim();
      if (!chunkId) continue;

      if (includedMap.has(chunkId)) {
        // Authoritative resolution: ignore any model-suggested title/page/score
        const evidence = includedMap.get(chunkId)!;
        if (!verifiedSourcesMap.has(chunkId)) {
          verifiedSourcesMap.set(chunkId, RAGSourceCitation.fromEvidenceChunk(evidence));
        }
      } else if (excludedMap.has(chunkId)) {
        inconsistencies.push(
          `Citation to unused retrieved chunk '${chunkId}': chunk was retrieved but excluded by context builder due to token budget.`,
        );
        unverifiedChunkIds.push(chunkId);
      } else {
        inconsistencies.push(
          `Fabricated or foreign citation '${chunkId}': identifier does not exist in authorized context for this request.`,
        );
        unverifiedChunkIds.push(chunkId);
      }
    }

    const verifiedCitations = Array.from(verifiedSourcesMap.values());

    // 3. Claim-level attribution parsing (extracts sentences with inline bracket citations e.g. [chk-1])
    const claims = this.parseClaimAttributions(generationResult.answer, includedMap);

    // 4. Groundedness Consistency Evaluation
    let isGrounded = generationResult.grounded;
    let abstentionReason = generationResult.abstentionReason ?? null;
    let adjustedAnswer = generationResult.answer.trim();

    // Check 4A: Missing evidence pool
    if (includedMap.size === 0) {
      if (isGrounded) {
        inconsistencies.push(
          'Model reported grounded: true but authorized evidence pool contained 0 chunks.',
        );
        isGrounded = false;
      }
      abstentionReason = abstentionReason ?? 'INSUFFICIENT_EVIDENCE';
    }

    // Check 4B: Model cited exclusively unverified/hallucinated chunk IDs
    if (unverifiedChunkIds.length > 0 && verifiedCitations.length === 0) {
      inconsistencies.push(
        `Model cited exclusively fabricated/foreign chunk IDs: [${unverifiedChunkIds.join(', ')}].`,
      );
      isGrounded = false;
      abstentionReason = 'FABRICATED_CITATIONS';
    } else if (isGrounded && verifiedCitations.length === 0) {
      // Check 4C: Grounded reported without any verified citations
      inconsistencies.push(
        'Model reported grounded: true but produced zero verified citations against authorized evidence.',
      );
      isGrounded = false;
      abstentionReason = abstentionReason ?? 'UNVERIFIED_EVIDENCE';
    }

    // Check 4D: Abstention text pattern detection
    const hasAbstentionPhrasing = CitationValidatorService.ABSTENTION_PATTERNS.some((pattern) =>
      pattern.test(adjustedAnswer),
    );

    if (hasAbstentionPhrasing) {
      if (isGrounded) {
        this.logger.debug(
          `Detected explicit abstention phrasing in answer. Overriding grounded to false.`,
        );
        isGrounded = false;
      }
      abstentionReason = abstentionReason ?? 'INSUFFICIENT_EVIDENCE';
    }

    // Check 4E: If abstaining, citations must be empty to avoid confusing the user
    const finalVerifiedCitations = isGrounded ? verifiedCitations : [];

    // Check 4F: Enforce max answer length
    if (adjustedAnswer.length > 4000) {
      inconsistencies.push(`Answer length (${adjustedAnswer.length}) exceeds 4,000 characters.`);
      adjustedAnswer = adjustedAnswer.slice(0, 4000);
    }

    // Check 4G: Sanitize dangerous exfiltration vectors (Markdown images and raw HTML img/script tags)
    const exfiltrationImagePattern = /!\[.*?\]\s*\(\s*https?:\/\/[^\s)]+\)/gi;
    const htmlImgPattern = /<img\s+[^>]*src\s*=\s*['"]https?:\/\/[^'"]+['"][^>]*>/gi;
    const htmlScriptPattern = /<\/?script[^>]*>/gi;

    if (
      exfiltrationImagePattern.test(adjustedAnswer) ||
      htmlImgPattern.test(adjustedAnswer) ||
      htmlScriptPattern.test(adjustedAnswer)
    ) {
      inconsistencies.push(
        'Detected potential data exfiltration channel or script tag in model output.',
      );
      adjustedAnswer = adjustedAnswer
        .replace(exfiltrationImagePattern, '[Image Removed: Exfiltration Prevention]')
        .replace(htmlImgPattern, '[Image Removed: Exfiltration Prevention]')
        .replace(htmlScriptPattern, '');
    }

    if (inconsistencies.length > 0) {
      this.logger.warn(
        `Citation validation flagged ${inconsistencies.length} inconsistency(ies) for query "${query.slice(0, 50)}...": ${inconsistencies.join(' | ')}`,
      );
    }

    return CitationValidationResult.create({
      isValid: inconsistencies.length === 0,
      isGrounded,
      verifiedCitations: finalVerifiedCitations,
      unverifiedChunkIds,
      claims,
      adjustedAnswer,
      abstentionReason,
      inconsistencies,
    });
  }

  /**
   * Parses factual claims and inline bracket citations (e.g. "El tratamiento es X [kc-1].")
   * mapping each claim to its verified evidence chunk.
   */
  private parseClaimAttributions(
    answer: string,
    includedMap: Map<string, RAGEvidenceChunk>,
  ): ClaimAttribution[] {
    const claims: ClaimAttribution[] = [];
    if (!answer || answer.trim().length === 0) return claims;

    // Matches statements ending with bracket citation e.g. "... [chk-1]" or "... [chk-1, chk-2]"
    const claimRegex = /([^.!?\n]+(?:\[[^\]]+\])+[.!?]?)/g;
    let match: RegExpExecArray | null;

    while ((match = claimRegex.exec(answer)) !== null) {
      const sentence = match[1]?.trim();
      if (!sentence) continue;

      const bracketMatch = /\[([^\]]+)\]/g;
      let tagMatch: RegExpExecArray | null;

      while ((tagMatch = bracketMatch.exec(sentence)) !== null) {
        const rawIds = tagMatch[1]?.split(/[,;\s]+/) ?? [];
        for (const rawId of rawIds) {
          const chunkId = rawId.trim();
          if (!chunkId) continue;

          const evidence = includedMap.get(chunkId);
          claims.push(
            ClaimAttribution.create({
              claim: sentence.replace(/\[[^\]]+\]/g, '').trim(),
              chunkId,
              isVerified: Boolean(evidence),
              documentTitle: evidence?.documentTitle,
              pageNumber: evidence?.pageNumber,
            }),
          );
        }
      }
    }

    return claims;
  }
}
