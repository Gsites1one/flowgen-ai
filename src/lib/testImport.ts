import { FunctionsHttpError } from '@supabase/supabase-js'
import type { ValidationResult } from '../validator/index.ts'
import { supabase } from './supabase.ts'

export type TestImportResult = ValidationResult & {
  /** Import się powiódł, ale coś wymaga uwagi (np. kopia testowa została w n8n). */
  warning?: string
}

/**
 * Walidacja po stronie serwera i testowy import do n8n (utworzenie + natychmiastowe usunięcie).
 * Wymaga zalogowanego użytkownika. Błędy transportu i autoryzacji są rzucane jako wyjątek.
 */
export async function testImport(workflow: unknown): Promise<TestImportResult> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.functions.invoke('validate-n8n', { body: { workflow } })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null)
      throw new Error(body?.error ?? `Request failed (HTTP ${error.context.status})`)
    }
    throw new Error(error.message)
  }
  return data as TestImportResult
}
