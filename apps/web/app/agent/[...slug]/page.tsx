import { PortalPlaceholder } from '@/components/portal-placeholder'

export default async function AgentCatchAll({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  return <PortalPlaceholder portal='agent' slug={slug} />
}
