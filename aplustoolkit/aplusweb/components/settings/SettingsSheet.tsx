'use client';

import { useCallback, useEffect, useState, useTransition, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Sheet } from '@/components/ui/Sheet';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import type { EditorSettings } from '@/components/editor/fountain/settings';
import { locales, type Locale } from '@/i18n/config';
import { themes, defaultTheme, isTheme, type Theme } from '@/lib/theme';
import { applyTheme, persistLocale } from '@/lib/preferences';
import type { PageSize } from '@aplus/paginator/geometry';
import styles from './SettingsSheet.module.css';

/** Published with every release, at an address that never changes. */
const EXTENSION_URL = 'https://github.com/Bobbandus/apluswriter/releases/latest/download/aplus-toolkit.mcpb';

export interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  pageSize: PageSize;
  onPageSizeChange: (size: PageSize) => void;
  editor: EditorSettings;
  onEditorChange: (next: EditorSettings) => void;
  cards: boolean;
  onCardsChange: (next: boolean) => void;
  /** The writer's own note on how this script should sound. */
  styleGuide: string;
  onStyleGuideChange: (next: string) => void;
  /** Copies to `.fountain` files in a folder. Only the desktop app can; elsewhere `available` is false. */
  mirror?: { available: boolean; folder: string | null; choose: () => void; clear: () => void };
}

/** The colours each theme's miniature is painted in — read from the tokens. */
const THEME_SWATCHES: Record<Theme, { sidebar: string; canvas: string; page: string; edge: string }> = {
  light: { sidebar: '#ececed', canvas: '#dededf', page: '#ffffff', edge: 'rgba(0,0,0,0.12)' },
  dark: { sidebar: '#17171c', canvas: '#0f0f12', page: '#f7f5f0', edge: 'rgba(0,0,0,0.5)' },
  system: { sidebar: '#c9c9d0', canvas: '#3a3a42', page: '#f7f5f0', edge: 'rgba(0,0,0,0.3)' },
};

