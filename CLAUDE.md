# FlowGen AI — generator przepływów n8n

Aplikacja, która z opisu procesu biznesowego w zwykłym języku tworzy **gotowy do importu** plik JSON przepływu n8n. Po imporcie użytkownik ma jedynie podpiąć poświadczenia — nic więcej nie powinien poprawiać.

Projekt powstaje jako wyzwanie TRW (AI Workflow Generator) i element portfolio studia SetFrame.

---

## 1. Zasada nadrzędna

**Model AI nigdy nie pisze JSON-a n8n.**

| Warstwa | Odpowiedzialność |
|---|---|
| AI | rozumie proces, dzieli go na kroki, wybiera akcje z listy dozwolonych, wypełnia wartości parametrów, zgłasza braki |
| Kod deterministyczny | katalog węzłów, identyfikatory, nazwy, pozycje, połączenia, wyrażenia, walidacja, eksport |

AI zwraca wyłącznie **reprezentację pośrednią (RP)** zgodną ze schematem Zod. Wszystko, co nie przejdzie schematu, jest odrzucane.

---

## 2. Stos technologiczny

- **Frontend:** React + Vite + TypeScript, Tailwind CSS, Framer Motion
- **Diagram:** `@xyflow/react` (React Flow) + `dagre` do automatycznego układu
- **Podgląd JSON:** CodeMirror 6
- **Walidacja schematów:** Zod
- **Backend:** Supabase (Postgres, Auth, Edge Functions w Deno)
- **AI:** wywoływane wyłącznie z Edge Functions, z wymuszonym ustrukturyzowanym wyjściem
- **Wdrożenie:** GitHub → Vercel

Projekt Supabase: `https://umjvbrlrvgldvdispfxq.supabase.co`

### Zmienne środowiskowe

```
# .env (frontend — tylko klucze publiczne)
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=

# Sekrety Supabase Edge Functions (nigdy we frontendzie)
AI_API_KEY=
N8N_API_URL=
N8N_API_KEY=
```

Klucze wpisuje właściciel projektu. Nigdy nie commituj `.env`.

---

## 3. Środowisko docelowe

**n8n 2.32.6.** Wszystkie `typeVersion` i struktury parametrów w katalogu muszą odpowiadać tej wersji. Źródłem prawdy są pliki w `reference/`:

- `reference/wzorzec-kontakt.json` — Gmail Trigger → OpenAI → Supabase → Google Sheets → Slack → Gmail
- `reference/wzorzec-platnosc.json` — Webhook → Edit Fields → If (true/false) → Stripe → Discord → Respond to Webhook

Oba zostały zaimportowane i **uruchomione z sukcesem** na docelowej instancji.

---

## 4. Potok przetwarzania

```
1. Strażnik wejścia      — długość, czyszczenie, wykrywanie wstrzyknięć
2. Analiza intencji (AI) — opis → RP
3. Braki                 — RP.missing + reguły katalogu → pytania uzupełniające → powrót do 2
4. Mapowanie             — krok RP → wpis katalogu (bez AI)
5. Parametry (AI)        — wartości pól w wymuszonym schemacie wpisu katalogu
6. Kompilator            — RP → JSON n8n
7. Walidator             — reguły + opcjonalny testowy import przez API n8n
8. Dokumentacja + szacunek wykonania
```

### Reprezentacja pośrednia (szkic)

```ts
type Plan = {
  name: string
  trigger: { action: TriggerAction; integration: Integration; params: Record<string, unknown> }
  steps: Array<{
    id: string                         // s1, s2...
    action: ActionKey                  // tylko z katalogu
    integration: Integration
    params: Record<string, ParamValue> // ParamValue może być odwołaniem { ref: "s1", field: "email" }
    after: string | { step: string; branch: "true" | "false" } // poprzednik
  }>
  missing: Array<{ field: string; question: string }>
}
```

Odwołania między krokami (`{ ref, field }`) zamienia na wyrażenia **wyłącznie kompilator**.

---

## 5. Katalog węzłów — wnioski z wzorców (n8n 2.32.6)

