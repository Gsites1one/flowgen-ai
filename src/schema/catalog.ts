import type { z } from 'zod'
import type { ParamValue } from './plan.ts'

/** Narzędzia, które kompilator udostępnia wpisom katalogu przy budowaniu parametrów. */
export type BuildContext = {
  /** Zamienia wartość RP na wartość parametru n8n (odwołania → wyrażenia). */
  value(v: ParamValue): string | number | boolean | null
  uuid(): string
  /** Czy w przepływie występuje węzeł Respond to Webhook. */
  hasRespondNode: boolean
}

export type CatalogEntry = {
  /** Klucz akcji używany w RP, np. `gmail.reply`. */
  key: string
  integration: string
  kind: 'trigger' | 'action'
  /** Domyślna nazwa węzła (taka, jaką nadaje n8n). */
  label: string
  type: string
  typeVersion: number
  /** Nazwa typu poświadczenia; kompilator nie eksportuje bloku `credentials`. */
  credential?: string
  /** Węzeł dostaje pole `webhookId`. */
  needsWebhookId?: boolean
  /** Wyjścia inne niż pojedyncze `main[0]` (If: true/false). */
  branches?: readonly ['true', 'false']
  /** Węzeł przepuszcza dane wejściowe bez zmian (If). */
  passthrough?: boolean
  paramsSchema: z.ZodType
  /** Pola wyjściowe: nazwa pola w RP → ścieżka w `$json`. */
  outputs(params: never): Record<string, string>
  /** Parametry węzła w formacie n8n. */
  build(params: never, ctx: BuildContext): Record<string, unknown>
  /** Reguły walidatora dla parametrów w formacie n8n. */
  n8n: N8nParamRules
  /** Ścieżki wyjściowe wyprowadzone z parametrów n8n (walidator nie ufa kompilatorowi). */
  nodeOutputs(parameters: Record<string, unknown>): NodeOutputs
}

export type N8nParamRules = {
  /** Ścieżki, które muszą istnieć i być niepuste. */
  required: readonly string[]
  /** Ścieżki o wymaganej, stałej wartości — przypinają węzeł do akcji z katalogu. */
  fixed?: Readonly<Record<string, unknown>>
  /** Pozostałe dozwolone klucze najwyższego poziomu. */
  optional?: readonly string[]
}

export type NodeOutputs = {
  /** Dokładne ścieżki w `$json`. */
  exact: string[]
  /** Przedrostki, pod którymi dozwolona jest dowolna ścieżka (np. `body` w Webhooku). */
  prefixes?: string[]
}

/** Bezpieczny odczyt zagnieżdżonej wartości: `getPath(params, 'columns.value')`. */
export function getPath(source: unknown, path: string): unknown {
  let current = source
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, key)) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

export function defineEntry<S extends z.ZodType>(
  entry: Omit<CatalogEntry, 'paramsSchema' | 'outputs' | 'build'> & {
    paramsSchema: S
    outputs(params: z.output<S>): Record<string, string>
    build(params: z.output<S>, ctx: BuildContext): Record<string, unknown>
  },
): CatalogEntry {
  return entry
}

/** Wybór zasobu (resource locator). */
export function resourceLocator(value: string, mode: 'id' | 'list' = 'id') {
  return { __rl: true, value, mode }
}

/** Segment ścieżki dla nazwy pola: `name` albo `["Full Name"]`, gdy nazwa nie jest identyfikatorem. */
export function pathKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : `[${JSON.stringify(name)}]`
}

/** Łączy segmenty ścieżki: `joinPath('body', '["Full Name"]')` → `body["Full Name"]`. */
export function joinPath(...segments: string[]): string {
  return segments.reduce(
    (acc, s) => (acc === '' ? s : s.startsWith('[') ? acc + s : `${acc}.${s}`),
    '',
  )
}

/** Pola o ścieżce równej nazwie. */
export function plainOutputs(fields: readonly string[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f, pathKey(f)]))
}
