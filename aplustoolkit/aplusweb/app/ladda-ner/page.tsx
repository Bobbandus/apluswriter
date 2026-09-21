import { getLocale, getTranslations } from 'next-intl/server';
import { Icon } from '@/components/icons/Icon';
import { ToolkitPage } from '@/components/toolkit/ToolkitPage';
import { DownloadButton } from '@/components/desktop/DownloadButton';
import { fileSize, getLatestRelease, RELEASES_URL } from '@/lib/release';
import styles from './page.module.css';

/* The page asks GitHub what is published. An hour is plenty — this changes a
   few times a year — and it keeps a cold visit off the API. */
export const revalidate = 3600;

export default async function DownloadPage() {
  const t = await getTranslations('download');
  const locale = await getLocale();
  const release = await getLatestRelease();

  const published = release?.published
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(release.published))
    : null;
  const size = release?.setup ? fileSize(release.setup.size, locale) : '';

  return (
    <ToolkitPage crumbs={[{ label: t('title'), href: '/ladda-ner' }]} eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')}>
      <div className={styles.split}>
        <section className={styles.main}>
          {/* Nothing published is a real state, and the old page's silent dead
              link is exactly what this is here to prevent. */}
          {release?.setup ? (
            <>
              <DownloadButton href={release.setup.url} label={t('button')} />
              <p className={styles.meta}>
                {[release.tag, published, size].filter(Boolean).join(' · ')}
              </p>
              {!release.updatable && <p className={styles.warn}>{t('noUpdates')}</p>}
            </>
          ) : (
            <div className={styles.none}>
              <p className={styles.noneTitle}>{t('noneTitle')}</p>
              <p>{t('noneBody')}</p>
              <a className={styles.link} href={RELEASES_URL}>
                {t('noneLink')}
              </a>
            </div>
          )}

          <h2 className={styles.heading}>{t('smartscreenTitle')}</h2>
          <p className={styles.body}>{t('smartscreenWhy')}</p>
          <ol className={styles.steps}>
            <li>{t('smartscreenStep1')}</li>
            <li>{t('smartscreenStep2')}</li>
            <li>{t('smartscreenStep3')}</li>
          </ol>

          {release?.notes && (
            <>
              <h2 className={styles.heading}>{t('whatsNew')}</h2>
              <Notes markdown={release.notes} />
            </>
          )}
        </section>

        <aside className={styles.side}>
          <h2 className={styles.sideTitle}>{t('requirementsTitle')}</h2>
          <ul className={styles.facts}>
            <li>{t('reqWindows')}</li>
            <li>{t('reqOffline')}</li>
            <li>{t('reqLocal')}</li>
          </ul>

          <h2 className={styles.sideTitle}>{t('claudeTitle')}</h2>
          <p className={styles.body}>{t('claudeBody')}</p>
          {release?.extension && (
            <a className={styles.link} href={release.extension.url}>
              <Icon name="download" size={14} /> {t('claudeDownload')}
            </a>
          )}

          <h2 className={styles.sideTitle}>{t('browserTitle')}</h2>
          <p className={styles.body}>{t('browserBody')}</p>
          <a className={styles.link} href="/plan/write">
            {t('browserLink')}
          </a>
        </aside>
      </div>
    </ToolkitPage>
  );
}

/**
 * The release notes, which are Markdown written by us in CHANGELOG.md.
 *
 * Deliberately not a Markdown renderer: this is our own text in a known shape,
 * and pulling in a parser to bold a few words would be a dependency for
 * nothing. Paragraphs and `**lead-ins**`, which is all the changelog uses.
 */
function Notes({ markdown }: { markdown: string }) {
  const paragraphs = markdown
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !p.startsWith('#'));

  return (
    <div className={styles.notes}>
      {paragraphs.map((paragraph, i) => (
        <p key={i}>
          {paragraph.split(/\*\*(.+?)\*\*/g).map((part, j) =>
            j % 2 === 1 ? <strong key={j}>{part}</strong> : part.replace(/\n/g, ' '),
          )}
        </p>
      ))}
    </div>
  );
}
