import dagre from 'dagre'
import type { Edge } from './types.ts'

const NODE_SIZE = 96
const GRID = 16

const snap = (n: number) => Math.round(n / GRID) * GRID

/** Układ LR przez dagre; pozycje względem pierwszego węzła, przyciągnięte do siatki n8n. */
export function layout(nodeIds: string[], edges: Edge[]): Map<string, [number, number]> {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', ranksep: 112, nodesep: 64 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const id of nodeIds) g.setNode(id, { width: NODE_SIZE, height: NODE_SIZE })
  // Gałąź true przed false, żeby dagre ułożył ją wyżej.
  const ordered = [...edges].sort((a, b) => Number(a.branch === 'false') - Number(b.branch === 'false'))
  for (const e of ordered) g.setEdge(e.from, e.to)
  dagre.layout(g)

  const origin = g.node(nodeIds[0])
  const pos = new Map<string, [number, number]>(
    nodeIds.map((id) => {
      const n = g.node(id)
      return [id, [snap(n.x - origin.x), snap(n.y - origin.y)]]
    }),
  )

  // Jeśli mimo to gałąź true wylądowała niżej niż false — odbij układ w pionie.
  const upsideDown = edges.some((t) => {
    if (t.branch !== 'true') return false
    const f = edges.find((e) => e.from === t.from && e.branch === 'false')
    return f !== undefined && pos.get(t.to)![1] > pos.get(f.to)![1]
  })
  if (upsideDown) for (const p of pos.values()) p[1] = -p[1] || 0

  return pos
}
