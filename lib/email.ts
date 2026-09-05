// Minimal email sending helper. Sends via SMTP (nodemailer) when SMTP_HOST is
// configured. Without it, emails are logged to the server console so the
// verification flow stays testable in local development without any
// provider set up.

import nodemailer from 'nodemailer'

type SendEmailInput = { to: string; subject: string; html: string; text: string }

let transporter: ReturnType<typeof nodemailer.createTransport> | undefined

function getTransporter() {
  if (transporter) return transporter
  const port = Number(process.env.SMTP_PORT ?? 587)
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is implicit TLS; 587/25 use STARTTLS. Override with SMTP_SECURE if needed.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  })
  return transporter
}

async function sendViaSmtp(input: SendEmailInput) {
  const from = process.env.EMAIL_FROM ?? process.env.SMTP_USER
  await getTransporter().sendMail({ from, to: input.to, subject: input.subject, html: input.html, text: input.text })
}

export async function sendEmail(input: SendEmailInput) {
  if (process.env.SMTP_HOST) {
    await sendViaSmtp(input)
    return
  }

  // Dev fallback: no provider configured yet. Log instead of failing so
  // sign-up/sign-in keeps working while SMTP_* is pending.
  console.log(`\n[email:dev] Para: ${input.to}\nAsunto: ${input.subject}\n${input.text}\n`)
}

type ShiftReportSale = { folio: number | null; totalCents: number; paymentMethod: string; createdAt: Date }
type ShiftReportInput = {
  to: string
  restaurantName: string
  shiftNumber: number | null
  openedAt: Date
  closedAt: Date
  sales: ShiftReportSale[]
  cashSalesCents: number
  cardSalesCents: number
  transferSalesCents: number
  expensesCents: number
  openingCashCents: number
  closingCashCents: number
  expectedCashCents: number
  differenceCents: number
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`
const PAYMENT_LABEL: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' }

// Sent when a shift closes: the sale rows behind it get deleted right after
// (see closeShift in app/actions/shifts.ts), so this email is the durable
// record of that shift's invoices going forward.
export async function sendShiftReportEmail(input: ShiftReportInput) {
  const totalCents = input.cashSalesCents + input.cardSalesCents + input.transferSalesCents
  const rows = input.sales
    .map(
      (s) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${s.folio ?? '—'}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">${s.createdAt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">${PAYMENT_LABEL[s.paymentMethod] ?? s.paymentMethod}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${money(s.totalCents)}</td></tr>`,
    )
    .join('')
  const textRows = input.sales
    .map((s) => `Folio ${s.folio ?? '—'} · ${s.createdAt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · ${PAYMENT_LABEL[s.paymentMethod] ?? s.paymentMethod} · ${money(s.totalCents)}`)
    .join('\n')

  await sendEmail({
    to: input.to,
    subject: `Cierre de turno${input.shiftNumber ? ` #${input.shiftNumber}` : ''} — ${input.restaurantName}`,
    html: `<div style="font-family:sans-serif;font-size:15px;color:#1c1c1c">
      <p>Turno${input.shiftNumber ? ` #${input.shiftNumber}` : ''} de <strong>${input.restaurantName}</strong> cerrado.</p>
      <p style="color:#666;font-size:13px">Abierto: ${input.openedAt.toLocaleString('es-MX')}<br/>Cerrado: ${input.closedAt.toLocaleString('es-MX')}</p>
      <table style="border-collapse:collapse;width:100%;max-width:480px;margin:12px 0">
        <thead><tr><th style="text-align:left;padding:4px 8px">Folio</th><th style="text-align:left;padding:4px 8px">Hora</th><th style="text-align:left;padding:4px 8px">Pago</th><th style="text-align:right;padding:4px 8px">Total</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" style="padding:8px;color:#888">Sin ventas registradas en este turno.</td></tr>'}</tbody>
      </table>
      <table style="border-collapse:collapse;font-size:14px;margin-top:8px">
        <tr><td style="padding:2px 12px 2px 0;color:#666">Ventas en efectivo</td><td style="text-align:right">${money(input.cashSalesCents)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666">Ventas con tarjeta</td><td style="text-align:right">${money(input.cardSalesCents)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666">Ventas por transferencia</td><td style="text-align:right">${money(input.transferSalesCents)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;font-weight:600">Total vendido</td><td style="text-align:right;font-weight:600">${money(totalCents)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666">Gastos / retiros de caja</td><td style="text-align:right">-${money(input.expensesCents)}</td></tr>
        <tr><td style="padding:8px 12px 2px 0;color:#666">Caja inicial</td><td style="text-align:right;padding-top:8px">${money(input.openingCashCents)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666">Efectivo esperado</td><td style="text-align:right">${money(input.expectedCashCents)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666">Efectivo contado</td><td style="text-align:right">${money(input.closingCashCents)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;font-weight:600">Diferencia</td><td style="text-align:right;font-weight:600">${money(input.differenceCents)}</td></tr>
      </table>
      <p style="color:#999;font-size:12px">Las facturas de este turno se eliminaron del sistema tras el cierre; este correo es su respaldo.</p>
    </div>`,
    text: `Turno${input.shiftNumber ? ` #${input.shiftNumber}` : ''} de ${input.restaurantName} cerrado.\nAbierto: ${input.openedAt.toLocaleString('es-MX')}\nCerrado: ${input.closedAt.toLocaleString('es-MX')}\n\n${textRows || 'Sin ventas registradas en este turno.'}\n\nEfectivo: ${money(input.cashSalesCents)}\nTarjeta: ${money(input.cardSalesCents)}\nTransferencia: ${money(input.transferSalesCents)}\nTotal vendido: ${money(totalCents)}\nGastos/retiros: -${money(input.expensesCents)}\nCaja inicial: ${money(input.openingCashCents)}\nEfectivo esperado: ${money(input.expectedCashCents)}\nEfectivo contado: ${money(input.closingCashCents)}\nDiferencia: ${money(input.differenceCents)}\n\nLas facturas de este turno se eliminaron del sistema tras el cierre; este correo es su respaldo.`,
  })
}

export async function sendVerificationEmail({ to, name, url }: { to: string; name?: string | null; url: string }) {
  const greeting = name ? `Hola ${name},` : 'Hola,'
  await sendEmail({
    to,
    subject: 'Confirma tu correo en MesaFlow',
    html: `<div style="font-family:sans-serif;font-size:15px;color:#1c1c1c"><p>${greeting}</p><p>Confirma tu correo electrónico para activar tu acceso a MesaFlow.</p><p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#c86b4a;color:#fff;border-radius:8px;text-decoration:none">Verificar mi correo</a></p><p style="color:#666;font-size:13px">Si el botón no funciona, copia y pega este enlace en tu navegador:<br/>${url}</p><p style="color:#666;font-size:13px">Si tú no solicitaste esto, puedes ignorar este mensaje.</p></div>`,
    text: `${greeting}\n\nConfirma tu correo electrónico para activar tu acceso a MesaFlow:\n${url}\n\nSi tú no solicitaste esto, puedes ignorar este mensaje.`,
  })
}
