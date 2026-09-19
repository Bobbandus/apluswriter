import { ProjectWorkspace } from '@/components/workspace/ProjectWorkspace';

/**
 * A thin server shell around a fully client-side editor.
 *
 * Nothing about editing may depend on the server — see ProjectWorkspace.
 */
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectWorkspace projectId={projectId} />;
}
