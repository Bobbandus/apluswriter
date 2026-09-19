'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import styles from './ProjectDashboard.module.css';

interface ProjectCard { id: string; title: string; updatedAt: number; }
const PROJECTS_KEY = 'aplus.projects';

export function ProjectDashboard() {
  const t = useTranslations('projects');
  const common = useTranslations('common');
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  useEffect(() => { try { setProjects(JSON.parse(localStorage.getItem(PROJECTS_KEY) ?? '[]') as ProjectCard[]); } catch { setProjects([]); } }, []);
  const createProject = () => {
    const project = { id: crypto.randomUUID(), title: common('untitled'), updatedAt: Date.now() };
    const next = [project, ...projects]; setProjects(next); localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)); window.location.assign(`/app/${project.id}`);
  };
  return <main className={styles.page}><header className={styles.header}><div><p className={styles.eyebrow}>A+ Studios</p><h1>{t('title')}</h1></div><Button variant="primary" icon="write" onClick={createProject}>{t('create')}</Button></header>
    {projects.length === 0 ? <section className={styles.empty}><h2>{t('empty')}</h2><p>{t('emptyHint')}</p><Button variant="secondary" onClick={createProject}>{t('create')}</Button></section> : <section className={styles.grid}>{projects.map((project) => <Link href={`/app/${project.id}`} className={styles.card} key={project.id}><span className={styles.document} aria-hidden="true" /><h2>{project.title}</h2><p>{t('lastEdited', { time: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(project.updatedAt) })}</p></Link>)}</section>}
  </main>;
}
