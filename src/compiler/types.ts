import type { CatalogEntry } from '../schema/catalog.ts'

export type N8nNode = {
  parameters: Record<string, unknown>
  type: string
  typeVersion: number
  position: [number, number]
  id: string
  name: string
  webhookId?: string
}

export type N8nConnection = { node: string; type: 'main'; index: number }

export type N8nWorkflow = {
  name: string
  nodes: N8nNode[]
  connections: Record<string, { main: N8nConnection[][] }>
  settings: { executionOrder: 'v1' }
}

export type CompileError = {
  /** Identyfikator kroku RP (`trigger`, `s1`…) albo `plan` dla błędów ogólnych. */
  step: string
  message: string
}

export type CompileResult =
  | { ok: true; workflow: N8nWorkflow }
  | { ok: false; errors: CompileError[] }

export type Edge = { from: string; to: string; branch?: 'true' | 'false' }

/** Krok RP po dopasowaniu do katalogu. */
export type ResolvedNode = {
  id: string
  entry: CatalogEntry
  params: unknown
  name: string
  outputs: Record<string, string>
  /** Krawędzie wchodzące. */
  incoming: Edge[]
}
