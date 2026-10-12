import { z } from 'zod'
import { defineEntry, getPath, pathKey, plainOutputs } from '../schema/catalog.ts'
import { paramValueSchema } from '../schema/plan.ts'

export const supabaseCreateRow = defineEntry({
  key: 'supabase.createRow',
  integration: 'supabase',
  kind: 'action',
  label: 'Create a row',
  type: 'n8n-nodes-base.supabase',
  typeVersion: 1,
  credential: 'supabaseApi',
  paramsSchema: z.strictObject({
    table: z.string().min(1),
    /** Kolumna → wartość. */
    fields: z.record(z.string().min(1), paramValueSchema),
  }),
  outputs: (p) => plainOutputs(['id', ...Object.keys(p.fields)]),
  build: (p, ctx) => ({
    tableId: p.table,
    fieldsUi: {
      fieldValues: Object.entries(p.fields).map(([fieldId, v]) => ({
        fieldId,
        fieldValue: ctx.value(v),
      })),
    },
  }),
  n8n: { required: ['tableId', 'fieldsUi.fieldValues'] },
  nodeOutputs: (parameters) => {
    const rows = getPath(parameters, 'fieldsUi.fieldValues')
    const ids = Array.isArray(rows) ? rows.map((r) => String(getPath(r, 'fieldId') ?? '')) : []
    return { exact: ['id', ...ids.filter(Boolean).map(pathKey)] }
  },
})