| Akcja | `type` | `typeVersion` | Poświadczenie |
|---|---|---|---|
| Gmail — nowa wiadomość (wyzwalacz) | `n8n-nodes-base.gmailTrigger` | 1.4 | `gmailOAuth2` |
| Gmail — odpowiedź | `n8n-nodes-base.gmail` | 2.2 | `gmailOAuth2` |
| OpenAI — wiadomość do modelu | `@n8n/n8n-nodes-langchain.openAi` | 2.3 | `openAiApi` |
| Supabase — utwórz wiersz | `n8n-nodes-base.supabase` | 1 | `supabaseApi` |
| Google Sheets — dopisz wiersz | `n8n-nodes-base.googleSheets` | 4.7 | `googleSheetsOAuth2Api` |
| Slack — wyślij wiadomość | `n8n-nodes-base.slack` | 2.5 | `slackApi` |
| Webhook (wyzwalacz) | `n8n-nodes-base.webhook` | 2.1 | — |
| Edit Fields (Set) | `n8n-nodes-base.set` | 3.5 | — |
| If | `n8n-nodes-base.if` | 2.3 | — |
| Stripe — pobierz klienta | `n8n-nodes-base.stripe` | 1 | `stripeApi` |
| Discord — wiadomość przez webhook | `n8n-nodes-base.discord` | 2 | `discordWebhookApi` |
| Respond to Webhook | `n8n-nodes-base.respondToWebhook` | 1.5 | — |

### Kluczowe struktury parametrów

**Wybór zasobu (resource locator)** — Sheets, Slack, OpenAI:
```json
{ "__rl": true, "value": "<id>", "mode": "id" }
```
Kompilator używa `mode: "id"` (albo `"list"` dla modeli OpenAI). Pola `cachedResult*` są opcjonalne — pomijamy je.

**Wyjście OpenAI 2.3 z `json_schema`** — kluczowe odkrycie:
```
{{ $json.output[0].content[0].text.<pole> }}                       // bezpośredni następnik
{{ $('Message a model').item.json.output[0].content[0].text.<pole> }} // dalszy węzeł
```
`text` jest już sparsowanym obiektem, nie ciągiem znaków. **Nie** `message.content` (to struktura starszych wersji).

Struktura parametrów OpenAI:
```json
"modelId":   { "__rl": true, "value": "gpt-4o-mini", "mode": "list" },
"responses": { "values": [ { "role": "system", "content": "..." }, { "content": "={{ ... }}" } ] },
"builtInTools": {},
"options": { "textFormat": { "textOptions": {
  "type": "json_schema", "name": "...", "schema": "<JSON jako STRING>", "description": "...", "strict": true
} } }
```

**Gmail Trigger:**
```json
"pollTimes": { "item": [ { "mode": "everyMinute" } ] },
"filters":   { "q": "subject:\"...\"", "readStatus": "unread" }
```
Pola wyjściowe (przy uproszczonym wyniku): `id`, `threadId`, `snippet`, `From`, `To`, `Subject`.

**Supabase — create:** `"tableId": "contacts"`, `"fieldsUi": { "fieldValues": [ { "fieldId", "fieldValue" } ] }`

**Google Sheets — append:** `"operation": "append"`, `documentId` i `sheetName` jako resource locator (`sheetName.value` np. `"gid=0"`), `columns.mappingMode: "defineBelow"`, `columns.value` (mapa kolumna → wyrażenie) **oraz wymagana tablica `columns.schema`** z wpisem na każdą kolumnę:
```json
{ "id": "name", "displayName": "name", "required": false, "defaultMatch": false,
  "display": true, "type": "string", "canBeUsedToMatch": true }
```

**Slack — send:** `"select": "channel"`, `"channelId"` jako resource locator, `"text"`, `"otherOptions": { "includeLinkToWorkflow": false }` (domyślnie n8n ustawia `true` — zawsze wyłączamy).

**Gmail — reply:** `"operation": "reply"`, `"messageId": "={{ $('Gmail Trigger').item.json.id }}"`, `"emailType": "text"`, `"message"`, `"options": { "appendAttribution": false }`.

