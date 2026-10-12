import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compile } from '../src/compiler/index.ts'
import type { N8nWorkflow } from '../src/compiler/index.ts'
import { brokenExamples } from '../src/validator/examples.ts'
import { validate } from '../src/validator/index.ts'

const load = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))

function compiled(name: 'kontakt' | 'platnosc'): N8nWorkflow {
  const result = compile(load(`./fixtures/plan-${name}.json`))
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.workflow
}

describe('poprawne przepływy', () => {
  it.each(['kontakt', 'platnosc'] as const)('wynik kompilatora: %s', (name) => {
    expect(validate(compiled(name))).toEqual({ ok: true, issues: [] })
  })

  // Wzorce wyeksportowane z n8n (z poświadczeniami, polami cachedResult*, meta itd.) też muszą przejść.
  it.each(['kontakt', 'platnosc'])('wzorzec z n8n: %s', (name) => {
    expect(validate(load(`../reference/wzorzec-${name}.json`))).toEqual({ ok: true, issues: [] })
  })
})

describe('celowo zepsute przepływy', () => {
  it.each(brokenExamples)('$title', (example) => {
    const workflow = compiled(example.base === 'contact' ? 'kontakt' : 'platnosc')
    example.mutate(workflow)
    const result = validate(workflow)
    expect(result.ok).toBe(false)
    const messages = result.issues.filter((i) => i.rule === example.rule).map((i) => i.message)
    expect(messages.join('\n')).toContain(example.expect)
  })

  it('każda reguła ma przykład', () => {
    const covered = new Set(brokenExamples.map((e) => e.rule))
    for (const rule of ['node-type', 'params', 'connections', 'trigger', 'graph', 'cycle', 'expression', 'respond']) {
      expect(covered.has(rule as never), rule).toBe(true)
    }
  })
})

describe('przypadki brzegowe', () => {
  it('wejście, które nie jest przepływem', () => {
    for (const input of [null, 'x', {}, { name: 'x', nodes: [], connections: {} }]) {
      const result = validate(input)
      expect(result.ok).toBe(false)
      expect(result.issues[0].rule).toBe('shape')
    }
  })

  it('zgłasza wszystkie problemy naraz, ze wskazaniem węzła', () => {
    const wf = compiled('platnosc')
    wf.nodes.find((n) => n.name === 'If')!.typeVersion = 1
    delete wf.nodes.find((n) => n.name === 'Get a customer')!.parameters.customerId
    const { issues } = validate(wf)
    expect(issues.map((i) => i.node).sort()).toEqual(['Get a customer', 'If'])
  })

  it('$json za węzłem If wskazuje dane sprzed If', () => {
    const wf = compiled('platnosc')
    wf.nodes.find((n) => n.name === 'Get a customer')!.parameters.customerId = '={{ $json.customerId }}'
    expect(validate(wf).ok).toBe(true)
    wf.nodes.find((n) => n.name === 'Get a customer')!.parameters.customerId = '={{ $json.nope }}'
    expect(validate(wf).issues[0].message).toContain('node "Edit Fields" has no output field "nope"')
  })

  it('$json w węźle z dwoma wejściami jest niejednoznaczne', () => {
    const wf = compiled('platnosc')
    wf.nodes.find((n) => n.name === 'Respond to Webhook')!.parameters.responseBody = '={{ $json.email }}'
    expect(validate(wf).issues[0].message).toContain('$json is ambiguous')
  })

  it('wywołania funkcji i niedomknięte klamry w wyrażeniach', () => {
    const wf = compiled('kontakt')
    const slack = wf.nodes.find((n) => n.name === 'Send a message')!
    slack.parameters.text = '={{ $json.name.constructor.constructor("return process")() }}'
    expect(validate(wf).issues[0].message).toContain('Unsupported expression')
    slack.parameters.text = '=Hello {{ $json.name'
    expect(validate(wf).issues[0].message).toContain('Malformed expression')
  })

  it('tekst z klamrami, który nie jest wyrażeniem, przechodzi', () => {
    const wf = compiled('kontakt')
    wf.nodes.find((n) => n.name === 'Reply to a message')!.parameters.message = 'Use {{ name }} as a placeholder'
    expect(validate(wf).ok).toBe(true)
  })

  it('nieoczekiwany parametr', () => {
    const wf = compiled('kontakt')
    wf.nodes.find((n) => n.name === 'Create a row')!.parameters.operation = 'delete'
    expect(validate(wf).issues[0].message).toBe('Unexpected parameter "operation"')
  })
})
