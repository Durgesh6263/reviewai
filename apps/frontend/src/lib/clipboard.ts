/**
 * Cross-platform clipboard helper with mobile and desktop fallbacks.
 * Handles permission blocks, non-secure contexts, and mobile webviews.
 */

export interface CopyResult {
  success: boolean;
  message: string;
  fallbackRequired?: boolean;
}

export async function copyTextToClipboard(text: string, textareaElement?: HTMLTextAreaElement | null): Promise<CopyResult> {
  if (!text) {
    return { success: false, message: 'Nothing to copy' };
  }

  // Method 1: Modern navigator.clipboard API
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return { success: true, message: 'Copied to clipboard!' };
    } catch (err) {
      console.warn('navigator.clipboard.writeText failed, trying fallback:', err);
    }
  }

  // Method 2: Fallback using document.execCommand('copy')
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    // Prevent zooming on iOS
    textArea.style.fontSize = '16px';
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);

    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, 99999); // For mobile devices

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);

    if (successful) {
      return { success: true, message: 'Copied to clipboard!' };
    }
  } catch (err) {
    console.warn('execCommand copy failed:', err);
  }

  // Method 3: Fallback - select text directly in user's visible textarea so they can tap Copy
  if (textareaElement) {
    try {
      textareaElement.focus();
      textareaElement.select();
      textareaElement.setSelectionRange(0, textareaElement.value.length);
      return {
        success: false,
        fallbackRequired: true,
        message: 'Clipboard access blocked. Review text selected—please tap "Copy" on your device.',
      };
    } catch {}
  }

  return {
    success: false,
    fallbackRequired: true,
    message: 'Unable to access clipboard. Please manually select and copy the text.',
  };
}
