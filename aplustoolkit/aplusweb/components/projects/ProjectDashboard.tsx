'use client';

import { IMPORT_ACCEPT, IMPORT_PATTERN, readScriptFile } from '@/lib/import/readScriptFile';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { AccountButton } from '@/components/auth/AccountButton';
import { DesktopDownloadBanner } from '@/components/desktop/DesktopDownloadBanner';
import { UpdatePill } from '@/components/desktop/UpdatePill';
import { ShareSheet } from './ShareSheet';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/icons/Icon';
import { Menu } from '@/components/ui/Menu';
import { SearchField } from '@/components/ui/SearchField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Sheet } from '@/components/ui/Sheet';
import { usePersistentState } from '@/lib/hooks/usePersistentState';
import { useRepository } from '@/lib/storage/hooks';
import { desktopApi, type OpenedScript } from '@/lib/platform';
import type { ProjectLocation, ProjectMeta } from '@/lib/storage/types';
import styles from './ProjectDashboard.module.css';

type Filter = 'all' | ProjectLocation;
type Sort = 'recent' | 'name';

/** "3 minutes ago", in the interface language. */
function relative(time: number, locale: string): string {
  const seconds = Math.round((time - Date.now()) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, 'minute');
}

/**
 * Every project, in one place.
 *
 * A project on this computer and a project in the cloud look the same here
 * and open the same way; the badge is the only difference. That is on
 * purpose — where a script is kept is a setting, not a different kind of
 * script. Cloud is the default for a signed-in writer, but nobody is ever
 * forced into it.
 */
