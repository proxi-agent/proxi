import { PortalPlaceholder } from '@/components/portal-placeholder'

export default async function IssuerCatchAll({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  return <PortalPlaceholder portal='issuer' slug={slug} />
}
