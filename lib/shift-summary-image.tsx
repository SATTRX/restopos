// Renders the whole cash-register close ("arqueo de caja") as one PNG — the
// "factura grande" attached to the shift-close email alongside the per-sale
// receipt images (see lib/receipt-image.tsx and closeShift in
// app/actions/shifts.ts). This is the only place that information survives
// once the shift's rows are deleted from the database.
import { ImageResponse } from 'next/og'
import { formatDateTime } from '@/lib/datetime'

export type ShiftSummaryImageInput = {
  restaurantName: string
  logoUrl: string | null
  shiftNumber: number | null
  openedByName: string
  openedAt: Date
  closedByName: string
  closedAt: Date
  openingCashCents: number
  cashSalesCents: number
  cardSalesCents: number
  transferSalesCents: number
  salesCount: number
  expensesCents: number
  expenses: { description: string; amountCents: number; createdByName: string }[]
  expectedCashCents: number
  closingCashCents: number
  differenceCents: number
}

const WIDTH = 480
const money = (cents: number) => `$ ${(cents / 100).toFixed(2)}`
const row = { display: 'flex', justifyContent: 'space-between' } as const
const label = { display: 'flex' } as const

function estimateHeight(input: ShiftSummaryImageInput): number {
  const base = 640
  const perExpense = 26
  return base + Math.max(input.expenses.length, 1) * perExpense
}

export async function renderShiftSummaryImage(input: ShiftSummaryImageInput): Promise<Buffer> {
  const totalSalesCents = input.cashSalesCents + input.cardSalesCents + input.transferSalesCents
  const differenceColor = input.differenceCents === 0 ? '#1c1c1c' : input.differenceCents > 0 ? '#166534' : '#b91c1c'

  const res = new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff', color: '#1c1c1c', fontFamily: 'sans-serif', padding: '32px 36px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {input.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={input.logoUrl} width={52} height={52} style={{ borderRadius: 12, objectFit: 'cover', marginBottom: 10 }} />
          )}
          <div style={{ display: 'flex', fontSize: 22, fontWeight: 700 }}>{input.restaurantName}</div>
          <div style={{ display: 'flex', fontSize: 14, color: '#6b7280', marginTop: 4 }}>{`Cierre de turno${input.shiftNumber ? ` #${input.shiftNumber}` : ''}`}</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #d1d5db', borderBottom: '1px dashed #d1d5db', padding: '14px 0', marginTop: 22, fontSize: 12, color: '#6b7280' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ display: 'flex', fontWeight: 700, color: '#1c1c1c' }}>Apertura</span>
            <span style={label}>{input.openedByName}</span>
            <span style={label}>{formatDateTime(input.openedAt)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ display: 'flex', fontWeight: 700, color: '#1c1c1c' }}>Cierre</span>
            <span style={label}>{input.closedByName}</span>
            <span style={label}>{formatDateTime(input.closedAt)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 20, fontSize: 14, gap: 6 }}>
          <div style={{ display: 'flex', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Ventas por método de pago</div>
          <div style={{ ...row, color: '#6b7280' }}>
            <span style={label}>Efectivo</span>
            <span style={label}>{money(input.cashSalesCents)}</span>
          </div>
          <div style={{ ...row, color: '#6b7280' }}>
            <span style={label}>Tarjeta</span>
            <span style={label}>{money(input.cardSalesCents)}</span>
          </div>
          <div style={{ ...row, color: '#6b7280' }}>
            <span style={label}>Transferencia</span>
            <span style={label}>{money(input.transferSalesCents)}</span>
          </div>
          <div style={{ ...row, fontWeight: 700, marginTop: 4 }}>
            <span style={label}>{`Total (${input.salesCount} venta${input.salesCount === 1 ? '' : 's'})`}</span>
            <span style={label}>{money(totalSalesCents)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 20, fontSize: 14, borderTop: '1px dashed #d1d5db', paddingTop: 16 }}>
          <div style={{ display: 'flex', fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Gastos y retiros de caja</div>
          {input.expenses.length > 0 ? (
            input.expenses.map((e, i) => (
              <div key={i} style={{ ...row, color: '#6b7280', fontSize: 12, marginTop: 4 }}>
                <span style={label}>{`${e.description} · ${e.createdByName}`}</span>
                <span style={label}>{money(e.amountCents)}</span>
              </div>
            ))
          ) : (
            <div style={{ display: 'flex', color: '#9ca3af', fontSize: 12 }}>Sin gastos registrados</div>
          )}
          <div style={{ ...row, fontWeight: 700, marginTop: 8 }}>
            <span style={label}>Total gastos</span>
            <span style={label}>{money(input.expensesCents)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 20, fontSize: 14, borderTop: '1px dashed #d1d5db', paddingTop: 16 }}>
          <div style={{ display: 'flex', fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Arqueo de caja</div>
          <div style={{ ...row, color: '#6b7280' }}>
            <span style={label}>Base de apertura</span>
            <span style={label}>{money(input.openingCashCents)}</span>
          </div>
          <div style={{ ...row, color: '#6b7280', marginTop: 4 }}>
            <span style={label}>Efectivo esperado</span>
            <span style={label}>{money(input.expectedCashCents)}</span>
          </div>
          <div style={{ ...row, color: '#6b7280', marginTop: 4 }}>
            <span style={label}>Efectivo contado</span>
            <span style={label}>{money(input.closingCashCents)}</span>
          </div>
          <div style={{ ...row, fontSize: 17, fontWeight: 700, marginTop: 8 }}>
            <span style={label}>Diferencia</span>
            <span style={{ display: 'flex', color: differenceColor }}>{`${input.differenceCents > 0 ? '+' : ''}${money(input.differenceCents)}`}</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', fontSize: 10, color: '#9ca3af', textAlign: 'center', marginTop: 24 }}>
          Reporte de cierre de turno — el detalle se eliminó del sistema tras enviarse por correo.
        </div>
      </div>
    ),
    { width: WIDTH, height: estimateHeight(input) },
  )
  return Buffer.from(await res.arrayBuffer())
}
