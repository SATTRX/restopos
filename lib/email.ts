// Minimal email sending helper. Sends via SMTP (nodemailer) when SMTP_HOST is
// configured. Without it, emails are logged to the server console so the
// verification flow stays testable in local development without any
// provider set up.

import nodemailer from 'nodemailer'

export type EmailAttachment = { filename: string; content: Buffer; contentType: string }
type SendEmailInput = { to: string; subject: string; html: string; text: string; attachments?: EmailAttachment[] }

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
  await getTransporter().sendMail({ from, to: input.to, subject: input.subject, html: input.html, text: input.text, attachments: input.attachments })
}

export async function sendEmail(input: SendEmailInput) {
  if (process.env.SMTP_HOST) {
    await sendViaSmtp(input)
    return
  }

  // Dev fallback: no provider configured yet. Log instead of failing so
  // sign-up/sign-in keeps working while SMTP_* is pending.
  const attachmentNote = input.attachments?.length ? ` (+${input.attachments.length} adjunto${input.attachments.length === 1 ? '' : 's'})` : ''
  console.log(`\n[email:dev] Para: ${input.to}\nAsunto: ${input.subject}${attachmentNote}\n${input.text}\n`)
}

type ShiftReportInput = {
  to: string
  restaurantName: string
  shiftNumber: number | null
  closedAt: Date
  salesCount: number
  totalSalesCents: number
  differenceCents: number
  summaryImage: EmailAttachment
  receiptImages: EmailAttachment[]
  skippedReceiptImages: number
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

// Sent when a shift closes. Both the turno's cash-register detail and every
// sale behind it get deleted from the database right after (see closeShift
// in app/actions/shifts.ts) — this email, with the attached "factura grande"
// (whole-shift summary image) and one receipt image per sale, is the only
// place that detail survives.
export async function sendShiftReportEmail(input: ShiftReportInput) {
  const differenceLine =
    input.differenceCents === 0
      ? 'La caja cuadró exacto.'
      : `Diferencia de caja: ${input.differenceCents > 0 ? '+' : '-'}${money(Math.abs(input.differenceCents))}.`
  const skippedNote = input.skippedReceiptImages
    ? ` (${input.skippedReceiptImages} recibo${input.skippedReceiptImages === 1 ? '' : 's'} no se adjuntó${input.skippedReceiptImages === 1 ? '' : 'aron'} por el volumen del turno — el total de ventas arriba ya los incluye.)`
    : ''

  await sendEmail({
    to: input.to,
    subject: `Cierre de turno${input.shiftNumber ? ` #${input.shiftNumber}` : ''} — ${input.restaurantName}`,
    html: `<div style="font-family:sans-serif;font-size:15px;color:#1c1c1c">
      <p>Turno${input.shiftNumber ? ` #${input.shiftNumber}` : ''} de <strong>${input.restaurantName}</strong> cerrado el ${input.closedAt.toLocaleString('es-MX')}.</p>
      <p style="color:#666;font-size:13px">${input.salesCount} venta${input.salesCount === 1 ? '' : 's'} · Total vendido ${money(input.totalSalesCents)}. ${differenceLine}</p>
      <p style="color:#666;font-size:13px">Adjuntamos el reporte de caja completo del turno y ${input.receiptImages.length} recibo${input.receiptImages.length === 1 ? '' : 's'} en imagen — esta información ya no se guarda en el sistema.${skippedNote}</p>
    </div>`,
    text: `Turno${input.shiftNumber ? ` #${input.shiftNumber}` : ''} de ${input.restaurantName} cerrado el ${input.closedAt.toLocaleString('es-MX')}.\n${input.salesCount} venta(s) · Total vendido ${money(input.totalSalesCents)}. ${differenceLine}\nAdjuntamos el reporte de caja completo del turno y ${input.receiptImages.length} recibo(s) en imagen — esta información ya no se guarda en el sistema.${skippedNote}`,
    attachments: [input.summaryImage, ...input.receiptImages],
  })
}

export async function sendVerificationEmail({ to, name, url }: { to: string; name?: string | null; url: string }) {
  const greeting = name ? `Hola ${name},` : 'Hola,'
  await sendEmail({
    to,
    subject: 'Confirma tu correo en MesaFlow',
    html: `<div style="font-family:sans-serif;font-size:15px;color:#1c1c1c"><p>${greeting}</p><p>Confirma tu correo electrónico para activar tu acceso a MesaFlow.</p><p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#ea580c;color:#fff;border-radius:8px;text-decoration:none">Verificar mi correo</a></p><p style="color:#666;font-size:13px">Si el botón no funciona, copia y pega este enlace en tu navegador:<br/>${url}</p><p style="color:#666;font-size:13px">Si tú no solicitaste esto, puedes ignorar este mensaje.</p></div>`,
    text: `${greeting}\n\nConfirma tu correo electrónico para activar tu acceso a MesaFlow:\n${url}\n\nSi tú no solicitaste esto, puedes ignorar este mensaje.`,
  })
}

// `url` already points at our own /recuperar page with the reset token
// attached (better-auth builds it from the `redirectTo` we pass to
// requestPasswordReset) — same pattern as sendVerificationEmail above.
export async function sendResetPasswordEmail({ to, name, url }: { to: string; name?: string | null; url: string }) {
  const greeting = name ? `Hola ${name},` : 'Hola,'
  await sendEmail({
    to,
    subject: 'Restablece tu contraseña de MesaFlow',
    html: `<div style="font-family:sans-serif;font-size:15px;color:#1c1c1c"><p>${greeting}</p><p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en MesaFlow.</p><p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#ea580c;color:#fff;border-radius:8px;text-decoration:none">Elegir nueva contraseña</a></p><p style="color:#666;font-size:13px">Si el botón no funciona, copia y pega este enlace en tu navegador:<br/>${url}</p><p style="color:#666;font-size:13px">Este enlace expira en 1 hora. Si tú no solicitaste esto, puedes ignorar este mensaje — tu contraseña actual seguirá funcionando.</p></div>`,
    text: `${greeting}\n\nRecibimos una solicitud para restablecer la contraseña de tu cuenta en MesaFlow. Elige una nueva aquí (el enlace expira en 1 hora):\n${url}\n\nSi tú no solicitaste esto, puedes ignorar este mensaje.`,
  })
}
