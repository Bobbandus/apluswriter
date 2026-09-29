import { ProductionWorkspace } from '@/components/production/ProductionWorkspace';

/** One script's shotlists. Client-side throughout, like the editor. */
export default async function ShotlistPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProductionWorkspace projectId={projectId} view="shotlist" />;
}
