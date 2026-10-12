// Pakuje walidator do jednego pliku dla Edge Functions (Deno), żeby serwer używał tych samych reguł co aplikacja.
// Uruchom po każdej zmianie w src/validator, src/catalog lub src/schema: npm run build:functions
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'rolldown'

const zodVersion = JSON.parse(
  readFileSync(new URL('../node_modules/zod/package.json', import.meta.url), 'utf8'),
).version

const targets = [
  { input: '../src/validator/index.ts', output: '../supabase/functions/validate-n8n/validator.gen.js' },
]

for (const target of targets) {
  const file = fileURLToPath(new URL(target.output, import.meta.url))
  await build({
    input: fileURLToPath(new URL(target.input, import.meta.url)),
    external: ['zod'],
    logLevel: 'warn',
    output: { file, format: 'esm' },
  })
  const code = readFileSync(file, 'utf8').replaceAll(/from\s+["']zod["']/g, `from "npm:zod@${zodVersion}"`)
  writeFileSync(file, `// PLIK GENEROWANY — nie edytuj. Źródło: ${target.input.slice(3)} (npm run build:functions)\n${code}`)
  console.log(`${target.input.slice(3)} → ${target.output.slice(3)} (${(code.length / 1024).toFixed(1)} kB)`)
}
