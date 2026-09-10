// @vitest-environment jsdom
//
// Home-safe section navigation for the Developers workspace. These need a real
// DOM: focus, history, and scroll positions cannot be observed through
// renderToStaticMarkup. The jsdom environment is scoped to this file.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { parseChessRoute } from './deepLink';
import {
  APP_ROOT_SELECTOR,
  REFERENCE_SECTIONS,
  ReferenceNavigation,
  referenceSectionUrl,
  scrollToReferenceSection,
} from './ReferenceNavigation';

const SECTION_IDS = REFERENCE_SECTIONS.map(([id]) => id);

function rect(top: number): DOMRect {
  return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
}

/** Makes a jsdom element report as scrollable with the given geometry. */
function makeScrollable(element: HTMLElement, top: number) {
  element.style.overflowY = 'auto';
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 2000 });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: 400 });
  element.getBoundingClientRect = () => rect(top);
}

/** Renders the nav inside the app root with every section present. */
function renderReference({ scroller }: { scroller: boolean }) {
  const view = render(
    <main className={APP_ROOT_SELECTOR.slice(1)}>
      <div data-testid="inner">
        <ReferenceNavigation />
        {SECTION_IDS.map((id) => (
          <section id={id} key={id} tabIndex={-1}>
            {id}
          </section>
        ))}
      </div>
    </main>,
  );
  const inner = screen.getByTestId('inner');

  if (scroller) {
    makeScrollable(inner, 100);
  }

  return { ...view, inner };
}

describe('referenceSectionUrl', () => {
  it('builds base-safe document links that canonicalize only the owned route keys', () => {
    const href = referenceSectionUrl(
      'https://node.test/render/APP/Chess/Chess/?view=reference&view=developer&gameId=abc&qdnHomeBridge=fixture&theme=dark&future=a&future=b#old',
      'reference-hash',
    );
    const target = new URL(href, 'https://node.test/render/APP/Chess/Chess/');

    expect(href.startsWith('/render/APP/Chess/Chess/?')).toBe(true);
    expect(target.pathname).toBe('/render/APP/Chess/Chess/');
    expect(target.searchParams.getAll('view')).toEqual(['developers']);
    expect(target.searchParams.has('gameId')).toBe(false);
    expect(target.searchParams.get('qdnHomeBridge')).toBe('fixture');
    expect(target.searchParams.get('theme')).toBe('dark');
    expect(target.searchParams.getAll('future')).toEqual(['a', 'b']);
    expect(target.hash).toBe('#reference-hash');
    expect(parseChessRoute(target.search)).toEqual({ view: 'developers' });
  });

  it('renders a real document link for every section, never a base-sensitive bare fragment', () => {
    const html = renderToStaticMarkup(<ReferenceNavigation />);

    expect(html).toContain('aria-label="Developer reference sections"');
    for (const id of SECTION_IDS) {
      expect(html).toContain(`href="/?view=developers#${id}"`);
    }
    expect(html).not.toContain('href="#');
  });
});

