import { Injectable } from '@nestjs/common';
import {
  ILanguageDetectorPort,
  LanguageDetectorInputBlock,
  DetectedLanguageResult,
  ExtractedBlockType,
} from '@kinergy-platform/core';

// Top 90 high-frequency functional stopwords and common terms in Spanish
const SPANISH_STOPWORDS = new Set([
  'de',
  'la',
  'que',
  'el',
  'en',
  'y',
  'a',
  'los',
  'del',
  'se',
  'las',
  'por',
  'un',
  'para',
  'con',
  'no',
  'una',
  'su',
  'al',
  'lo',
  'como',
  'mas',
  'más',
  'pero',
  'sus',
  'le',
  'ya',
  'o',
  'este',
  'si',
  'sí',
  'porque',
  'esta',
  'entre',
  'cuando',
  'muy',
  'sin',
  'sobre',
  'también',
  'tambien',
  'me',
  'hasta',
  'hay',
  'donde',
  'quien',
  'desde',
  'todo',
  'nos',
  'durante',
  'todos',
  'uno',
  'les',
  'ni',
  'contra',
  'otros',
  'ese',
  'eso',
  'ante',
  'ellos',
  'e',
  'esto',
  'mi',
  'mí',
  'antes',
  'algunos',
  'que',
  'qué',
  'unos',
  'yo',
  'otro',
  'otras',
  'otra',
  'el',
  'él',
  'tanto',
  'esa',
  'estos',
  'mucho',
  'quienes',
  'nada',
  'muchos',
  'cual',
  'sea',
  'poco',
  'ella',
  'estar',
  'haber',
  'paciente',
  'clinico',
  'clínico',
  'sesion',
  'sesión',
  'dolor',
  'escala',
  'evaluado',
  'evaluación',
  'zona',
  'ejercicio',
  'tratamiento',
]);

// Top 90 high-frequency functional stopwords and common terms in English
const ENGLISH_STOPWORDS = new Set([
  'the',
  'be',
  'to',
  'of',
  'and',
  'a',
  'in',
  'that',
  'have',
  'i',
  'it',
  'for',
  'not',
  'on',
  'with',
  'he',
  'as',
  'you',
  'do',
  'at',
  'this',
  'but',
  'his',
  'by',
  'from',
  'they',
  'we',
  'say',
  'her',
  'she',
  'or',
  'an',
  'will',
  'my',
  'one',
  'all',
  'would',
  'there',
  'their',
  'what',
  'so',
  'up',
  'out',
  'if',
  'about',
  'who',
  'get',
  'which',
  'go',
  'me',
  'when',
  'make',
  'can',
  'like',
  'time',
  'no',
  'just',
  'him',
  'know',
  'take',
  'people',
  'into',
  'year',
  'your',
  'good',
  'some',
  'could',
  'them',
  'see',
  'other',
  'than',
  'then',
  'now',
  'look',
  'only',
  'come',
  'its',
  'over',
  'think',
  'also',
  'back',
  'after',
  'use',
  'two',
  'how',
  'our',
  'work',
  'first',
  'well',
  'way',
  'even',
  'new',
  'want',
  'because',
  'any',
  'these',
  'give',
  'day',
  'most',
  'us',
  'pain',
  'scale',
  'score',
  'tender',
  'points',
  'upon',
  'palpation',
  'mild',
  'severe',
  'acute',
  'chronic',
  'report',
  'reports',
  'test',
  'exercise',
  'level',
  'assessment',
]);

const SPANISH_CHARACTER_REGEX = /[áéíóúüñ¿¡ÁÉÍÓÚÜÑ]/g;
const SPANISH_SUFFIXES = /(ción|sión|mente|ando|iendo|aron|ieron|amos|emos|ados|adas|idos|idas)$/i;
const ENGLISH_SUFFIXES = /(tion|sion|ment|ing|ed|ly|ness|able|ible|ized|ised|ward|wards)$/i;
const ENGLISH_CONTRACTIONS =
  /\b(don't|can't|it's|won't|i'm|they're|we're|you're|didn't|doesn't|haven't|hasn't)\b/i;

