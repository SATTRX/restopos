import { NextResponse } from 'next/server'
import { claudeComplete } from '@/lib/claude'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { prompt } = body
    if (!prompt) return NextResponse.json({ error: 'missing prompt' }, { status: 400 })

    const out = await claudeComplete(prompt, { maxTokens: 300 })
    return NextResponse.json(out)
  } catch (err: any) {
    return NextResponse.json({ error: String(err.message) }, { status: 500 })
  }
}