export function ProjectDashboard() {
  const t = useTranslations('projects');
  const tAuth = useTranslations('auth');
  const tCommon = useTranslations('common');
  const [bannerDismissed, setBannerDismissed] = usePersistentState('aplus.ui.cloudBanner.dismissed', false);
  const locale = useLocale();
  const router = useRouter();
  const { repo, session } = useRepository();

  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<ProjectMeta | null>(null);
  const [deleting, setDeleting] = useState<ProjectMeta | null>(null);
  const [sharing, setSharing] = useState<ProjectMeta | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const signedIn = Boolean(session.email);

  const refresh = useCallback(async () => {
    await repo.migrateLegacy(tCommon('untitled'));
    setProjects(await repo.list());
  }, [repo, tCommon]);

  useEffect(() => {
    if (!session.ready) return;
    void refresh();
  }, [refresh, session.ready]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // The script written on last, one click away: opening the app is for writing.
  const latest = useMemo(
    () => (projects && projects.length > 0 ? projects.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a)) : null),
    [projects],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = (projects ?? []).filter(
      (p) => (filter === 'all' || p.location === filter) && (!needle || p.title.toLowerCase().includes(needle)),
    );
    return sort === 'name'
      ? [...list].sort((a, b) => a.title.localeCompare(b.title, locale))
      : [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [projects, query, filter, sort, locale]);

  /* ------------------------------------------------------------- actions */

  const create = async (title: string, location: ProjectLocation) => {
    try {
      const meta = await repo.create({ title: title.trim() || tCommon('untitled'), location });
      router.push(`/app/${meta.id}`);
    } catch (failure) {
      // Left unhandled, this vanished into an unhandled promise rejection:
      // the "Skapa"-knappen went idle again with no project, no navigation,
      // and nothing on screen to say why. Whatever Supabase actually
      // refused it for — RLS, a missing table, being signed out after
      // all — the writer sees it now instead of a dead button.
      setNotice(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const importFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!IMPORT_PATTERN.test(file.name)) {
        setNotice(t('importFailed'));
        continue;
      }
      try {
        const text = await readScriptFile(file);
        await repo.importFountain(file.name, text, signedIn ? 'cloud' : 'local');
      } catch {
        setNotice(t('importFailed'));
      }
    }
    await refresh();
  };

  /* A .fountain file double-clicked in Explorer, or dropped on the app icon.
     The shell reads it and hands over the text; from here it is an import like
     any other, so the file on disk is never written to by accident. */
  useEffect(() => {
    const api = desktopApi();
    if (!api?.takeOpenFiles) return;

    const open = async (files: OpenedScript[]) => {
      let last: ProjectMeta | null = null;
      for (const file of files) {
        try {
          last = await repo.importFountain(`${file.name}.fountain`, file.text, signedIn ? 'cloud' : 'local');
        } catch {
          setNotice(t('importFailed'));
        }
      }
      await refresh();
      // One file opens it; several land in the list rather than fighting over
      // which one wins the window.
      if (last && files.length === 1) router.push(`/app/${last.id}`);
    };

    void api.takeOpenFiles().then((files) => {
      if (files.length > 0) void open(files);
    });
    return api.onOpenFiles?.((files) => void open(files));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, signedIn]);

  const moveToCloud = async (project: ProjectMeta) => {
    try {
      await repo.moveToCloud(project.id);
      setNotice(t('movedToCloud'));
      await refresh();
    } catch (failure) {
      setNotice(failure instanceof Error ? failure.message : String(failure));
    }
  };

  // Session-only: a writer who still has local projects should see this again
  // next time, not have it silenced forever by one earlier dismissal.
  const [migrateDismissed, setMigrateDismissed] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const localCount = (projects ?? []).filter((p) => p.location === 'local').length;

  const moveAllToCloud = async () => {
    setMigrating(true);
    try {
      const moved = await repo.moveAllToCloud();
      setNotice(t('movedAllToCloud', { count: moved }));
      await refresh();
    } catch (failure) {
      setNotice(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setMigrating(false);
    }
  };

  /* -------------------------------------------------------------- render */

  return (
    <div
      className={styles.page}
      data-dragging={dragging || undefined}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void importFiles(event.dataTransfer.files);
      }}
    >
      <header className={styles.bar}>
        <nav aria-label="Breadcrumb" className={styles.brand}>
          <Link href="/">
            A<span className={styles.plus}>+</span> Toolkit
          </Link>
          <span aria-hidden="true" className={styles.sep}> / </span>
          <Link href="/plan">A+ Plan</Link>
          <span aria-hidden="true" className={styles.sep}> / </span>
          <span>{t('breadcrumbWrite')}</span>
        </nav>

        <AccountButton />
      </header>

      <main className={styles.main}>
        <div className={styles.titleRow}>
          <div>
            <p className={styles.eyebrow}>A+ Studios</p>
            <h1 className={styles.title}>{t('title')}</h1>
          </div>
          <div className={styles.titleActions}>
            <Button variant="ghost" icon="import" onClick={() => fileInput.current?.click()}>
              {t('import')}
            </Button>
            <Button variant={latest ? 'secondary' : 'primary'} icon="plus" onClick={() => setCreating(true)}>
              {t('create')}
            </Button>
            {latest && (
              <Button variant="primary" icon="write" onClick={() => router.push(`/app/${latest.id}`)} title={latest.title}>
                {t('continue')}
              </Button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept={IMPORT_ACCEPT}
              multiple
              hidden
              onChange={(event) => {
                if (event.target.files) void importFiles(event.target.files);
                event.target.value = '';
              }}
            />
          </div>
        </div>

        {session.configured && session.ready && !signedIn && !bannerDismissed && (
          <div className={styles.banner}>
            <Icon name="cloud" size={16} />
            <span>{t('cloudBanner')}</span>
            <Link href="/login" className={styles.bannerLink}>
              {tAuth('signIn')}
            </Link>
            <button type="button" className={styles.bannerClose} onClick={() => setBannerDismissed(true)} aria-label={tCommon('close')}>
              <Icon name="close" size={14} />
            </button>
          </div>
        )}

        {signedIn && localCount > 0 && !migrateDismissed && (
          <div className={styles.banner}>
            <Icon name="upload" size={16} />
            <span>{t('migrateBanner', { count: localCount })}</span>
            <button type="button" className={styles.bannerLink} disabled={migrating} onClick={() => void moveAllToCloud()}>
              {migrating ? t('migrating') : t('migrateAll')}
            </button>
            <button
              type="button"
              className={styles.bannerClose}
              onClick={() => setMigrateDismissed(true)}
              aria-label={tCommon('close')}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        )}

        <UpdatePill />
        <DesktopDownloadBanner />

        {projects && projects.length > 0 && (
          <div className={styles.toolbar}>
            <SearchField value={query} onValueChange={setQuery} placeholder={t('search')} className={styles.search} />
            {signedIn && (
              <SegmentedControl<Filter>
                label={t('title')}
                size="sm"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: t('filterAll') },
                  { value: 'cloud', label: t('filterCloud'), icon: 'cloud' },
                  { value: 'local', label: t('filterLocal'), icon: 'device' },
                ]}
              />
            )}
            <SegmentedControl<Sort>
              label={t('sortRecent')}
              size="sm"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'recent', label: t('sortRecent') },
                { value: 'name', label: t('sortName') },
              ]}
            />
          </div>
        )}

        {projects === null ? null : projects.length === 0 ? (
          <section className={styles.empty}>
            <span className={styles.emptyPage} aria-hidden="true">
              <span>INT. NÅGONSTANS – DAG</span>
            </span>
            <h2>{t('empty')}</h2>
            <p>{t('emptyHint')}</p>
            <div className={styles.emptyActions}>
              <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
                {t('create')}
              </Button>
              <Button variant="ghost" icon="import" onClick={() => fileInput.current?.click()}>
                {t('import')}
              </Button>
            </div>
          </section>
        ) : visible.length === 0 ? (
          <p className={styles.nothing}>{t('nothingFound')}</p>
        ) : (
          <ul className={styles.grid}>
            {visible.map((project) => (
              <li key={project.id} className={styles.cardWrap}>
                <Link href={`/app/${project.id}`} className={styles.card} aria-label={t('openProject', { title: project.title })}>
                  <span className={styles.sheet} aria-hidden="true">
                    <span className={styles.sheetTitle}>{project.title.toUpperCase()}</span>
                  </span>
                  <span className={styles.cardBody}>
                    <span className={styles.cardTitle}>{project.title}</span>
                    <span className={styles.cardMeta}>
                      {project.pages !== undefined &&
                        `${t('stats', { pages: project.pages, scenes: project.scenes ?? 0 })} · `}
                      {relative(project.updatedAt, locale)}
                    </span>
                  </span>
                </Link>

                <span className={styles.badge} data-location={project.location} title={project.location === 'cloud' ? t('locationCloud') : t('locationLocal')}>
                  <Icon name={project.location === 'cloud' ? 'cloud' : 'device'} size={13} />
                  <span>{project.location === 'cloud' ? t('locationCloud') : t('locationLocal')}</span>
                </span>

                <span className={styles.menu}>
                  <Menu
                    items={[
                      { label: t('open'), icon: 'write', onSelect: () => router.push(`/app/${project.id}`) },
                      { label: t('rename'), icon: 'elCharacter', onSelect: () => setRenaming(project) },
                      {
                        label: t('duplicate'),
                        icon: 'copy',
                        onSelect: () => void repo.duplicate(project.id, t('copySuffix')).then(refresh),
                      },
                      ...(signedIn && project.location === 'local'
                        ? [{ label: t('moveToCloud'), icon: 'upload' as const, onSelect: () => void moveToCloud(project) }]
                        : []),
                      ...(signedIn && project.location === 'cloud'
                        ? [{ label: t('share'), icon: 'share' as const, onSelect: () => setSharing(project) }]
                        : []),
                      'separator',
                      { label: t('delete'), icon: 'trash', danger: true, onSelect: () => setDeleting(project) },
                    ]}
                    trigger={(props) => (
                      <button type="button" className={styles.menuButton} aria-label={t('actions', { title: project.title })} {...props}>
                        <Icon name="ellipsis" size={16} />
                      </button>
                    )}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </main>

      {dragging && (
        <div className={styles.drop} aria-hidden="true">
          <Icon name="import" size={28} />
          <span>{t('dropHint')}</span>
        </div>
      )}

      {notice && (
        <div className={styles.toast} role="status">
          {notice}
        </div>
      )}

      <NewProjectSheet open={creating} signedIn={signedIn} onClose={() => setCreating(false)} onCreate={create} />

      <ShareSheet project={sharing} onClose={() => setSharing(null)} />

      <RenameSheet
        project={renaming}
        onClose={() => setRenaming(null)}
        onRename={async (title) => {
          if (renaming) await repo.rename(renaming.id, title);
          setRenaming(null);
          await refresh();
        }}
      />

      <Sheet
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('deleteTitle', { title: deleting?.title ?? '' })}
        width={440}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              {tCommon('cancel')}
            </Button>
            <Button
              variant="danger"
              icon="trash"
              onClick={async () => {
                if (deleting) await repo.remove(deleting.id);
                setDeleting(null);
                await refresh();
              }}
            >
              {t('delete')}
            </Button>
          </>
        }
      >
        <p className={styles.sheetText}>
          {deleting?.location === 'cloud' ? t('deleteBodyCloud') : t('deleteBodyLocal')}
        </p>
      </Sheet>
    </div>
  );
}

/* ========================================================================== */

function NewProjectSheet({
  open,
  signedIn,
  onClose,
  onCreate,
}: {
  open: boolean;
  signedIn: boolean;
  onClose: () => void;
  onCreate: (title: string, location: ProjectLocation) => Promise<void>;
}) {
  const t = useTranslations('projects');
  const tCommon = useTranslations('common');
  const [title, setTitle] = useState('');
  // Cloud is the default for anyone signed in — the main path — but it is
  // one click away from staying on this computer.
  const [location, setLocation] = useState<ProjectLocation>(signedIn ? 'cloud' : 'local');
  const [busy, setBusy] = useState(false);

  useEffect(() => setLocation(signedIn ? 'cloud' : 'local'), [signedIn, open]);

  const submit = async () => {
    setBusy(true);
    try {
      await onCreate(title, location);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('create')}
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>
            {t('create')}
          </Button>
        </>
      }
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className={styles.field}>
          <span>{t('createTitle')}</span>
          <input
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={tCommon('untitled')}
            autoFocus
            // Enter creates, explicitly. Implicit form submission is not
            // reliable once a form holds more than one kind of input.
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void submit();
              }
            }}
          />
        </label>

        {signedIn && (
          <fieldset className={styles.where}>
            <legend>{t('whereTitle')}</legend>
            {(['cloud', 'local'] as const).map((value) => (
              <label key={value} className={styles.whereOption} data-checked={location === value || undefined}>
                <input type="radio" name="where" value={value} checked={location === value} onChange={() => setLocation(value)} />
                <Icon name={value === 'cloud' ? 'cloud' : 'device'} size={18} />
                <span>
                  <strong>{value === 'cloud' ? t('whereCloud') : t('whereLocal')}</strong>
                  <small>{value === 'cloud' ? t('whereCloudHint') : t('whereLocalHint')}</small>
                </span>
              </label>
            ))}
          </fieldset>
        )}
      </form>
    </Sheet>
  );
}

function RenameSheet({
  project,
  onClose,
  onRename,
}: {
  project: ProjectMeta | null;
  onClose: () => void;
  onRename: (title: string) => Promise<void>;
}) {
  const t = useTranslations('projects');
  const tCommon = useTranslations('common');
  const [title, setTitle] = useState('');

  useEffect(() => setTitle(project?.title ?? ''), [project]);

  return (
    <Sheet
      open={project !== null}
      onClose={onClose}
      title={t('rename')}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button variant="primary" onClick={() => void onRename(title.trim() || (project?.title ?? ''))}>
            {tCommon('save')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onRename(title.trim() || (project?.title ?? ''));
        }}
      >
        <input
          className={styles.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          aria-label={t('rename')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void onRename(title.trim() || (project?.title ?? ''));
            }
          }}
        />
      </form>
    </Sheet>
  );
}
