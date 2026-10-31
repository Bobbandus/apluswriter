import { ShootWorkspace } from '@/components/shoot/ShootWorkspace';

/** A+ Shoot for one script. Client-side throughout, like the editor. */
export default async function ShootProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ShootWorkspace projectId={projectId} />;
}
