import type { Metadata, Viewport } from 'next';
import { ProjectSlate } from '@/components/shoot/ProjectSlate';

export const metadata: Metadata = { title: 'Klappa · A+ Shoot' };

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, themeColor: '#0d0d10', viewportFit: 'cover' };

/** The slate, run from a script's shotlist. */
export default async function ProjectSlatePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectSlate projectId={projectId} />;
}
