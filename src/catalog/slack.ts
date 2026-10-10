import { z } from 'zod'
import { defineEntry, plainOutputs, resourceLocator } from '../schema/catalog.ts'
import { paramValueSchema } from '../schema/plan.ts'

export const slackSendMessage = defineEntry({
  key: 'slack.sendMessage',
  integration: 'slack',
  kind: 'action',
  label: 'Send a message',
  type: 'n8n-nodes-base.slack',
  typeVersion: 2.5,
  credential: 'slackApi',
  needsWebhookId: true,
  paramsSchema: z.strictObject({
    /** Identyfikator kanału, np. C0123456789. */
    channelId: z.string().regex(/^[A-Z0-9]{2,}$/),
    text: paramValueSchema,
  }),
  outputs: () => plainOutputs(['ts', 'channel']),
  build: (p, ctx) => ({
    select: 'channel',
    channelId: resourceLocator(p.channelId),
    text: ctx.value(p.text),
    // n8n domyślnie ustawia true — zawsze wyłączamy.
    otherOptions: { includeLinkToWorkflow: false },
  }),
})
