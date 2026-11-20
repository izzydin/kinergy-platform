import {
  DocumentFormat,
  ExtractedBlock,
  ExtractedBlockType,
  ExtractedDocument,
  SourceLocation,
} from '@kinergy-platform/core';
import { DeterministicDocumentNormalizerService } from '../deterministic-document-normalizer.service';

describe('DeterministicDocumentNormalizerService (Unit & Preservation)', () => {
  let normalizer: DeterministicDocumentNormalizerService;

  beforeEach(() => {
    normalizer = new DeterministicDocumentNormalizerService();
  });

  describe('Unicode & Text Cleaning Pipeline', () => {
    it('applies Unicode NFC normalization combining decomposed accents', async () => {
      // 'e\u0301' is decomposed 'é'
      const decomposedText = 'Evaluacio\u0301n kine\u0301sica de la rodilla.';
      const block = ExtractedBlock.create({
        type: ExtractedBlockType.PARAGRAPH,
        text: decomposedText,
        sequence: 0,
      });

      const doc = ExtractedDocument.create({
        documentId: 'doc-unicode',
        documentVersionId: 'ver-1',
        sourceFormat: DocumentFormat.TXT,
        blocks: [block],
      });

      const normalized = await normalizer.normalize(doc);
      const normalizedBlock = normalized.blocks[0];

      expect(normalizedBlock?.text).toBe('Evaluación kinésica de la rodilla.');
      expect(normalizedBlock?.transformationsApplied).toContain('UNICODE_NFC');
    });

    it('normalizes CRLF and CR line endings to LF', async () => {
      const crlfText = 'Línea 1\r\nLínea 2\rLínea 3';
      const block = ExtractedBlock.create({
        type: ExtractedBlockType.PARAGRAPH,
        text: crlfText,
        sequence: 0,
      });

      const doc = ExtractedDocument.create({
        documentId: 'doc-crlf',
        documentVersionId: 'ver-1',
        sourceFormat: DocumentFormat.TXT,
        blocks: [block],
      });

      const normalized = await normalizer.normalize(doc);
      expect(normalized.blocks[0]?.text).toBe('Línea 1\nLínea 2\nLínea 3');
      expect(normalized.blocks[0]?.transformationsApplied).toContain('NORMALIZE_LINE_ENDINGS');
    });

    it('removes non-printable control characters while strictly preserving tabs and newlines', async () => {
      // \x00 (NUL), \x07 (BEL), \x1B (ESC) should be stripped; \t and \n preserved
      const dirtyText = 'Inicio \x00de \x07texto \tcon \x1Bescapes\ny saltos.';
      const block = ExtractedBlock.create({
        type: ExtractedBlockType.PARAGRAPH,
        text: dirtyText,
        sequence: 0,
      });

      const doc = ExtractedDocument.create({
        documentId: 'doc-ctrl',
        documentVersionId: 'ver-1',
        sourceFormat: DocumentFormat.TXT,
        blocks: [block],
      });

      const normalized = await normalizer.normalize(doc);
      expect(normalized.blocks[0]?.text).toBe('Inicio de texto con escapes\ny saltos.');
      expect(normalized.blocks[0]?.transformationsApplied).toContain('STRIP_CONTROL_CHARS');
    });

    it('removes formatting artifacts such as soft hyphens and zero-width spaces', async () => {
      // \u00AD (soft hyphen), \u200B (zero-width space), \uFEFF (BOM)
      const artifactText = 'Trata\u00ADmiento\u200B con\uFEFF láser.';
      const block = ExtractedBlock.create({
        type: ExtractedBlockType.PARAGRAPH,
        text: artifactText,
        sequence: 0,
      });

      const doc = ExtractedDocument.create({
        documentId: 'doc-art',
        documentVersionId: 'ver-1',
        sourceFormat: DocumentFormat.TXT,
        blocks: [block],
      });

      const normalized = await normalizer.normalize(doc);
      expect(normalized.blocks[0]?.text).toBe('Tratamiento con láser.');
      expect(normalized.blocks[0]?.transformationsApplied).toContain('REMOVE_FORMATTING_ARTIFACTS');
    });

    it('unwraps line-break hyphenation while preserving intentional compound terms', async () => {
      const hyphenatedText =
        'El protocolo de rehabi-\nlitación funcional incluye ejercicios pre- y post-quirúrgicos.';
      const block = ExtractedBlock.create({
        type: ExtractedBlockType.PARAGRAPH,
        text: hyphenatedText,
        sequence: 0,
      });

      const doc = ExtractedDocument.create({
        documentId: 'doc-hyph',
        documentVersionId: 'ver-1',
        sourceFormat: DocumentFormat.TXT,
        blocks: [block],
      });

      const normalized = await normalizer.normalize(doc);
      expect(normalized.blocks[0]?.text).toBe(
        'El protocolo de rehabilitación funcional incluye ejercicios pre- y post-quirúrgicos.',
      );
      expect(normalized.blocks[0]?.transformationsApplied).toContain('UNWRAP_HYPHENATION');
    });

    it('collapses excessive horizontal whitespace and cleans repeated blank lines in prose', async () => {
      const messyText = 'Párrafo   con    muchos      espacios.\n\n\n\n\nSiguiente    párrafo.';
      const block = ExtractedBlock.create({
        type: ExtractedBlockType.PARAGRAPH,
        text: messyText,
        sequence: 0,
      });

      const doc = ExtractedDocument.create({
        documentId: 'doc-ws',
        documentVersionId: 'ver-1',
        sourceFormat: DocumentFormat.TXT,
        blocks: [block],
      });

      const normalized = await normalizer.normalize(doc);
      expect(normalized.blocks[0]?.text).toBe('Párrafo con muchos espacios.\n\nSiguiente párrafo.');
      expect(normalized.blocks[0]?.transformationsApplied).toContain('COLLAPSE_WHITESPACE');
    });
  });

  describe('Strict Structural & Business Semantics Preservation', () => {
    it('strictly preserves currency values, numbers, and identifiers without corruption', async () => {
      const businessText =
        'Membresía Plan Black: $45.000 CLP / mes. Matrícula: USD 25.50. Código: SOAP-102. Fecha: 19/11/2026. Límite: -5 °C y 95% de asistencia.';
      const block = ExtractedBlock.create({
        type: ExtractedBlockType.PARAGRAPH,
        text: businessText,
        sequence: 0,
      });

      const doc = ExtractedDocument.create({
        documentId: 'doc-biz',
        documentVersionId: 'ver-1',
        sourceFormat: DocumentFormat.TXT,
        blocks: [block],
      });

      const normalized = await normalizer.normalize(doc);
      const text = normalized.blocks[0]?.text;

      expect(text).toContain('$45.000 CLP');
      expect(text).toContain('USD 25.50');
      expect(text).toContain('SOAP-102');
      expect(text).toContain('19/11/2026');
      expect(text).toContain('-5 °C');
      expect(text).toContain('95%');
    });

    it('strictly preserves code block indentation, syntax, and formatting', async () => {
      const code = `function calculateDose(weight: number): number {\n    const factor = 0.75;\n    return weight * factor;\n}`;
      const block = ExtractedBlock.create({
        type: ExtractedBlockType.CODE_BLOCK,
        text: code,
        sequence: 0,
        codeLanguage: 'typescript',
      });

      const doc = ExtractedDocument.create({
        documentId: 'doc-code',
        documentVersionId: 'ver-1',
        sourceFormat: DocumentFormat.MARKDOWN,
        blocks: [block],
      });

      const normalized = await normalizer.normalize(doc);
      const codeBlock = normalized.blocks[0];

      expect(codeBlock?.type).toBe(ExtractedBlockType.CODE_BLOCK);
      expect(codeBlock?.codeLanguage).toBe('typescript');
      // Indentation must be 100% intact
      expect(codeBlock?.text).toBe(code);
      expect(codeBlock?.transformationsApplied).not.toContain('COLLAPSE_WHITESPACE');
    });

    it('strictly preserves table columns, markdown pipes, and tableMetadata', async () => {
      const tableText = `| Fase | Frecuencia | Intensidad |\n| --- | --- | --- |\n| Aguda | Diaria | Baja |\n| Crónica | 3x/semana | Moderada |`;
      const block = ExtractedBlock.create({
        type: ExtractedBlockType.TABLE,
        text: tableText,
        sequence: 0,
        tableMetadata: { rowCount: 3, colCount: 3, headers: ['Fase', 'Frecuencia', 'Intensidad'] },
      });

      const doc = ExtractedDocument.create({
        documentId: 'doc-tbl',
        documentVersionId: 'ver-1',
        sourceFormat: DocumentFormat.DOCX,
        blocks: [block],
      });

      const normalized = await normalizer.normalize(doc);
      const tableBlock = normalized.blocks[0];

      expect(tableBlock?.type).toBe(ExtractedBlockType.TABLE);
      expect(tableBlock?.tableMetadata?.rowCount).toBe(3);
      expect(tableBlock?.tableMetadata?.colCount).toBe(3);
      expect(tableBlock?.tableMetadata?.headers).toEqual(['Fase', 'Frecuencia', 'Intensidad']);
      expect(tableBlock?.text).toContain('| Fase | Frecuencia | Intensidad |');
    });

    it('strictly preserves heading hierarchy and sectionPath context', async () => {
      const h1 = ExtractedBlock.create({
        type: ExtractedBlockType.HEADING,
        text: 'Protocolo de Lumbalgia',
        sequence: 0,
        headingLevel: 1,
        sectionPath: [],
      });
      const h2 = ExtractedBlock.create({
        type: ExtractedBlockType.HEADING,
        text: '1. Diagnóstico Diferencial',
        sequence: 1,
        headingLevel: 2,
        sectionPath: ['Protocolo de Lumbalgia'],
      });
      const p = ExtractedBlock.create({
        type: ExtractedBlockType.PARAGRAPH,
        text: 'Descartar banderas rojas: síndrome de cauda equina o fracturas vertebrales.',
        sequence: 2,
        sectionPath: ['Protocolo de Lumbalgia', '1. Diagnóstico Diferencial'],
      });

      const doc = ExtractedDocument.create({
        documentId: 'doc-hier',
        documentVersionId: 'ver-1',
        sourceFormat: DocumentFormat.MARKDOWN,
        blocks: [h1, h2, p],
      });

      const normalized = await normalizer.normalize(doc);

      expect(normalized.blocks[0]?.headingLevel).toBe(1);
      expect(normalized.blocks[1]?.headingLevel).toBe(2);
      expect(normalized.blocks[1]?.sectionPath).toEqual(['Protocolo de Lumbalgia']);
      expect(normalized.blocks[2]?.sectionPath).toEqual([
        'Protocolo de Lumbalgia',
        '1. Diagnóstico Diferencial',
      ]);
    });
  });

  describe('Source Traceability & Provenance Mapping', () => {
    it('maps each NormalizedBlock strictly to its originating sourceBlockId and calculates length delta', async () => {
      const blockId = 'orig-block-abc-123';
      const block = ExtractedBlock.create({
        id: blockId,
        type: ExtractedBlockType.PARAGRAPH,
        text: 'Texto    con    espacios   redundantes.',
        sequence: 0,
        location: SourceLocation.create({ pageNumber: 1, startLine: 5, endLine: 5 }),
      });

      const doc = ExtractedDocument.create({
        documentId: 'doc-trace',
        documentVersionId: 'ver-1',
        sourceFormat: DocumentFormat.TXT,
        blocks: [block],
      });

      const normalized = await normalizer.normalize(doc);
      const normalizedBlock = normalized.blocks[0];

      expect(normalizedBlock?.sourceBlockId).toBe(blockId);
      expect(normalizedBlock?.originalLength).toBe(39);
      expect(normalizedBlock?.normalizedLength).toBe(31);
      expect(normalizedBlock?.location?.startLine).toBe(5);
      expect(normalizedBlock?.metadata.sourceBlockCharDelta).toBe(-8);
    });

    it('detects repetitive running headers across multi-page documents as artifacts', async () => {
      const page1Header = ExtractedBlock.create({
        type: ExtractedBlockType.PARAGRAPH,
        text: 'Página 1 de 2',
        sequence: 0,
        pageNumber: 1,
      });
      const page1Body = ExtractedBlock.create({
        type: ExtractedBlockType.PARAGRAPH,
        text: 'Contenido clínico de la primera página del informe.',
        sequence: 1,
        pageNumber: 1,
      });
      const page2Header = ExtractedBlock.create({
        type: ExtractedBlockType.PARAGRAPH,
        text: 'Página 2 de 2',
        sequence: 2,
        pageNumber: 2,
      });
      const page2Body = ExtractedBlock.create({
        type: ExtractedBlockType.PARAGRAPH,
        text: 'Contenido clínico de la segunda página del informe.',
        sequence: 3,
        pageNumber: 2,
      });

      const doc = ExtractedDocument.create({
        documentId: 'doc-header-footer',
        documentVersionId: 'ver-1',
        sourceFormat: DocumentFormat.PDF,
        blocks: [page1Header, page1Body, page2Header, page2Body],
      });

      const normalized = await normalizer.normalize(doc, { cleanHeaderFooterArtifacts: true });

      expect(normalized.blocks[0]?.isHeaderOrFooterArtifact).toBe(true);
      expect(normalized.blocks[1]?.isHeaderOrFooterArtifact).toBe(false);
      expect(normalized.blocks[2]?.isHeaderOrFooterArtifact).toBe(true);
      expect(normalized.blocks[3]?.isHeaderOrFooterArtifact).toBe(false);
      expect(normalized.metadata.headerFooterArtifactsDetected).toBe(2);
    });
  });

  describe('Determinism', () => {
    it('produces 100% byte-for-byte deterministic normalized output across repetitive executions', async () => {
      const blocks = [
        ExtractedBlock.create({
          type: ExtractedBlockType.HEADING,
          text: 'Evaluacio\u0301n   Clínica',
          sequence: 0,
          headingLevel: 1,
        }),
        ExtractedBlock.create({
          type: ExtractedBlockType.PARAGRAPH,
          text: 'Paciente refiere dolor EVA 5/10 tras rehabi-\nlitación motora. Costo: $25.000.',
          sequence: 1,
        }),
      ];

      const doc = ExtractedDocument.create({
        documentId: 'doc-det',
        documentVersionId: 'ver-1',
        sourceFormat: DocumentFormat.TXT,
        blocks,
      });

      const run1 = await normalizer.normalize(doc);
      const run2 = await normalizer.normalize(doc);

      expect(run1.toFullPlainText()).toBe(run2.toFullPlainText());
      expect(run1.documentLanguage.language).toBe(run2.documentLanguage.language);
      expect(run1.metadata.normalizedTotalChars).toBe(run2.metadata.normalizedTotalChars);
      expect(run1.blocks[0]?.text).toBe(run2.blocks[0]?.text);
      expect(run1.blocks[1]?.text).toBe(run2.blocks[1]?.text);
    });
  });
});
