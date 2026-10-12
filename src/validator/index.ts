import { z } from 'zod'
import { catalogByType, RESPOND_TYPE, WEBHOOK_TYPE } from '../catalog/index.ts'
import type { CatalogEntry } from '../schema/catalog.ts'
import { getPath } from '../schema/catalog.ts'
import { checkExpressions } from './expressions.ts'
import type { Graph, Issue, ValidationResult } from './types.ts'

export type { Issue, ValidationResult } from './types.ts'

const workflowSchema = z.looseObject({
  name: z.string().min(1),
  nodes: z
    .array(
      z.looseObject({
        parameters: z.record(z.string(), z.unknown()),
        type: z.string(),
        typeVersion: z.number(),
        position: z.tuple([z.number(), z.number()]),
        id: z.string().min(1),
        name: z.string().min(1),
        webhookId: z.string().optional(),
      }),
    )
    .min(1),
  connections: z.record(
    z.string(),
    z.looseObject({
      main: z.array(z.array(z.looseObject({ node: z.string(), type: z.literal('main'), index: z.number() }))),
    }),
  ),
})

/** Typy blokowane ze względów bezpieczeństwa — osobny, jednoznaczny komunikat. */
const BLOCKED: Record<string, string> = {
  'n8n-nodes-base.code': 'Code',
  'n8n-nodes-base.function': 'Function',
  'n8n-nodes-base.functionItem': 'Function Item',
  'n8n-nodes-base.executeCommand': 'Execute Command',
  'n8n-nodes-base.ssh': 'SSH',
  'n8n-nodes-base.httpRequest': 'HTTP Request',
}

const isEmpty = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Sprawdza JSON przepływu n8n niezależnie od tego, skąd pochodzi (kompilator, edycja w interfejsie).
 * Zwraca wszystkie znalezione problemy, nie tylko pierwszy.
 */
