import {
  NormalizedDocument,
  NormalizedBlock,
  DocumentFormat,
  ExtractedBlockType,
  DetectedLanguageResult,
  ChunkingConfig,
  EmptyExtractedDocumentException,
  DocumentValidationException,
} from '@kinergy-platform/core';
import { StructureAwareChunkerService } from '../structure-aware-chunker.service';
import { DeterministicBpeTokenizerAdapter } from '../../../adapters/tokenizers/deterministic-bpe-tokenizer.adapter';

describe('StructureAwareChunkerService', () => {
  let chunkerService: StructureAwareChunkerService;
  let tokenizer: DeterministicBpeTokenizerAdapter;

  const docId = 'doc-clinical-001';
  const verId = 'ver-clinical-001-v1';
  const spanishLanguage = DetectedLanguageResult.spanish(0.95, 100);

  beforeEach(() => {
    tokenizer = new DeterministicBpeTokenizerAdapter();
    chunkerService = new StructureAwareChunkerService(tokenizer);
  });

  const createTestBlock = (props: {
    sourceBlockId?: string;
    type?: ExtractedBlockType;
    text: string;
    sequence: number;
    headingLevel?: number | null;
    sectionPath?: string[];
    pageNumber?: number | null;
    detectedLanguage?: DetectedLanguageResult | null;
    codeLanguage?: string | null;
  }): NormalizedBlock => {
    return NormalizedBlock.create({
      sourceBlockId: props.sourceBlockId ?? `block-${props.sequence}`,
      type: props.type ?? ExtractedBlockType.PARAGRAPH,
      text: props.text,
      originalLength: props.text.length,
      sequence: props.sequence,
      headingLevel: props.headingLevel ?? null,
      sectionPath: props.sectionPath ?? [],
      pageNumber: props.pageNumber ?? 1,
      detectedLanguage: props.detectedLanguage ?? null,
      codeLanguage: props.codeLanguage ?? null,
    });
  };

  const createTestDoc = (blocks: NormalizedBlock[], lang = spanishLanguage): NormalizedDocument => {
    return NormalizedDocument.create({
      documentId: docId,
      documentVersionId: verId,
      sourceFormat: DocumentFormat.MARKDOWN,
      title: 'Manual de Procedimientos Kinesiológicos',
      documentLanguage: lang,
      blocks,
    });
  };

  describe('Basic Chunking & Short Documents', () => {
    it('should emit a single chunk for a document well under minimumChunkTokens', () => {
      const blocks = [
        createTestBlock({
          type: ExtractedBlockType.HEADING,
          headingLevel: 1,
          text: '# Introducción a la Fisioterapia',
          sequence: 0,
          sectionPath: ['Introducción'],
        }),
        createTestBlock({
          type: ExtractedBlockType.PARAGRAPH,
          text: 'La fisioterapia busca la rehabilitación integral del movimiento corporal humano.',
          sequence: 1,
          sectionPath: ['Introducción'],
        }),
      ];

      const doc = createTestDoc(blocks);
      const chunks = chunkerService.chunk(doc);

      expect(chunks.length).toBe(1);
      const chunk = chunks[0]!;
      expect(chunk.sequence).toBe(0);
      expect(chunk.documentId).toBe(docId);
      expect(chunk.documentVersionId).toBe(verId);
      expect(chunk.tokenCount).toBeGreaterThan(0);
      expect(chunk.language).toBe('es');
      expect(chunk.provenance.sectionHierarchy).toEqual(['Introducción']);
      expect(chunk.provenance.sourceBlockIds).toEqual(['block-0', 'block-1']);
      expect(chunk.provenance.chunkIndex).toBe(0);
    });

    it('should reject document with zero meaningful text', () => {
      const emptyBlock = NormalizedBlock.create({
        sourceBlockId: 'block-empty',
        type: ExtractedBlockType.PAGE_BOUNDARY,
        text: '',
        originalLength: 0,
        sequence: 0,
      });

      expect(() => {
        // NormalizedDocument invariants reject all-empty blocks directly
        NormalizedDocument.create({
          documentId: docId,
          documentVersionId: verId,
          sourceFormat: DocumentFormat.TXT,
          documentLanguage: spanishLanguage,
          blocks: [emptyBlock],
        });
      }).toThrow(EmptyExtractedDocumentException);
    });

    it('should reject null document input in chunkerService', () => {
      expect(() => chunkerService.chunk(null as unknown as NormalizedDocument)).toThrow(
        DocumentValidationException,
      );
    });
  });

  describe('Section Boundaries & Anti-Bleed Guarantees', () => {
    it('should not merge unrelated top-level sections into a single chunk', () => {
      const blocks = [
        createTestBlock({
          type: ExtractedBlockType.HEADING,
          headingLevel: 1,
          text: '# 1. Protocolo de Admisión',
          sequence: 0,
          sectionPath: ['1. Protocolo de Admisión'],
        }),
        createTestBlock({
          type: ExtractedBlockType.PARAGRAPH,
          text: 'El paciente debe registrar sus antecedentes médicos en la recepción de la clínica.',
          sequence: 1,
          sectionPath: ['1. Protocolo de Admisión'],
        }),
        createTestBlock({
          type: ExtractedBlockType.HEADING,
          headingLevel: 1,
          text: '# 2. Tarifas y Copagos',
          sequence: 2,
          sectionPath: ['2. Tarifas y Copagos'],
        }),
        createTestBlock({
          type: ExtractedBlockType.PARAGRAPH,
          text: 'La consulta kinesiológica particular tiene un valor de $45.000 CLP sujeta a reembolso.',
          sequence: 3,
          sectionPath: ['2. Tarifas y Copagos'],
        }),
      ];

      const doc = createTestDoc(blocks);
      const chunks = chunkerService.chunk(doc);

      expect(chunks.length).toBe(2);
      expect(chunks[0]!.provenance.sectionHierarchy).toEqual(['1. Protocolo de Admisión']);
      expect(chunks[1]!.provenance.sectionHierarchy).toEqual(['2. Tarifas y Copagos']);
      expect(chunks[0]!.content).toContain('Protocolo de Admisión');
      expect(chunks[1]!.content).toContain('Tarifas y Copagos');
    });

    it('should preserve standalone small sections as independent chunks without discarding', () => {
      const blocks = [
        createTestBlock({
          type: ExtractedBlockType.HEADING,
          headingLevel: 1,
          text: '# Política de Cancelación',
          sequence: 0,
          sectionPath: ['Política de Cancelación'],
        }),
        createTestBlock({
          type: ExtractedBlockType.PARAGRAPH,
          text: 'Cancelaciones con menos de 2 horas de aviso tendrán un recargo del 50%.',
          sequence: 1,
          sectionPath: ['Política de Cancelación'],
        }),
      ];

      const doc = createTestDoc(blocks);
      const chunks = chunkerService.chunk(doc);

      expect(chunks.length).toBe(1);
      expect(chunks[0]!.content).toContain('Cancelaciones con menos de 2 horas');
      expect(chunks[0]!.tokenCount).toBeGreaterThan(0);
    });
  });

  describe('Oversized Paragraphs & Sentence Boundary Splitting', () => {
    it('should split an oversized paragraph into sentence-level chunks', () => {
      // Build a paragraph exceeding 500 tokens
      const sentence1 =
        'La artrosis de rodilla es una patología degenerativa del cartílago articular que genera dolor y limitación funcional severa. ';
      const sentence2 =
        'El tratamiento conservador comprende fortalecimiento del cuádriceps, terapia manual y control del peso corporal en forma rigurosa. ';
      const sentence3 =
        'Se recomienda la aplicación de termoterapia superficial antes de los ejercicios para disminuir la rigidez articular en pacientes mayores. ';
      const sentence4 =
        'El control electromiográfico permite evaluar el reclutamiento motor del vasto medial oblicuo durante las sentadillas asistidas. ';

      const longParagraph = (sentence1 + sentence2 + sentence3 + sentence4).repeat(5);

      const block = createTestBlock({
        type: ExtractedBlockType.PARAGRAPH,
        text: longParagraph,
        sequence: 0,
        sectionPath: ['Tratamiento de Gonartrosis'],
      });

      const doc = createTestDoc([block]);
      const config = ChunkingConfig.create({
        targetChunkTokens: 200,
        minimumChunkTokens: 100,
        maximumChunkTokens: 250,
      });

      const chunks = chunkerService.chunk(doc, config);

      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.tokenCount).toBeLessThanOrEqual(config.maximumChunkTokens + 50); // with overlap
        expect(chunk.content.length).toBeGreaterThan(0);
      }
    });

    it('should not split sentences on abbreviations or decimal numbers', () => {
      const text =
        'El Dr. González indicó una dosis de 10.5 mg de antiinflamatorio al paciente Sr. Muñoz. ' +
        'Posteriormente, el Art. 12 del reglamento de kinesiología establece la sesión de control.';

      const block = createTestBlock({
        type: ExtractedBlockType.PARAGRAPH,
        text,
        sequence: 0,
        sectionPath: ['Pautas Médicas'],
      });

      const doc = createTestDoc([block]);
      const chunks = chunkerService.chunk(doc);

      expect(chunks.length).toBe(1);
      expect(chunks[0]!.content).toContain('Dr. González indicó una dosis de 10.5 mg');
      expect(chunks[0]!.content).toContain('Sr. Muñoz');
      expect(chunks[0]!.content).toContain('Art. 12');
    });

    it('should trigger token-level subdivision fallback on a giant sentence without period', () => {
      // Giant sentence with no period that exceeds maximumChunkTokens
      const giantSentence = 'palabra '.repeat(700);

      const block = createTestBlock({
        type: ExtractedBlockType.PARAGRAPH,
        text: giantSentence,
        sequence: 0,
        sectionPath: ['Oración Gigante'],
      });

      const doc = createTestDoc([block]);
      const config = ChunkingConfig.create({
        targetChunkTokens: 150,
        minimumChunkTokens: 100,
        maximumChunkTokens: 200,
        overlapTokens: 20,
      });

      const chunks = chunkerService.chunk(doc, config);

      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.tokenCount).toBeLessThanOrEqual(config.maximumChunkTokens + 30);
      }
    });
  });

  describe('Special Structures: Tables & Code Blocks', () => {
    it('should split an oversized markdown table preserving header row on each sub-chunk', () => {
      const header = '| Sesión | Procedimiento | Observaciones |\n| --- | --- | --- |\n';
      const rows = Array.from(
        { length: 40 },
        (_, i) =>
          `| ${i + 1} | Evaluación articular grado ${i % 4} | Paciente tolera carga progresiva sin dolor articular significativo |`,
      ).join('\n');
      const tableText = header + rows;

      const block = createTestBlock({
        type: ExtractedBlockType.TABLE,
        text: tableText,
        sequence: 0,
        sectionPath: ['Registro Clínico'],
      });

      const doc = createTestDoc([block]);
      const config = ChunkingConfig.create({
        targetChunkTokens: 200,
        minimumChunkTokens: 150,
        maximumChunkTokens: 300,
      });

      const chunks = chunkerService.chunk(doc, config);

      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        // Invariant: Header row must be present in every table chunk
        expect(chunk.content).toContain('| Sesión | Procedimiento | Observaciones |');
        expect(chunk.content).toContain('| --- | --- | --- |');
        expect(chunk.metadata['isTableSplit']).toBe(true);
      }
    });

    it('should split an oversized code block preserving code fences on each sub-chunk', () => {
      const codeLines = Array.from(
        { length: 50 },
        (_, i) => `function calculateRangeOfMotionStep${i}() { return ${i} * 1.5; }`,
      ).join('\n');
      const codeText = '```typescript\n' + codeLines + '\n```';

      const block = createTestBlock({
        type: ExtractedBlockType.CODE_BLOCK,
        text: codeText,
        sequence: 0,
        codeLanguage: 'typescript',
        sectionPath: ['Algoritmos Biomecánicos'],
      });

      const doc = createTestDoc([block]);
      const config = ChunkingConfig.create({
        targetChunkTokens: 200,
        minimumChunkTokens: 150,
        maximumChunkTokens: 300,
      });

      const chunks = chunkerService.chunk(doc, config);

      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.content.startsWith('```typescript')).toBe(true);
        expect(chunk.content.endsWith('```')).toBe(true);
        expect(chunk.metadata['isCodeSplit']).toBe(true);
      }
    });

    it('should keep list items together within size limits', () => {
      const listItems = Array.from({ length: 6 }, (_, i) =>
        createTestBlock({
          type: ExtractedBlockType.LIST_ITEM,
          text: `* Ejercicio ${i + 1}: Realizar 3 series de 10 repeticiones con banda elástica.`,
          sequence: i,
          sectionPath: ['Pauta de Ejercicios'],
        }),
      );

      const doc = createTestDoc(listItems);
      const chunks = chunkerService.chunk(doc);

      expect(chunks.length).toBe(1);
      expect(chunks[0]!.content).toContain('Ejercicio 1');
      expect(chunks[0]!.content).toContain('Ejercicio 6');
      expect(chunks[0]!.metadata['blockTypes'] as string[]).toContain(ExtractedBlockType.LIST_ITEM);
    });
  });

  describe('Deterministic Overlap', () => {
    it('should apply sentence-level overlap between consecutive chunks in the same section', () => {
      const sentences = Array.from(
        { length: 25 },
        (_, i) =>
          `Esta es la oración número ${i + 1} de la evaluación biomecánica con información clínica relevante.`,
      );

      const block = createTestBlock({
        type: ExtractedBlockType.PARAGRAPH,
        text: sentences.join(' '),
        sequence: 0,
        sectionPath: ['Evaluación Biomecánica'],
      });

      const doc = createTestDoc([block]);
      const config = ChunkingConfig.create({
        targetChunkTokens: 150,
        minimumChunkTokens: 100,
        maximumChunkTokens: 200,
        overlapTokens: 40,
      });

      const chunks = chunkerService.chunk(doc, config);

      expect(chunks.length).toBeGreaterThan(1);
      const chunk1 = chunks[0]!;
      const chunk2 = chunks[1]!;

      // Chunk 2 should carry overlap from Chunk 1
      expect(chunk2.metadata['hasOverlap']).toBe(true);
      expect(chunk2.metadata['overlapTokens'] as number).toBeGreaterThan(0);

      // Verify text from chunk 1 is carried over as overlap in chunk 2
      const firstLineChunk2 = chunk2.content.split('\n')[0]!;
      expect(chunk1.content).toContain(firstLineChunk2);
    });
  });

  describe('Bilingual & Mixed-Language Documents', () => {
    it('should preserve block-level detected language in resulting chunks', () => {
      const englishLang = DetectedLanguageResult.english(0.98, 150);

      const blocks = [
        createTestBlock({
          type: ExtractedBlockType.HEADING,
          headingLevel: 1,
          text: '# Clinical Guidelines',
          sequence: 0,
          sectionPath: ['Clinical Guidelines'],
          detectedLanguage: englishLang,
        }),
        createTestBlock({
          type: ExtractedBlockType.PARAGRAPH,
          text: 'Patient shoulder range of motion measured actively at 90 degrees of abduction.',
          sequence: 1,
          sectionPath: ['Clinical Guidelines'],
          detectedLanguage: englishLang,
        }),
      ];

      const doc = createTestDoc(blocks);
      const chunks = chunkerService.chunk(doc);

      expect(chunks.length).toBe(1);
      expect(chunks[0]!.language).toBe('en');
    });
  });

  describe('Quality Guards, Invariants & Determinism', () => {
    it('should produce 100% deterministic chunks across repeated runs', () => {
      const blocks = [
        createTestBlock({
          type: ExtractedBlockType.HEADING,
          headingLevel: 1,
          text: '# Protocolo Post-Quirúrgico de Ligamento Cruzado Anterior',
          sequence: 0,
          sectionPath: ['LCA'],
        }),
        createTestBlock({
          type: ExtractedBlockType.PARAGRAPH,
          text: 'Fase 1 (Semanas 1 a 2): Control del edema articular mediante crioterapia y elevación del miembro afectado.',
          sequence: 1,
          sectionPath: ['LCA'],
        }),
        createTestBlock({
          type: ExtractedBlockType.PARAGRAPH,
          text: 'Fase 2 (Semanas 3 a 6): Ganancia de flexión hasta 120 grados y trabajo de propiocepción estática.',
          sequence: 2,
          sectionPath: ['LCA'],
        }),
      ];

      const doc = createTestDoc(blocks);

      const run1 = chunkerService.chunk(doc);
      const run2 = chunkerService.chunk(doc);

      expect(run1.length).toBe(run2.length);

      for (let i = 0; i < run1.length; i++) {
        const c1 = run1[i]!;
        const c2 = run2[i]!;

        expect(c1.id.value).toBe(c2.id.value);
        expect(c1.content).toBe(c2.content);
        expect(c1.tokenCount).toBe(c2.tokenCount);
        expect(c1.sequence).toBe(c2.sequence);
        expect(c1.provenance.checksum).toBe(c2.provenance.checksum);
      }
    });

    it('should maintain strictly monotonic sequences: 0, 1, 2, ...', () => {
      const blocks = Array.from({ length: 15 }, (_, i) =>
        createTestBlock({
          type: ExtractedBlockType.HEADING,
          headingLevel: 1,
          text: `# Sección ${i + 1}`,
          sequence: i,
          sectionPath: [`Sección ${i + 1}`],
        }),
      );

      const doc = createTestDoc(blocks);
      const chunks = chunkerService.chunk(doc);

      expect(chunks.length).toBe(15);
      chunks.forEach((chunk, index) => {
        expect(chunk.sequence).toBe(index);
        expect(chunk.provenance.chunkIndex).toBe(index);
      });
    });

    it('should track multi-page range in metadata accurately', () => {
      const blocks = [
        createTestBlock({
          type: ExtractedBlockType.PARAGRAPH,
          text: 'Inicio del contenido en la página 2 del informe.',
          sequence: 0,
          pageNumber: 2,
          sectionPath: ['Informe'],
        }),
        createTestBlock({
          type: ExtractedBlockType.PARAGRAPH,
          text: 'Continuación del contenido en la página 3 del informe.',
          sequence: 1,
          pageNumber: 3,
          sectionPath: ['Informe'],
        }),
      ];

      const doc = createTestDoc(blocks);
      const chunks = chunkerService.chunk(doc);

      expect(chunks.length).toBe(1);
      expect(chunks[0]!.provenance.pageNumber).toBe(2);
      expect(chunks[0]!.metadata['pageRange']).toEqual([2, 3]);
    });
  });
});
