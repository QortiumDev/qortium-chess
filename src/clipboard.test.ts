import { describe, expect, it, vi } from 'vitest';
import type { ClipboardDependencies } from './clipboard';
import { copyTextToClipboard } from './clipboard';

function mockDocument(execCommandResult: boolean | (() => boolean)) {
  const textarea = {
    value: '',
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    focus: vi.fn(),
    select: vi.fn(),
    setSelectionRange: vi.fn(),
  };

  return {
    textarea,
    body: {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    },
    createElement: vi.fn(() => textarea),
    execCommand: vi.fn(
      typeof execCommandResult === 'function' ? execCommandResult : () => execCommandResult,
    ),
  };
}

function deps(overrides: Partial<ClipboardDependencies>): ClipboardDependencies {
  return overrides as ClipboardDependencies;
}

describe('copyTextToClipboard', () => {
  it('uses navigator.clipboard.writeText when it is available and resolves', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const fallbackDocument = mockDocument(true);

    expect(
      await copyTextToClipboard(
        'e2e4',
        deps({ document: fallbackDocument as never, navigator: { clipboard: { writeText } } }),
      ),
    ).toBe(true);
    expect(writeText).toHaveBeenCalledWith('e2e4');
    expect(fallbackDocument.createElement).not.toHaveBeenCalled();
  });

  it('falls back to an offscreen textarea when writeText is unavailable', async () => {
    const fallbackDocument = mockDocument(true);

    expect(
      await copyTextToClipboard(
        'Fallback',
        deps({ document: fallbackDocument as never, navigator: { clipboard: {} } }),
      ),
    ).toBe(true);
    expect(fallbackDocument.createElement).toHaveBeenCalledWith('textarea');
    expect(fallbackDocument.textarea.value).toBe('Fallback');
    expect(fallbackDocument.execCommand).toHaveBeenCalledWith('copy');
    expect(fallbackDocument.body.appendChild).toHaveBeenCalledTimes(1);
    expect(fallbackDocument.body.removeChild).toHaveBeenCalledTimes(1);
  });

  it('falls back to the textarea when the sandbox rejects writeText', async () => {
    const fallbackDocument = mockDocument(true);
    const writeText = vi.fn().mockRejectedValue(new Error('blocked by sandbox'));

    expect(
      await copyTextToClipboard(
        'Blocked',
        deps({ document: fallbackDocument as never, navigator: { clipboard: { writeText } } }),
      ),
    ).toBe(true);
    expect(writeText).toHaveBeenCalled();
    expect(fallbackDocument.execCommand).toHaveBeenCalledWith('copy');
  });

  it('reports failure when execCommand refuses the copy', async () => {
    const fallbackDocument = mockDocument(false);

    expect(
      await copyTextToClipboard(
        'Nope',
        deps({ document: fallbackDocument as never, navigator: { clipboard: {} } }),
      ),
    ).toBe(false);
    expect(fallbackDocument.execCommand).toHaveBeenCalledWith('copy');
    expect(fallbackDocument.body.removeChild).toHaveBeenCalledTimes(1);
  });

  it('removes the textarea even when execCommand throws', async () => {
    const fallbackDocument = mockDocument(() => {
      throw new Error('execCommand is not allowed here');
    });

    expect(
      await copyTextToClipboard(
        'Throws',
        deps({ document: fallbackDocument as never, navigator: {} }),
      ),
    ).toBe(false);
    expect(fallbackDocument.body.removeChild).toHaveBeenCalledTimes(1);
  });

  it('reports failure when there is no clipboard and no document at all', async () => {
    expect(await copyTextToClipboard('Nothing', deps({}))).toBe(false);
  });
});
