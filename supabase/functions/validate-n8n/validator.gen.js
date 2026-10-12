// PLIK GENEROWANY — nie edytuj. Źródło: src/validator/index.ts (npm run build:functions)
import { z } from "npm:zod@4.6.5";
//#region src/schema/catalog.ts
/** Bezpieczny odczyt zagnieżdżonej wartości: `getPath(params, 'columns.value')`. */
function getPath(source, path) {
	let current = source;
	for (const key of path.split(".")) {
		if (current === null || typeof current !== "object" || !Object.hasOwn(current, key)) return void 0;
		current = current[key];
	}
	return current;
}
function defineEntry(entry) {
	return entry;
}
/** Wybór zasobu (resource locator). */
function resourceLocator(value, mode = "id") {
	return {
		__rl: true,
		value,
		mode
	};
}
/** Segment ścieżki dla nazwy pola: `name` albo `["Full Name"]`, gdy nazwa nie jest identyfikatorem. */
function pathKey(name) {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : `[${JSON.stringify(name)}]`;
}
/** Łączy segmenty ścieżki: `joinPath('body', '["Full Name"]')` → `body["Full Name"]`. */
function joinPath(...segments) {
	return segments.reduce((acc, s) => acc === "" ? s : s.startsWith("[") ? acc + s : `${acc}.${s}`, "");
}
/** Pola o ścieżce równej nazwie. */
function plainOutputs(fields) {
	return Object.fromEntries(fields.map((f) => [f, pathKey(f)]));
}
//#endregion
//#region src/schema/plan.ts
const stepId = z.string().regex(/^(trigger|s\d+)$/, "Expected \"trigger\" or \"s<number>\"");
/** Odwołanie do pola wyjściowego innego kroku. Na wyrażenie n8n zamienia je wyłącznie kompilator. */
const refSchema = z.strictObject({
	ref: stepId,
	field: z.string().min(1)
});
const literalSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null()
]);
/** Tekst mieszany: stałe fragmenty przeplatane odwołaniami. */
const templateSchema = z.strictObject({ template: z.array(z.union([z.string(), refSchema])).min(1) });
const paramValueSchema = z.union([
	literalSchema,
	refSchema,
	templateSchema
]);
const afterOneSchema = z.union([stepId, z.strictObject({
	step: stepId,
	branch: z.enum(["true", "false"])
})]);
z.strictObject({
	name: z.string().min(1).max(120),
	trigger: z.strictObject({
		action: z.string(),
		integration: z.string(),
		params: z.record(z.string(), z.unknown())
	}),
	steps: z.array(z.strictObject({
		id: z.string().regex(/^s\d+$/, "Expected \"s<number>\""),
		action: z.string(),
		integration: z.string(),
		params: z.record(z.string(), z.unknown()),
		after: z.union([afterOneSchema, z.array(afterOneSchema).min(1)])
	})),
	missing: z.array(z.strictObject({
		field: z.string(),
		question: z.string()
	}))
});
//#endregion
//#region src/catalog/core.ts
const editFields = defineEntry({
	key: "core.editFields",
	integration: "core",
	kind: "action",
	label: "Edit Fields",
	type: "n8n-nodes-base.set",
	typeVersion: 3.5,
	paramsSchema: z.strictObject({ fields: z.array(z.strictObject({
		name: z.string().min(1),
		value: paramValueSchema,
		type: z.enum([
			"string",
			"number",
			"boolean"
		]).default("string")
	})).min(1) }),
	outputs: (p) => plainOutputs(p.fields.map((f) => f.name)),
	build: (p, ctx) => ({
		assignments: { assignments: p.fields.map((f) => ({
			id: ctx.uuid(),
			name: f.name,
			value: ctx.value(f.value),
			type: f.type
		})) },
		options: {}
	}),
	n8n: {
		required: ["assignments.assignments"],
		optional: ["options"]
	},
	nodeOutputs: (parameters) => {
		const rows = getPath(parameters, "assignments.assignments");
		return { exact: (Array.isArray(rows) ? rows.map((r) => String(getPath(r, "name") ?? "")) : []).filter(Boolean).map(pathKey) };
	}
});
const ifCondition = defineEntry({
	key: "core.if",
	integration: "core",
	kind: "action",
	label: "If",
	type: "n8n-nodes-base.if",
	typeVersion: 2.3,
	branches: ["true", "false"],
	paramsSchema: z.discriminatedUnion("dataType", [z.strictObject({
		dataType: z.literal("number"),
		left: paramValueSchema,
		operation: z.enum([
			"equals",
			"notEquals",
			"gt",
			"gte",
			"lt",
			"lte"
		]),
		right: paramValueSchema
	}), z.strictObject({
		dataType: z.literal("string"),
		left: paramValueSchema,
		operation: z.enum([
			"equals",
			"notEquals",
			"contains",
			"notContains",
			"startsWith",
			"endsWith"
		]),
		right: paramValueSchema
	})]),
	outputs: () => ({}),
	build: (p, ctx) => ({
		conditions: {
			options: {
				caseSensitive: true,
				leftValue: "",
				typeValidation: "strict",
				version: 3
			},
			conditions: [{
				id: ctx.uuid(),
				leftValue: ctx.value(p.left),
				rightValue: ctx.value(p.right),
				operator: {
					type: p.dataType,
					operation: p.operation
				}
			}],
			combinator: "and"
		},
		options: {}
	}),
	passthrough: true,
	n8n: {
		required: ["conditions.conditions", "conditions.combinator"],
		optional: ["options"]
	},
	nodeOutputs: () => ({ exact: [] })
});
//#endregion
//#region src/catalog/discord.ts
const discordWebhookMessage = defineEntry({
	key: "discord.webhookMessage",
	integration: "discord",
	kind: "action",
	label: "Discord",
	type: "n8n-nodes-base.discord",
	typeVersion: 2,
	credential: "discordWebhookApi",
	needsWebhookId: true,
	paramsSchema: z.strictObject({ content: paramValueSchema }),
	outputs: () => ({}),
	build: (p, ctx) => ({
		authentication: "webhook",
		content: ctx.value(p.content),
		options: {}
	}),
	n8n: {
		required: ["content"],
		fixed: { authentication: "webhook" },
		optional: ["options"]
	},
	nodeOutputs: () => ({ exact: [] })
});
//#endregion
//#region src/catalog/gmail.ts
const gmailNewMessage = defineEntry({
	key: "gmail.newMessage",
	integration: "gmail",
	kind: "trigger",
	label: "Gmail Trigger",
	type: "n8n-nodes-base.gmailTrigger",
	typeVersion: 1.4,
	credential: "gmailOAuth2",
	paramsSchema: z.strictObject({
		/** Fraza w temacie wiadomości. */
		subject: z.string().min(1).optional(),
		/** Surowe zapytanie Gmail; ma pierwszeństwo przed `subject`. */
		query: z.string().min(1).optional(),
		readStatus: z.enum([
			"unread",
			"read",
			"both"
		]).default("unread")
	}),
	outputs: () => plainOutputs([
		"id",
		"threadId",
		"snippet",
		"From",
		"To",
		"Subject"
	]),
	build: (p) => {
		const q = p.query ?? (p.subject ? `subject:"${p.subject.replaceAll("\"", "")}"` : void 0);
		return {
			pollTimes: { item: [{ mode: "everyMinute" }] },
			filters: {
				...q ? { q } : {},
				readStatus: p.readStatus
			}
		};
	},
	n8n: {
		required: ["pollTimes.item"],
		optional: ["filters"]
	},
	nodeOutputs: () => ({ exact: [
		"id",
		"threadId",
		"snippet",
		"From",
		"To",
		"Subject"
	] })
});
const gmailReply = defineEntry({
	key: "gmail.reply",
	integration: "gmail",
	kind: "action",
	label: "Reply to a message",
	type: "n8n-nodes-base.gmail",
	typeVersion: 2.2,
	credential: "gmailOAuth2",
	needsWebhookId: true,
	paramsSchema: z.strictObject({
		messageId: paramValueSchema,
		message: paramValueSchema
	}),
	outputs: () => plainOutputs(["id", "threadId"]),
	build: (p, ctx) => ({
		operation: "reply",
		messageId: ctx.value(p.messageId),
		emailType: "text",
		message: ctx.value(p.message),
		options: { appendAttribution: false }
	}),
	n8n: {
		required: ["messageId", "message"],
		fixed: {
			operation: "reply",
			emailType: "text"
		},
		optional: ["options"]
	},
	nodeOutputs: () => ({ exact: ["id", "threadId"] })
});
//#endregion
//#region src/catalog/googleSheets.ts
const googleSheetsAppendRow = defineEntry({
	key: "googleSheets.appendRow",
	integration: "googleSheets",
	kind: "action",
	label: "Append row in sheet",
	type: "n8n-nodes-base.googleSheets",
	typeVersion: 4.7,
	credential: "googleSheetsOAuth2Api",
	paramsSchema: z.strictObject({
		/** Identyfikator arkusza z adresu URL. */
		documentId: z.string().regex(/^[A-Za-z0-9_-]{2,}$/),
		/** Identyfikator karty w postaci `gid=<liczba>`. */
		sheet: z.string().regex(/^gid=\d+$/).default("gid=0"),
		/** Kolumna → wartość. */
		columns: z.record(z.string().min(1), paramValueSchema)
	}),
	outputs: (p) => plainOutputs(Object.keys(p.columns)),
	build: (p, ctx) => ({
		operation: "append",
		documentId: resourceLocator(p.documentId),
		sheetName: resourceLocator(p.sheet),
		columns: {
			mappingMode: "defineBelow",
			value: Object.fromEntries(Object.entries(p.columns).map(([k, v]) => [k, ctx.value(v)])),
			matchingColumns: [],
			schema: Object.keys(p.columns).map((id) => ({
				id,
				displayName: id,
				required: false,
				defaultMatch: false,
				display: true,
				type: "string",
				canBeUsedToMatch: true
			})),
			attemptToConvertTypes: false,
			convertFieldsToString: false
		},
		options: {}
	}),
	n8n: {
		required: [
			"documentId.value",
			"sheetName.value",
			"columns.value",
			"columns.schema"
		],
		fixed: {
			operation: "append",
			"columns.mappingMode": "defineBelow"
		},
		optional: ["options"]
	},
	nodeOutputs: (parameters) => {
		const value = getPath(parameters, "columns.value");
		return { exact: value && typeof value === "object" ? Object.keys(value).map(pathKey) : [] };
	}
});
//#endregion
//#region src/catalog/openai.ts
const fieldName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const openaiMessage = defineEntry({
	key: "openai.message",
	integration: "openai",
	kind: "action",
	label: "Message a model",
	type: "@n8n/n8n-nodes-langchain.openAi",
	typeVersion: 2.3,
	credential: "openAiApi",
	paramsSchema: z.strictObject({
		model: z.string().min(1).default("gpt-4o-mini"),
		system: z.string().min(1),
		user: paramValueSchema,
		/** Nazwa i opis schematu odpowiedzi (json_schema). */
		schemaName: fieldName,
		schemaDescription: z.string().min(1),
		fields: z.array(z.strictObject({
			name: fieldName,
			type: z.enum([
				"string",
				"number",
				"boolean"
			]).default("string"),
			nullable: z.boolean().default(true)
		})).min(1)
	}),
	outputs: (p) => Object.fromEntries(p.fields.map((f) => [f.name, `output[0].content[0].text.${f.name}`])),
	build: (p, ctx) => {
		const schema = {
			type: "object",
			properties: Object.fromEntries(p.fields.map((f) => [f.name, { type: f.nullable ? [f.type, "null"] : f.type }])),
			additionalProperties: false,
			required: p.fields.map((f) => f.name)
		};
		return {
			modelId: resourceLocator(p.model, "list"),
			responses: { values: [{
				role: "system",
				content: p.system
			}, { content: ctx.value(p.user) }] },
			builtInTools: {},
			options: { textFormat: { textOptions: {
				type: "json_schema",
				name: p.schemaName,
				schema: JSON.stringify(schema, null, 2),
				description: p.schemaDescription,
				strict: true
			} } }
		};
	},
	n8n: {
		required: [
			"modelId.value",
			"responses.values",
			"options.textFormat.textOptions.schema"
		],
		fixed: {
			"options.textFormat.textOptions.type": "json_schema",
			builtInTools: {}
		}
	},
	nodeOutputs: (parameters) => {
		try {
			const schema = JSON.parse(String(getPath(parameters, "options.textFormat.textOptions.schema")));
			return { exact: Object.keys(schema.properties ?? {}).map((k) => joinPath("output[0].content[0].text", pathKey(k))) };
		} catch {
			return { exact: [] };
		}
	}
});
//#endregion
//#region src/catalog/slack.ts
const slackSendMessage = defineEntry({
	key: "slack.sendMessage",
	integration: "slack",
	kind: "action",
	label: "Send a message",
	type: "n8n-nodes-base.slack",
	typeVersion: 2.5,
	credential: "slackApi",
	needsWebhookId: true,
	paramsSchema: z.strictObject({
		/** Identyfikator kanału, np. C0123456789. */
		channelId: z.string().regex(/^[A-Z0-9]{2,}$/),
		text: paramValueSchema
	}),
	outputs: () => plainOutputs(["ts", "channel"]),
	build: (p, ctx) => ({
		select: "channel",
		channelId: resourceLocator(p.channelId),
		text: ctx.value(p.text),
		otherOptions: { includeLinkToWorkflow: false }
	}),
	n8n: {
		required: ["channelId.value", "text"],
		fixed: { select: "channel" },
		optional: ["otherOptions"]
	},
	nodeOutputs: () => ({ exact: ["ts", "channel"] })
});
//#endregion
//#region src/catalog/stripe.ts
const stripeGetCustomer = defineEntry({
	key: "stripe.getCustomer",
	integration: "stripe",
	kind: "action",
	label: "Get a customer",
	type: "n8n-nodes-base.stripe",
	typeVersion: 1,
	credential: "stripeApi",
	paramsSchema: z.strictObject({ customerId: paramValueSchema }),
	outputs: () => plainOutputs([
		"id",
		"email",
		"name"
	]),
	build: (p, ctx) => ({
		resource: "customer",
		customerId: ctx.value(p.customerId)
	}),
	n8n: {
		required: ["customerId"],
		fixed: { resource: "customer" }
	},
	nodeOutputs: () => ({ exact: [
		"id",
		"email",
		"name"
	] })
});
//#endregion
//#region src/catalog/supabase.ts
const supabaseCreateRow = defineEntry({
	key: "supabase.createRow",
	integration: "supabase",
	kind: "action",
	label: "Create a row",
	type: "n8n-nodes-base.supabase",
	typeVersion: 1,
	credential: "supabaseApi",
	paramsSchema: z.strictObject({
		table: z.string().min(1),
		/** Kolumna → wartość. */
		fields: z.record(z.string().min(1), paramValueSchema)
	}),
	outputs: (p) => plainOutputs(["id", ...Object.keys(p.fields)]),
	build: (p, ctx) => ({
		tableId: p.table,
		fieldsUi: { fieldValues: Object.entries(p.fields).map(([fieldId, v]) => ({
			fieldId,
			fieldValue: ctx.value(v)
		})) }
	}),
	n8n: { required: ["tableId", "fieldsUi.fieldValues"] },
	nodeOutputs: (parameters) => {
		const rows = getPath(parameters, "fieldsUi.fieldValues");
		return { exact: ["id", ...(Array.isArray(rows) ? rows.map((r) => String(getPath(r, "fieldId") ?? "")) : []).filter(Boolean).map(pathKey)] };
	}
});
//#endregion
//#region src/catalog/webhook.ts
const jsonPrimitive = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null()
]);
const webhookReceive = defineEntry({
	key: "webhook.receive",
	integration: "webhook",
	kind: "trigger",
	label: "Webhook",
	type: "n8n-nodes-base.webhook",
	typeVersion: 2.1,
	needsWebhookId: true,
	paramsSchema: z.strictObject({
		method: z.enum([
			"GET",
			"POST",
			"PUT",
			"PATCH",
			"DELETE"
		]).default("POST"),
		path: z.string().regex(/^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/),
		/** Pola oczekiwane w treści żądania. */
		bodyFields: z.array(z.string().min(1)).default([])
	}),
	outputs: (p) => Object.fromEntries(p.bodyFields.map((f) => [f, joinPath("body", pathKey(f))])),
	build: (p, ctx) => ({
		httpMethod: p.method,
		path: p.path,
		...ctx.hasRespondNode ? { responseMode: "responseNode" } : {},
		options: {}
	}),
	n8n: {
		required: ["httpMethod", "path"],
		optional: ["responseMode", "options"]
	},
	nodeOutputs: () => ({
		exact: [],
		prefixes: ["body"]
	})
});
const webhookRespond = defineEntry({
	key: "webhook.respond",
	integration: "webhook",
	kind: "action",
	label: "Respond to Webhook",
	type: "n8n-nodes-base.respondToWebhook",
	typeVersion: 1.5,
	paramsSchema: z.strictObject({ 
	/** Stała odpowiedź JSON. */
body: z.record(z.string().min(1), jsonPrimitive) }),
	outputs: () => ({}),
	build: (p) => ({
		respondWith: "json",
		responseBody: JSON.stringify(p.body),
		options: {}
	}),
	n8n: {
		required: ["responseBody"],
		fixed: { respondWith: "json" },
		optional: ["options"]
	},
	nodeOutputs: () => ({ exact: [] })
});
//#endregion
//#region src/catalog/index.ts
const entries = [
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
	webhookRespond
];
new Map(entries.map((e) => [e.key, e]));
/** Wpisy według typu węzła n8n (każdy typ występuje w katalogu raz). */
const catalogByType = new Map(entries.map((e) => [e.type, e]));
webhookRespond.key;
const RESPOND_TYPE = webhookRespond.type;
const WEBHOOK_TYPE = webhookReceive.type;
//#endregion
//#region src/validator/expressions.ts
const PATH = String.raw`((?:\.[A-Za-z_$][\w$]*|\[\d+\]|\["(?:[^"\\]|\\.)*"\])+)`;
/** Jedyne dozwolone postacie wyrażeń — dokładnie te, które emituje kompilator. */
const JSON_REF = new RegExp(String.raw`^\$json${PATH}$`);
const NODE_REF = new RegExp(String.raw`^\$\('((?:[^'\\]|\\.)*)'\)\.item\.json${PATH}$`);
function collectStrings(value, out = []) {
	if (typeof value === "string") out.push(value);
	else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
	else if (value && typeof value === "object") for (const v of Object.values(value)) collectStrings(v, out);
	return out;
}
function ancestorsOf(name, { incoming }) {
	const seen = /* @__PURE__ */ new Set();
	const queue = [...incoming.get(name) ?? []];
	while (queue.length > 0) {
		const current = queue.shift();
		if (seen.has(current)) continue;
		seen.add(current);
		queue.push(...incoming.get(current) ?? []);
	}
	return seen;
}
/** Problemy z wyrażeniami w parametrach węzła `name`. */
function checkExpressions(name, parameters, entries, graph) {
	const problems = /* @__PURE__ */ new Set();
	const ancestors = ancestorsOf(name, graph);
	const checkPath = (source, rawPath, shown) => {
		const entry = entries.get(source);
		if (!entry) return;
		const { exact, prefixes = [] } = entry.nodeOutputs(parameters.get(source) ?? {});
		const path = rawPath.replace(/^\./, "");
		const underPrefix = prefixes.some((p) => path === p || path.startsWith(`${p}.`) || path.startsWith(`${p}[`));
		if (!exact.includes(path) && !underPrefix) {
			const known = [...exact, ...prefixes.map((p) => `${p}.*`)].join(", ") || "none";
			problems.add(`${shown}: node "${source}" has no output field "${path}" (available: ${known})`);
		}
	};
	/** Węzeł, którego dane widzi `$json`: jedyny poprzednik, z pominięciem węzłów przepuszczających (If). */
	const jsonSource = () => {
		const visited = /* @__PURE__ */ new Set([name]);
		let current = name;
		for (;;) {
			const from = graph.incoming.get(current) ?? [];
			if (from.length !== 1 || visited.has(from[0])) return null;
			current = from[0];
			visited.add(current);
			if (!entries.get(current)?.passthrough) return current;
		}
	};
	for (const text of collectStrings(parameters.get(name))) {
		if (!text.startsWith("=")) continue;
		const leftover = text.slice(1).replace(/\{\{(.*?)\}\}/gs, (_, inner) => {
			const expr = inner.trim();
			const shown = `{{ ${expr} }}`;
			const viaJson = JSON_REF.exec(expr);
			const viaNode = NODE_REF.exec(expr);
			if (viaJson) {
				const source = jsonSource();
				if (!source) problems.add(`${shown}: $json is ambiguous here — the node must have exactly one input`);
				else checkPath(source, viaJson[1], shown);
			} else if (viaNode) {
				const source = viaNode[1].replaceAll("\\'", "'");
				if (!parameters.has(source)) problems.add(`${shown}: node "${source}" does not exist`);
				else if (!ancestors.has(source)) problems.add(`${shown}: node "${source}" does not run before this node`);
				else if (entries.get(source)?.passthrough) problems.add(`${shown}: node "${source}" only passes data through — reference the node before it`);
				else checkPath(source, viaNode[2], shown);
			} else problems.add(`Unsupported expression ${shown} — only references to earlier nodes are allowed`);
			return "";
		});
		if (leftover.includes("{{") || leftover.includes("}}")) problems.add(`Malformed expression: unbalanced "{{" or "}}" in "${text}"`);
	}
	return [...problems];
}
//#endregion
//#region src/validator/index.ts
const workflowSchema = z.looseObject({
	name: z.string().min(1),
	nodes: z.array(z.looseObject({
		parameters: z.record(z.string(), z.unknown()),
		type: z.string(),
		typeVersion: z.number(),
		position: z.tuple([z.number(), z.number()]),
		id: z.string().min(1),
		name: z.string().min(1),
		webhookId: z.string().optional()
	})).min(1),
	connections: z.record(z.string(), z.looseObject({ main: z.array(z.array(z.looseObject({
		node: z.string(),
		type: z.literal("main"),
		index: z.number()
	}))) }))
});
/** Typy blokowane ze względów bezpieczeństwa — osobny, jednoznaczny komunikat. */
const BLOCKED = {
	"n8n-nodes-base.code": "Code",
	"n8n-nodes-base.function": "Function",
	"n8n-nodes-base.functionItem": "Function Item",
	"n8n-nodes-base.executeCommand": "Execute Command",
	"n8n-nodes-base.ssh": "SSH",
	"n8n-nodes-base.httpRequest": "HTTP Request"
};
const isEmpty = (v) => v === void 0 || v === null || v === "" || Array.isArray(v) && v.length === 0;
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/**
* Sprawdza JSON przepływu n8n niezależnie od tego, skąd pochodzi (kompilator, edycja w interfejsie).
* Zwraca wszystkie znalezione problemy, nie tylko pierwszy.
*/
function validate(input) {
	const issues = [];
	const add = (rule, message, node) => void issues.push({
		rule,
		message,
		...node ? { node } : {}
	});
	const parsed = workflowSchema.safeParse(input);
	if (!parsed.success) {
		for (const i of parsed.error.issues) add("shape", `${i.path.join(".") || "workflow"}: ${i.message}`);
		return {
			ok: false,
			issues
		};
	}
	const workflow = parsed.data;
	const entries = /* @__PURE__ */ new Map();
	const names = /* @__PURE__ */ new Set();
	const ids = /* @__PURE__ */ new Set();
	for (const node of workflow.nodes) {
		if (names.has(node.name)) add("unique", `Duplicate node name "${node.name}"`, node.name);
		if (ids.has(node.id)) add("unique", `Duplicate node id "${node.id}"`, node.name);
		names.add(node.name);
		ids.add(node.id);
		const entry = catalogByType.get(node.type);
		if (!entry) {
			add("node-type", BLOCKED[node.type] ? `${BLOCKED[node.type]} nodes are blocked for security reasons` : `Node type "${node.type}" is not in the catalog`, node.name);
			continue;
		}
		entries.set(node.name, entry);
		if (node.typeVersion !== entry.typeVersion) add("node-type", `Expected typeVersion ${entry.typeVersion}, got ${node.typeVersion}`, node.name);
		if (entry.needsWebhookId && !node.webhookId) add("params", "Missing webhookId", node.name);
		const { required, fixed = {}, optional = [] } = entry.n8n;
		for (const path of required) if (isEmpty(getPath(node.parameters, path))) add("params", `Missing required parameter "${path}"`, node.name);
		for (const [path, expected] of Object.entries(fixed)) {
			const actual = getPath(node.parameters, path);
			if (!sameJson(actual, expected)) add("params", `Parameter "${path}" must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual) ?? "nothing"}`, node.name);
		}
		const allowed = new Set([
			...required,
			...Object.keys(fixed),
			...optional
		].map((p) => p.split(".")[0]));
		for (const key of Object.keys(node.parameters)) if (!allowed.has(key)) add("params", `Unexpected parameter "${key}"`, node.name);
	}
	const graph = {
		incoming: /* @__PURE__ */ new Map(),
		outgoing: /* @__PURE__ */ new Map()
	};
	for (const name of names) {
		graph.incoming.set(name, []);
		graph.outgoing.set(name, []);
	}
	for (const [source, { main }] of Object.entries(workflow.connections)) {
		if (!names.has(source)) {
			add("connections", `Connection from unknown node "${source}"`);
			continue;
		}
		const outputs = entries.get(source)?.branches ? 2 : 1;
		if (main.length > outputs) add("connections", `Node has ${outputs} output(s) but connections use ${main.length}`, source);
		for (const targets of main) for (const target of targets) if (!names.has(target.node)) add("connections", `Connection to unknown node "${target.node}"`, source);
		else if (target.index !== 0) add("connections", `Connection to "${target.node}" uses input ${target.index}; only input 0 exists`, source);
		else if (!graph.outgoing.get(source).includes(target.node)) {
			graph.outgoing.get(source).push(target.node);
			graph.incoming.get(target.node).push(source);
		}
	}
	const triggers = [...entries].filter(([, e]) => e.kind === "trigger").map(([name]) => name);
	if (triggers.length === 0) add("trigger", "Workflow has no trigger");
	if (triggers.length > 1) add("trigger", `Workflow has ${triggers.length} triggers (${triggers.join(", ")}); exactly one is allowed`);
	for (const name of triggers) {
		const from = graph.incoming.get(name);
		if (from.length > 0) add("trigger", `Trigger cannot have incoming connections (from ${from.join(", ")})`, name);
	}
	const reachable = new Set(triggers);
	const queue = [...triggers];
	while (queue.length > 0) for (const next of graph.outgoing.get(queue.shift())) if (!reachable.has(next)) {
		reachable.add(next);
		queue.push(next);
	}
	for (const name of names) {
		if (triggers.includes(name)) continue;
		if (graph.incoming.get(name).length === 0) add("graph", "Node has no incoming connection", name);
		else if (!reachable.has(name)) add("graph", "Node is not reachable from the trigger", name);
	}
	const cycle = findCycle(graph);
	if (cycle) add("cycle", `Workflow contains a cycle: ${cycle.join(" → ")}`);
	const parameters = new Map(workflow.nodes.map((n) => [n.name, n.parameters]));
	for (const node of workflow.nodes) {
		if (!entries.has(node.name)) continue;
		for (const message of checkExpressions(node.name, parameters, entries, graph)) add("expression", message, node.name);
	}
	const respondNodes = workflow.nodes.filter((n) => n.type === RESPOND_TYPE);
	const webhook = workflow.nodes.find((n) => n.type === WEBHOOK_TYPE);
	const usesResponseNode = webhook?.parameters.responseMode === "responseNode";
	if (respondNodes.length > 0 && !webhook) add("respond", "Respond to Webhook requires a Webhook trigger", respondNodes[0].name);
	else if (webhook && respondNodes.length > 0 && !usesResponseNode) add("respond", "Workflow has a Respond to Webhook node, so responseMode must be \"responseNode\"", webhook.name);
	else if (webhook && respondNodes.length === 0 && usesResponseNode) add("respond", "responseMode is \"responseNode\" but the workflow has no Respond to Webhook node", webhook.name);
	return {
		ok: issues.length === 0,
		issues
	};
}
function findCycle({ outgoing }) {
	const state = /* @__PURE__ */ new Map();
	const stack = [];
	const visit = (name) => {
		state.set(name, "visiting");
		stack.push(name);
		for (const next of outgoing.get(name)) {
			if (state.get(next) === "visiting") return [...stack.slice(stack.indexOf(next)), next];
			if (!state.has(next)) {
				const found = visit(next);
				if (found) return found;
			}
		}
		stack.pop();
		state.set(name, "done");
		return null;
	};
	for (const name of outgoing.keys()) if (!state.has(name)) {
		const found = visit(name);
		if (found) return found;
	}
	return null;
}
//#endregion
export { validate };
