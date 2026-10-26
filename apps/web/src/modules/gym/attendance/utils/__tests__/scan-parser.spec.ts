import { parseScanPayload } from '../scan-parser';
import { CheckInMethod } from '../../types';

describe('scan-parser utility', () => {
  it('parses JSON payload containing clientId', () => {
    const input = JSON.stringify({ clientId: 'cli_sarah123', type: 'CHECK_IN' });
    const result = parseScanPayload(input);
    expect(result.isValid).toBe(true);
    expect(result.clientId).toBe('cli_sarah123');
    expect(result.method).toBe(CheckInMethod.QR_CODE);
  });

  it('parses JSON payload containing id', () => {
    const input = JSON.stringify({ id: 'cli_john456' });
    const result = parseScanPayload(input);
    expect(result.isValid).toBe(true);
    expect(result.clientId).toBe('cli_john456');
  });

  it('rejects malformed JSON payload', () => {
    const input = '{"clientId": "incomplete';
    const result = parseScanPayload(input);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Malformed JSON');
  });

  it('rejects JSON payload without clientId or id', () => {
    const input = JSON.stringify({ otherField: 'val' });
    const result = parseScanPayload(input);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('missing required clientId');
  });

  it('parses kinergy://checkin?clientId=... URI scheme', () => {
    const input = 'kinergy://checkin?clientId=cli_member_99';
    const result = parseScanPayload(input);
    expect(result.isValid).toBe(true);
    expect(result.clientId).toBe('cli_member_99');
    expect(result.method).toBe(CheckInMethod.QR_CODE);
  });

  it('parses kinergy://client/... URI scheme', () => {
    const input = 'kinergy://client/cli_member_88';
    const result = parseScanPayload(input);
    expect(result.isValid).toBe(true);
    expect(result.clientId).toBe('cli_member_88');
    expect(result.method).toBe(CheckInMethod.QR_CODE);
  });

  it('parses barcode prefixed with BAR_ or BC_', () => {
    const input = 'BAR_987654321';
    const result = parseScanPayload(input);
    expect(result.isValid).toBe(true);
    expect(result.clientId).toBe('BAR_987654321');
    expect(result.method).toBe(CheckInMethod.BARCODE);
  });

  it('parses RFID numeric token', () => {
    const input = '123456789012';
    const result = parseScanPayload(input);
    expect(result.isValid).toBe(true);
    expect(result.clientId).toBe('123456789012');
    expect(result.method).toBe(CheckInMethod.RFID);
  });

  it('parses standard alphanumeric client ID or UUID', () => {
    const input = '550e8400-e29b-41d4-a716-446655440000';
    const result = parseScanPayload(input);
    expect(result.isValid).toBe(true);
    expect(result.clientId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('rejects empty or whitespace input', () => {
    const result = parseScanPayload('   ');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Empty scan payload');
  });

  it('rejects malicious payload containing HTML script tags', () => {
    const input = '<script>alert("xss")</script>';
    const result = parseScanPayload(input);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Unsafe characters');
  });

  it('rejects oversized payload', () => {
    const hugeInput = 'a'.repeat(600);
    const result = parseScanPayload(hugeInput);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('exceeds maximum permissible length');
  });

  it('rejects unrecognized format with strange characters', () => {
    const invalidInput = '$$$###@@@~~~';
    const result = parseScanPayload(invalidInput);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Unrecognized barcode/QR format');
  });
});
