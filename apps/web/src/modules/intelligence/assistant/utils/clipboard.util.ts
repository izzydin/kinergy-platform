export interface CopyToClipboardResult {
  readonly success: boolean;
  readonly error?: string;
}

/**
 * Copies plain text to the system clipboard with robust fallback mechanisms.
 *
 * Implements AI-09.5 - FB.04:
 * 1. Primary: navigator.clipboard.writeText (modern asynchronous clipboard API)
 * 2. Fallback: Hidden document.execCommand('copy') via temporary textarea (for insecure contexts or unsupported environments)
 * 3. Handles PermissionDenied, NotAllowedError, security exceptions gracefully
 * 4. Never falsely reports success when copying fails
 */
export async function copyToClipboard(text: string): Promise<CopyToClipboardResult> {
  if (typeof text !== 'string') {
    return { success: false, error: 'Invalid text payload for clipboard' };
  }

  // 1. Try modern async Clipboard API if available in current browser window
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return { success: true };
    } catch {
      // If modern API fails (e.g. PermissionDenied or Document not focused), proceed to fallback
    }
  }

  // 2. Fallback using document.execCommand('copy')
  if (
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function' &&
    typeof document.execCommand === 'function' &&
    document.body
  ) {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      // Position offscreen to prevent layout shifts or viewport scrolling
      textArea.style.position = 'fixed';
      textArea.style.top = '0';
      textArea.style.left = '-9999px';
      textArea.style.width = '2em';
      textArea.style.height = '2em';
      textArea.style.padding = '0';
      textArea.style.border = 'none';
      textArea.style.outline = 'none';
      textArea.style.boxShadow = 'none';
      textArea.style.background = 'transparent';
      textArea.setAttribute('readonly', '');
      textArea.setAttribute('aria-hidden', 'true');

      document.body.appendChild(textArea);
      textArea.select();
      textArea.setSelectionRange(0, text.length);

      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);

      if (successful) {
        return { success: true };
      }
    } catch {
      // Fallback failed
    }
  }

  return {
    success: false,
    error: 'El portapapeles no está disponible o el permiso fue denegado',
  };
}
