import { z } from 'zod'
import { defineEntry, getPath, joinPath, pathKey, resourceLocator } from '../schema/catalog.ts'
import { paramValueSchema } from '../schema/plan.ts'

const fieldName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/)

export const openaiMessage = defineEntry({
  key: 'openai.message',
  integration: 'openai',
  kind: 'action',
  label: 'Message a model',
  type: '@n8n/n8n-nodes-langchain.openAi',
  typeVersion: 2.3,
  credential: 'openAiApi',
  paramsSchema: z.strictObject({
    model: z.string().min(1).default('gpt-4o-mini'),
    system: z.string().min(1),
    user: paramValueSchema,
    /** Nazwa i opis schematu odpowiedzi (json_schema). */
    schemaName: fieldName,
    schemaDescription: z.string().min(1),
    fields: z
      .array(
        z.strictObject({
          name: fieldName,
          type: z.enum(['string', 'number', 'boolean']).default('string'),
          nullable: z.boolean().default(true),
        }),
      )
      .min(1),
  }),
  // `text` jest już sparsowanym obiektem (OpenAI 2.3 + json_schema).
  outputs: (p) =>
    Object.fromEntries(p.fields.map((f) => [f.name, `output[0].content[0].text.${f.name}`])),
  build: (p, ctx) => {
    const schema = {
      type: 'object',
      properties: Object.fromEntries(
        p.fields.map((f) => [f.name, { type: f.nullable ? [f.type, 'null'] : f.type }]),
      ),
      additionalProperties: false,
      required: p.fields.map((f) => f.name),
    }
    return {
      modelId: resourceLocator(p.model, 'list'),
      responses: {
        values: [{ role: 'system', content: p.system }, { content: ctx.value(p.user) }],
      },
      builtInTools: {},
      options: {
        textFormat: {
          textOptions: {
            type: 'json_schema',
            name: p.schemaName,
            schema: JSON.stringify(schema, null, 2),
            description: p.schemaDescription,
            strict: true,
          },
        },
      },
    }
  },
  n8n: {
    required: ['modelId.value', 'responses.values', 'options.textFormat.textOptions.schema'],
    // Puste builtInTools: bez wyszukiwarki, interpretera kodu itp.
    fixed: { 'options.textFormat.textOptions.type': 'json_schema', builtInTools: {} },
  },
  nodeOutputs: (parameters) => {
    try {
      const schema = JSON.parse(String(getPath(parameters, 'options.textFormat.textOptions.schema')))
      return {
        exact: Object.keys(schema.properties ?? {}).map((k) =>
          joinPath('output[0].content[0].text', pathKey(k)),
        ),
      }
    } catch {
      return { exact: [] }
    }
  },
})