@Injectable()
export class DeterministicLanguageDetectorService implements ILanguageDetectorPort {
  /**
   * Evaluates a single text fragment and returns language classification with confidence.
   */
  public detectLanguage(text: string): DetectedLanguageResult {
    const cleanText = text.trim();
    if (cleanText.length < 15) {
      return DetectedLanguageResult.undetermined(cleanText.length);
    }

    // Extract word tokens (excluding numbers, currency, and punctuation)
    const rawTokens = cleanText
      .toLowerCase()
      .replace(/[0-9.,;:!?¡¿()[\]{}"'\\/_\-–—]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);

    if (rawTokens.length < 3) {
      return DetectedLanguageResult.undetermined(cleanText.length);
    }

    let spanishScore = 0;
    let englishScore = 0;

    // 1. Accented characters / distinctive Spanish orthography
    const spanishCharMatches = cleanText.match(SPANISH_CHARACTER_REGEX);
    if (spanishCharMatches) {
      spanishScore += spanishCharMatches.length * 3;
    }

    // 2. English contractions
    if (ENGLISH_CONTRACTIONS.test(cleanText)) {
      englishScore += 5;
    }

    // 3. Stopword evaluation
    for (const token of rawTokens) {
      const isSpanish = SPANISH_STOPWORDS.has(token);
      const isEnglish = ENGLISH_STOPWORDS.has(token);

      if (isSpanish && !isEnglish) {
        spanishScore += 2;
      } else if (isEnglish && !isSpanish) {
        englishScore += 2;
      } else if (isSpanish && isEnglish) {
        // Shared ambiguous functional words (e.g. 'no', 'me')
        spanishScore += 0.5;
        englishScore += 0.5;
      }

      // Suffix morphological hints
      if (SPANISH_SUFFIXES.test(token)) {
        spanishScore += 1;
      }
      if (ENGLISH_SUFFIXES.test(token)) {
        englishScore += 1;
      }
    }

    const totalScore = spanishScore + englishScore;
    if (totalScore < 3) {
      return DetectedLanguageResult.undetermined(cleanText.length);
    }

    const spanishRatio = spanishScore / totalScore;
    const englishRatio = englishScore / totalScore;

    // Check for mixed language (both languages significantly represented)
    if (
      ((spanishRatio >= 0.3 && englishRatio >= 0.3) ||
        (spanishScore >= 4 && englishScore >= 4 && spanishRatio >= 0.25 && englishRatio >= 0.25)) &&
      rawTokens.length >= 8
    ) {
      return DetectedLanguageResult.mixed(
        0.8,
        { es: Number(spanishRatio.toFixed(2)), en: Number(englishRatio.toFixed(2)) },
        cleanText.length,
      );
    }

    if (spanishScore > englishScore) {
      const confidence = Math.min(0.99, Math.max(0.65, Number(spanishRatio.toFixed(2))));
      return DetectedLanguageResult.create({
        language: 'es',
        confidence,
        isReliable: confidence >= 0.75,
        sampleCharCount: cleanText.length,
        distribution: {
          es: Number(spanishRatio.toFixed(2)),
          en: Number(englishRatio.toFixed(2)),
        },
      });
    } else {
      const confidence = Math.min(0.99, Math.max(0.65, Number(englishRatio.toFixed(2))));
      return DetectedLanguageResult.create({
        language: 'en',
        confidence,
        isReliable: confidence >= 0.75,
        sampleCharCount: cleanText.length,
        distribution: {
          es: Number(spanishRatio.toFixed(2)),
          en: Number(englishRatio.toFixed(2)),
        },
      });
    }
  }

  /**
   * Evaluates collective text across structural blocks to determine document-level language.
   */
  public detectDocumentLanguage(
    blocks: readonly LanguageDetectorInputBlock[],
  ): DetectedLanguageResult {
    // Filter out code blocks and synthetic boundaries from language detection
    const validBlocks = blocks.filter(
      (b) =>
        b.type !== ExtractedBlockType.CODE_BLOCK &&
        b.type !== ExtractedBlockType.PAGE_BOUNDARY &&
        b.type !== ExtractedBlockType.DIVIDER &&
        b.text.trim().length > 0,
    );

    if (validBlocks.length === 0) {
      return DetectedLanguageResult.undetermined(0);
    }

    // Aggregate text across up to first 25 representative blocks
    const sampleText = validBlocks
      .slice(0, 25)
      .map((b) => b.text)
      .join('\n');

    return this.detectLanguage(sampleText);
  }
}