export function SettingsSheet({
  open,
  onClose,
  pageSize,
  onPageSizeChange,
  editor,
  onEditorChange,
  cards,
  onCardsChange,
  styleGuide,
  onStyleGuideChange,
  mirror,
}: SettingsSheetProps) {
  const t = useTranslations('settings');
  const tAssistant = useTranslations('assistant');
  const desktopApi =
    typeof window === 'undefined'
      ? undefined
      : (window as unknown as { aplusDesktop?: { setupClaude?: () => Promise<unknown> } }).aplusDesktop;
  const router = useRouter();
  const locale = useLocale() as Locale;

  const [theme, setTheme] = useState<Theme>(defaultTheme);
  const [, startTransition] = useTransition();

  // The server already set `data-theme`; read it back rather than keeping a
  // second copy of the truth in React state.
  useEffect(() => {
    const current = document.documentElement.dataset['themePref'] ?? document.documentElement.dataset['theme'];
    if (isTheme(current)) setTheme(current);
  }, [open]);

  const onThemeChange = useCallback((next: Theme) => {
    setTheme(next);
    applyTheme(next);
  }, []);

  const onLocaleChange = useCallback(
    (next: Locale) => {
      persistLocale(next);
      // Messages are resolved on the server, so the route has to re-render.
      startTransition(() => router.refresh());
    },
    [router],
  );

  return (
    <Sheet open={open} onClose={onClose} title={t('title')} width={560}>
      <div className={styles.group}>
        <p className={styles.groupTitle}>{t('appearance')}</p>

        <div>
          <div className={styles.fieldText}>
            <p className={styles.fieldLabel}>{t('theme')}</p>
          </div>

          <div
            className={styles.themeRow}
            role="radiogroup"
            aria-label={t('theme')}
            style={{ marginTop: 'var(--s-3)' }}
          >
            {themes.map((name) => {
              const swatch = THEME_SWATCHES[name];
              const vars: CSSProperties = {
                ['--sw-sidebar' as string]: swatch.sidebar,
                ['--sw-canvas' as string]: swatch.canvas,
                ['--sw-page' as string]: swatch.page,
                ['--sw-edge' as string]: swatch.edge,
              };

              return (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={theme === name}
                  className={styles.themeOption}
                  // Only System needs explaining — the other two are what their swatch shows.
                  title={name === 'system' ? t('themeSystemHint') : undefined}
                  onClick={() => onThemeChange(name)}
                >
                  <span className={styles.swatch} style={vars} aria-hidden="true">
                    <span className={styles.swatchSide} />
                    <span className={styles.swatchMain}>
                      <span className={styles.swatchPage} />
                    </span>
                  </span>
                  <span className={styles.themeName}>
                    {name === 'light'
                      ? t('themeLight')
                      : name === 'dark'
                        ? t('themeDark')
                        : t('themeSystem')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={styles.group}>
        <p className={styles.groupTitle}>{t('general')}</p>

        <div className={styles.field}>
          <div className={styles.fieldText}>
            <p className={styles.fieldLabel}>{t('language')}</p>
            <p className={styles.fieldHint}>{t('languageHint')}</p>
          </div>
          <div className={styles.fieldControl}>
            <SegmentedControl<Locale>
              label={t('language')}
              value={locale}
              onChange={onLocaleChange}
              options={locales.map((code) => ({
                value: code,
                label: code.toUpperCase(),
              }))}
            />
          </div>
        </div>
      </div>

      <div className={styles.group}>
        <p className={styles.groupTitle}>{t('editing')}</p>

        <Toggle
          label={t('renderNotes')}
          hint={t('renderNotesHint')}
          checked={editor.renderNotes}
          onChange={(renderNotes) => onEditorChange({ ...editor, renderNotes })}
        />

        <Toggle
          label={t('spellcheck')}
          hint={t('spellcheckHint')}
          checked={editor.spellcheck}
          onChange={(spellcheck) => onEditorChange({ ...editor, spellcheck })}
        />

        <Toggle
          label={t('autoUppercase')}
          hint={t('autoUppercaseHint')}
          checked={editor.autoUppercase}
          onChange={(autoUppercase) => onEditorChange({ ...editor, autoUppercase })}
        />

        <Toggle
          label={t('autoContd')}
          hint={t('autoContdHint')}
          checked={editor.autoContd}
          onChange={(autoContd) => onEditorChange({ ...editor, autoContd })}
        />

        <Toggle
          label={tAssistant('cardsSetting')}
          hint={tAssistant('cardsHint')}
          checked={cards}
          onChange={onCardsChange}
        />

        {/* Per project, and read by Claude before it writes a word. This is
            the one place the writer can push back on a house style that is
            not theirs. */}
        <div className={styles.fieldText}>
          <label className={styles.fieldLabel} htmlFor="aplus-style-guide">
            {tAssistant('styleGuide')}
          </label>
          <p className={styles.fieldHint}>{tAssistant('styleGuideHint')}</p>
          <textarea
            id="aplus-style-guide"
            className={styles.textarea}
            rows={3}
            value={styleGuide}
            placeholder={tAssistant('styleGuidePlaceholder')}
            onChange={(event) => onStyleGuideChange(event.target.value)}
          />
        </div>

        {!desktopApi?.setupClaude && (
          <div className={styles.field}>
            <div className={styles.fieldText}>
              <p className={styles.fieldLabel}>{tAssistant('connectClaude')}</p>
              <p className={styles.fieldHint}>{tAssistant('extensionHint')}</p>
            </div>
            <div className={styles.fieldControl}>
              <a className={styles.link} href={EXTENSION_URL}>
                {tAssistant('extensionDownload')}
              </a>
            </div>
          </div>
        )}

        {desktopApi?.setupClaude && (
          <div className={styles.field}>
            <div className={styles.fieldText}>
              <p className={styles.fieldLabel}>{tAssistant('connectClaude')}</p>
              <p className={styles.fieldHint}>{tAssistant('connectClaudeHint')}</p>
            </div>
            <div className={styles.fieldControl}>
              <Button variant="secondary" size="sm" icon="sparkle" onClick={() => void desktopApi.setupClaude?.()}>
                {tAssistant('connectClaudeButton')}
              </Button>
            </div>
          </div>
        )}

        {mirror?.available && (
          <div className={styles.field}>
            <div className={styles.fieldText}>
              <p className={styles.fieldLabel}>{t('mirror')}</p>
              <p className={styles.fieldHint}>{mirror.folder ? t('mirrorOn', { folder: mirror.folder }) : t('mirrorHint')}</p>
            </div>
            <div className={styles.fieldControl}>
              <Button variant="secondary" size="sm" onClick={mirror.choose}>
                {t('mirrorChoose')}
              </Button>
              {mirror.folder && (
                <Button variant="ghost" size="sm" onClick={mirror.clear}>
                  {t('mirrorOff')}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className={styles.field}>
          <div className={styles.fieldText}>
            <p className={styles.fieldLabel}>{t('tabOnCharacter')}</p>
          </div>
          <div className={styles.fieldControl}>
            <SegmentedControl<'parenthetical' | 'extension'>
              label={t('tabOnCharacter')}
              value={editor.tabOnCharacter}
              onChange={(tabOnCharacter) => onEditorChange({ ...editor, tabOnCharacter })}
              options={[
                { value: 'parenthetical', label: t('tabParenthetical') },
                { value: 'extension', label: t('tabExtension') },
              ]}
            />
          </div>
        </div>
      </div>

      <div className={styles.group}>
        <p className={styles.groupTitle}>{t('page')}</p>

        <div className={styles.field}>
          <div className={styles.fieldText}>
            <p className={styles.fieldLabel}>{t('pageSize')}</p>
          </div>
          <div className={styles.fieldControl}>
            <SegmentedControl<PageSize>
              label={t('pageSize')}
              value={pageSize}
              onChange={onPageSizeChange}
              options={[
                { value: 'a4', label: t('pageSizeA4') },
                { value: 'letter', label: t('pageSizeLetter') },
              ]}
            />
          </div>
        </div>
      </div>
    </Sheet>
  );
}
