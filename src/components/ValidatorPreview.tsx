import { useMemo, useState } from 'react'
import contactPlan from '../../tests/fixtures/plan-kontakt.json'
import paymentPlan from '../../tests/fixtures/plan-platnosc.json'
import { compile } from '../compiler/index.ts'
import { testImport } from '../lib/testImport.ts'
import { brokenExamples } from '../validator/examples.ts'
import { validate } from '../validator/index.ts'

const PLANS = { contact: contactPlan, payment: paymentPlan }

type ServerCheck =
  | { status: 'idle' }
  | { status: 'running'; done: number }
  | { status: 'done'; verdicts: Record<string, 'match' | 'mismatch'> }
  | { status: 'error'; message: string }

/** Tymczasowy podgląd etapu 2: celowo zepsute przepływy i powody ich odrzucenia. */
export function ValidatorPreview({ signedIn }: { signedIn: boolean }) {
  const results = useMemo(
    () =>
      brokenExamples.map((example) => {
        const compiled = compile(PLANS[example.base])
        if (!compiled.ok) throw new Error('Fixture does not compile')
        example.mutate(compiled.workflow)
        return { example, workflow: compiled.workflow, result: validate(compiled.workflow) }
      }),
    [],
  )
  const rejected = results.filter((r) => !r.result.ok).length
  const [server, setServer] = useState<ServerCheck>({ status: 'idle' })

  // Zepsute przepływy serwer odrzuca przed kontaktem z n8n — sprawdzamy, czy podaje te same powody co aplikacja.
  const runServerCheck = async () => {
    const verdicts: Record<string, 'match' | 'mismatch'> = {}
    try {
      for (const [i, { example, workflow, result }] of results.entries()) {
        setServer({ status: 'running', done: i })
        const remote = await testImport(workflow)
        const same = !remote.ok && JSON.stringify(remote.issues) === JSON.stringify(result.issues)
        verdicts[example.title] = same ? 'match' : 'mismatch'
      }
      setServer({ status: 'done', verdicts })
    } catch (e) {
      setServer({ status: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  const matches = server.status === 'done' ? Object.values(server.verdicts).filter((v) => v === 'match').length : 0

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-medium tracking-wide text-zinc-400 uppercase">
        Stage 2 — validator
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div>
          <p className={rejected === results.length ? 'text-emerald-400' : 'text-red-400'}>
            {rejected} of {results.length} deliberately broken workflows rejected
          </p>
          {server.status === 'done' && (
            <p className={matches === results.length ? 'text-emerald-400' : 'text-red-400'}>
              Server rejected {matches} of {results.length} with identical reasons
            </p>
          )}
          {server.status === 'error' && <p className="text-red-400">Server check error: {server.message}</p>}
        </div>
        <button
          type="button"
          onClick={runServerCheck}
          disabled={!signedIn || server.status === 'running'}
          title={signedIn ? undefined : 'Sign in to run the server check'}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {server.status === 'running' ? `Checking ${server.done + 1}/${results.length}…` : 'Run server check'}
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {results.map(({ example, result }) => {
          const verdict = server.status === 'done' ? server.verdicts[example.title] : undefined
          return (
            <li key={example.title} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-zinc-100">{example.title}</span>
                <span className="flex shrink-0 gap-3">
                  {verdict && (
                    <span className={verdict === 'match' ? 'text-emerald-400' : 'text-red-400'}>
                      {verdict === 'match' ? 'server agrees' : 'server differs'}
                    </span>
                  )}
                  <span className={result.ok ? 'text-red-400' : 'text-emerald-400'}>
                    {result.ok ? 'accepted' : 'rejected'}
                  </span>
                </span>
              </div>
              <ul className="mt-1.5 flex flex-col gap-1 text-xs text-zinc-400">
                {result.issues.map((issue, i) => (
                  <li key={i}>
                    <span className="mr-2 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-zinc-300">
                      {issue.rule}
                    </span>
                    {issue.node && <span className="text-zinc-300">{issue.node}: </span>}
                    {issue.message}
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
