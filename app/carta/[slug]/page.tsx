import { notFound } from 'next/navigation'
import { getPublicMenu } from '@/app/actions/menu'
import { PublicMenuView } from '@/components/public-menu-view'

export const revalidate = 30

export default async function PublicMenuPage({ params }: Readonly<{ params: Promise<{ slug: string }> }>) {
  const { slug } = await params
  const menu = await getPublicMenu(slug)
  if (!menu) notFound()
  return <PublicMenuView menu={menu} slug={slug} />
}
