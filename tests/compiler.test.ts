import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compile } from '../src/compiler/index.ts'
import type { N8nWorkflow } from '../src/compiler/index.ts'

type Json = Record<string, any>

const load = (path: string): Json => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Usuwa różnice bez znaczenia dla importu: identyfikatory, pola cachedResult*, formatowanie JSON w stringach. */
function normalize(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) return value.map((v) => normalize(v))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k, v]) => !k.startsWith('cachedResult') && !(k === 'id' && UUID.test(String(v))))
        .map(([k, v]) => [k, normalize(v, k)]),
    )
  }
  if (typeof value === 'string' && (key === 'schema' || key === 'responseBody')) return JSON.parse(value)
  return value
}

const nodesByName = (wf: Json) =>
  Object.fromEntries(
    wf.nodes.map((n: Json) => [
      n.name,
      { type: n.type, typeVersion: n.typeVersion, parameters: normalize(n.parameters) },
    ]),
  )

function compileOk(plan: unknown): N8nWorkflow {
  const result = compile(plan)
  if (!result.ok) throw new Error(JSON.stringify(result.errors, null, 2))
  return result.workflow
}

describe('wzorzec A — kontakt', () => {
  const reference = load('../reference/wzorzec-kontakt.json')
  const workflow = compileOk(load('./fixtures/plan-kontakt.json'))

  // Świadome odstępstwa od wzorca (CLAUDE.md §5).
  const expected = nodesByName(reference) as Json
  expected['Message a model'].parameters.responses.values[1].content = '={{ $json.snippet }}'
  expected['Send a message'].parameters.otherOptions.includeLinkToWorkflow = false
  expected['Reply to a message'].parameters.options = { appendAttribution: false }
  expected['Append row in sheet'].parameters.documentId.mode = 'id'
  expected['Append row in sheet'].parameters.sheetName.mode = 'id'

  it('węzły: typy, wersje i parametry jak we wzorcu', () => {
    expect(nodesByName(workflow)).toEqual(expected)
  })

  it('połączenia jak we wzorcu', () => {
    expect(workflow.connections).toEqual(reference.connections)
  })
})

describe('wzorzec B — płatność', () => {
  const reference = load('../reference/wzorzec-platnosc.json')
  const workflow = compileOk(load('./fixtures/plan-platnosc.json'))

  it('węzły: typy, wersje i parametry jak we wzorcu', () => {
    expect(nodesByName(workflow)).toEqual(nodesByName(reference))
  })

  it('połączenia jak we wzorcu (If: main[0] = true, main[1] = false)', () => {
    expect(workflow.connections).toEqual(reference.connections)
  })

  it('gałąź true leży wyżej niż false, a przepływ idzie w prawo', () => {
    const pos = Object.fromEntries(workflow.nodes.map((n) => [n.name, n.position]))
    expect(pos['Get a customer'][1]).toBeLessThan(pos['Respond to Webhook'][1])
    expect(pos['Webhook'][0]).toBeLessThan(pos['Edit Fields'][0])
    expect(pos['Discord'][0]).toBeLessThan(pos['Respond to Webhook'][0])
  })
})

describe('struktura eksportu', () => {
  const workflows = ['plan-kontakt', 'plan-platnosc'].map((f) => compileOk(load(`./fixtures/${f}.json`)))

  it('tylko pola potrzebne do importu, bez poświadczeń', () => {
    for (const wf of workflows) {
      expect(Object.keys(wf)).toEqual(['name', 'nodes', 'connections', 'settings'])
      expect(wf.settings).toEqual({ executionOrder: 'v1' })
      for (const node of wf.nodes) expect(node).not.toHaveProperty('credentials')
    }
  })

  it('unikalne identyfikatory UUID i nazwy; webhookId tam, gdzie trzeba', () => {
    for (const wf of workflows) {
      const ids = wf.nodes.map((n) => n.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const id of ids) expect(id).toMatch(UUID)
      expect(new Set(wf.nodes.map((n) => n.name)).size).toBe(wf.nodes.length)
    }
    const withWebhookId = workflows.flatMap((wf) => wf.nodes.filter((n) => n.webhookId).map((n) => n.name))
    expect(withWebhookId.sort()).toEqual(['Discord', 'Reply to a message', 'Send a message', 'Webhook'])
  })

  it('pozycje na siatce 16 px, bez nakładania się węzłów', () => {
    for (const wf of workflows) {
      const seen = new Set<string>()
      for (const { position } of wf.nodes) {
        expect(Math.abs(position[0] % 16)).toBe(0)
        expect(Math.abs(position[1] % 16)).toBe(0)
        expect(seen.has(position.join())).toBe(false)
        seen.add(position.join())
      }
    }
  })
})

describe('odrzucanie błędnych planów', () => {
  const base = () => load('./fixtures/plan-platnosc.json')
  const errorsOf = (plan: unknown) => {
    const result = compile(plan)
    return result.ok ? [] : result.errors.map((e) => `${e.step}: ${e.message}`)
  }

  it('akcja spoza katalogu', () => {
    const plan = base()
    plan.steps[0].action = 'core.code'
    expect(errorsOf(plan)).toEqual(['s1: Unknown action "core.code"'])
  })

  it('wyzwalacz użyty jako krok', () => {
    const plan = base()
    plan.steps[0] = { id: 's1', action: 'webhook.receive', integration: 'webhook', after: 'trigger', params: { path: 'x' } }
    expect(errorsOf(plan)[0]).toMatch(/cannot be used as a step/)
  })

  it('nieznane pole w parametrach i nadmiarowe klucze', () => {
    const plan = base()
    plan.steps[2].params.evil = 'x'
    expect(errorsOf(plan)[0]).toMatch(/^s3: params/)
  })

  it('odwołanie do nieistniejącego pola wyjściowego', () => {
    const plan = base()
    plan.steps[2].params.customerId = { ref: 's1', field: 'nope' }
    expect(errorsOf(plan)[0]).toMatch(/has no output field "nope" \(available: customerId, amount\)/)
  })

  it('odwołanie do kroku, który nie jest przodkiem', () => {
    const plan = base()
    plan.steps[0].params.fields[0].value = { ref: 's3', field: 'email' }
    expect(errorsOf(plan)[0]).toMatch(/does not run before this step/)
  })

  it('krok po If bez wskazania gałęzi', () => {
    const plan = base()
    plan.steps[2].after = 's2'
    expect(errorsOf(plan)[0]).toMatch(/specify branch/)
  })

  it('cykl', () => {
    const plan = base()
    plan.steps[0].after = 's4'
    expect(errorsOf(plan).length).toBeGreaterThan(0)
    expect(errorsOf(plan)[0]).toMatch(/cycle/)
  })

  it('tekst udający wyrażenie n8n', () => {
    const plan = base()
    plan.steps[3].params.content = '={{ $env.SECRET }}'
    expect(errorsOf(plan)[0]).toMatch(/must not start with "="/)
    plan.steps[3].params.content = { template: ['{{ $env.SECRET }} ', { ref: 's1', field: 'amount' }] }
    expect(errorsOf(plan)[0]).toMatch(/must not contain "\{\{"/)
  })

  it('wejście niezgodne ze schematem RP', () => {
    expect(errorsOf({ name: 'x' }).length).toBeGreaterThan(0)
    expect(errorsOf('not a plan').length).toBeGreaterThan(0)
  })

  it('responseMode tylko gdy jest Respond to Webhook', () => {
    const plan = base()
    plan.steps = plan.steps.slice(0, 4)
    const webhook = compileOk(plan).nodes[0]
    expect(webhook.parameters).not.toHaveProperty('responseMode')
  })
})
