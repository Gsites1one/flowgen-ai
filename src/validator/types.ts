export type Issue = {
  rule:
    | 'shape'
    | 'unique'
    | 'node-type'
    | 'params'
    | 'connections'
    | 'trigger'
    | 'graph'
    | 'cycle'
    | 'expression'
    | 'respond'
    | 'test-import'
  /** Nazwa węzła, którego dotyczy problem. */
  node?: string
  message: string
}

export type ValidationResult = { ok: boolean; issues: Issue[] }

/** Graf przepływu po nazwach węzłów (bez powtórzeń krawędzi). */
export type Graph = {
  incoming: Map<string, string[]>
  outgoing: Map<string, string[]>
}
