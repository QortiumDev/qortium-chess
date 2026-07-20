// The supported-language list, the BCP-47 mapper and the RTL helper all live in
// ./i18n — the module that owns the catalogs — and are re-exported here so the
// display layer stays the single import site for host display settings.
import { isRtlLanguage, normalizeLanguage as normalizeLanguageTag, SUPPORTED_LANGUAGES } from './i18n';
import type { SupportedLanguage } from './i18n';

export const TEXT_SIZE_VALUES = ['extra-small', 'small', 'medium', 'large', 'extra-large', 'huge'] as const;
export const ACCENT_OPTIONS = ['green', 'blue', 'orange', 'purple', 'red', 'teal', 'cyan', 'pink', 'yellow'] as const;
export const UI_STYLE_OPTIONS = ['classic', 'modern', 'fun'] as const;

export { isRtlLanguage, SUPPORTED_LANGUAGES };
export type { SupportedLanguage };

export type QdnTheme = 'dark' | 'light';
export type QdnTextSize = (typeof TEXT_SIZE_VALUES)[number];
export type QdnAccent = (typeof ACCENT_OPTIONS)[number];
export type QdnUiStyle = (typeof UI_STYLE_OPTIONS)[number];

export type QdnDisplaySettings = {
  accent: QdnAccent;
  language: SupportedLanguage;
  textSize: QdnTextSize;
  theme: QdnTheme;
  uiStyle: QdnUiStyle;
};

type QdnHostWindow = Window & {
  _qdnAccent?: unknown;
  _qdnLang?: unknown;
  _qdnLanguage?: unknown;
  _qdnTextSize?: unknown;
  _qdnTheme?: unknown;
  _qdnUiStyle?: unknown;
  _qdnUIStyle?: unknown;
};

export const DEFAULT_DISPLAY_SETTINGS: QdnDisplaySettings = {
  accent: 'green',
  language: 'en',
  textSize: 'medium',
  theme: 'light',
  uiStyle: 'classic',
};

/* fouc-1 — DUPLICATED LOGIC, INTENTIONAL, PINNED BY A TEST.
   ---------------------------------------------------------------------------
   index.html carries a small inline <script> in <head> that stamps the four
   attributes below onto <html> before the render-blocking stylesheet paints.
   It has to be inline and duplicated: this module arrives as a deferred ES
   module, so by the time applyDisplaySettings() runs the browser has already
   painted a frame of the Classic-light defaults (measured ~140ms of light
   background on a ?theme=dark load).

   That inline copy re-implements a slice of this file: the query-param names,
   the ?-vs-window precedence, the trim/lowercase + membership normalization,
   the defaults, and the attribute names. Divergence between the two would be
   invisible at build time and would surface only as a flash of the WRONG
   setting, so the pair is pinned by src/bootTheme.test.ts, which extracts the
   real script out of index.html, runs it, and asserts its output matches
   applyDisplaySettings(getInitialDisplaySettings()) over a matrix of URLs.
   Change one side and that test fails. Change both together.

   Scope is deliberately limited to the four attributes styles.css actually
   keys on. `language`/`dir` are NOT duplicated: no selector in styles.css
   matches [dir] or [data-language], so they cannot flash the stylesheet, and
   inlining the BCP-47 mapper would be the larger correctness risk. */
export const BOOT_STYLE_CONTRACT = {
  accent: { attribute: 'data-accent', default: DEFAULT_DISPLAY_SETTINGS.accent, values: ACCENT_OPTIONS },
  textSize: { attribute: 'data-text-size', default: DEFAULT_DISPLAY_SETTINGS.textSize, values: TEXT_SIZE_VALUES },
  theme: { attribute: 'data-theme', default: DEFAULT_DISPLAY_SETTINGS.theme, values: ['dark', 'light'] },
  uiStyle: { attribute: 'data-ui', default: DEFAULT_DISPLAY_SETTINGS.uiStyle, values: UI_STYLE_OPTIONS },
} as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

export function normalizeTheme(value: unknown): QdnTheme | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return normalized === 'dark' || normalized === 'light' ? normalized : null;
}

export function normalizeLanguage(value: unknown): SupportedLanguage | null {
  return normalizeLanguageTag(value);
}

export function normalizeTextSize(value: unknown): QdnTextSize | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return TEXT_SIZE_VALUES.includes(normalized as QdnTextSize) ? (normalized as QdnTextSize) : null;
}

