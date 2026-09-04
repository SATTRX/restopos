import { notFound } from 'next/navigation'
import { getPublicReceipt } from '@/app/actions/receipts'

const money = (cents: number) => `$ ${(cents / 100).toFixed(2)}`

export default async function ReceiptPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params
  const receipt = await getPublicReceipt(id)
  if (!receipt) notFound()

  const date = new Date(receipt.createdAt)
  const paymentLabel = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' }[receipt.paymentMethod] ?? receipt.paymentMethod

  return (
    <main className="flex min-h-screen items-start justify-center bg-background px-5 py-10 text-foreground">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          {receipt.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={receipt.logoUrl} alt="" className="size-12 rounded-lg object-cover" />
          ) : null}
          <h1 className="text-lg font-semibold">{receipt.restaurantName}</h1>
          {receipt.taxId && <p className="text-xs text-muted-foreground">RFC/Tax ID: {receipt.taxId}</p>}
        </div>

        <div className="mt-5 flex items-center justify-between border-y border-dashed border-border py-3 text-sm">
          <span className="text-muted-foreground">Boleta digital{receipt.shiftNumber ? ` · Turno ${receipt.shiftNumber}` : ''}</span>
          <span className="font-semibold">#{String(receipt.folio ?? '—').padStart(6, '0')}</span>
        </div>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          {date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })} ·{' '}
          {date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
        </p>

        <div className="mt-5 flex flex-col gap-2">
          {receipt.items.length ? (
            receipt.items.map((item, i) => (
              <div key={`${item.productName}-${i}`} className="flex justify-between text-sm">
                <span>
                  {item.quantity} × {item.productName}
                </span>
                <span>{money(item.unitPriceCents * item.quantity)}</span>
              </div>
            ))
          ) : (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Venta</span>
              <span>{money(receipt.subtotalCents)}</span>
            </div>
          )}
        </div>

        <div className="mt-5 border-t border-dashed border-border pt-4 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{money(receipt.subtotalCents)}</span>
          </div>
          <div className="mt-1 flex justify-between text-muted-foreground">
            <span>Impuesto</span>
            <span>{money(receipt.taxCents)}</span>
          </div>
          <div className="mt-2 flex justify-between text-base font-semibold">
            <span>Total ({receipt.currency})</span>
            <span>{money(receipt.totalCents)}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Pago con {paymentLabel}</p>
          {receipt.tenderedCents !== null && (
            <>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>Pagó con</span>
                <span>{money(receipt.tenderedCents)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Cambio</span>
                <span>{money(receipt.changeCents ?? 0)}</span>
              </div>
            </>
          )}
        </div>

        {receipt.receiptFooter && <p className="mt-5 text-center text-xs text-muted-foreground">{receipt.receiptFooter}</p>}

        <p className="mt-6 text-center text-[10px] text-muted-foreground">Recibo digital — no es un comprobante fiscal timbrado.</p>
      </div>
    </main>
  )
}
