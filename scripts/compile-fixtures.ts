// Kompiluje RP z tests/fixtures do plików JSON gotowych do importu w n8n (katalog out/).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { compile } from '../src/compiler/index.ts'

const fixtures = new URL('../tests/fixtures/', import.meta.url)
const out = new URL('../out/', import.meta.url)
mkdirSync(out, { recursive: true })

let failed = false
for (const file of readdirSync(fixtures).filter((f) => f.endsWith('.json'))) {
  const result = compile(JSON.parse(readFileSync(new URL(file, fixtures), 'utf8')))
  if (!result.ok) {
    failed = true
    console.error(`${file}: FAILED`)
    for (const e of result.errors) console.error(`  ${e.step}: ${e.message}`)
    continue
  }
  const target = file.replace(/^plan-/, 'n8n-')
  writeFileSync(new URL(target, out), JSON.stringify(result.workflow, null, 2) + '\n')
  console.log(`${file} → out/${target} (${result.workflow.nodes.length} nodes)`)
}
process.exit(failed ? 1 : 0)
