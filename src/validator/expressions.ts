import type { CatalogEntry } from '../schema/catalog.ts'
import type { Graph } from './types.ts'

const PATH = String.raw`((?:\.[A-Za-z_$][\w$]*|\[\d+\]|\["(?:[^"\\]|\\.)*"\])+)`
/** Jedyne dozwolone postacie wyrażeń — dokładnie te, które emituje kompilator. */
const JSON_REF = new RegExp(String.raw`^\$json${PATH}$`)
const NODE_REF = new RegExp(String.raw`^\$\('((?:[^'\\]|\\.)*)'\)\.item\.json${PATH}$`)

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out)
  else if (value && typeof value === 'object') for (const v of Object.values(value)) collectStrings(v, out)
  return out
}

function ancestorsOf(name: string, { incoming }: Graph): Set<string> {
  const seen = new Set<string>()
  const queue = [...(incoming.get(name) ?? [])]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (seen.has(current)) continue
    seen.add(current)
    queue.push(...(incoming.get(current) ?? []))
  }
  return seen
}

/** Problemy z wyrażeniami w parametrach węzła `name`. */
export function checkExpressions(
  name: string,
  parameters: ReadonlyMap<string, Record<string, unknown>>,
  entries: ReadonlyMap<string, CatalogEntry>,
  graph: Graph,
): string[] {
  const problems = new Set<string>()
  const ancestors = ancestorsOf(name, graph)

  const checkPath = (source: string, rawPath: string, shown: string) => {
    const entry = entries.get(source)
    if (!entry) return // typ spoza katalogu — zgłoszony osobno
    const { exact, prefixes = [] } = entry.nodeOutputs(parameters.get(source) ?? {})
    const path = rawPath.replace(/^\./, '')
    const underPrefix = prefixes.some((p) => path === p || path.startsWith(`${p}.`) || path.startsWith(`${p}[`))
    if (!exact.includes(path) && !underPrefix) {
      const known = [...exact, ...prefixes.map((p) => `${p}.*`)].join(', ') || 'none'
      problems.add(`${shown}: node "${source}" has no output field "${path}" (available: ${known})`)
    }
  }

  /** Węzeł, którego dane widzi `$json`: jedyny poprzednik, z pominięciem węzłów przepuszczających (If). */
  const jsonSource = (): string | null => {
    const visited = new Set([name])
    let current = name
    for (;;) {
      const from = graph.incoming.get(current) ?? []
      if (from.length !== 1 || visited.has(from[0])) return null
      current = from[0]
      visited.add(current)
      if (!entries.get(current)?.passthrough) return current
    }
  }

  for (const text of collectStrings(parameters.get(name))) {
    if (!text.startsWith('=')) continue
    const body = text.slice(1)
    const leftover = body.replace(/\{\{(.*?)\}\}/gs, (_, inner: string) => {
      const expr = inner.trim()
      const shown = `{{ ${expr} }}`
      const viaJson = JSON_REF.exec(expr)
      const viaNode = NODE_REF.exec(expr)
      if (viaJson) {
        const source = jsonSource()
        if (!source) problems.add(`${shown}: $json is ambiguous here — the node must have exactly one input`)
        else checkPath(source, viaJson[1], shown)
      } else if (viaNode) {
        const source = viaNode[1].replaceAll("\\'", "'")
        if (!parameters.has(source)) problems.add(`${shown}: node "${source}" does not exist`)
        else if (!ancestors.has(source)) problems.add(`${shown}: node "${source}" does not run before this node`)
        else if (entries.get(source)?.passthrough) {
          problems.add(`${shown}: node "${source}" only passes data through — reference the node before it`)
        } else checkPath(source, viaNode[2], shown)
      } else {
        problems.add(`Unsupported expression ${shown} — only references to earlier nodes are allowed`)
      }
      return ''
    })
    if (leftover.includes('{{') || leftover.includes('}}')) {
      problems.add(`Malformed expression: unbalanced "{{" or "}}" in "${text}"`)
    }
  }
  return [...problems]
}
