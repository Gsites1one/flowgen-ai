import { useMemo, useState } from 'react'
import contactPlan from '../../tests/fixtures/plan-kontakt.json'
import paymentPlan from '../../tests/fixtures/plan-platnosc.json'
import { compile } from '../compiler/index.ts'
import { testImport } from '../lib/testImport.ts'
import type { TestImportResult } from '../lib/testImport.ts'
import { validate } from '../validator/index.ts'

const FIXTURES = [
  { file: 'n8n-kontakt.json', label: 'Reference A — contact', plan: contactPlan },
  { file: 'n8n-platnosc.json', label: 'Reference B — payment', plan: paymentPlan },
]

type ImportState = { status: 'running' } | { status: 'done'; result: TestImportResult } | { status: 'error'; message: string }

function download(file: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = file
  a.click()
  URL.revokeObjectURL(url)
}

/** Tymczasowy podgląd etapów 1–2: kompilacja ręcznie napisanych RP wzorców A i B, walidacja, testowy import. */
export function CompilerPreview({ signedIn }: { signedIn: boolean }) {
  const compiled = useMemo(
    () =>
      FIXTURES.map((f) => {
        const result = compile(f.plan)
        return { ...f, result, validation: result.ok ? validate(result.workflow) : null }
      }),
    [],
  )
  const [open, setOpen] = useState<string | null>(null)
  const [imports, setImports] = useState<Record<string, ImportState>>({})

  const runImport = async (file: string, workflow: unknown) => {
    setImports((s) => ({ ...s, [file]: { status: 'running' } }))
    try {
      const result = await testImport(workflow)
      setImports((s) => ({ ...s, [file]: { status: 'done', result } }))
    } catch (e) {
      setImports((s) => ({ ...s, [file]: { status: 'error', message: e instanceof Error ? e.message : String(e) } }))
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-medium tracking-wide text-zinc-400 uppercase">
        Stage 1 — compiler output
      </h2>
      {compiled.map(({ file, label, result, validation }) => {
        const json = result.ok ? JSON.stringify(result.workflow, null, 2) : ''
        const state = imports[file]
        return (
          <article key={file} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-medium text-zinc-100">{label}</h3>
                <p className={result.ok ? 'text-emerald-400' : 'text-red-400'}>
                  {result.ok
                    ? `compiled — ${result.workflow.nodes.length} nodes`
                    : `failed — ${result.errors.length} errors`}
                </p>
                {validation && (
                  <p className={validation.ok ? 'text-emerald-400' : 'text-red-400'}>
                    {validation.ok
                      ? 'validation passed'
                      : `validation failed — ${validation.issues.map((i) => i.message).join('; ')}`}
                  </p>
                )}
              </div>
              {result.ok && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(open === file ? null : file)}
                    className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:bg-zinc-800"
                  >
                    {open === file ? 'Hide JSON' : 'Show JSON'}
                  </button>
                  <button
                    type="button"
                    onClick={() => runImport(file, result.workflow)}
                    disabled={!signedIn || !validation?.ok || state?.status === 'running'}
                    title={signedIn ? undefined : 'Sign in to run a test import'}
                    className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {state?.status === 'running' ? 'Importing…' : 'Test import in n8n'}
                  </button>
                  <button
                    type="button"
                    onClick={() => download(file, json + '\n')}
                    // Eksport zablokowany, dopóki walidacja nie przejdzie.
                    disabled={!validation?.ok}
                    className="rounded-md bg-emerald-500 px-3 py-1.5 font-medium text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Download {file}
                  </button>
                </div>
              )}
            </div>
            {state?.status === 'done' && (
              <div className="mt-3 rounded-md bg-zinc-950 p-3">
                <p className={state.result.ok ? 'text-emerald-400' : 'text-red-400'}>
                  {state.result.ok
                    ? 'Test import passed — n8n accepted the workflow and the test copy was removed'
                    : 'Test import failed'}
                </p>
                {state.result.warning && <p className="mt-1 text-amber-400">{state.result.warning}</p>}
                {state.result.issues.map((issue, i) => (
                  <p key={i} className="mt-1 text-xs text-zinc-400">
                    <span className="mr-2 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-zinc-300">{issue.rule}</span>
                    {issue.node && <span className="text-zinc-300">{issue.node}: </span>}
                    {issue.message}
                  </p>
                ))}
              </div>
            )}
            {state?.status === 'error' && <p className="mt-3 text-red-400">Test import error: {state.message}</p>}
            {result.ok ? (
              <ol className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-zinc-300">
                {result.workflow.nodes.map((n, i) => (
                  <li key={n.id}>
                    {i > 0 && <span className="mr-2 text-zinc-600">→</span>}
                    {n.name}
                  </li>
                ))}
              </ol>
            ) : (
              <ul className="mt-3 font-mono text-xs text-red-400">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    {e.step}: {e.message}
                  </li>
                ))}
              </ul>
            )}
            {open === file && (
              <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
                {json}
              </pre>
            )}
          </article>
        )
      })}
    </section>
  )
}
