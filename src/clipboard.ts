// Sandbox-safe clipboard write (fleet pattern).
//
// A QDN app renders inside Home's sandboxed iframe, where `navigator.clipboard`
// is frequently absent or rejects on write. Every copy control therefore falls
// back to an offscreen textarea plus `document.execCommand('copy')`, and reports
// honest failure so the UI can tell the reader to select the code manually.
//
// Dependencies are injected so both paths are testable without a DOM.

export interface ClipboardDependencies {
  document?: Pick<Document, 'body' | 'createElement' | 'execCommand'>;
  navigator?: {
    clipboard?: {
      writeText?: (text: string) => Promise<void> | void;
    };
  };
}

export async function copyTextToClipboard(
  text: string,
  dependencies: ClipboardDependencies = globalThis as ClipboardDependencies,
): Promise<boolean> {
  const writeText = dependencies.navigator?.clipboard?.writeText;

  if (writeText) {
    try {
      await writeText.call(dependencies.navigator?.clipboard, text);
      return true;
    } catch {
      // Fall back to the selection-based copy path below.
    }
  }

  return copyTextWithTextarea(text, dependencies.document);
}

function copyTextWithTextarea(
  text: string,
  documentRef: ClipboardDependencies['document'],
): boolean {
  if (!documentRef?.body || !documentRef.createElement || !documentRef.execCommand) {
    return false;
  }

  const textarea = documentRef.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  textarea.style.position = 'fixed';
  textarea.style.top = '0';

  documentRef.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    return documentRef.execCommand('copy');
  } catch {
    return false;
  } finally {
    documentRef.body.removeChild(textarea);
  }
}
