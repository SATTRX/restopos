'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { restaurantMembership } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'

async function requireMembership() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('No autorizado')
  const rows = await db
    .select({ restaurantId: restaurantMembership.restaurantId })
    .from(restaurantMembership)
    .where(and(eq(restaurantMembership.userId, session.user.id), eq(restaurantMembership.isActive, true)))
    .limit(1)
  if (!rows.length) throw new Error('No tienes un restaurante asignado')
}

// Caps a single API call's cost/latency — plenty for one menu photo's worth
// of dishes missing a description. Requires ANTHROPIC_API_KEY (see .env.example).
const MAX_NAMES = 100

function stripCodeFence(text: string): string {
  return text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
}

// Best-effort, name-only descriptions for menu items imported without one
// (see the Carta OCR import in components/restaurant-workspace.tsx) — the
// model never sees real ingredients, so these are plausible guesses shown
// as editable text before anything is saved, never applied silently.
export async function generateMenuDescriptions(names: string[]): Promise<Record<string, string>> {
  await requireMembership()
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Configura ANTHROPIC_API_KEY para generar descripciones con IA')

  const clean = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean))).slice(0, MAX_NAMES)
  if (!clean.length) return {}

  const prompt = `Eres un redactor de menús de restaurante. Para cada platillo de la lista, escribe una descripción breve (máximo 15 palabras), apetitosa y realista en español, basada únicamente en su nombre — si el nombre ya sugiere sus ingredientes o preparación típica, descríbelos.

Responde ÚNICAMENTE con un array JSON de objetos {"name": "...", "description": "..."}, uno por platillo, sin texto adicional ni bloques de markdown.

Platillos:
${clean.map((n) => `- ${n}`).join('\n')}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`No se pudo generar descripciones (${response.status}): ${body.slice(0, 200)}`)
  }

  const data = await response.json()
  const text: string = data?.content?.[0]?.text ?? ''
  let parsed: unknown
  try {
    parsed = JSON.parse(stripCodeFence(text))
  } catch {
    throw new Error('La IA no devolvió un formato válido, inténtalo de nuevo')
  }
  if (!Array.isArray(parsed)) throw new Error('La IA no devolvió un formato válido, inténtalo de nuevo')

  const result: Record<string, string> = {}
  for (const item of parsed as any[]) {
    if (item?.name && item?.description) result[String(item.name)] = String(item.description).trim()
  }
  return result
}
