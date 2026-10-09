import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'

type Status = 'checking' | 'connected' | 'not-configured' | 'error'

const TABLES = ['workflows', 'workflow_versions', 'clarifications', 'usage'] as const

export default function App() {
  const [status, setStatus] = useState<Status>(isSupabaseConfigured ? 'checking' : 'not-configured')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const client = supabase
    if (!client) return
    Promise.all(TABLES.map((t) => client.from(t).select('*', { head: true, count: 'exact' })))
      .then((results) => {
        const failed = results.find((r) => r.error)
        if (failed?.error) {
          setStatus('error')
          setError(failed.error.message)
        } else {
          setStatus('connected')
        }
      })
      .catch((e: unknown) => {
        setStatus('error')
        setError(e instanceof Error ? e.message : String(e))
      })
  }, [])

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-4xl font-semibold tracking-tight"
      >
        FlowGen AI
      </motion.h1>
      <p className="text-zinc-400">
        Describe a business process in plain language and get an n8n workflow ready to import.
      </p>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm">
        <span className="text-zinc-400">Supabase: </span>
        <StatusLabel status={status} />
        {error && <p className="mt-2 font-mono text-xs text-red-400">{error}</p>}
      </div>
    </main>
  )
}

function StatusLabel({ status }: { status: Status }) {
  switch (status) {
    case 'checking':
      return <span className="text-zinc-300">checking…</span>
    case 'connected':
      return <span className="text-emerald-400">connected, all tables reachable</span>
    case 'not-configured':
      return <span className="text-amber-400">not configured — fill in .env</span>
    case 'error':
      return <span className="text-red-400">error</span>
  }
}
