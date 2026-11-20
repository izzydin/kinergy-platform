import { DetectedLanguageResult } from '../../domain/value-objects/detected-language.vo';
import { ExtractedBlockType } from '../../domain/enums/extracted-block-type.enum';

export interface LanguageDetectorInputBlock {
  readonly text: string;
  readonly type: ExtractedBlockType;
}

/**
 * Outbound Port defining the contract for deterministic language detection.
 * Inspects document or block content to determine primary language ('es', 'en'),
 * mixed-language distributions ('mixed'), or unclassified content ('und')
 * with associated confidence scores.
 */
export interface ILanguageDetectorPort {
  /**
   * Evaluates a single text fragment and returns language classification with confidence.
   */
  detectLanguage(text: string): DetectedLanguageResult;

  /**
   * Evaluates the collective text across structural blocks to determine document-level language.
   */
  detectDocumentLanguage(blocks: readonly LanguageDetectorInputBlock[]): DetectedLanguageResult;
}
