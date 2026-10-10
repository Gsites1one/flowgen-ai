import { z } from 'zod'
import { defineEntry, joinPath, pathKey } from '../schema/catalog.ts'

const jsonPrimitive = z.union([z.string(), z.number(), z.boolean(), z.null()])

export const webhookReceive = defineEntry({
  key: 'webhook.receive',
  integration: 'webhook',
  kind: 'trigger',
  label: 'Webhook',
  type: 'n8n-nodes-base.webhook',
  typeVersion: 2.1,
  needsWebhookId: true,
  paramsSchema: z.strictObject({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
    path: z.string().regex(/^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/),
    /** Pola oczekiwane w treści żądania. */
    bodyFields: z.array(z.string().min(1)).default([]),
  }),
  outputs: (p) => Object.fromEntries(p.bodyFields.map((f) => [f, joinPath('body', pathKey(f))])),
  build: (p, ctx) => ({
    httpMethod: p.method,
    path: p.path,
    ...(ctx.hasRespondNode ? { responseMode: 'responseNode' } : {}),
    options: {},
  }),
})

export const webhookRespond = defineEntry({
  key: 'webhook.respond',
  integration: 'webhook',
  kind: 'action',
  label: 'Respond to Webhook',
  type: 'n8n-nodes-base.respondToWebhook',
  typeVersion: 1.5,
  paramsSchema: z.strictObject({
    /** Stała odpowiedź JSON. */
    body: z.record(z.string().min(1), jsonPrimitive),
  }),
  outputs: () => ({}),
  build: (p) => ({
    respondWith: 'json',
    responseBody: JSON.stringify(p.body),
    options: {},
  }),
})
