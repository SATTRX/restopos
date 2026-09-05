import { notFound } from 'next/navigation'
import { UtensilsCrossed } from 'lucide-react'
import { getPublicMenu } from '@/app/actions/menu'
import { iconForTag } from '@/lib/menu-tags'

export const revalidate = 30

export default async function PublicMenuPage({ params }: Readonly<{ params: Promise<{ slug: string }> }>) {
  const { slug } = await params
  const menu = await getPublicMenu(slug)
  if (!menu) notFound()

  const brandStyle = { '--brand': menu.primaryColor } as React.CSSProperties

  return (
    <main style={brandStyle} className="relative min-h-screen bg-background text-foreground">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 flex select-none items-center justify-center overflow-hidden">
        {menu.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={menu.logoUrl} alt="" style={{ width: 'min(46vw, 520px)', height: 'auto', transform: 'rotate(-6deg)' }} className="opacity-[0.06]" />
        ) : (
          <span
            className="whitespace-nowrap font-black uppercase tracking-tight text-[var(--brand)] opacity-[0.05]"
            style={{ fontSize: 'min(22vw, 260px)', transform: 'rotate(-8deg)' }}
          >
            {menu.restaurantName}
          </span>
        )}
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-5 py-12 md:py-16">
        <header className="flex flex-col items-center gap-4 text-center">
          {menu.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={menu.logoUrl} alt={menu.restaurantName} className="size-16 rounded-2xl border border-border object-cover" />
          ) : (
            <div className="flex size-16 items-center justify-center rounded-2xl bg-[var(--brand)] text-white">
              <UtensilsCrossed size={26} />
            </div>
          )}
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{menu.restaurantName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Carta digital</p>
          </div>
        </header>

        <div className="mt-12 flex flex-col gap-10">
          {menu.categories.length ? (
            menu.categories.map((category) => (
              <section key={category.id}>
                <h2 className="mb-4 text-lg font-semibold text-[var(--brand)]">{category.name}</h2>
                <div className="flex flex-col gap-3">
                  {category.products.map((product) => (
                    <div key={product.id} className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4">
                      <div className="min-w-0">
                        <p className="font-medium">{product.name}</p>
                        {product.description && <p className="mt-1 text-sm text-muted-foreground">{product.description}</p>}
                        {product.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {product.tags.map((tag) => {
                              const TagIcon = iconForTag(tag)
                              return (
                                <span key={tag} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  <TagIcon size={11} /> {tag}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      <p className="shrink-0 font-semibold">$ {(product.priceCents / 100).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </section>
            ))
          ) : (
            <p className="text-center text-sm text-muted-foreground">Esta carta todavía no tiene productos disponibles.</p>
          )}
        </div>
      </div>
    </main>
  )
}
