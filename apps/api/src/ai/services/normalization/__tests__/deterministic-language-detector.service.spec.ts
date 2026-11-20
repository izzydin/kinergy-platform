import { ExtractedBlockType } from '@kinergy-platform/core';
import { DeterministicLanguageDetectorService } from '../deterministic-language-detector.service';

describe('DeterministicLanguageDetectorService (Unit & NLP)', () => {
  let detector: DeterministicLanguageDetectorService;

  beforeEach(() => {
    detector = new DeterministicLanguageDetectorService();
  });

  describe('Single Text Fragment Detection', () => {
    it('detects Spanish clinical text with high confidence', () => {
      const spanishText =
        'El paciente presenta sintomatología dolorosa en la región lumbar con limitación funcional para la flexión anterior del tronco y marcha antiálgica.';
      const result = detector.detectLanguage(spanishText);

      expect(result.language).toBe('es');
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      expect(result.isReliable).toBe(true);
      expect(result.isSpanish()).toBe(true);
      expect(result.distribution?.es).toBeGreaterThan(result.distribution?.en ?? 0);
    });

    it('detects English medical text with high confidence', () => {
      const englishText =
        'The patient reports persistent lower back pain exacerbated by prolonged sitting and physical exertion during therapeutic exercises.';
      const result = detector.detectLanguage(englishText);

      expect(result.language).toBe('en');
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      expect(result.isReliable).toBe(true);
      expect(result.isEnglish()).toBe(true);
      expect(result.distribution?.en).toBeGreaterThan(result.distribution?.es ?? 0);
    });

    it('detects mixed-language text without arbitrarily forcing single language', () => {
      const mixedText =
        'El paciente fue evaluado con visual analog scale and reports mild tender points upon palpation en la zona paravertebral durante la sesión.';
      const result = detector.detectLanguage(mixedText);

      expect(result.language).toBe('mixed');
      expect(result.isMixed()).toBe(true);
      expect(result.distribution).toBeDefined();
      expect(result.distribution?.es).toBeGreaterThan(0.2);
      expect(result.distribution?.en).toBeGreaterThan(0.2);
    });

    it('classifies short or ambiguous text fragments as undetermined (und)', () => {
      const shortText = 'EVA 4/10';
      const result = detector.detectLanguage(shortText);

      expect(result.language).toBe('und');
      expect(result.confidence).toBe(0.0);
      expect(result.isReliable).toBe(false);
      expect(result.isUndetermined()).toBe(true);
    });

    it('classifies numbers, code-like strings, and punctuation as undetermined (und)', () => {
      const numberText = '19/11/2026 - $45.000 CLP (REF: #98421)';
      const result = detector.detectLanguage(numberText);

      expect(result.language).toBe('und');
      expect(result.isUndetermined()).toBe(true);
    });
  });

  describe('Document-Level Language Detection', () => {
    it('detects document language aggregating multiple blocks while ignoring code fences', () => {
      const blocks = [
        { type: ExtractedBlockType.HEADING, text: 'Guía Clínica de Atención' },
        {
          type: ExtractedBlockType.PARAGRAPH,
          text: 'Esta guía establece las pautas de rehabilitación física para pacientes con artrosis de rodilla.',
        },
        {
          type: ExtractedBlockType.CODE_BLOCK,
          text: 'const painLevel = getVisualAnalogScale(patientId);',
        },
        {
          type: ExtractedBlockType.PARAGRAPH,
          text: 'Se recomienda iniciar con ejercicios isométricos de cuádriceps y movilidad activa asistida.',
        },
      ];

      const result = detector.detectDocumentLanguage(blocks);

      expect(result.language).toBe('es');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      expect(result.isReliable).toBe(true);
    });

    it('returns undetermined for documents containing only synthetic boundaries and code', () => {
      const blocks = [
        { type: ExtractedBlockType.PAGE_BOUNDARY, text: '--- Page 1 ---' },
        { type: ExtractedBlockType.CODE_BLOCK, text: 'SELECT * FROM users;' },
        { type: ExtractedBlockType.DIVIDER, text: '---' },
      ];

      const result = detector.detectDocumentLanguage(blocks);

      expect(result.language).toBe('und');
      expect(result.isUndetermined()).toBe(true);
    });
  });

  describe('Determinism & Safety', () => {
    it('is completely deterministic across repetitive executions', () => {
      const text = 'Evaluación de dolor según escala visual análoga y prueba de Lasègue.';
      const first = detector.detectLanguage(text);

      for (let i = 0; i < 50; i++) {
        const next = detector.detectLanguage(text);
        expect(next.language).toBe(first.language);
        expect(next.confidence).toBe(first.confidence);
      }
    });
  });
});
