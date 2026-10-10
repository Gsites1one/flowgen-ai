import { z } from 'zod'
import { defineEntry, plainOutputs } from '../schema/catalog.ts'
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
})
