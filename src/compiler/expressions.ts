import type { ParamValue, Ref } from '../schema/plan.ts'
import { isRef, isTemplate } from '../schema/plan.ts'
import type { ResolvedNode } from './types.ts'

export type ExpressionScope = {
  node: ResolvedNode
  nodes: ReadonlyMap<string, ResolvedNode>
  ancestors: ReadonlySet<string>
}

/** Wyrażenie n8n (bez klamer) dla odwołania widzianego z węzła `scope.node`. */
function refExpression(ref: Ref, { node, nodes, ancestors }: ExpressionScope): string {
  const source = nodes.get(ref.ref)
  if (!source) throw new Error(`Reference to unknown step "${ref.ref}"`)
  if (!ancestors.has(source.id)) {
    throw new Error(`Step "${ref.ref}" does not run before this step, so its data is not available`)
  }
  const path = source.outputs[ref.field]
  if (path === undefined) {
    const known = Object.keys(source.outputs).join(', ') || 'none'
    throw new Error(
      `Step "${ref.ref}" (${source.name}) has no output field "${ref.field}" (available: ${known})`,
    )
  }
  // $json to dane jedynego bezpośredniego poprzednika; każdy inny węzeł wskazujemy po nazwie.
  const isSolePredecessor = node.incoming.length === 1 && node.incoming[0].from === source.id
  const base = isSolePredecessor ? '$json' : `$('${source.name.replaceAll("'", "\\'")}').item.json`
  return path.startsWith('[') ? base + path : `${base}.${path}`
}

function literal(text: string): string {
  // Tekst zaczynający się od "=" n8n potraktowałby jak wyrażenie.
  if (text.startsWith('=')) throw new Error('Literal text must not start with "="')
  return text
}

/** Zamienia wartość RP na wartość parametru n8n. */
export function toN8nValue(
  value: ParamValue,
  scope: ExpressionScope,
): string | number | boolean | null {
  if (isRef(value)) return `={{ ${refExpression(value, scope)} }}`
  if (isTemplate(value)) {
    const parts = value.template
    if (parts.every((p) => typeof p === 'string')) return literal(parts.join(''))
    return (
      '=' +
      parts
        .map((p) => {
          if (typeof p !== 'string') return `{{ ${refExpression(p, scope)} }}`
          if (p.includes('{{')) throw new Error('Literal text inside a template must not contain "{{"')
          return p
        })
        .join('')
    )
  }
  return typeof value === 'string' ? literal(value) : value
}
