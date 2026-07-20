import { describe, expect, it } from 'vitest';
import { EN_STRINGS } from './locales/en';
import { createTranslator, isRtlLanguage, normalizeLanguage, OTHER_STRINGS, SUPPORTED_LANGUAGES } from './i18n';

const EN_KEYS = Object.keys(EN_STRINGS).sort();

function placeholders(value: string) {
  return (value.match(/\{(\w+)\}/g) ?? []).sort();
}

const NON_EN = SUPPORTED_LANGUAGES.filter((language) => language !== 'en');

describe('i18n locale parity', () => {
  it('registers a catalog for every supported non-English language', () => {
    expect(NON_EN.length).toBe(22);

    for (const language of NON_EN) {
      expect(OTHER_STRINGS[language], `missing catalog for ${language}`).toBeDefined();
    }
  });

  it.each(NON_EN)('locale "%s" has exactly the English key set', (language) => {
    const catalog = OTHER_STRINGS[language];
    expect(catalog, `missing catalog for ${language}`).toBeDefined();

    const keys = Object.keys(catalog ?? {}).sort();
    const missing = EN_KEYS.filter((key) => !(key in (catalog ?? {})));
    const extra = keys.filter((key) => !(key in EN_STRINGS));

    expect(missing, `${language} is missing keys`).toEqual([]);
    expect(extra, `${language} has unknown keys`).toEqual([]);
  });

  it.each(NON_EN)('locale "%s" preserves all {placeholder} tokens', (language) => {
    const catalog = (OTHER_STRINGS[language] ?? {}) as Record<string, string>;

    for (const key of EN_KEYS) {
      const translated = catalog[key];
      if (translated === undefined) {
        continue;
      }

      expect(placeholders(translated), `${language} → ${key} placeholder mismatch`).toEqual(
        placeholders((EN_STRINGS as Record<string, string>)[key]),
      );
    }
  });

  // Keys whose value legitimately matches English in a given locale: pure
  // punctuation templates, loanwords, and shared abbreviations. A value
  // identical to English that is NOT listed here is the classic signature of a
  // key added without translating it — add a real translation, or extend this
  // list only after confirming the English form is the correct native term.
  //
  // 'game.withResult' is allowlisted everywhere: it is a layout template
  // ('{summary} — {result} ({reason})') whose only literal characters are
  // punctuation, so any locale that keeps Latin parentheses matches English
  // by construction.
  //
  // 'square.occupied' is the same kind of thing: '{square}, {piece}' is the
  // accessible-name assembly template for an occupied square, and its only
  // literal characters are a comma and a space. It is allowlisted for every
  // locale that uses the Latin comma, and deliberately NOT for ar / ja /
  // zh-CN / zh-TW, which use their own comma (، 、 ，).
  const IDENTICAL_TO_ENGLISH_ALLOWLIST: Record<string, string[]> = {
    ar: ['game.withResult'],
    de: ['game.backToLobby', 'game.chat', 'game.withResult', 'nav.lobby', 'square.occupied'],
    el: ['game.withResult', 'square.occupied'],
    es: ['game.chat', 'game.withResult', 'square.occupied'],
    et: ['game.withResult', 'square.occupied'],
    fi: ['game.withResult', 'square.occupied'],
    fr: ['game.withResult', 'square.occupied'],
    he: ['game.withResult', 'square.occupied'],
    hi: ['game.withResult', 'square.occupied'],
    hu: ['game.withResult', 'square.occupied'],
    it: ['game.chat', 'game.withResult', 'square.occupied'],
    ja: [],
    ko: ['game.withResult', 'square.occupied'],
    nb: ['game.backToLobby', 'game.chat', 'game.send', 'game.withResult', 'nav.lobby', 'square.occupied'],
    nl: ['game.backToLobby', 'game.chat', 'game.withResult', 'nav.lobby', 'square.occupied'],
    pl: ['game.withResult', 'square.occupied'],
    pt: ['game.withResult', 'square.occupied'],
    ro: ['game.withResult', 'square.occupied'],
    ru: ['game.withResult', 'square.occupied'],
    sv: ['game.backToLobby', 'game.withResult', 'nav.lobby', 'square.occupied'],
    'zh-CN': [],
    'zh-TW': [],
  };

  it.each(NON_EN)('locale "%s" has no unexpected untranslated values', (language) => {
    const catalog = (OTHER_STRINGS[language] ?? {}) as Record<string, string>;
    const allowed = new Set(IDENTICAL_TO_ENGLISH_ALLOWLIST[language] ?? []);
    const unexpectedIdentical = EN_KEYS.filter(
      (key) =>
        catalog[key] !== undefined &&
        catalog[key] === (EN_STRINGS as Record<string, string>)[key] &&
        !allowed.has(key),
    );

    expect(
      unexpectedIdentical,
      `${language} has values identical to English that are not in the cognate allowlist — translate them (or allowlist a confirmed cognate)`,
    ).toEqual([]);
  });

  it('keeps the allowlist itself honest — no stale entries', () => {
    for (const [language, keys] of Object.entries(IDENTICAL_TO_ENGLISH_ALLOWLIST)) {
      const catalog = (OTHER_STRINGS[language as (typeof NON_EN)[number]] ?? {}) as Record<string, string>;
      const stale = keys.filter((key) => catalog[key] !== (EN_STRINGS as Record<string, string>)[key]);

      expect(stale, `${language} allowlists keys that are already translated`).toEqual([]);
    }
  });
});

