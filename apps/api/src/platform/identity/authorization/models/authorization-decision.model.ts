export interface AuthorizationDecisionProps {
  isAuthorized: boolean;
  reason?: string;
  failedRequirement?: string;
  evaluatedAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Domain Value Object representing the structured outcome of an authorization evaluation.
 * Avoids primitive boolean returns and enables rich auditing, diagnostic telemetry, and debugging.
 */
export class AuthorizationDecision {
  public readonly isAuthorized: boolean;
  public readonly reason: string | null;
  public readonly failedRequirement: string | null;
  public readonly evaluatedAt: Date;
  public readonly metadata: Readonly<Record<string, unknown>>;

  constructor(props: AuthorizationDecisionProps) {
    this.isAuthorized = props.isAuthorized;
    this.reason = props.reason ?? null;
    this.failedRequirement = props.failedRequirement ?? null;
    this.evaluatedAt = props.evaluatedAt ?? new Date();
    this.metadata = Object.freeze({ ...(props.metadata ?? {}) });
  }

  public static authorized(metadata?: Record<string, unknown>): AuthorizationDecision {
    return new AuthorizationDecision({
      isAuthorized: true,
      metadata,
    });
  }

  public static denied(
    reason: string,
    failedRequirement?: string,
    metadata?: Record<string, unknown>,
  ): AuthorizationDecision {
    return new AuthorizationDecision({
      isAuthorized: false,
      reason,
      failedRequirement,
      metadata,
    });
  }
}