**Webhook:** `"httpMethod"`, `"path"`, `"responseMode": "responseNode"` gdy w przepływie jest Respond to Webhook.

**Set 3.5:**
```json
"assignments": { "assignments": [ { "id": "<uuid>", "name": "...", "value": "={{ ... }}", "type": "string|number|boolean" } ] }
```

**If 2.3:**
```json
"conditions": {
  "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict", "version": 3 },
  "conditions": [ { "id": "<uuid>", "leftValue": "={{ ... }}", "rightValue": 100,
                    "operator": { "type": "number", "operation": "gt" } } ],
  "combinator": "and"
}
```
Wyjście `main[0]` = **true**, `main[1]` = **false**.

**Stripe — get customer:** `"resource": "customer"`, `"customerId"`. Pola wyjściowe m.in. `id`, `email`, `name`.

**Discord — webhook:** `"authentication": "webhook"`, `"content"`.

**Respond to Webhook:** `"respondWith": "json"`, `"responseBody": "<JSON jako string>"`. Może mieć wiele wejść (np. z obu gałęzi If).

### Obserwacje ogólne

- n8n **pomija w eksporcie parametry o wartościach domyślnych** (np. `resource: "row"` w Supabase, `operation` w Stripe). Kompilator może je wpisywać jawnie — import to akceptuje — ale porównując z wzorcem, pamiętaj o tej różnicy.
- Wyrażenia zaczynają się od `=`: `"={{ ... }}"`. Tekst mieszany: `"=Nowy kontakt: {{ ... }}"`.
- `webhookId` (UUID) nadają węzły: Webhook, Slack, Gmail (akcje), Discord. Kompilator generuje go dla tych typów.
- Węzły z poświadczeniami: kompilator **pomija** blok `credentials` — n8n poprosi o nie po imporcie.
- Pozycje: siatka co ok. 200 px w poziomie; gałąź true wyżej (−96), false niżej.
- `settings`: `{ "executionOrder": "v1" }`.
- Nie eksportujemy pól `id` przepływu, `versionId`, `meta`, `active` — n8n nada je przy imporcie.

### Błędy znalezione we wzorcach (nie kopiować)

- `wzorzec-kontakt.json`: druga wiadomość do OpenAI zawiera przypadkowy tekst instrukcji (`"przełącz pole na Expression i wpisz ..."`). Poprawna treść: `"={{ $json.snippet }}"`.
- `wzorzec-kontakt.json`: Slack ma `includeLinkToWorkflow: true` — w katalogu zawsze `false`.

---

## 6. Zasady kompilatora

1. Każdy węzeł: `id` (UUID v4), `name` (unikalna, czytelna), `type`, `typeVersion`, `position`, `parameters`.
2. `connections` kluczowane **nazwą** węzła źródłowego; indeks wyjścia odpowiada gałęzi.
3. Odwołanie do bezpośredniego poprzednika → `$json.<ścieżka>`, do dalszego węzła → `$('<Nazwa>').item.json.<ścieżka>`.
4. Ścieżki pól wyjściowych pochodzą z katalogu (pole `outputs` wpisu), nigdy od AI.
5. Automatyczny układ przez dagre (kierunek LR).

---

## 7. Reguły walidatora

- Dokładnie jeden wyzwalacz, bez połączeń wejściowych.
- Węzeł-wyzwalacz nigdy nie występuje w środku przepływu.
- Każdy węzeł poza wyzwalaczem ma co najmniej jedno wejście; graf spójny.
- Brak cykli.
- Każde `$('Nazwa')` wskazuje istniejący węzeł, który jest przodkiem bieżącego.
- Każda ścieżka pola istnieje w `outputs` węzła źródłowego.
- Komplet wymaganych parametrów dla każdego wpisu katalogu.
- `responseMode: "responseNode"` ⇔ w przepływie jest Respond to Webhook.
- Tylko typy z katalogu. Zablokowane: Code, Execute Command, SSH, HTTP Request do adresów niepodanych przez użytkownika.
- Opcjonalnie: testowy import `POST /api/v1/workflows`, potem `DELETE`.

