import { CheckInMethod } from '../types';

export interface ScanParseResult {
  readonly isValid: boolean;
  readonly clientId?: string;
  readonly method?: CheckInMethod;
  readonly error?: string;
  readonly rawInput: string;
}

/**
 * Validates and normalizes raw input from hardware barcode wedge scanners,
 * QR code camera streams, and RFID card readers into a verified check-in target.
 *
 * Supported payload contracts:
 * 1. URI Schemes:
 *    - `kinergy://client/{clientId}`
 *    - `kinergy://checkin?clientId={clientId}`
 *    - `kinergy://member/{clientId}`
 * 2. JSON Payloads (Mobile App QR):
 *    - `{"clientId": "...", "type": "CHECK_IN"}`
 *    - `{"id": "..."}`
 * 3. Barcode Card Formats:
 *    - Standard code formats: e.g. `BC123456`, numeric strings, `BAR_xxx`
 * 4. Plain Client IDs / UUIDs:
 *    - `cli_xxx`, UUID format, alphanumeric IDs
 */
export function parseScanPayload(rawInput: string): ScanParseResult {
  const trimmed = rawInput?.trim() ?? '';

  if (!trimmed) {
    return {
      isValid: false,
      error: 'Empty scan payload.',
      rawInput,
    };
  }

  // Reject oversized payloads (potential memory / buffer overflow attacks)
  if (trimmed.length > 512) {
    return {
      isValid: false,
      error: 'Scan payload exceeds maximum permissible length.',
      rawInput,
    };
  }

  // Reject payloads with HTML tags or dangerous script content
  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    return {
      isValid: false,
      error: 'Unsafe characters detected in scanned code.',
      rawInput,
    };
  }

  // 1. JSON Payload Contract
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const extractedId = parsed.clientId || parsed.id;
      if (typeof extractedId === 'string' && extractedId.trim().length > 0) {
        return {
          isValid: true,
          clientId: extractedId.trim(),
          method: CheckInMethod.QR_CODE,
          rawInput,
        };
      }
      return {
        isValid: false,
        error: 'JSON payload missing required clientId property.',
        rawInput,
      };
    } catch {
      return {
        isValid: false,
        error: 'Malformed JSON barcode/QR payload.',
        rawInput,
      };
    }
  }

  // 2. URI Scheme Contract: kinergy://
  if (trimmed.startsWith('kinergy://')) {
    try {
      const url = new URL(trimmed);
      // Format: kinergy://checkin?clientId=xyz
      const queryClientId = url.searchParams.get('clientId');
      if (queryClientId && queryClientId.trim().length > 0) {
        return {
          isValid: true,
          clientId: queryClientId.trim(),
          method: CheckInMethod.QR_CODE,
          rawInput,
        };
      }

      // Format: kinergy://client/xyz or kinergy://member/xyz
      const pathname = url.pathname.replace(/^\/+/, '');
      const pathSegments = pathname.split('/');
      const host = url.host;

      if ((host === 'client' || host === 'member') && pathSegments[0]) {
        return {
          isValid: true,
          clientId: pathSegments[0].trim(),
          method: CheckInMethod.QR_CODE,
          rawInput,
        };
      }

      const clientSegment = pathSegments[1];
      if (
        pathSegments.length >= 2 &&
        (pathSegments[0] === 'client' || pathSegments[0] === 'member') &&
        clientSegment
      ) {
        return {
          isValid: true,
          clientId: clientSegment.trim(),
          method: CheckInMethod.QR_CODE,
          rawInput,
        };
      }

      return {
        isValid: false,
        error: 'Unrecognized kinergy:// URI scheme path or missing clientId.',
        rawInput,
      };
    } catch {
      return {
        isValid: false,
        error: 'Malformed kinergy:// URI payload.',
        rawInput,
      };
    }
  }

  // 3. Barcode Card Prefix Contract (e.g. BAR_xxx or BC_xxx)
  if (/^(BAR_|BC_)/i.test(trimmed)) {
    return {
      isValid: true,
      clientId: trimmed,
      method: CheckInMethod.BARCODE,
      rawInput,
    };
  }

  // 4. RFID / Keycard numeric sequence (e.g. 8 to 16 digits)
  if (/^\d{8,16}$/.test(trimmed)) {
    return {
      isValid: true,
      clientId: trimmed,
      method: CheckInMethod.RFID,
      rawInput,
    };
  }

  // 5. Standard Client ID / UUID / Alphanumeric token
  // Must be 3-64 chars, containing alphanumeric, underscores, hyphens
  if (/^[a-zA-Z0-9_\-.]{3,64}$/.test(trimmed)) {
    return {
      isValid: true,
      clientId: trimmed,
      rawInput,
    };
  }

  return {
    isValid: false,
    error: 'Unrecognized barcode/QR format. Please verify the code or use manual lookup.',
    rawInput,
  };
}