export function normalizeAccent(value: unknown): QdnAccent | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return ACCENT_OPTIONS.includes(normalized as QdnAccent) ? (normalized as QdnAccent) : null;
}

// Single shared uiStyle normalizer. Do NOT replace this with a two-branch
// `=== 'modern' ? 'modern' : 'classic'` check: that silently downgrades 'fun'.
export function normalizeUiStyle(value: unknown): QdnUiStyle | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return UI_STYLE_OPTIONS.includes(normalized as QdnUiStyle) ? (normalized as QdnUiStyle) : null;
}

export function getInitialDisplaySettings(): QdnDisplaySettings {
  const hostWindow = typeof window === 'undefined' ? null : (window as QdnHostWindow);
  const query = typeof window === 'undefined' ? null : new URLSearchParams(window.location?.search ?? '');

  return {
    accent: normalizeAccent(query?.get('accent') ?? hostWindow?._qdnAccent) ?? DEFAULT_DISPLAY_SETTINGS.accent,
    language:
      normalizeLanguage(query?.get('lang') ?? query?.get('language') ?? hostWindow?._qdnLang ?? hostWindow?._qdnLanguage) ??
      DEFAULT_DISPLAY_SETTINGS.language,
    textSize:
      normalizeTextSize(query?.get('textSize') ?? query?.get('text-size')) ??
      normalizeTextSize(hostWindow?._qdnTextSize) ??
      DEFAULT_DISPLAY_SETTINGS.textSize,
    theme: normalizeTheme(query?.get('theme') ?? hostWindow?._qdnTheme) ?? DEFAULT_DISPLAY_SETTINGS.theme,
    uiStyle:
      normalizeUiStyle(query?.get('uiStyle') ?? query?.get('ui-style') ?? hostWindow?._qdnUiStyle ?? hostWindow?._qdnUIStyle) ??
      DEFAULT_DISPLAY_SETTINGS.uiStyle,
  };
}

export function applyDisplaySettings(settings: QdnDisplaySettings) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;

  root.dataset.accent = settings.accent;
  root.dataset.language = settings.language;
  root.dataset.textSize = settings.textSize;
  root.dataset.theme = settings.theme;
  root.dataset.ui = settings.uiStyle;
  root.dir = isRtlLanguage(settings.language) ? 'rtl' : 'ltr';
  root.lang = settings.language;
  root.style.colorScheme = settings.theme;
}

export function getDisplaySettingsUpdateFromMessage(
  data: unknown,
  current: QdnDisplaySettings,
): QdnDisplaySettings | null {
  if (!isObject(data) || typeof data.action !== 'string') {
    return null;
  }

  if ('requestedHandler' in data && data.requestedHandler !== 'UI') {
    return null;
  }

  switch (data.action) {
    case 'ACCENT_CHANGED': {
      const accent = normalizeAccent(data.accent ?? data.qdnAccent);

      return accent ? { ...current, accent } : null;
    }
    case 'DISPLAY_SETTINGS_CHANGED': {
      return {
        accent: normalizeAccent(data.accent ?? data.qdnAccent) ?? current.accent,
        language: normalizeLanguage(data.language ?? data.lang ?? data.qdnLang) ?? current.language,
        textSize: normalizeTextSize(data.textSize ?? data.qdnTextSize) ?? current.textSize,
        theme: normalizeTheme(data.theme ?? data.qdnTheme) ?? current.theme,
        uiStyle: normalizeUiStyle(data.uiStyle ?? data.ui ?? data.qdnUiStyle ?? data.qdnUIStyle) ?? current.uiStyle,
      };
    }
    case 'LANGUAGE_CHANGED': {
      const language = normalizeLanguage(data.language ?? data.lang ?? data.qdnLang);

      return language ? { ...current, language } : null;
    }
    case 'TEXT_SIZE_CHANGED': {
      const textSize = normalizeTextSize(data.textSize ?? data.qdnTextSize);

      return textSize ? { ...current, textSize } : null;
    }
    case 'THEME_CHANGED': {
      const theme = normalizeTheme(data.theme ?? data.qdnTheme);

      return theme ? { ...current, theme } : null;
    }
    case 'UI_STYLE_CHANGED': {
      const uiStyle = normalizeUiStyle(data.uiStyle ?? data.ui ?? data.qdnUiStyle ?? data.qdnUIStyle);

      return uiStyle ? { ...current, uiStyle } : null;
    }
    default:
      return null;
  }
}
