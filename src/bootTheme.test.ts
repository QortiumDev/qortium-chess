// @vitest-environment jsdom
//
// fouc-1 drift guard.
//
// index.html carries an inline <head> script that stamps the styling
// attributes onto <html> before the render-blocking stylesheet paints. It is a
// hand-written duplicate of a slice of displaySettings.ts, and nothing about
// the build or the type system can notice the two drifting apart — a divergence
// shows up only as a flash of the WRONG setting in a real browser.
//
// So this suite does not read the script, it RUNS it: the real text is
// extracted from the real index.html, executed against a stubbed window, and
// its resulting attributes are diffed against what
// applyDisplaySettings(getInitialDisplaySettings()) produces for the same URL.
// Any change to a param name, a precedence rule, a default, an allowed value or
// an attribute name on either side fails here.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyDisplaySettings,
  BOOT_STYLE_CONTRACT,
  getInitialDisplaySettings,
  type QdnDisplaySettings,
} from './displaySettings';

// Under the jsdom environment import.meta.url is an http:// URL, so this
// resolves from the Vitest root (the package dir) instead.
const INDEX_HTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
// Comments stripped first: the fouc-1 comment itself talks about script tags,
// and would otherwise be matched as one.
const INDEX_HTML_MARKUP = INDEX_HTML.replace(/<!--[\s\S]*?-->/g, '');

/** The inline boot script, straight out of index.html. */
function readBootScript(): string {
  // The only inline (src-less) <script> in the document.
  const matches = [...INDEX_HTML_MARKUP.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];

  expect(matches, 'index.html should contain exactly one inline <script> (the fouc-1 boot script)').toHaveLength(1);

  return matches[0][1];
}

/** Runs the boot script against a stub window, returns what it put on <html>. */
function runBootScript(search: string, hostGlobals: Record<string, unknown> = {}) {
  const root = document.documentElement;

  for (const { attribute } of Object.values(BOOT_STYLE_CONTRACT)) {
    root.removeAttribute(attribute);
  }

  root.removeAttribute('style');

  const stubWindow = { ...hostGlobals, location: { search } };

  // The script is an IIFE taking (window, document); calling it with a stub
  // window is exactly how the browser calls it, minus the real globals.
  new Function('window', 'document', readBootScript())(stubWindow, document);

  return {
    accent: root.getAttribute('data-accent'),
    colorScheme: root.style.colorScheme,
    textSize: root.getAttribute('data-text-size'),
    theme: root.getAttribute('data-theme'),
    ui: root.getAttribute('data-ui'),
  };
}

/** The same shape, produced by the module the script duplicates. */
function runModule(search: string, hostGlobals: Record<string, unknown> = {}) {
  const root = document.documentElement;

  for (const { attribute } of Object.values(BOOT_STYLE_CONTRACT)) {
    root.removeAttribute(attribute);
  }

  root.removeAttribute('style');

  vi.stubGlobal('window', { ...hostGlobals, location: { search } });

  const settings: QdnDisplaySettings = getInitialDisplaySettings();

  applyDisplaySettings(settings);

  return {
    accent: root.getAttribute('data-accent'),
    colorScheme: root.style.colorScheme,
    textSize: root.getAttribute('data-text-size'),
    theme: root.getAttribute('data-theme'),
    ui: root.getAttribute('data-ui'),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fouc-1 inline boot script', () => {
  it('is inline, in <head>, and ahead of anything Vite injects', () => {
    const head = INDEX_HTML_MARKUP.slice(INDEX_HTML_MARKUP.indexOf('<head>'), INDEX_HTML_MARKUP.indexOf('</head>'));

    expect(head).toContain('data-theme');
    // Vite appends its own <script type="module"> and CSS <link> to the end of
    // <head>, so "last thing in head" is what guarantees the boot script wins.
    // Nothing may be added after it by hand either.
    expect(head.trimEnd().endsWith('</script>')).toBe(true);
    expect(head).not.toContain('rel="stylesheet"');
  });

  it('references exactly the attribute names and defaults the module exports', () => {
    const script = readBootScript();

    for (const [key, { attribute, default: fallback, values }] of Object.entries(BOOT_STYLE_CONTRACT)) {
      expect(script, `boot script must stamp ${key} as ${attribute}`).toContain(`'${attribute}'`);
      expect(script, `boot script must default ${key} to ${fallback}`).toContain(`'${fallback}'`);

      for (const value of values) {
        expect(script, `boot script must accept ${key}=${value}`).toContain(`'${value}'`);
      }
    }
  });
});

describe('fouc-1 boot script matches displaySettings.ts', () => {
  const urls = [
    '',
    '?theme=dark',
    '?theme=light',
    '?theme=DARK',
    '?theme=  dark  ',
    '?theme=bogus',
    '?accent=blue',
    '?accent=yellow&theme=dark',
    '?accent=chartreuse',
    '?textSize=huge',
    '?textSize=extra-small',
    '?text-size=large',
    '?textSize=nonsense',
    '?uiStyle=fun',
    '?uiStyle=modern',
    '?ui-style=fun',
    '?uiStyle=retro',
    '?theme=dark&accent=pink&textSize=huge&uiStyle=fun',
    '?lang=ar&theme=dark&uiStyle=fun',
    '?view=developers&theme=dark',
  ];

  for (const search of urls) {
    it(`agrees for "${search || '(no query)'}"`, () => {
      expect(runBootScript(search)).toEqual(runModule(search));
    });
  }

  const hostCases: Array<[string, string, Record<string, unknown>]> = [
    ['host globals with no query', '', { _qdnTheme: 'dark', _qdnAccent: 'teal', _qdnTextSize: 'large', _qdnUiStyle: 'fun' }],
    ['query overriding host globals', '?theme=light&uiStyle=classic', { _qdnTheme: 'dark', _qdnUiStyle: 'fun' }],
    ['the _qdnUIStyle casing alias', '', { _qdnUIStyle: 'modern' }],
    // Precedence subtlety: an invalid ?accent falls back to the DEFAULT, not to
    // the host global, while an invalid ?textSize DOES fall through to it.
    ['an invalid query accent beside a valid host accent', '?accent=banana', { _qdnAccent: 'blue' }],
    ['an invalid query textSize beside a valid host textSize', '?textSize=banana', { _qdnTextSize: 'small' }],
    ['an invalid uiStyle on both sides', '?uiStyle=banana', { _qdnUIStyle: 'retro' }],
    ['non-string host globals', '', { _qdnTheme: 7, _qdnAccent: null, _qdnUiStyle: {} }],
  ];

  for (const [name, search, globals] of hostCases) {
    it(`agrees for ${name}`, () => {
      expect(runBootScript(search, globals)).toEqual(runModule(search, globals));
    });
  }
});
