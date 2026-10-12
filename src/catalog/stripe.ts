import { z } from 'zod'
import { defineEntry, plainOutputs } from '../schema/catalog.ts'
import { paramValueSchema } from '../schema/plan.ts'

export const stripeGetCustomer = defineEntry({
  key: 'stripe.getCustomer',
  integration: 'stripe',
  kind: 'action',
  label: 'Get a customer',
  type: 'n8n-nodes-base.stripe',
  typeVersion: 1,
  credential: 'stripeApi',
  paramsSchema: z.strictObject({
    customerId: paramValueSchema,
  }),
  outputs: () => plainOutputs(['id', 'email', 'name']),
  build: (p, ctx) => ({
    resource: 'customer',
    customerId: ctx.value(p.customerId),
  }),
  n8n: { required: ['customerId'], fixed: { resource: 'customer' } },
  nodeOutputs: () => ({ exact: ['id', 'email', 'name'] }),
})
