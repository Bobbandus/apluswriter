'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icons/Icon';
import { useRepository } from '@/lib/storage/hooks';
import type { ProjectMeta } from '@/lib/storage/types';
import styles from './ProjectPicker.module.css';

export interface ProjectPickerProps {
  tool: 'shotlist' | 'stripboard' | 'shoot';
}

/**
 * Which script to plan from. The same projects as Write, newest first; a
 * planning tool has nothing to show until a script is chosen, so this is
 * the whole page rather than a dialog in front of an empty one.
 */
export function ProjectPicker({ tool }: ProjectPickerProps) {
  const t = useTranslations('production');
  const tProjects = useTranslations('projects');
  const tCommon = useTranslations('common');
  const { repo, session } = useRepository();
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);

  useEffect(() => {
    if (!session.ready) return;
    let cancelled = false;
    void repo.list().then((list) => {
      if (!cancelled) setProjects(list);
    });
    return () => {
      cancelled = true;
    };
  }, [repo, session.ready]);

  if (projects === null) return <p className={styles.quiet}>{tCommon('loading')}</p>;

  if (projects.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>{t('pickerEmpty')}</p>
        <p className={styles.quiet}>{t('pickerEmptyHint')}</p>
        <Link href="/plan/write" className={styles.emptyLink}>
          {t('pickerGoWrite')} <span aria-hidden="true">→</span>
        </Link>
      </div>
    );
  }

  return (
    <ul className={styles.list}>
      {projects.map((project) => (
        <li key={project.id}>
          <Link href={tool === 'shoot' ? `/shoot/${project.id}` : `/plan/${tool}/${project.id}`} className={styles.row}>
            <span className={styles.icon} aria-hidden="true">
              <Icon name="write" size={16} />
            </span>
            <span className={styles.text}>
              <span className={styles.title}>{project.title}</span>
              <span className={styles.meta}>
                {project.pages !== undefined || project.scenes !== undefined
                  ? t('pickerStats', { pages: project.pages ?? 0, scenes: project.scenes ?? 0 })
                  : null}
              </span>
            </span>
            <span className={styles.badge} data-location={project.location}>
              <Icon name={project.location === 'cloud' ? 'cloud' : 'device'} size={12} />
              {project.location === 'cloud' ? tProjects('locationCloud') : tProjects('locationLocal')}
            </span>
            <span className={styles.chevron} aria-hidden="true">
              <Icon name="chevronRight" size={16} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
