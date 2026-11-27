export enum SuspiciousContentCategory {
  SYSTEM_OVERRIDE = 'SYSTEM_OVERRIDE',
  PROMPT_EXTRACTION = 'PROMPT_EXTRACTION',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  PRIVILEGED_ACTION = 'PRIVILEGED_ACTION',
  IDENTITY_HIJACK = 'IDENTITY_HIJACK',
  ENCODED_PAYLOAD = 'ENCODED_PAYLOAD',
  DATA_EXFILTRATION = 'DATA_EXFILTRATION',
  CITATION_FORGERY = 'CITATION_FORGERY',
}

export enum SuspiciousContentSeverity {
  BENIGN = 'BENIGN',
  SUSPICIOUS_LOW = 'SUSPICIOUS_LOW',
  SUSPICIOUS_HIGH = 'SUSPICIOUS_HIGH',
}

export enum SuspiciousContentAction {
  ADMIT = 'ADMIT',
  ADMIT_WITH_AUDIT = 'ADMIT_WITH_AUDIT',
  DROP_CHUNK = 'DROP_CHUNK',
}

export interface SuspiciousContentScanResult {
  readonly isSuspicious: boolean;
  readonly severity: SuspiciousContentSeverity;
  readonly recommendedAction: SuspiciousContentAction;
  readonly matchedRules: readonly string[];
  readonly category?: SuspiciousContentCategory;
}

interface HeuristicRule {
  readonly id: string;
  readonly category: SuspiciousContentCategory;
  readonly severity: SuspiciousContentSeverity;
  readonly pattern: RegExp;
}

/**
 * Deterministic Heuristic Engine for detecting suspicious instructions,
 * prompt overrides, and adversarial payloads embedded in retrieved documents.
 *
 * Design Guarantees:
 * 1. 100% deterministic in-memory evaluation (zero LLM calls, zero network latency).
 * 2. High precision: Distinguishes legitimate clinical/human procedures from AI-directed exploits.
 * 3. Never mutates document text (no unsafe content rewriting).
 * 4. High-severity threats recommend DROP_CHUNK; informational/academic mentions recommend ADMIT_WITH_AUDIT.
 */
export class SuspiciousContentDetector {
  private static readonly RULES: readonly HeuristicRule[] = [
    // 1. Direct System Override / Jailbreak
    {
      id: 'SO-01',
      category: SuspiciousContentCategory.SYSTEM_OVERRIDE,
      severity: SuspiciousContentSeverity.SUSPICIOUS_HIGH,
      pattern:
        /\b(?:ignore|disregard|forget|bypass)\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|rules|directives|prompts)\b/i,
    },
    {
      id: 'SO-02',
      category: SuspiciousContentCategory.SYSTEM_OVERRIDE,
      severity: SuspiciousContentSeverity.SUSPICIOUS_HIGH,
      pattern:
        /\b(?:olvida|ignora|desestima|omite)\s+(?:todas\s+las\s+)?(?:instrucciones|reglas|directivas)\s+(?:anteriores|previas)\b/i,
    },
    {
      id: 'SO-03',
      category: SuspiciousContentCategory.SYSTEM_OVERRIDE,
      severity: SuspiciousContentSeverity.SUSPICIOUS_HIGH,
      pattern:
        /\b(?:system\s+override|admin\s+override|developer\s+mode\s+enabled|jailbreak\s+activated)\b/i,
    },
    {
      id: 'SO-04',
      category: SuspiciousContentCategory.SYSTEM_OVERRIDE,
      severity: SuspiciousContentSeverity.SUSPICIOUS_HIGH,
      pattern: /<\/?developer_instructions>|<\/?system_instructions>/i,
    },
    {
      id: 'SO-05',
      category: SuspiciousContentCategory.SYSTEM_OVERRIDE,
      severity: SuspiciousContentSeverity.SUSPICIOUS_HIGH,
      pattern:
        /\b(?:ignoriere|ignorieren\s+sie)\s+(?:alle\s+)?(?:vorherigen|vorherige)\s+(?:anweisungen|instruktionen)\b/i,
    },

