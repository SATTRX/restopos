export type ClaudeResponse = any

export async function claudeComplete(prompt: string, opts?: { model?: string; maxTokens?: number }) {
  const apiKey = process.env.CLAUDE_API_KEY
  const base = process.env.CLAUDE_API_URL ?? 'https://api.anthropic.com'
  if (!apiKey) throw new Error('Missing CLAUDE_API_KEY')

  // Uses the current Messages API — the legacy `/v1/complete` text-completion
  // endpoint (and the `claude-2` model) has been retired.
  const payload = {
    model: opts?.model ?? 'claude-sonnet-4-5',
    max_tokens: opts?.maxTokens ?? 300,
    messages: [{ role: 'user', content: prompt }],
  }

  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Claude API error: ${res.status} ${txt}`)
  }

  const data = await res.json()
  return data as ClaudeResponse
}
