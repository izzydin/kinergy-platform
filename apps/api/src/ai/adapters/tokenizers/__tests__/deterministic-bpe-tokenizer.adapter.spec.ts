import { DeterministicBpeTokenizerAdapter } from '../deterministic-bpe-tokenizer.adapter';

describe('DeterministicBpeTokenizerAdapter', () => {
  let tokenizer: DeterministicBpeTokenizerAdapter;

  beforeEach(() => {
    tokenizer = new DeterministicBpeTokenizerAdapter();
  });

  describe('Configuration & Identity', () => {
    it('should expose default model identity, version, and context limit', () => {
      expect(tokenizer.modelName).toBe('bge-m3-calibrated-v1');
      expect(tokenizer.tokenizerVersion).toBe('1.0.0');
      expect(tokenizer.maxContextLimit).toBe(8192);
    });

    it('should accept custom configuration options', () => {
      const custom = new DeterministicBpeTokenizerAdapter({
        modelName: 'custom-roberta-es',
        tokenizerVersion: '2.1.0',
        maxContextLimit: 4096,
      });

      expect(custom.modelName).toBe('custom-roberta-es');
      expect(custom.tokenizerVersion).toBe('2.1.0');
      expect(custom.maxContextLimit).toBe(4096);
    });
  });

  describe('Token Counting', () => {
    it('should return 0 for empty or null-like strings', () => {
      expect(tokenizer.countTokens('')).toBe(0);
      expect(tokenizer.countTokens('   ')).toBe(1); // whitespace segment is 1 token
    });

    it('should count short Spanish and English words accurately', () => {
      const countEs = tokenizer.countTokens('El paciente');
      expect(countEs).toBeGreaterThanOrEqual(2);

      const countEn = tokenizer.countTokens('The patient');
      expect(countEn).toBeGreaterThanOrEqual(2);
    });

    it('should produce subword tokens for long and compound clinical terms', () => {
      const shortWordTokens = tokenizer.countTokens('brazo');
      const longWordTokens = tokenizer.countTokens('musculoesquelético');

      expect(longWordTokens).toBeGreaterThan(shortWordTokens);
      expect(longWordTokens).toBeGreaterThanOrEqual(4);
    });

    it('should handle numbers, currency, and punctuation deterministically', () => {
      const text = 'Sesión $45.000 CLP el día 19/11/2026.';
      const count1 = tokenizer.countTokens(text);
      const count2 = tokenizer.countTokens(text);

      expect(count1).toBe(count2);
      expect(count1).toBeGreaterThan(5);
    });

    it('should be 100% deterministic across multiple invocations', () => {
      const paragraph =
        'La evaluación postural kinesiológica incluye la inspección de la columna vertebral, ' +
        'amplitud de movimiento activo y pasivo, y pruebas musculares específicas.';

      const initialCount = tokenizer.countTokens(paragraph);
      for (let i = 0; i < 10; i++) {
        expect(tokenizer.countTokens(paragraph)).toBe(initialCount);
      }
    });
  });

  describe('Encoding & Decoding', () => {
    it('should encode string into an array of integer token IDs', () => {
      const text = 'Protocolo de rehabilitación';
      const tokenIds = tokenizer.encode(text);

      expect(Array.isArray(tokenIds)).toBe(true);
      expect(tokenIds.length).toBeGreaterThan(0);
      expect(tokenIds.every((id) => Number.isInteger(id) && id > 0)).toBe(true);
    });

    it('should decode token IDs back into the exact original text (round-trip)', () => {
      const text = 'Evaluación articular: hombro derecho doloroso a 90° de abducción.';
      const tokenIds = tokenizer.encode(text);
      const decoded = tokenizer.decode(tokenIds);

      expect(decoded).toBe(text);
    });

    it('should decode empty array as empty string', () => {
      expect(tokenizer.decode([])).toBe('');
    });

    it('should decode unknown token ID as <unk>', () => {
      expect(tokenizer.decode([999999])).toBe('<unk>');
    });
  });

  describe('Truncation', () => {
    it('should return original text if within maxTokens limit', () => {
      const text = 'Texto breve dentro del límite.';
      const maxTokens = 50;

      expect(tokenizer.truncateToMaxTokens(text, maxTokens)).toBe(text);
    });

    it('should truncate text so that its token count does not exceed maxTokens', () => {
      const longText =
        'Este es un documento médico extenso con múltiples cláusulas, contraindicaciones, ' +
        'ejercicios recomendados y pautas terapéuticas para el paciente durante su proceso de recuperación.';

      const maxTokens = 10;
      const truncated = tokenizer.truncateToMaxTokens(longText, maxTokens);

      expect(tokenizer.countTokens(truncated)).toBeLessThanOrEqual(maxTokens);
      expect(longText.startsWith(truncated)).toBe(true);
    });

    it('should return empty string when maxTokens <= 0', () => {
      expect(tokenizer.truncateToMaxTokens('Texto de prueba', 0)).toBe('');
      expect(tokenizer.truncateToMaxTokens('Texto de prueba', -5)).toBe('');
    });
  });
});
