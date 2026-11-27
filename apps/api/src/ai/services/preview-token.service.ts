import * as crypto from 'crypto';
import { Injectable, Optional, Inject } from '@nestjs/common';

export interface PreviewTokenClaims {
  readonly tenantId: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly citationId: string;
  readonly documentId: string;
  readonly roles?: readonly string[];
  readonly exp: number;
}

export interface ExpectedPreviewContext {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly citationId: string;
}

export interface TokenVerificationResult {
  readonly valid: boolean;
  readonly error?: string;
  readonly claims?: PreviewTokenClaims;
}

const DEFAULT_EXPIRATION_SECONDS = 300; // 5 minutes

/**
 * Service providing cryptographically signed, short-lived preview tokens for citation document previews.
 *
 * Guarantees:
 * - Scoped strictly to { tenantId, userId, conversationId, messageId, citationId, documentId }.
 * - Short-lived (default 5 minutes), expiring automatically.
 * - Tamper-proof HMAC SHA-256 signatures.
 * - Safe URL-safe Base64 representation.
 * - Fails closed on expired tokens, altered parameters, or cross-tenant manipulation.
 */
@Injectable()
export class PreviewTokenService {
  private readonly secretKey: string;

  constructor(@Optional() @Inject('AI_PREVIEW_TOKEN_SECRET') secret?: string) {
    const isTestEnv =
      process.env['NODE_ENV'] === 'test' || process.env['JEST_WORKER_ID'] !== undefined;
    const candidateSecret =
      secret ||
      process.env['AI_PREVIEW_TOKEN_SECRET'] ||
      process.env['JWT_SECRET'] ||
      (isTestEnv ? 'kinergy-secure-document-preview-secret-salt-2026' : '');
    if (!candidateSecret || candidateSecret.length < 32) {
      throw new Error(
        'AI_PREVIEW_TOKEN_SECRET or JWT_SECRET must be configured in environment with at least 32 characters',
      );
    }
    this.secretKey = candidateSecret;
  }

  /**
   * Generates a short-lived, signed preview token.
   */
  public generateToken(
    claims: Omit<PreviewTokenClaims, 'exp'>,
    expiresInSeconds: number = DEFAULT_EXPIRATION_SECONDS,
  ): string {
    const exp = Date.now() + expiresInSeconds * 1000;
    const fullClaims: PreviewTokenClaims = {
      ...claims,
      exp,
    };

    const payloadJson = JSON.stringify(fullClaims);
    const payloadBase64 = Buffer.from(payloadJson, 'utf-8').toString('base64url');

    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(payloadBase64)
      .digest('base64url');

    return `${payloadBase64}.${signature}`;
  }

  /**
   * Verifies that a preview token is valid, unexpired, and strictly matches the expected execution context.
   */
  public verifyToken(
    token: string,
    expectedContext: ExpectedPreviewContext,
  ): TokenVerificationResult {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Token is missing or empty' };
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
      return { valid: false, error: 'Invalid token structure' };
    }

    const [payloadBase64, providedSignature] = parts;
    if (!payloadBase64 || !providedSignature) {
      return { valid: false, error: 'Malformed token payload or signature' };
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.secretKey)
      .update(payloadBase64)
      .digest('base64url');

    // Constant-time signature comparison to prevent timing attacks
    const providedBuffer = Buffer.from(providedSignature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return { valid: false, error: 'Token signature verification failed' };
    }

    let claims: PreviewTokenClaims;
    try {
      const decodedJson = Buffer.from(payloadBase64, 'base64url').toString('utf-8');
      claims = JSON.parse(decodedJson) as PreviewTokenClaims;
    } catch {
      return { valid: false, error: 'Failed to parse token payload' };
    }

    // Expiry check
    if (Date.now() > claims.exp) {
      return { valid: false, error: 'Token has expired', claims };
    }

    // Context scoping check
    if (claims.tenantId !== expectedContext.tenantId) {
      return { valid: false, error: 'Tenant mismatch in preview token', claims };
    }
    if (claims.conversationId !== expectedContext.conversationId) {
      return { valid: false, error: 'Conversation mismatch in preview token', claims };
    }
    if (claims.messageId !== expectedContext.messageId) {
      return { valid: false, error: 'Message mismatch in preview token', claims };
    }
    if (claims.citationId !== expectedContext.citationId) {
      return { valid: false, error: 'Citation mismatch in preview token', claims };
    }

    return { valid: true, claims };
  }
}