describe('ReferenceNavigation in a document', () => {
  let pushState: MockInstance<History['pushState']>;
  let replaceState: MockInstance<History['replaceState']>;
  const scrollIntoView = vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>();

  beforeEach(() => {
    window.history.replaceState(null, '', '/?view=developers');
    pushState = vi.spyOn(window.history, 'pushState');
    replaceState = vi.spyOn(window.history, 'replaceState');
    scrollIntoView.mockClear();
    Element.prototype.scrollIntoView = scrollIntoView;
    document.documentElement.scrollTop = 0;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('pushes the section URL and scrolls only the bounded container, focusing the section', () => {
    const { inner } = renderReference({ scroller: true });
    const section = document.getElementById('reference-hash') as HTMLElement;
    section.getBoundingClientRect = () => rect(340);

    fireEvent.click(screen.getByRole('link', { name: 'Hash chain and move encoding' }));

    expect(pushState).toHaveBeenCalledTimes(1);
    expect(String(pushState.mock.calls[0][2])).toBe('/?view=developers#reference-hash');
    expect(window.location.hash).toBe('#reference-hash');
    expect(inner.scrollTop).toBe(240);
    expect(document.documentElement.scrollTop).toBe(0);
    expect(document.activeElement).toBe(section);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('falls back to the app document scrolling element when no bounded container exists', () => {
    renderReference({ scroller: false });
    const section = document.getElementById('reference-limits') as HTMLElement;
    section.getBoundingClientRect = () => rect(900);
    document.documentElement.scrollTop = 50;

    fireEvent.click(screen.getByRole('link', { name: 'Limits and security' }));

    expect(document.documentElement.scrollTop).toBe(950);
    expect(document.activeElement).toBe(section);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('never scrolls the app root itself even when it is the scrollable ancestor', () => {
    renderReference({ scroller: false });
    const root = document.querySelector<HTMLElement>(APP_ROOT_SELECTOR) as HTMLElement;
    makeScrollable(root, 0);
    const section = document.getElementById('reference-bridge') as HTMLElement;
    section.getBoundingClientRect = () => rect(120);

    fireEvent.click(screen.getByRole('link', { name: 'Home bridge and runtime modes' }));

    expect(root.scrollTop).toBe(0);
    expect(document.documentElement.scrollTop).toBe(120);
    expect(document.activeElement).toBe(section);
  });

  it('does not add a duplicate history entry when the hash already matches', () => {
    renderReference({ scroller: false });
    window.history.replaceState(null, '', '/?view=developers#reference-limits');

    fireEvent.click(screen.getByRole('link', { name: 'Limits and security' }));

    expect(pushState).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe('reference-limits');
  });

  it('leaves modified clicks to the browser', () => {
    renderReference({ scroller: false });
    const link = screen.getByRole('link', { name: 'Message types' });

    const prevented = !fireEvent.click(link, { ctrlKey: true });

    expect(prevented).toBe(false);
    expect(pushState).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(document.getElementById('reference-messages'));
  });

  it('follows Back/Forward and hash changes to the named section', () => {
    renderReference({ scroller: false });

    window.history.pushState(null, '', '/?view=developers#reference-validation');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(document.activeElement?.id).toBe('reference-validation');

    window.history.replaceState(null, '', '/?view=developers#reference-transport');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(document.activeElement?.id).toBe('reference-transport');
  });

  it('canonicalizes route aliases on mount without a history entry, keeping host params and the hash', () => {
    window.history.replaceState(null, '', '/?view=reference&theme=dark&qdnHomeBridge=fixture#reference-lifecycle');

    renderReference({ scroller: false });

    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalled();
    expect(new URLSearchParams(window.location.search).getAll('view')).toEqual(['developers']);
    expect(new URLSearchParams(window.location.search).get('theme')).toBe('dark');
    expect(new URLSearchParams(window.location.search).get('qdnHomeBridge')).toBe('fixture');
    expect(window.location.hash).toBe('#reference-lifecycle');
    expect(document.activeElement?.id).toBe('reference-lifecycle');
  });

  it('stops listening once unmounted', () => {
    const { unmount } = renderReference({ scroller: false });
    unmount();

    window.history.pushState(null, '', '/?view=developers#reference-limits');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(document.activeElement).toBe(document.body);
  });

  it('ignores unknown or missing ids', () => {
    renderReference({ scroller: false });

    expect(scrollToReferenceSection('not-a-section')).toBe(false);
    expect(scrollToReferenceSection('reference-limits', new Document())).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('scroll-into-view ban', () => {
  // The browser's scroll-into-view can move Home's outer Android document. No
  // production source may call it; only this test names it, to spy on it.
  it('no production source under src/ uses the browser scroll-into-view API', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          walk(path);
        } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
          if (readFileSync(path, 'utf8').includes('scrollInto' + 'View')) offenders.push(path);
        }
      }
    };
    walk(resolve(process.cwd(), 'src'));

    expect(offenders).toEqual([]);
  });
});