Eksport zablokowany, dopóki walidacja nie przejdzie.

---

## 8. Bezpieczeństwo

- Opis użytkownika trafia do modelu w wydzielonych znacznikach jako **dane**, nigdy jako instrukcja.
- Model zwraca wyłącznie RP zgodną ze schematem; dowolny tekst jest odrzucany.
- Limit długości opisu (np. 2000 znaków) i limit generowań na użytkownika.
- Walidacja działa zawsze, niezależnie od odpowiedzi modelu.
- Wygenerowane przepływy nigdy nie są uruchamiane automatycznie.
- Klucze AI i n8n wyłącznie w sekretach Edge Functions.

---

## 9. Baza danych

```sql
create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  parent_id uuid references public.workflows on delete set null, -- klonowanie
  current_version_id uuid,
  created_at timestamptz default now()
);

create table public.workflow_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows on delete cascade,
  version_no int not null,
  prompt text not null,
  integrations text[] not null default '{}',
  plan jsonb not null,
  n8n_json jsonb not null,
  validation jsonb,
  docs text,
  estimate jsonb,
  created_at timestamptz default now(),
  unique (workflow_id, version_no)
);

create table public.clarifications (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.workflow_versions on delete cascade,
  question text not null,
  answer text
);

create table public.usage (
  user_id uuid not null references auth.users on delete cascade,
  month date not null,
  generations int not null default 0,
  credits int not null default 0,
  primary key (user_id, month)
);
```

RLS włączone na wszystkich tabelach; polityki: użytkownik widzi i zmienia wyłącznie własne wiersze (przez `workflows.user_id`).

---

## 10. Struktura repozytorium

```
reference/              wzorce z n8n (źródło prawdy)
src/
  catalog/              wpisy katalogu węzłów (jeden plik na integrację)
  compiler/             RP → JSON n8n, układ, wyrażenia
  validator/            reguły walidacji
  estimate/             szacunek wykonania
  schema/               schematy Zod (RP, wpisy katalogu)
  components/           interfejs
  pages/
supabase/
  functions/generate/   analiza intencji + pytania
  functions/fill-params/
  functions/validate-n8n/ testowy import
  migrations/
tests/
  fixtures/             ręcznie napisane RP dla wzorców A i B
```

---

## 11. Etapy i kryteria ukończenia

| Etap | Zakres | Gotowe, gdy |
|---|---|---|
| 0 | szkielet Vite/React/Tailwind, Supabase, migracja bazy | `npm run dev` działa, tabele istnieją |
| 1 | katalog 12 węzłów + kompilator | RP wzorców A i B → JSON importuje się do n8n 2.32.6 bez poprawek |
| 2 | walidator + testowy import | celowo zepsuty przepływ odrzucony z czytelnym powodem |
| 3 | warstwa AI, pytania uzupełniające, ochrona przed wstrzyknięciem | 10/10 opisów testowych importuje się; próby wstrzyknięcia zablokowane |
| 4 | interfejs jak na makiecie (pełne bogactwo, nie wersja uproszczona) | wszystkie sekcje makiety działają, edycja węzła → ponowna walidacja |
| 5 | dokumentacja, szacunek wykonania, eksport | pobranie JSON jednym kliknięciem |
| 6 | historia wersji, klonowanie | przywrócenie dowolnej wersji |
| 7 | szlif, Vercel, demo | publiczny adres + nagranie |

**Aktualny etap: 0.**

---

## 12. Sposób pracy

- Komunikacja z właścicielem projektu po polsku, bez zbędnych anglicyzmów.
- Interfejs aplikacji po angielsku (jak makieta i wymagania wyzwania TRW).
- Identyfikatory w kodzie po angielsku.
- Każdy etap: budowa → testy → właściciel sprawdza import w n8n → poprawki → commit.
- Nie przechodzimy do kolejnego etapu, dopóki poprzedni nie spełnia kryterium.
- Jeśli redukujesz zakres względem makiety, napisz to wprost — nie upraszczaj po cichu.
