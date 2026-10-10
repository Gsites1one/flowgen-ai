import { z } from 'zod'
import { defineEntry, plainOutputs } from '../schema/catalog.ts'
import { paramValueSchema } from '../schema/plan.ts'

export const editFields = defineEntry({
  key: 'core.editFields',
  integration: 'core',
  kind: 'action',
  label: 'Edit Fields',
  type: 'n8n-nodes-base.set',
  typeVersion: 3.5,
  paramsSchema: z.strictObject({
    fields: z
      .array(
        z.strictObject({
          name: z.string().min(1),
          value: paramValueSchema,
          type: z.enum(['string', 'number', 'boolean']).default('string'),
        }),
      )
      .min(1),
  }),
  outputs: (p) => plainOutputs(p.fields.map((f) => f.name)),
  build: (p, ctx) => ({
    assignments: {
      assignments: p.fields.map((f) => ({
        id: ctx.uuid(),
        name: f.name,
        value: ctx.value(f.value),
        type: f.type,
      })),
    },
    options: {},
  }),
})

const numberOps = ['equals', 'notEquals', 'gt', 'gte', 'lt', 'lte'] as const
const stringOps = [
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
] as const

export const ifCondition = defineEntry({
  key: 'core.if',
  integration: 'core',
  kind: 'action',
  label: 'If',
  type: 'n8n-nodes-base.if',
  typeVersion: 2.3,
  branches: ['true', 'false'],
  paramsSchema: z.discriminatedUnion('dataType', [
    z.strictObject({
      dataType: z.literal('number'),
      left: paramValueSchema,
      operation: z.enum(numberOps),
      right: paramValueSchema,
    }),
    z.strictObject({
      dataType: z.literal('string'),
      left: paramValueSchema,
      operation: z.enum(stringOps),
      right: paramValueSchema,
    }),
  ]),
  // If przepuszcza dane bez zmian — odwołuj się do kroku przed nim.
  outputs: () => ({}),
  build: (p, ctx) => ({
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
      conditions: [
        {
          id: ctx.uuid(),
          leftValue: ctx.value(p.left),
          rightValue: ctx.value(p.right),
          operator: { type: p.dataType, operation: p.operation },
        },
      ],
      combinator: 'and',
    },
    options: {},
  }),
})
