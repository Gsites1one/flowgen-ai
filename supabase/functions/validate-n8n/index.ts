// Testowy import: walidacja → POST /api/v1/workflows → DELETE. Przepływ nigdy nie jest aktywowany ani uruchamiany.
import { validate } from './validator.gen.js'

const MAX_BODY_BYTES = 200_000
const N8N_TIMEOUT_MS = 15_000

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const importIssue = (message: string) => ({ ok: false, issues: [{ rule: 'test-import', message }] })

/** Zalogowany użytkownik albo null. Token sprawdza serwer Auth, nie sama funkcja. */
async function getUser(req: Request): Promise<{ id: string } | null> {
  const authorization = req.headers.get('Authorization')
  const apikey = req.headers.get('apikey')
  if (!authorization?.startsWith('Bearer ') || !apikey) return null
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey },
  })
  if (!res.ok) return null
  const user = await res.json()
  return typeof user?.id === 'string' && user.aud === 'authenticated' ? { id: user.id } : null
}

/** Tylko pola, które przyjmuje API n8n — bez poświadczeń i metadanych. */
function toImportPayload(workflow: any) {
  return {
    name: `[FlowGen test] ${String(workflow.name).slice(0, 100)}`,
    nodes: workflow.nodes.map((n: any) => ({
      parameters: n.parameters,
      type: n.type,
      typeVersion: n.typeVersion,
      position: n.position,
      id: n.id,
      name: n.name,
      ...(n.webhookId ? { webhookId: n.webhookId } : {}),
    })),
    connections: workflow.connections,
    settings: { executionOrder: 'v1' },
  }
}

async function n8nMessage(res: Response): Promise<string> {
  const text = await res.text()
  try {
    return String(JSON.parse(text).message ?? text).slice(0, 500)
  } catch {
    return text.slice(0, 500)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const user = await getUser(req)
  if (!user) return json({ error: 'Sign in required' }, 401)

  const baseUrl = Deno.env.get('N8N_API_URL')?.replace(/\/+$/, '')
  const apiKey = Deno.env.get('N8N_API_KEY')
  if (!baseUrl || !apiKey) return json({ error: 'Test import is not configured' }, 503)

  const raw = await req.text()
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'Workflow is too large' }, 413)
  let workflow: unknown
  try {
    workflow = JSON.parse(raw).workflow
  } catch {
    return json({ error: 'Body must be JSON: { "workflow": ... }' }, 400)
  }

  // Walidacja działa zawsze — do n8n trafia wyłącznie przepływ, który ją przeszedł.
  const validation = validate(workflow)
  if (!validation.ok) return json(validation)

  const headers = { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' }
  const payload = toImportPayload(workflow)
  let createdId: string
  try {
    const created = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(N8N_TIMEOUT_MS),
    })
    if (!created.ok) {
      return json(importIssue(`n8n rejected the workflow (HTTP ${created.status}): ${await n8nMessage(created)}`))
    }
    createdId = (await created.json()).id
  } catch (e) {
    console.error('test import failed', e)
    return json(importIssue('Could not reach n8n for the test import'))
  }

  const deleted = await fetch(`${baseUrl}/api/v1/workflows/${createdId}`, {
    method: 'DELETE',
    headers,
    signal: AbortSignal.timeout(N8N_TIMEOUT_MS),
  }).catch(() => null)
  if (!deleted?.ok) {
    console.error(`test workflow ${createdId} was not deleted from n8n`)
    return json({
      ok: true,
      issues: [],
      warning: `Import succeeded, but the test copy "${payload.name}" could not be removed from n8n — delete it manually.`,
    })
  }
  return json({ ok: true, issues: [] })
})
