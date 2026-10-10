import { useMemo, useState } from 'react'
import contactPlan from '../../tests/fixtures/plan-kontakt.json'
import paymentPlan from '../../tests/fixtures/plan-platnosc.json'
import { compile } from '../compiler/index.ts'

const FIXTURES = [
  { file: 'n8n-kontakt.json', label: 'Reference A — contact', plan: contactPlan },
  { file: 'n8n-platnosc.json', label: 'Reference B — payment', plan: paymentPlan },
]

function download(file: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = file
  a.click()
  URL.revokeObjectURL(url)
}

/** Tymczasowy podgląd etapu 1: kompilacja ręcznie napisanych RP wzorców A i B. */
export function CompilerPreview() {
  const compiled = useMemo(
    () => FIXTURES.map((f) => ({ ...f, result: compile(f.plan) })),
    [],
  )
  const [open, setOpen] = useState<string | null>(null)

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-medium tracking-wide text-zinc-400 uppercase">
        Stage 1 — compiler output
      </h2>
      {compiled.map(({ file, label, result }) => {
        const json = result.ok ? JSON.stringify(result.workflow, null, 2) : ''
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
              </div>
              {result.ok && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(open === file ? null : file)}
                    className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:bg-zinc-800"
                  >
                    {open === file ? 'Hide JSON' : 'Show JSON'}
                  </button>
                  <button
                    type="button"
                    onClick={() => download(file, json + '\n')}
                    className="rounded-md bg-emerald-500 px-3 py-1.5 font-medium text-zinc-950 hover:bg-emerald-400"
                  >
                    Download {file}
                  </button>
                </div>
              )}
            </div>
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