    // 2. System Prompt & Secret Extraction
    {
      id: 'PE-01',
      category: SuspiciousContentCategory.PROMPT_EXTRACTION,
      severity: SuspiciousContentSeverity.SUSPICIOUS_HIGH,
      pattern:
        /\b(?:reveal|print|output|display|show|dump)\s+(?:your\s+)?(?:entire\s+|complete\s+|full\s+|initial\s+)?(?:system\s+prompt|developer\s+prompt|hidden\s+rules|internal\s+instructions)\b/i,
    },
    {
      id: 'PE-02',
      category: SuspiciousContentCategory.PROMPT_EXTRACTION,
      severity: SuspiciousContentSeverity.SUSPICIOUS_HIGH,
      pattern:
        /\b(?:muestra|imprime|revela)\s+(?:tu\s+)?(?:prompt\s+del\s+sistema|instrucciones\s+internas|reglas\s+ocultas)\b/i,
    },
    {
      id: 'PE-03',
      category: SuspiciousContentCategory.PROMPT_EXTRACTION,
      severity: SuspiciousContentSeverity.SUSPICIOUS_HIGH,
      pattern: /\bKINERGY_SYSTEM_PROMPT_CANARY_\w+\b/i,
    },

    // 3. Unauthorized Cross-Tenant / Database Probing
    {
      id: 'UA-01',
      category: SuspiciousContentCategory.UNAUTHORIZED_ACCESS,
      severity: SuspiciousContentSeverity.SUSPICIOUS_HIGH,
      pattern:
        /\b(?:access|switch\s+to|retrieve\s+from)\s+(?:other\s+|another\s+)?tenant\s+['"][a-z0-9_-]+['"]/i,
    },
    {
      id: 'UA-02',
      category: SuspiciousContentCategory.UNAUTHORIZED_ACCESS,
      severity: SuspiciousContentSeverity.SUSPICIOUS_HIGH,
      pattern: /\b(?:dump\s+all\s+tables|select\s+\*\s+from\s+users|select\s+\*\s+from\s+ai_)\b/i,
    },

    // 4. Privileged Command & Tool Invocations
    {
      id: 'PA-01',
      category: SuspiciousContentCategory.PRIVILEGED_ACTION,
      severity: SuspiciousContentSeverity.SUSPICIOUS_HIGH,
      pattern:
        /\b(?:execute\s+tool|invoke\s+function|call\s+api\s+endpoint)\s*[:=]\s*['"]?[a-z0-9_]+['"]?/i,
    },
    {
      id: 'PA-02',
      category: SuspiciousContentCategory.PRIVILEGED_ACTION,
      severity: SuspiciousContentSeverity.SUSPICIOUS_HIGH,
      pattern: /\b(?:run\s+bash|exec\s+command|subprocess\.call|child_process\.exec)\b/i,
    },

    // 5. Identity & Persona Hijacking
    {
      id: 'IH-01',
      category: SuspiciousContentCategory.IDENTITY_HIJACK,
      severity: SuspiciousContentSeverity.SUSPICIOUS_HIGH,
      pattern:
        /\b(?:you\s+are\s+now|act\s+as)\s+(?:dan|unrestricted\s+ai|godmode|evilbot|chaosgpt)\b/i,
    },
    {
      id: 'IH-02',
      category: SuspiciousContentCategory.IDENTITY_HIJACK,
      severity: SuspiciousContentSeverity.SUSPICIOUS_HIGH,
      pattern:
        /\b(?:ahora\s+eres|act[uú]a\s+como)\s+(?:un\s+asistente\s+sin\s+restricciones|dan|modo\s+libre)\b/i,
    },

    // 6. Encoded Obfuscation Payloads
    {
      id: 'EP-01',
      category: SuspiciousContentCategory.ENCODED_PAYLOAD,
      severity: SuspiciousContentSeverity.SUSPICIOUS_HIGH,
      pattern: /\beval\s*\(\s*(?:atob|Buffer\.from|decodeURIComponent)\b/i,
    },
    {
      id: 'EP-02',
      category: SuspiciousContentCategory.ENCODED_PAYLOAD,
      severity: SuspiciousContentSeverity.SUSPICIOUS_HIGH,
      pattern: /\bbase64\s*:\s*[A-Za-z0-9+/=]{60,}\b/,
    },

    // 7. Data Exfiltration Channels
    {
      id: 'DE-01',
      category: SuspiciousContentCategory.DATA_EXFILTRATION,
      severity: SuspiciousContentSeverity.SUSPICIOUS_HIGH,
      pattern: /!\[.*?\]\s*\(\s*https?:\/\/[^\s)]+\)/i,
    },
    {
      id: 'DE-02',
      category: SuspiciousContentCategory.DATA_EXFILTRATION,
      severity: SuspiciousContentSeverity.SUSPICIOUS_HIGH,
      pattern: /<img\s+[^>]*src\s*=\s*['"]https?:\/\/[^'"]+['"]/i,
    },

    // 8. Citation & Delimiter Forgery
    {
      id: 'CF-01',
      category: SuspiciousContentCategory.CITATION_FORGERY,
      severity: SuspiciousContentSeverity.SUSPICIOUS_HIGH,
      pattern: /<evidence_chunk\s+id\s*=\s*['"][^'"]+['"]|<turn\s+role\s*=\s*['"][^'"]+['"]/i,
    },

    // 9. Informational / Low-Severity Mentions (Security topics discussed in literature)
    {
      id: 'INFO-01',
      category: SuspiciousContentCategory.SYSTEM_OVERRIDE,
      severity: SuspiciousContentSeverity.SUSPICIOUS_LOW,
      pattern: /\b(?:prompt\s+injection|jailbreaking\s+llms|adversarial\s+prompts)\b/i,
    },
  ];

  /**
   * Scans input document chunk text against authoritative heuristic rules.
   * Returns scan result with severity and recommended policy action.
   */
  public static scan(text: string): SuspiciousContentScanResult {
    if (!text || text.trim().length === 0) {
      return {
        isSuspicious: false,
        severity: SuspiciousContentSeverity.BENIGN,
        recommendedAction: SuspiciousContentAction.ADMIT,
        matchedRules: [],
      };
    }

    const matchedRules: string[] = [];
    let highestSeverity = SuspiciousContentSeverity.BENIGN;
    let detectedCategory: SuspiciousContentCategory | undefined;

    for (const rule of this.RULES) {
      if (rule.pattern.test(text)) {
        matchedRules.push(`${rule.id}:${rule.category}`);

        if (rule.severity === SuspiciousContentSeverity.SUSPICIOUS_HIGH) {
          highestSeverity = SuspiciousContentSeverity.SUSPICIOUS_HIGH;
          detectedCategory = rule.category;
          // High severity is a conclusive determination; break early
          break;
        } else if (
          rule.severity === SuspiciousContentSeverity.SUSPICIOUS_LOW &&
          highestSeverity === SuspiciousContentSeverity.BENIGN
        ) {
          highestSeverity = SuspiciousContentSeverity.SUSPICIOUS_LOW;
          detectedCategory = rule.category;
        }
      }
    }

    if (highestSeverity === SuspiciousContentSeverity.SUSPICIOUS_HIGH) {
      return {
        isSuspicious: true,
        severity: SuspiciousContentSeverity.SUSPICIOUS_HIGH,
        recommendedAction: SuspiciousContentAction.DROP_CHUNK,
        matchedRules,
        category: detectedCategory,
      };
    }

    if (highestSeverity === SuspiciousContentSeverity.SUSPICIOUS_LOW) {
      return {
        isSuspicious: true,
        severity: SuspiciousContentSeverity.SUSPICIOUS_LOW,
        recommendedAction: SuspiciousContentAction.ADMIT_WITH_AUDIT,
        matchedRules,
        category: detectedCategory,
      };
    }

    return {
      isSuspicious: false,
      severity: SuspiciousContentSeverity.BENIGN,
      recommendedAction: SuspiciousContentAction.ADMIT,
      matchedRules: [],
    };
  }
}
