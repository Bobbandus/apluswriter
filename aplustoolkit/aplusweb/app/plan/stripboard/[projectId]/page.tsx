import { ProductionWorkspace } from '@/components/production/ProductionWorkspace';

/** One script's stripboard. Client-side throughout, like the editor. */
export default async function StripboardPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProductionWorkspace projectId={projectId} view="stripboard" />;
}
