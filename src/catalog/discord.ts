import { z } from 'zod'
import { defineEntry } from '../schema/catalog.ts'
import { paramValueSchema } from '../schema/plan.ts'

export const discordWebhookMessage = defineEntry({
  key: 'discord.webhookMessage',
  integration: 'discord',
  kind: 'action',
  label: 'Discord',
  type: 'n8n-nodes-base.discord',
  typeVersion: 2,
  credential: 'discordWebhookApi',
  needsWebhookId: true,
  paramsSchema: z.strictObject({
    content: paramValueSchema,
  }),
  outputs: () => ({}),
  build: (p, ctx) => ({
    authentication: 'webhook',
    content: ctx.value(p.content),
    options: {},
  }),
  n8n: { required: ['content'], fixed: { authentication: 'webhook' }, optional: ['options'] },
  nodeOutputs: () => ({ exact: [] }),
})