describe('normalizeLanguage', () => {
  it('accepts every supported tag verbatim', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      expect(normalizeLanguage(language)).toBe(language);
    }
  });

  it('normalizes underscores, casing and surrounding space', () => {
    expect(normalizeLanguage('  ZH_tw  ')).toBe('zh-TW');
    expect(normalizeLanguage('DE')).toBe('de');
  });

  it('maps the explicit BCP-47 aliases', () => {
    expect(normalizeLanguage('en-GB')).toBe('en');
    expect(normalizeLanguage('en-US')).toBe('en');
    expect(normalizeLanguage('zh-Hans')).toBe('zh-CN');
    expect(normalizeLanguage('zh-Hant')).toBe('zh-TW');
  });

  it('falls back to the primary subtag, and to script/region for Chinese', () => {
    expect(normalizeLanguage('pt-BR')).toBe('pt');
    expect(normalizeLanguage('zh-HK')).toBe('zh-TW');
    expect(normalizeLanguage('zh-MO')).toBe('zh-TW');
    expect(normalizeLanguage('zh-Hant-TW')).toBe('zh-TW');
    expect(normalizeLanguage('zh-SG')).toBe('zh-CN');
  });

  it('rejects unknown, empty and non-string input', () => {
    expect(normalizeLanguage('kl')).toBeNull();
    expect(normalizeLanguage('   ')).toBeNull();
    expect(normalizeLanguage(undefined)).toBeNull();
    expect(normalizeLanguage(42)).toBeNull();
  });
});

describe('isRtlLanguage', () => {
  it('is true only for Arabic and Hebrew', () => {
    const rtl = SUPPORTED_LANGUAGES.filter((language) => isRtlLanguage(language));

    expect(rtl).toEqual(['ar', 'he']);
  });
});

describe('createTranslator', () => {
  it('returns the locale catalog value', () => {
    expect(createTranslator('de')('terminal.checkmate')).toBe('Schachmatt');
    expect(createTranslator('ru')('terminal.checkmate')).toBe('мат');
    expect(createTranslator('ja')('app.title')).toBe('チェス');
  });

  it('falls back to English for an unknown or missing language', () => {
    expect(createTranslator('kl')('app.title')).toBe(EN_STRINGS['app.title']);
    expect(createTranslator(undefined)('app.title')).toBe(EN_STRINGS['app.title']);
  });

  it('interpolates {placeholder} values', () => {
    expect(createTranslator('en')('status.playingAs', { name: 'Alice' })).toBe('Playing as Alice');
    expect(createTranslator('de')('status.playingAs', { name: 'Alice' })).toBe('Angemeldet als Alice');
  });

  it('leaves a placeholder untouched when no value is supplied', () => {
    expect(createTranslator('en')('status.playingAs')).toBe('Playing as {name}');
    expect(createTranslator('en')('status.playingAs', { other: 'x' })).toBe('Playing as {name}');
  });

  it('exposes the resolved locale for downstream formatting', () => {
    expect(createTranslator('zh-Hant')).toHaveProperty('locale', 'zh-TW');
    expect(createTranslator('nonsense')).toHaveProperty('locale', 'en');
  });
});
