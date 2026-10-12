import type { Session } from '@supabase/supabase-js'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase.ts'

/** Logowanie e-mailem i hasłem. Rejestracja jest wyłączona — konta zakłada właściciel projektu. */
export function AuthPanel({ session }: { session: Session | null | undefined }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!supabase || session === undefined) return null
  const client = supabase

  if (session) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm">
        <span className="text-zinc-400">
          Signed in as <span className="text-zinc-100">{session.user.email}</span>
        </span>
        <button
          type="button"
          onClick={() => client.auth.signOut()}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:bg-zinc-800"
        >
          Sign out
        </button>
      </div>
    )
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await client.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    else setPassword('')
    setBusy(false)
  }

  const input =
    'min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none'

  return (
    <form onSubmit={submit} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm">
      <p className="mb-3 text-zinc-400">Sign in to run test imports in n8n.</p>
      <div className="flex flex-wrap gap-2">
        <input
          type="email"
          required
          autoComplete="username"
          placeholder="Email"
          aria-label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="Password"
          aria-label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-emerald-500 px-3 py-1.5 font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
      {error && <p className="mt-2 text-red-400">{error}</p>}
    </form>
  )
}
