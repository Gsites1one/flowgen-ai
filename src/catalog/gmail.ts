import { z } from 'zod'
import { defineEntry, plainOutputs } from '../schema/catalog.ts'
import { paramValueSchema } from '../schema/plan.ts'

export const gmailNewMessage = defineEntry({
  key: 'gmail.newMessage',
  integration: 'gmail',
  kind: 'trigger',
  label: 'Gmail Trigger',
  type: 'n8n-nodes-base.gmailTrigger',
  typeVersion: 1.4,
  credential: 'gmailOAuth2',
  paramsSchema: z.strictObject({
    /** Fraza w temacie wiadomości. */
    subject: z.string().min(1).optional(),
    /** Surowe zapytanie Gmail; ma pierwszeństwo przed `subject`. */
    query: z.string().min(1).optional(),
    readStatus: z.enum(['unread', 'read', 'both']).default('unread'),
  }),
  outputs: () => plainOutputs(['id', 'threadId', 'snippet', 'From', 'To', 'Subject']),
  build: (p) => {
    const q = p.query ?? (p.subject ? `subject:"${p.subject.replaceAll('"', '')}"` : undefined)
    return {
      pollTimes: { item: [{ mode: 'everyMinute' }] },
      filters: { ...(q ? { q } : {}), readStatus: p.readStatus },
    }
  },
})

export const gmailReply = defineEntry({
  key: 'gmail.reply',
  integration: 'gmail',
  kind: 'action',
  label: 'Reply to a message',
  type: 'n8n-nodes-base.gmail',
  typeVersion: 2.2,
  credential: 'gmailOAuth2',
  needsWebhookId: true,
  paramsSchema: z.strictObject({
    messageId: paramValueSchema,
    message: paramValueSchema,
  }),
  outputs: () => plainOutputs(['id', 'threadId']),
  build: (p, ctx) => ({
    operation: 'reply',
    messageId: ctx.value(p.messageId),
    emailType: 'text',
    message: ctx.value(p.message),
    options: { appendAttribution: false },
  }),
})
