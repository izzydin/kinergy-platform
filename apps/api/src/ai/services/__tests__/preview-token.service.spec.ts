import { PreviewTokenService } from '../preview-token.service';

describe('PreviewTokenService Unit Tests', () => {
  let service: PreviewTokenService;

  const validContext = {
    tenantId: 'tenant_alpha',
    userId: 'user_123',
    conversationId: 'conv_456',
    messageId: 'msg_789',
    citationId: 'cite_101',
    documentId: 'doc_202',
  };

  beforeEach(() => {
    service = new PreviewTokenService();
  });

  it('1. generates a valid HMAC token and verifies matching context', () => {
    const token = service.generateToken(validContext, 300);
    expect(typeof token).toBe('string');
    expect(token).toContain('.');

    const verification = service.verifyToken(token, {
      tenantId: 'tenant_alpha',
      conversationId: 'conv_456',
      messageId: 'msg_789',
      citationId: 'cite_101',
    });

    expect(verification.valid).toBe(true);
    expect(verification.claims?.documentId).toBe('doc_202');
    expect(verification.claims?.userId).toBe('user_123');
  });

  it('2. rejects expired preview tokens', () => {
    // Generate token expired 10 seconds ago
    const token = service.generateToken(validContext, -10);

    const verification = service.verifyToken(token, {
      tenantId: 'tenant_alpha',
      conversationId: 'conv_456',
      messageId: 'msg_789',
      citationId: 'cite_101',
    });

    expect(verification.valid).toBe(false);
    expect(verification.error).toBe('Token has expired');
  });

  it('3. rejects tampered preview tokens with mismatched signature', () => {
    const token = service.generateToken(validContext, 300);
    const [, sig] = token.split('.');

    // Tamper payload (e.g. modify documentId or tenantId)
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...validContext, tenantId: 'tenant_hacked', exp: Date.now() + 300000 }),
    ).toString('base64url');

    const tamperedToken = `${tamperedPayload}.${sig}`;

    const verification = service.verifyToken(tamperedToken, {
      tenantId: 'tenant_alpha',
      conversationId: 'conv_456',
      messageId: 'msg_789',
      citationId: 'cite_101',
    });

    expect(verification.valid).toBe(false);
    expect(verification.error).toBe('Token signature verification failed');
  });

  it('4. rejects tokens with conversation context mismatch', () => {
    const token = service.generateToken(validContext, 300);

    const verification = service.verifyToken(token, {
      tenantId: 'tenant_alpha',
      conversationId: 'conv_DIFFERENT_TARGET', // Mismatched!
      messageId: 'msg_789',
      citationId: 'cite_101',
    });

    expect(verification.valid).toBe(false);
    expect(verification.error).toContain('Conversation mismatch');
  });

  it('5. rejects tokens with citation context mismatch', () => {
    const token = service.generateToken(validContext, 300);

    const verification = service.verifyToken(token, {
      tenantId: 'tenant_alpha',
      conversationId: 'conv_456',
      messageId: 'msg_789',
      citationId: 'cite_DIFFERENT_CITATION', // Mismatched!
    });

    expect(verification.valid).toBe(false);
    expect(verification.error).toContain('Citation mismatch');
  });

  it('6. rejects malformed or empty token strings safely', () => {
    expect(service.verifyToken('', validContext).valid).toBe(false);
    expect(service.verifyToken('invalid-dotless-token', validContext).valid).toBe(false);
    expect(service.verifyToken('invalid.payload.too.many.dots', validContext).valid).toBe(false);
  });

  it('7. throws an error if initialized with a secret shorter than 32 characters', () => {
    expect(() => new PreviewTokenService('too-short-secret')).toThrow(
      'AI_PREVIEW_TOKEN_SECRET or JWT_SECRET must be configured in environment with at least 32 characters',
    );
  });
});
