import { catalog, RESPOND_KEY } from '../catalog/index.ts'
import type { BuildContext } from '../schema/catalog.ts'
import type { AfterOne } from '../schema/plan.ts'
import { planSchema, TRIGGER_ID } from '../schema/plan.ts'
import { toN8nValue } from './expressions.ts'
import { layout } from './layout.ts'
import type { CompileError, CompileResult, Edge, N8nNode, N8nWorkflow, ResolvedNode } from './types.ts'

export type { CompileError, CompileResult, N8nNode, N8nWorkflow } from './types.ts'

export type CompileOptions = {
  /** Źródło identyfikatorów; w testach podmieniane na deterministyczne. */
  uuid?: () => string
}

/** RP → JSON przepływu n8n. Wejście jest niezaufane: wszystko przechodzi przez schematy Zod. */
export function compile(input: unknown, options: CompileOptions = {}): CompileResult {
  const uuid = options.uuid ?? (() => crypto.randomUUID())
  const errors: CompileError[] = []
  const fail = (step: string, message: string) => void errors.push({ step, message })

  const parsed = planSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => ({
        step: 'plan',
        message: `${i.path.join('.') || 'plan'}: ${i.message}`,
      })),
    }
  }
  const plan = parsed.data

  // 1. Dopasowanie kroków do katalogu i walidacja parametrów.
  const nodes = new Map<string, ResolvedNode>()
  const usedNames = new Map<string, number>()
  const steps = [{ id: TRIGGER_ID, ...plan.trigger, after: [] as AfterOne[] }, ...plan.steps]

  for (const step of steps) {
    const isTrigger = step.id === TRIGGER_ID
    if (nodes.has(step.id)) {
      fail(step.id, 'Duplicate step id')
      continue
    }
    const entry = catalog.get(step.action)
    if (!entry) {
      fail(step.id, `Unknown action "${step.action}"`)
      continue
    }
    if (entry.integration !== step.integration) {
      fail(step.id, `Action "${step.action}" belongs to "${entry.integration}", not "${step.integration}"`)
      continue
    }
    if (isTrigger !== (entry.kind === 'trigger')) {
      fail(step.id, isTrigger ? `"${step.action}" is not a trigger` : `Trigger "${step.action}" cannot be used as a step`)
      continue
    }
    const params = entry.paramsSchema.safeParse(step.params)
    if (!params.success) {
      for (const i of params.error.issues) fail(step.id, `params.${i.path.join('.')}: ${i.message}`)
      continue
    }
    // Nazwy jak w n8n: "Send a message", "Send a message1"…
    const count = usedNames.get(entry.label) ?? 0
    usedNames.set(entry.label, count + 1)
    nodes.set(step.id, {
      id: step.id,
      entry,
      params: params.data,
      name: count === 0 ? entry.label : `${entry.label}${count}`,
      outputs: entry.outputs(params.data as never),
      incoming: [],
    })
  }
  if (errors.length > 0) return { ok: false, errors }

  // 2. Krawędzie.
  const edges: Edge[] = []
  for (const step of plan.steps) {
    const node = nodes.get(step.id)!
    for (const after of Array.isArray(step.after) ? step.after : [step.after]) {
      const from = typeof after === 'string' ? after : after.step
      const branch = typeof after === 'string' ? undefined : after.branch
      const source = nodes.get(from)
      if (!source) {
        fail(step.id, `"after" points to unknown step "${from}"`)
        continue
      }
      if (source.entry.branches && !branch) {
        fail(step.id, `Step "${from}" (${source.name}) has two outputs — specify branch "true" or "false"`)
        continue
      }
      if (!source.entry.branches && branch) {
        fail(step.id, `Step "${from}" (${source.name}) has no branches`)
        continue
      }
      const edge: Edge = { from, to: step.id, branch }
      if (edges.some((e) => e.from === from && e.to === step.id && e.branch === branch)) continue
      edges.push(edge)
      node.incoming.push(edge)
    }
  }
  if (errors.length > 0) return { ok: false, errors }

  // 3. Przodkowie każdego węzła (i wykrycie cykli / kroków odciętych od wyzwalacza).
  const ancestors = new Map<string, Set<string>>([[TRIGGER_ID, new Set()]])
  let pending = plan.steps.map((s) => s.id)
  while (pending.length > 0) {
    const next = pending.filter((id) => !nodes.get(id)!.incoming.every((e) => ancestors.has(e.from)))
    if (next.length === pending.length) {
      for (const id of next) fail(id, 'Step is part of a cycle or is not reachable from the trigger')
      return { ok: false, errors }
    }
    for (const id of pending) {
      if (next.includes(id)) continue
      const set = new Set<string>()
      for (const e of nodes.get(id)!.incoming) {
        set.add(e.from)
        for (const a of ancestors.get(e.from)!) set.add(a)
      }
      ancestors.set(id, set)
    }
    pending = next
  }

  // 4. Parametry węzłów.
  const hasRespondNode = [...nodes.values()].some((n) => n.entry.key === RESPOND_KEY)
  const positions = layout([...nodes.keys()], edges)
  const n8nNodes: N8nNode[] = []
  for (const node of nodes.values()) {
    const ctx: BuildContext = {
      value: (v) => toN8nValue(v, { node, nodes, ancestors: ancestors.get(node.id)! }),
      uuid,
      hasRespondNode,
    }
    try {
      n8nNodes.push({
        parameters: node.entry.build(node.params as never, ctx),
        type: node.entry.type,
        typeVersion: node.entry.typeVersion,
        position: positions.get(node.id)!,
        id: uuid(),
        name: node.name,
        ...(node.entry.needsWebhookId ? { webhookId: uuid() } : {}),
      })
    } catch (e) {
      fail(node.id, e instanceof Error ? e.message : String(e))
    }
  }
  if (errors.length > 0) return { ok: false, errors }

  // 5. Połączenia — kluczowane nazwą węzła źródłowego, indeks wyjścia = gałąź.
  const connections: N8nWorkflow['connections'] = {}
  for (const e of edges) {
    const source = nodes.get(e.from)!
    const main = (connections[source.name] ??= { main: source.entry.branches ? [[], []] : [[]] }).main
    main[e.branch === 'false' ? 1 : 0].push({ node: nodes.get(e.to)!.name, type: 'main', index: 0 })
  }

  return {
    ok: true,
    workflow: { name: plan.name, nodes: n8nNodes, connections, settings: { executionOrder: 'v1' } },
  }
}
