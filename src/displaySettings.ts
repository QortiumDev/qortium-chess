export const TEXT_SIZE_VALUES = ['extra-small', 'small', 'medium', 'large', 'extra-large', 'huge'] as const;
export const ACCENT_OPTIONS = ['green', 'blue', 'orange', 'purple', 'red', 'teal', 'cyan', 'pink', 'yellow'] as const;
export const UI_STYLE_OPTIONS = ['classic', 'modern', 'fun'] as const;

// Chess has no i18n catalogs yet, so the supported-language list and the RTL
// helper live here instead of being imported from a shared i18n module. Keep
// this list in sync with qortium-help/src/i18n.ts if Chess ever gains i18n.
export const SUPPORTED_LANGUAGES = [
  'ar',
  'de',
  'el',
  'en',
  'es',
  'et',
  'fi',
  'fr',
  'he',
  'hi',
  'hu',
  'it',
  'ja',
  'ko',
  'nb',
  'nl',
  'pl',
  'pt',
  'ro',
  'ru',
  'sv',
  'zh-CN',
  'zh-TW',
] as const;

export type QdnTheme = 'dark' | 'light';
export type QdnTextSize = (typeof TEXT_SIZE_VALUES)[number];
export type QdnAccent = (typeof ACCENT_OPTIONS)[number];
export type QdnUiStyle = (typeof UI_STYLE_OPTIONS)[number];
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

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

const SUPPORTED_LANGUAGE_SET = new Set<string>(SUPPORTED_LANGUAGES);
const RTL_LANGUAGES = new Set<string>(['ar', 'he']);

const DEFAULT_DISPLAY_SETTINGS: QdnDisplaySettings = {
  accent: 'green',
  language: 'en',
  textSize: 'medium',
  theme: 'light',
  uiStyle: 'classic',
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function normalizeRawLanguage(language: string) {
  return language.trim().replace(/_/g, '-').toLowerCase();
}

function mapRawLanguage(language: string): SupportedLanguage | null {
  const normalized = normalizeRawLanguage(language);

  if (!normalized) {
    return null;
  }

  const explicit: Partial<Record<string, SupportedLanguage>> = {
    'en-gb': 'en',
    'en-us': 'en',
    'zh-cn': 'zh-CN',
    'zh-hans': 'zh-CN',
    'zh-hant': 'zh-TW',
    'zh-tw': 'zh-TW',
  };
  const mapped = explicit[normalized];

  if (mapped) {
    return mapped;
  }

  const [primary, ...rest] = normalized.split('-');

  if (primary && SUPPORTED_LANGUAGE_SET.has(primary)) {
    return primary as SupportedLanguage;
  }

  if (primary === 'zh') {
    if (rest.some((part) => part.includes('tw') || part.includes('hk') || part.includes('mo') || part.includes('hant'))) {
      return 'zh-TW';
    }

    return 'zh-CN';
  }

  return null;
}

export function isRtlLanguage(language: SupportedLanguage) {
  return RTL_LANGUAGES.has(language);
}

export function normalizeTheme(value: unknown): QdnTheme | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return normalized === 'dark' || normalized === 'light' ? normalized : null;
}

export function normalizeLanguage(value: unknown): SupportedLanguage | null {
  return typeof value === 'string' ? mapRawLanguage(value) : null;
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
