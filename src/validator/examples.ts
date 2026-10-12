import type { N8nWorkflow } from '../compiler/index.ts'
import type { Issue } from './types.ts'

/** Celowo zepsute przepływy: każdy łamie jedną regułę walidatora. Używane w testach i w podglądzie. */
export type BrokenExample = {
  title: string
  /** Wzorzec, na którym wykonywana jest zmiana. */
  base: 'contact' | 'payment'
  rule: Issue['rule']
  /** Fragment oczekiwanego komunikatu. */
  expect: string
  mutate(workflow: N8nWorkflow): void
}

const node = (wf: N8nWorkflow, name: string) => wf.nodes.find((n) => n.name === name)!

export const brokenExamples: BrokenExample[] = [
  {
    title: 'Code node added to the workflow',
    base: 'payment',
    rule: 'node-type',
    expect: 'Code nodes are blocked for security reasons',
    mutate: (wf) => {
      wf.nodes.push({
        parameters: { jsCode: 'return $input.all()' },
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [832, 160],
        id: 'b0d6a4a8-0000-4000-8000-000000000001',
        name: 'Code',
      })
      wf.connections['Discord'].main[0].push({ node: 'Code', type: 'main', index: 0 })
    },
  },
  {
    title: 'HTTP Request node instead of Discord',
    base: 'payment',
    rule: 'node-type',
    expect: 'HTTP Request nodes are blocked for security reasons',
    mutate: (wf) => {
      const discord = node(wf, 'Discord')
      discord.type = 'n8n-nodes-base.httpRequest'
      discord.parameters = { url: 'https://example.com/collect', method: 'POST' }
    },
  },
  {
    title: 'Expression reading environment variables',
    base: 'payment',
    rule: 'expression',
    expect: 'Unsupported expression {{ $env.STRIPE_SECRET }}',
    mutate: (wf) => {
      node(wf, 'Discord').parameters.content = '=Leak: {{ $env.STRIPE_SECRET }}'
    },
  },
  {
    title: 'Reference to a field the source node does not output',
    base: 'payment',
    rule: 'expression',
    expect: 'node "Get a customer" has no output field "phone"',
    mutate: (wf) => {
      node(wf, 'Discord').parameters.content = '=Call {{ $json.phone }}'
    },
  },
  {
    title: 'Reference to a node that does not exist',
    base: 'contact',
    rule: 'expression',
    expect: 'node "Extract data" does not exist',
    mutate: (wf) => {
      node(wf, 'Send a message').parameters.text = "={{ $('Extract data').item.json.name }}"
    },
  },
  {
    title: 'Reference to a node that runs later',
    base: 'contact',
    rule: 'expression',
    expect: 'node "Send a message" does not run before this node',
    mutate: (wf) => {
      node(wf, 'Create a row').parameters.tableId = "={{ $('Send a message').item.json.ts }}"
    },
  },
  {
    title: 'Old OpenAI output path (message.content)',
    base: 'contact',
    rule: 'expression',
    expect: 'has no output field "message.content.name"',
    mutate: (wf) => {
      const fields = (node(wf, 'Create a row').parameters.fieldsUi as any).fieldValues
      fields[0].fieldValue = '={{ $json.message.content.name }}'
    },
  },
  {
    title: 'Two triggers',
    base: 'contact',
    rule: 'trigger',
    expect: 'exactly one is allowed',
    mutate: (wf) => {
      wf.nodes.push({
        parameters: { httpMethod: 'POST', path: 'extra', options: {} },
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2.1,
        position: [0, 208],
        id: 'b0d6a4a8-0000-4000-8000-000000000002',
        name: 'Webhook',
        webhookId: 'b0d6a4a8-0000-4000-8000-000000000003',
      })
      wf.connections['Webhook'] = { main: [[{ node: 'Message a model', type: 'main', index: 0 }]] }
    },
  },
  {
    title: 'Trigger in the middle of the workflow',
    base: 'contact',
    rule: 'trigger',
    expect: 'Trigger cannot have incoming connections',
    mutate: (wf) => {
      wf.connections['Reply to a message'] = { main: [[{ node: 'Gmail Trigger', type: 'main', index: 0 }]] }
    },
  },
  {
    title: 'Cycle between two nodes',
    base: 'contact',
    rule: 'cycle',
    expect: 'Workflow contains a cycle: Create a row → Append row in sheet → Create a row',
    mutate: (wf) => {
      wf.connections['Append row in sheet'].main[0].push({ node: 'Create a row', type: 'main', index: 0 })
    },
  },
  {
    title: 'Disconnected node',
    base: 'contact',
    rule: 'graph',
    expect: 'Node has no incoming connection',
    mutate: (wf) => {
      delete wf.connections['Send a message']
    },
  },
  {
    title: 'Missing required parameter',
    base: 'contact',
    rule: 'params',
    expect: 'Missing required parameter "columns.schema"',
    mutate: (wf) => {
      delete (node(wf, 'Append row in sheet').parameters.columns as any).schema
    },
  },
  {
    title: 'Gmail node switched from "reply" to "delete"',
    base: 'contact',
    rule: 'params',
    expect: 'Parameter "operation" must be "reply", got "delete"',
    mutate: (wf) => {
      node(wf, 'Reply to a message').parameters.operation = 'delete'
    },
  },
  {
    title: 'Wrong node version',
    base: 'payment',
    rule: 'node-type',
    expect: 'Expected typeVersion 2.3, got 1',
    mutate: (wf) => {
      node(wf, 'If').typeVersion = 1
    },
  },
  {
    title: 'Respond to Webhook without responseMode on the trigger',
    base: 'payment',
    rule: 'respond',
    expect: 'responseMode must be "responseNode"',
    mutate: (wf) => {
      delete node(wf, 'Webhook').parameters.responseMode
    },
  },
  {
    title: 'Connection to a node that does not exist',
    base: 'payment',
    rule: 'connections',
    expect: 'Connection to unknown node "Send email"',
    mutate: (wf) => {
      wf.connections['Discord'].main[0][0].node = 'Send email'
    },
  },
]
