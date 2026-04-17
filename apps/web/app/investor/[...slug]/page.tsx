import { PortalPlaceholder } from '@/components/portal-placeholder'

export default async function InvestorCatchAll({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  return <PortalPlaceholder portal='investor' slug={slug} />
}
