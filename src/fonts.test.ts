// Guards the font contract that the build and the rest of the suite cannot see.
//
// The @fontsource-variable packages declare namespaced families ("Lexend
// Variable", "Inter Variable"). CSS family matching is exact, so a stack that
// asks only for "Lexend" silently renders in the system fallback: `vite build`
// succeeds, every unit test passes, and Classic — the contract default — quietly
// stops using its bundled face. That regression shipped once; this pins it.

// Read from disk rather than importing the CSS: vitest stubs CSS imports, so
// `import css from './styles.css?raw'` yields an empty string and every
// assertion below would pass vacuously.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const FONT_PACKAGE_CSS = [
  '@fontsource-variable/lexend/index.css',
  '@fontsource-variable/inter/index.css',
  '@fontsource/comic-neue/400.css',
  '@fontsource/fredoka/600.css',
];

function read(relative: string) {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

const appCss = read('./styles.css');

// Generic families and OS stacks legitimately appear as trailing fallbacks and
// are never bundled, so they are not expected to have an @font-face.
const UNBUNDLED_FALLBACKS = new Set([
  '-apple-system',
  'BlinkMacSystemFont',
  'Cascadia Mono',
  'Consolas',
  'Menlo',
  'SFMono-Regular',
  'Segoe UI',
  'Trebuchet MS',
  'monospace',
  'sans-serif',
  'system-ui',
  'ui-monospace',
  'ui-sans-serif',
]);

function declaredFamilies() {
  const declared = new Set<string>();

  for (const packageCss of FONT_PACKAGE_CSS) {
    const css = read(`../node_modules/${packageCss}`);

    for (const match of css.matchAll(/font-family:\s*'([^']+)'|font-family:\s*"([^"]+)"/g)) {
      const family = match[1] ?? match[2];

      if (family) {
        declared.add(family);
      }
    }
  }

  return declared;
}

/** Every quoted or bare family named by a `--qch-font-*` token, in order. */
function requestedFamilies() {
  const css = appCss;
  const requested = new Set<string>();

  for (const [, stack] of css.matchAll(/--qch-font-[a-z]+:\s*([^;]+);/g)) {
    if (stack.trim().startsWith('var(')) {
      continue;
    }

    for (const entry of stack.split(',')) {
      const family = entry.trim().replace(/^["']|["']$/g, '');

      if (family) {
        requested.add(family);
      }
    }
  }

  return requested;
}

describe('font contract', () => {
  it('bundles every non-fallback family the stylesheet asks for', () => {
    const declared = declaredFamilies();
    // A bare "Lexend"/"Inter" is an intentional secondary fallback for a
    // locally installed copy, so it counts as satisfied when the namespaced
    // variable face is bundled.
    const isSatisfied = (family: string) => declared.has(family) || declared.has(`${family} Variable`);
    const missing = [...requestedFamilies()].filter(
      (family) => !UNBUNDLED_FALLBACKS.has(family) && !isSatisfied(family),
    );

    // A family here is requested by styles.css but declared by no bundled
    // @font-face, so it can only resolve if the viewer happens to have it
    // installed — which inside QDN they will not.
    expect(missing).toEqual([]);
  });

  it('names the variable packages by their namespaced family', () => {
    const requested = requestedFamilies();

    // The bare names are kept as secondary fallbacks, but the namespaced name
    // is the one that can actually match the bundled face.
    expect(requested.has('Lexend Variable')).toBe(true);
    expect(requested.has('Inter Variable')).toBe(true);
  });

  it('puts the bundled face ahead of the system fallback in each stack', () => {
    const css = appCss;

    for (const [, stack] of css.matchAll(/--qch-font-body:\s*([^;]+);/g)) {
      const families = stack.split(',').map((entry: string) => entry.trim().replace(/^["']|["']$/g, ''));
      const firstBundled = families.findIndex((family: string) => !UNBUNDLED_FALLBACKS.has(family));
      const firstFallback = families.findIndex((family: string) => UNBUNDLED_FALLBACKS.has(family));

      expect(firstBundled).toBeGreaterThanOrEqual(0);
      expect(firstBundled).toBeLessThan(firstFallback);
    }
  });
});
