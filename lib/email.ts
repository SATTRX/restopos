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

export async function sendVerificationEmail({ to, name, url }: { to: string; name?: string | null; url: string }) {
  const greeting = name ? `Hola ${name},` : 'Hola,'
  await sendEmail({
    to,
    subject: 'Confirma tu correo en MesaFlow',
    html: `<div style="font-family:sans-serif;font-size:15px;color:#1c1c1c"><p>${greeting}</p><p>Confirma tu correo electrónico para activar tu acceso a MesaFlow.</p><p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#c86b4a;color:#fff;border-radius:8px;text-decoration:none">Verificar mi correo</a></p><p style="color:#666;font-size:13px">Si el botón no funciona, copia y pega este enlace en tu navegador:<br/>${url}</p><p style="color:#666;font-size:13px">Si tú no solicitaste esto, puedes ignorar este mensaje.</p></div>`,
    text: `${greeting}\n\nConfirma tu correo electrónico para activar tu acceso a MesaFlow:\n${url}\n\nSi tú no solicitaste esto, puedes ignorar este mensaje.`,
  })
}
