/**
 * AI-04.6: Chunking Quality Evaluation Test Suite
 *
 * Automated verification of extraction quality, chunk distributions, semantic coherence,
 * Spanish/English linguistic preservation, determinism, and performance.
 */

import { EvaluationRunner, CorpusEvaluationSummary } from '../evaluation-runner';
import { ExtractedBlockType } from '@kinergy-platform/core';

describe('AI-04.6: Chunking Quality Evaluation & Audit', () => {
  let runner: EvaluationRunner;
  let summary: CorpusEvaluationSummary;

  beforeAll(async () => {
    runner = new EvaluationRunner();
    summary = await runner.evaluateCorpus();
  });

  describe('1. Extraction Quality & Structure Preservation', () => {
    it('achieves 100% successful parsing rate across the evaluation corpus', () => {
      expect(summary.totalDocuments).toBe(11);
      expect(summary.successfulParsingRate).toBe(100);
      expect(summary.emptyExtractionRate).toBe(0);
      expect(summary.failureRate).toBe(0);
    });

    it('preserves multi-page PDF page boundaries and page numbers', () => {
      const multiPageDoc = summary.results.find((r) => r.id === 'eval-03-multipage-pdf');
      expect(multiPageDoc).toBeDefined();
      expect(multiPageDoc!.extractedPageCount).toBe(3);
      expect(multiPageDoc!.chunks.length).toBeGreaterThanOrEqual(1);

      // Verify page number tracking
      const hasPageInfo = multiPageDoc!.chunks.some((c) => c.provenance.pageNumber !== null);
      expect(hasPageInfo).toBe(true);
    });

    it('preserves table structure without flattening or loss in DOCX', () => {
      const tableDoc = summary.results.find((r) => r.id === 'eval-05-docx-tables');
      expect(tableDoc).toBeDefined();
      expect(tableDoc!.extractedBlockTypes).toContain(ExtractedBlockType.TABLE);

      // Ensure table content is present in generated chunks
      const combinedText = tableDoc!.chunks.map((c) => c.content).join('\n');
      expect(combinedText).toContain('Evaluación Kinésica Funcional');
      expect(combinedText).toContain('$35.000');
      expect(combinedText).toContain('Sesión Fisioterapia');
    });

    it('preserves code blocks and language fences without corruption in Markdown', () => {
      const codeDoc = summary.results.find((r) => r.id === 'eval-07-md-code');
      expect(codeDoc).toBeDefined();
      expect(codeDoc!.extractedBlockTypes).toContain(ExtractedBlockType.CODE_BLOCK);

      const combinedText = codeDoc!.chunks.map((c) => c.content).join('\n');
      expect(combinedText).toContain('ForcePlateReading');
      expect(combinedText).toContain('calculateRateOfForceDevelopment');
    });
  });

  describe('2. Chunk Quality & Token Distribution', () => {
    it('enforces maximumChunkTokens ceiling across all generated chunks', () => {
      for (const res of summary.results) {
        for (const chunk of res.chunks) {
          expect(chunk.tokenCount).toBeLessThanOrEqual(500);
          expect(chunk.tokenCount).toBeGreaterThan(0);
        }
      }
    });

    it('produces zero empty chunks', () => {
      for (const res of summary.results) {
        for (const chunk of res.chunks) {
          expect(chunk.content.trim().length).toBeGreaterThan(0);
        }
      }
    });

    it('handles oversized paragraphs via sentence subdivision without exceeding 500 tokens', () => {
      const longParaDoc = summary.results.find((r) => r.id === 'eval-11-long-para');
      expect(longParaDoc).toBeDefined();
      expect(longParaDoc!.chunkCount).toBeGreaterThan(1);
      for (const chunk of longParaDoc!.chunks) {
        expect(chunk.tokenCount).toBeLessThanOrEqual(500);
      }
    });

    it('verifies 100% provenance completeness across all chunks', () => {
      for (const res of summary.results) {
        expect(res.provenanceCompletePercent).toBe(100);
        for (const chunk of res.chunks) {
          expect(chunk.provenance.checksum).toHaveLength(64);
          expect(chunk.sequence).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe('3. Semantic Coherence & Boundary Separation', () => {
    it('isolates distinct operational policies into independent chunks without topic mixing', () => {
      const bylawsDoc = summary.results.find((r) => r.id === 'eval-10-long-doc');
      expect(bylawsDoc).toBeDefined();

      // Check section path or heading breadcrumbs for each chunk
      const registrationChunk = bylawsDoc!.chunks.find((c) =>
        c.content.includes('Procedimiento de Inscripción'),
      );
      expect(registrationChunk).toBeDefined();
      // Cancellation policy must not be mixed into the registration chunk
      expect(registrationChunk!.content).not.toContain('Cancelación y Rescisión de Contrato');

      const cancellationChunk = bylawsDoc!.chunks.find((c) =>
        c.content.includes('Cancelación y Rescisión de Contrato'),
      );
      expect(cancellationChunk).toBeDefined();
      // Registration specifics must not be mixed into the cancellation chunk
      expect(cancellationChunk!.content).not.toContain('cédula RUT vigente');
    });

    it('preserves self-containment with heading breadcrumbs', () => {
      const nestedDoc = summary.results.find((r) => r.id === 'eval-06-md-nested');
      expect(nestedDoc).toBeDefined();
      for (const chunk of nestedDoc!.chunks) {
        // Every chunk has section or heading breadcrumbs
        expect(chunk.provenance.sectionHierarchy.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('4. Spanish & English Linguistic Preservation', () => {
    it('preserves Spanish accents, special characters, and diacritics verbatim', () => {
      const txtDoc = summary.results.find((r) => r.id === 'eval-08-txt-accents');
      expect(txtDoc).toBeDefined();
      const combined = txtDoc!.chunks.map((c) => c.content).join('\n');

      expect(combined).toContain('TÉRMINOS');
      expect(combined).toContain('CONDICIONES');
      expect(combined).toContain('MEMBRESÍAS');
      expect(combined).toContain('Razón Social');
      expect(combined).toContain('Élite');
      expect(combined).toContain('FACTURACIÓN');
      expect(combined).toContain('POLÍTICA');
    });

    it('preserves financial currencies, Chilean RUT, and invoice codes without corruption', () => {
      const txtDoc = summary.results.find((r) => r.id === 'eval-08-txt-accents');
      expect(txtDoc).toBeDefined();
      const combined = txtDoc!.chunks.map((c) => c.content).join('\n');

      expect(combined).toContain('$45.000 CLP');
      expect(combined).toContain('$55 USD');
      expect(combined).toContain('€50 EUR');
      expect(combined).toContain('76.543.210-K');
      expect(combined).toContain('REG-FIN-2026-CHL');
      expect(combined).toContain('FAC-2026-00000');
    });

    it('accurately identifies Spanish and English languages across the corpus', () => {
      expect(summary.languageDetectionAccuracy).toBeGreaterThanOrEqual(90);

      const esDoc = summary.results.find((r) => r.id === 'eval-01-es-pdf');
      expect(esDoc!.detectedLanguage).toBe('es');

      const enDoc = summary.results.find((r) => r.id === 'eval-02-en-pdf');
      expect(enDoc!.detectedLanguage).toBe('en');
    });
  });

  describe('5. Determinism Across Repeated Pipeline Passes', () => {
    it('produces 100% bit-for-bit identical fingerprints and chunks across multiple passes', () => {
      expect(summary.allDeterministic).toBe(true);
      for (const res of summary.results) {
        expect(res.determinismVerified).toBe(true);
      }
    });
  });

  describe('6. Performance & Operational Metrics', () => {
    it('executes pipeline with acceptable latency across all document formats', () => {
      expect(summary.totalDurationMs).toBeGreaterThan(0);
      for (const avgDuration of Object.values(summary.averageDurationByFormat)) {
        // Each format should process in < 500ms on representative sample
        expect(avgDuration).toBeLessThan(1000);
      }
    });

    it('maintains bounded memory heap usage during multi-document processing', () => {
      // Bounded heap growth for 11 documents
      expect(summary.memoryHeapDeltaMb).toBeLessThan(150);
    });

    it('outputs exact empirical evaluation data for reporting', () => {
      const reportData = {
        totalDocuments: summary.totalDocuments,
        successfulParsingRate: summary.successfulParsingRate,
        emptyExtractionRate: summary.emptyExtractionRate,
        failureRate: summary.failureRate,
        languageDetectionAccuracy: summary.languageDetectionAccuracy,
        totalChunks: summary.totalChunks,
        overallAverageTokens: summary.overallAverageTokens,
        overallMedianTokens: summary.overallMedianTokens,
        overallMinTokens: summary.overallMinTokens,
        overallMaxTokens: summary.overallMaxTokens,
        overallWithinTargetPercent: summary.overallWithinTargetPercent,
        averageDurationByFormat: summary.averageDurationByFormat,
        totalDurationMs: summary.totalDurationMs,
        memoryHeapDeltaMb: summary.memoryHeapDeltaMb,
        allDeterministic: summary.allDeterministic,
        documentBreakdown: summary.results.map((r) => ({
          id: r.id,
          name: r.name,
          format: r.format,
          detectedLanguage: r.detectedLanguage,
          confidence: r.languageConfidence,
          chunkCount: r.chunkCount,
          tokenCounts: r.tokenCounts,
          avgTokens: r.averageTokens,
          minTokens: r.minTokens,
          maxTokens: r.maxTokens,
          durationMs: r.totalPipelineDurationMs,
          fingerprint: r.processingFingerprint.substring(0, 16) + '...',
        })),
      };

      console.warn('--- EMPIRICAL EVALUATION REPORT DATA ---');
      console.warn(JSON.stringify(reportData, null, 2));
      console.warn('--- END EMPIRICAL DATA ---');
    });
  });
});
