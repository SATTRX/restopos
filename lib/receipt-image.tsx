// Renders a sale as a PNG receipt image — the same information as the public
// /boleta/[id] page, but as an image so it survives being attached to the
// shift-close email report (see app/actions/shifts.ts): once a shift closes,
// its `sale` rows are deleted and the /boleta links stop resolving, so this
// image becomes the durable copy of that invoice.
import { ImageResponse } from 'next/og'
import type { ReceiptDTO } from '@/app/actions/receipts'

const WIDTH = 420
const PAYMENT_LABEL: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transferencia: 'Transferencia', transfer: 'Transferencia' }
const money = (cents: number) => `$ ${(cents / 100).toFixed(2)}`

function estimateHeight(receipt: ReceiptDTO): number {
  const base = 470
  const perItem = 28
  const tenderedExtra = receipt.tenderedCents !== null ? 44 : 0
  const footerExtra = receipt.receiptFooter ? 34 : 0
  return base + Math.max(receipt.items.length, 1) * perItem + tenderedExtra + footerExtra
}

export async function renderReceiptImage(receipt: ReceiptDTO): Promise<Buffer> {
  const date = new Date(receipt.createdAt)
  const dateLabel = `${date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })} · ${date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
  const folioLabel = `#${String(receipt.folio ?? '—').padStart(6, '0')}`
  const paymentLabel = PAYMENT_LABEL[receipt.paymentMethod] ?? receipt.paymentMethod

  const res = new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff', color: '#1c1c1c', fontFamily: 'sans-serif', padding: '28px 32px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {receipt.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={receipt.logoUrl} width={48} height={48} style={{ borderRadius: 10, objectFit: 'cover', marginBottom: 8 }} />
          )}
          <div style={{ display: 'flex', fontSize: 20, fontWeight: 700 }}>{receipt.restaurantName}</div>
          {receipt.taxId && <div style={{ display: 'flex', fontSize: 12, color: '#6b7280', marginTop: 4 }}>{`RFC/Tax ID: ${receipt.taxId}`}</div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #d1d5db', borderBottom: '1px dashed #d1d5db', padding: '12px 0', marginTop: 20, fontSize: 14 }}>
          <span style={{ display: 'flex', color: '#6b7280' }}>{`Boleta digital${receipt.shiftNumber ? ` · Turno ${receipt.shiftNumber}` : ''}`}</span>
          <span style={{ display: 'flex', fontWeight: 700 }}>{folioLabel}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', fontSize: 12, color: '#6b7280', marginTop: 12 }}>{dateLabel}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
          {receipt.items.length > 0 ? (
            receipt.items.map((item, i) => (
              <div key={`${item.productName}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ display: 'flex' }}>{`${item.quantity} × ${item.productName}`}</span>
                <span style={{ display: 'flex' }}>{money(item.unitPriceCents * item.quantity)}</span>
              </div>
            ))
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#6b7280' }}>
              <span style={{ display: 'flex' }}>Venta</span>
              <span style={{ display: 'flex' }}>{money(receipt.subtotalCents)}</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px dashed #d1d5db', marginTop: 20, paddingTop: 16, fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
            <span style={{ display: 'flex' }}>Subtotal</span>
            <span style={{ display: 'flex' }}>{money(receipt.subtotalCents)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280', marginTop: 4 }}>
            <span style={{ display: 'flex' }}>Impuesto</span>
            <span style={{ display: 'flex' }}>{money(receipt.taxCents)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 700, marginTop: 8 }}>
            <span style={{ display: 'flex' }}>{`Total (${receipt.currency})`}</span>
            <span style={{ display: 'flex' }}>{money(receipt.totalCents)}</span>
          </div>
          <div style={{ display: 'flex', fontSize: 12, color: '#6b7280', marginTop: 10 }}>{`Pago con ${paymentLabel}`}</div>
          {receipt.tenderedCents !== null && (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8, fontSize: 12, color: '#6b7280' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex' }}>Pagó con</span>
                <span style={{ display: 'flex' }}>{money(receipt.tenderedCents)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex' }}>Cambio</span>
                <span style={{ display: 'flex' }}>{money(receipt.changeCents ?? 0)}</span>
              </div>
            </div>
          )}
        </div>

        {receipt.receiptFooter && (
          <div style={{ display: 'flex', justifyContent: 'center', fontSize: 12, color: '#6b7280', textAlign: 'center', marginTop: 20 }}>{receipt.receiptFooter}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'center', fontSize: 10, color: '#9ca3af', textAlign: 'center', marginTop: 16 }}>
          Recibo digital — no es un comprobante fiscal timbrado.
        </div>
      </div>
    ),
    { width: WIDTH, height: estimateHeight(receipt) },
  )
  return Buffer.from(await res.arrayBuffer())
}
