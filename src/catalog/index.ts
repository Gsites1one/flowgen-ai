import type { CatalogEntry } from '../schema/catalog.ts'
import { editFields, ifCondition } from './core.ts'
import { discordWebhookMessage } from './discord.ts'
import { gmailNewMessage, gmailReply } from './gmail.ts'
import { googleSheetsAppendRow } from './googleSheets.ts'
import { openaiMessage } from './openai.ts'
import { slackSendMessage } from './slack.ts'
import { stripeGetCustomer } from './stripe.ts'
import { supabaseCreateRow } from './supabase.ts'
import { webhookReceive, webhookRespond } from './webhook.ts'

const entries: CatalogEntry[] = [
  gmailNewMessage,
  gmailReply,
  openaiMessage,
  supabaseCreateRow,
  googleSheetsAppendRow,
  slackSendMessage,
  webhookReceive,
  editFields,
  ifCondition,
  stripeGetCustomer,
  discordWebhookMessage,
  webhookRespond,
]

export const catalog: ReadonlyMap<string, CatalogEntry> = new Map(entries.map((e) => [e.key, e]))

export const RESPOND_KEY = webhookRespond.key
