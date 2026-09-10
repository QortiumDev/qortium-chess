// Section navigation for the Developers workspace (fleet pattern, ported from
// qortium-help).
//
// Core injects a `<base href>` into every rendered QDN page, so a bare
// `href="#section"` resolves against that base instead of the current document
// and native fragment navigation can scroll Home's OUTER Android document. Every
// link here is therefore a full document URL built from `window.location.href`
// (pathname and query kept, only the hash set), plain clicks are intercepted and
// pushed through the History API, and the scroll is applied by hand to the
// nearest scrollable ancestor bounded at the app root — falling back to the app
// document's own scrolling element, never the browser's scroll-into-view.

import { useEffect, type MouseEvent } from 'react';
import { buildChessRoute } from './deepLink';

export const REFERENCE_SECTIONS = [
  ['reference-contract', 'Contract and envelope'],
  ['reference-messages', 'Message types'],
  ['reference-hash', 'Hash chain and move encoding'],
  ['reference-validation', 'Validation and compatibility'],
  ['reference-transport', 'Transport and discovery'],
  ['reference-lifecycle', 'Authority, lifecycle, and state'],
  ['reference-bridge', 'Home bridge and runtime modes'],
  ['reference-limits', 'Limits and security'],
] as const;

export type ReferenceSectionId = (typeof REFERENCE_SECTIONS)[number][0];

/** The element section navigation may never scroll past: the app's own root. */
export const APP_ROOT_SELECTOR = '.app-shell';

/** Used for server rendering and tests, where there is no window at all. */
const FALLBACK_HREF = '/?view=developers';

export function isReferenceSectionId(value: string): value is ReferenceSectionId {
  return REFERENCE_SECTIONS.some(([id]) => id === value);
}

/**
 * A base-safe link to one section: the current document's pathname and query
 * with the route canonicalized (`developer`/`reference` aliases fold onto
 * `developers`, Home's own params survive) and only the hash replaced.
 */
export function referenceSectionUrl(input: string, id: ReferenceSectionId): string {
  const url = new URL(input, 'http://localhost');

  url.hash = id;

  return buildChessRoute({ view: 'developers' }, url);
}

function currentHref(): string {
  return typeof window === 'undefined' ? FALLBACK_HREF : window.location.href;
}

function currentDocumentPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/**
 * The nearest ancestor that actually scrolls, stopping at the app root. The
 * root itself is never returned: scrolling it is what would move Home.
 */
function scrollableAncestor(section: HTMLElement, root: HTMLElement | null): HTMLElement | null {
  let container = section.parentElement;

  while (container && container !== root) {
    const { overflowY } = getComputedStyle(container);

    if (/(auto|scroll)/.test(overflowY) && container.scrollHeight > container.clientHeight) {
      return container;
    }

    container = container.parentElement;
  }

  return null;
}

/**
 * Bring a section to the top of its scroll container and move focus to it.
 * Never uses the browser's scroll-into-view; when no bounded container exists the app
 * document's own scrolling element is adjusted, which cannot reach the host.
 * Returns false when the id is unknown or not on the page.
 */
export function scrollToReferenceSection(id: string, doc: Document = document): boolean {
  if (!isReferenceSectionId(id)) {
    return false;
  }

  const section = doc.getElementById(id);

  if (!section) {
    return false;
  }

  const root = section.closest<HTMLElement>(APP_ROOT_SELECTOR);
  const container = scrollableAncestor(section, root);
  const sectionTop = section.getBoundingClientRect().top;

  if (container) {
    container.scrollTop += sectionTop - container.getBoundingClientRect().top;
  } else {
    const scroller = doc.scrollingElement ?? doc.documentElement;

    scroller.scrollTop += sectionTop;
  }

  section.focus({ preventScroll: true });

  return true;
}

function scrollToCurrentHash() {
  scrollToReferenceSection(window.location.hash.slice(1));
}

export function ReferenceNavigation() {
  useEffect(() => {
    // Canonicalize without a history entry: aliases re-serialize as
    // `developers`; host params and any section hash are kept.
    const canonical = buildChessRoute({ view: 'developers' }, window.location);

    if (canonical !== currentDocumentPath()) {
      window.history.replaceState(window.history.state, '', canonical);
    }

    scrollToCurrentHash();
    window.addEventListener('popstate', scrollToCurrentHash);
    window.addEventListener('hashchange', scrollToCurrentHash);

    return () => {
      window.removeEventListener('popstate', scrollToCurrentHash);
      window.removeEventListener('hashchange', scrollToCurrentHash);
    };
  }, []);

  function visit(event: MouseEvent<HTMLAnchorElement>, id: ReferenceSectionId) {
    // Modified clicks keep their native meaning (new tab, download, ...).
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();

    if (window.location.hash !== `#${id}`) {
      window.history.pushState(window.history.state, '', referenceSectionUrl(window.location.href, id));
    }

    scrollToReferenceSection(id);
  }

  return (
    <nav aria-label="Developer reference sections" className="reference-toc">
      {REFERENCE_SECTIONS.map(([id, label]) => (
        <a href={referenceSectionUrl(currentHref(), id)} key={id} onClick={(event) => visit(event, id)}>
          {label}
        </a>
      ))}
    </nav>
  );
}
