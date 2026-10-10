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
  paramsSchema: z.ZodType
  /** Pola wyjściowe: nazwa pola w RP → ścieżka w `$json`. */
  outputs(params: never): Record<string, string>
  /** Parametry węzła w formacie n8n. */
  build(params: never, ctx: BuildContext): Record<string, unknown>
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
