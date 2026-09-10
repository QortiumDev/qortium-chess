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

  it('restores the previously focused element without scrolling after the fallback', async () => {
    const previousFocus = { focus: vi.fn() };
    const fallbackDocument = { ...mockDocument(true), activeElement: previousFocus };

    expect(
      await copyTextToClipboard(
        'Focus',
        deps({ document: fallbackDocument as never, navigator: { clipboard: {} } }),
      ),
    ).toBe(true);
    expect(fallbackDocument.textarea.focus).toHaveBeenCalledTimes(1);
    expect(previousFocus.focus).toHaveBeenCalledTimes(1);
    expect(previousFocus.focus).toHaveBeenCalledWith({ preventScroll: true });
    // Restore happens after the textarea is gone, never while it still holds focus.
    expect(previousFocus.focus.mock.invocationCallOrder[0]).toBeGreaterThan(
      fallbackDocument.body.removeChild.mock.invocationCallOrder[0],
    );
  });

  it('restores focus even when execCommand refuses or throws', async () => {
    for (const result of [false, () => { throw new Error('denied'); }] as const) {
      const previousFocus = { focus: vi.fn() };
      const fallbackDocument = { ...mockDocument(result), activeElement: previousFocus };

      expect(
        await copyTextToClipboard('Denied', deps({ document: fallbackDocument as never, navigator: {} })),
      ).toBe(false);
      expect(previousFocus.focus).toHaveBeenCalledWith({ preventScroll: true });
    }
  });

  it('tolerates a document with no focused element or a non-focusable one', async () => {
    const noActive = { ...mockDocument(true), activeElement: null };
    const notFocusable = { ...mockDocument(true), activeElement: {} };

    expect(await copyTextToClipboard('A', deps({ document: noActive as never, navigator: {} }))).toBe(true);
    expect(await copyTextToClipboard('B', deps({ document: notFocusable as never, navigator: {} }))).toBe(true);
  });

  it('reports failure when there is no clipboard and no document at all', async () => {
    expect(await copyTextToClipboard('Nothing', deps({}))).toBe(false);
  });
});
