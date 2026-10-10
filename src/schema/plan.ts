import { z } from 'zod'

/** Identyfikator wyzwalacza w odwołaniach i w polu `after`. */
export const TRIGGER_ID = 'trigger'

const stepId = z.string().regex(/^(trigger|s\d+)$/, 'Expected "trigger" or "s<number>"')

/** Odwołanie do pola wyjściowego innego kroku. Na wyrażenie n8n zamienia je wyłącznie kompilator. */
export const refSchema = z.strictObject({
  ref: stepId,
  field: z.string().min(1),
})
export type Ref = z.infer<typeof refSchema>

const literalSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])

/** Tekst mieszany: stałe fragmenty przeplatane odwołaniami. */
export const templateSchema = z.strictObject({
  template: z.array(z.union([z.string(), refSchema])).min(1),
})
export type Template = z.infer<typeof templateSchema>

export const paramValueSchema = z.union([literalSchema, refSchema, templateSchema])
export type ParamValue = z.infer<typeof paramValueSchema>

const afterOneSchema = z.union([
  stepId,
  z.strictObject({ step: stepId, branch: z.enum(['true', 'false']) }),
])
export type AfterOne = z.infer<typeof afterOneSchema>

export const planSchema = z.strictObject({
  name: z.string().min(1).max(120),
  trigger: z.strictObject({
    action: z.string(),
    integration: z.string(),
    params: z.record(z.string(), z.unknown()),
  }),
  steps: z.array(
    z.strictObject({
      id: z.string().regex(/^s\d+$/, 'Expected "s<number>"'),
      action: z.string(),
      integration: z.string(),
      params: z.record(z.string(), z.unknown()),
      // Pojedynczy poprzednik albo lista (np. Respond to Webhook po obu gałęziach If).
      after: z.union([afterOneSchema, z.array(afterOneSchema).min(1)]),
    }),
  ),
  missing: z.array(z.strictObject({ field: z.string(), question: z.string() })),
})
export type Plan = z.infer<typeof planSchema>
export type PlanStep = Plan['steps'][number]

export function isRef(value: unknown): value is Ref {
  return refSchema.safeParse(value).success
}

export function isTemplate(value: unknown): value is Template {
  return templateSchema.safeParse(value).success
}
