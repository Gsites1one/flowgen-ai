import { z } from 'zod'
import { defineEntry, getPath, pathKey, plainOutputs, resourceLocator } from '../schema/catalog.ts'
import { paramValueSchema } from '../schema/plan.ts'

export const googleSheetsAppendRow = defineEntry({
  key: 'googleSheets.appendRow',
  integration: 'googleSheets',
  kind: 'action',
  label: 'Append row in sheet',
  type: 'n8n-nodes-base.googleSheets',
  typeVersion: 4.7,
  credential: 'googleSheetsOAuth2Api',
  paramsSchema: z.strictObject({
    /** Identyfikator arkusza z adresu URL. */
    documentId: z.string().regex(/^[A-Za-z0-9_-]{2,}$/),
    /** Identyfikator karty w postaci `gid=<liczba>`. */
    sheet: z
      .string()
      .regex(/^gid=\d+$/)
      .default('gid=0'),
    /** Kolumna → wartość. */
    columns: z.record(z.string().min(1), paramValueSchema),
  }),
  outputs: (p) => plainOutputs(Object.keys(p.columns)),
  build: (p, ctx) => ({
    operation: 'append',
    documentId: resourceLocator(p.documentId),
    sheetName: resourceLocator(p.sheet),
    columns: {
      mappingMode: 'defineBelow',
      value: Object.fromEntries(Object.entries(p.columns).map(([k, v]) => [k, ctx.value(v)])),
      matchingColumns: [],
      // Wymagany wpis na każdą kolumnę.
      schema: Object.keys(p.columns).map((id) => ({
        id,
        displayName: id,
        required: false,
        defaultMatch: false,
        display: true,
        type: 'string',
        canBeUsedToMatch: true,
      })),
      attemptToConvertTypes: false,
      convertFieldsToString: false,
    },
    options: {},
  }),
  n8n: {
    required: ['documentId.value', 'sheetName.value', 'columns.value', 'columns.schema'],
    fixed: { operation: 'append', 'columns.mappingMode': 'defineBelow' },
    optional: ['options'],
  },
  nodeOutputs: (parameters) => {
    const value = getPath(parameters, 'columns.value')
    return { exact: value && typeof value === 'object' ? Object.keys(value).map(pathKey) : [] }
  },
})