export function validate(input: unknown): ValidationResult {
  const issues: Issue[] = []
  const add = (rule: Issue['rule'], message: string, node?: string) =>
    void issues.push({ rule, message, ...(node ? { node } : {}) })

  const parsed = workflowSchema.safeParse(input)
  if (!parsed.success) {
    for (const i of parsed.error.issues) add('shape', `${i.path.join('.') || 'workflow'}: ${i.message}`)
    return { ok: false, issues }
  }
  const workflow = parsed.data

  // 1. Węzły: unikalność, typ z katalogu, parametry.
  const entries = new Map<string, CatalogEntry>()
  const names = new Set<string>()
  const ids = new Set<string>()
  for (const node of workflow.nodes) {
    if (names.has(node.name)) add('unique', `Duplicate node name "${node.name}"`, node.name)
    if (ids.has(node.id)) add('unique', `Duplicate node id "${node.id}"`, node.name)
    names.add(node.name)
    ids.add(node.id)

    const entry = catalogByType.get(node.type)
    if (!entry) {
      add(
        'node-type',
        BLOCKED[node.type]
          ? `${BLOCKED[node.type]} nodes are blocked for security reasons`
          : `Node type "${node.type}" is not in the catalog`,
        node.name,
      )
      continue
    }
    entries.set(node.name, entry)
    if (node.typeVersion !== entry.typeVersion) {
      add('node-type', `Expected typeVersion ${entry.typeVersion}, got ${node.typeVersion}`, node.name)
    }
    if (entry.needsWebhookId && !node.webhookId) add('params', 'Missing webhookId', node.name)

    const { required, fixed = {}, optional = [] } = entry.n8n
    for (const path of required) {
      if (isEmpty(getPath(node.parameters, path))) add('params', `Missing required parameter "${path}"`, node.name)
    }
    for (const [path, expected] of Object.entries(fixed)) {
      const actual = getPath(node.parameters, path)
      if (!sameJson(actual, expected)) {
        add(
          'params',
          `Parameter "${path}" must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual) ?? 'nothing'}`,
          node.name,
        )
      }
    }
    const allowed = new Set([...required, ...Object.keys(fixed), ...optional].map((p) => p.split('.')[0]))
    for (const key of Object.keys(node.parameters)) {
      if (!allowed.has(key)) add('params', `Unexpected parameter "${key}"`, node.name)
    }
  }

  // 2. Połączenia.
  const graph: Graph = { incoming: new Map(), outgoing: new Map() }
  for (const name of names) {
    graph.incoming.set(name, [])
    graph.outgoing.set(name, [])
  }
  for (const [source, { main }] of Object.entries(workflow.connections)) {
    if (!names.has(source)) {
      add('connections', `Connection from unknown node "${source}"`)
      continue
    }
    const outputs = entries.get(source)?.branches ? 2 : 1
    if (main.length > outputs) {
      add('connections', `Node has ${outputs} output(s) but connections use ${main.length}`, source)
    }
    for (const targets of main) {
      for (const target of targets) {
        if (!names.has(target.node)) {
          add('connections', `Connection to unknown node "${target.node}"`, source)
        } else if (target.index !== 0) {
          add('connections', `Connection to "${target.node}" uses input ${target.index}; only input 0 exists`, source)
        } else if (!graph.outgoing.get(source)!.includes(target.node)) {
          graph.outgoing.get(source)!.push(target.node)
          graph.incoming.get(target.node)!.push(source)
        }
      }
    }
  }

  // 3. Wyzwalacz: dokładnie jeden, bez wejść.
  const triggers = [...entries].filter(([, e]) => e.kind === 'trigger').map(([name]) => name)
  if (triggers.length === 0) add('trigger', 'Workflow has no trigger')
  if (triggers.length > 1) add('trigger', `Workflow has ${triggers.length} triggers (${triggers.join(', ')}); exactly one is allowed`)
  for (const name of triggers) {
    const from = graph.incoming.get(name)!
    if (from.length > 0) add('trigger', `Trigger cannot have incoming connections (from ${from.join(', ')})`, name)
  }

  // 4. Każdy węzeł ma wejście i jest osiągalny z wyzwalacza.
  const reachable = new Set<string>(triggers)
  const queue = [...triggers]
  while (queue.length > 0) {
    for (const next of graph.outgoing.get(queue.shift()!)!) {
      if (!reachable.has(next)) {
        reachable.add(next)
        queue.push(next)
      }
    }
  }
  for (const name of names) {
    if (triggers.includes(name)) continue
    if (graph.incoming.get(name)!.length === 0) add('graph', 'Node has no incoming connection', name)
    else if (!reachable.has(name)) add('graph', 'Node is not reachable from the trigger', name)
  }

  // 5. Cykle.
  const cycle = findCycle(graph)
  if (cycle) add('cycle', `Workflow contains a cycle: ${cycle.join(' → ')}`)

  // 6. Wyrażenia: tylko odwołania do wcześniejszych węzłów i istniejących pól.
  const parameters = new Map(workflow.nodes.map((n) => [n.name, n.parameters]))
  for (const node of workflow.nodes) {
    if (!entries.has(node.name)) continue
    for (const message of checkExpressions(node.name, parameters, entries, graph)) {
      add('expression', message, node.name)
    }
  }

  // 7. Webhook ⇔ Respond to Webhook.
  const respondNodes = workflow.nodes.filter((n) => n.type === RESPOND_TYPE)
  const webhook = workflow.nodes.find((n) => n.type === WEBHOOK_TYPE)
  const usesResponseNode = webhook?.parameters.responseMode === 'responseNode'
  if (respondNodes.length > 0 && !webhook) {
    add('respond', 'Respond to Webhook requires a Webhook trigger', respondNodes[0].name)
  } else if (webhook && respondNodes.length > 0 && !usesResponseNode) {
    add('respond', 'Workflow has a Respond to Webhook node, so responseMode must be "responseNode"', webhook.name)
  } else if (webhook && respondNodes.length === 0 && usesResponseNode) {
    add('respond', 'responseMode is "responseNode" but the workflow has no Respond to Webhook node', webhook.name)
  }

  return { ok: issues.length === 0, issues }
}

function findCycle({ outgoing }: Graph): string[] | null {
  const state = new Map<string, 'visiting' | 'done'>()
  const stack: string[] = []
  const visit = (name: string): string[] | null => {
    state.set(name, 'visiting')
    stack.push(name)
    for (const next of outgoing.get(name)!) {
      if (state.get(next) === 'visiting') return [...stack.slice(stack.indexOf(next)), next]
      if (!state.has(next)) {
        const found = visit(next)
        if (found) return found
      }
    }
    stack.pop()
    state.set(name, 'done')
    return null
  }
  for (const name of outgoing.keys()) {
    if (!state.has(name)) {
      const found = visit(name)
      if (found) return found
    }
  }
  return null
}
