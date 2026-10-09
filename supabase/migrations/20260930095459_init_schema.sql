-- FlowGen AI — schemat początkowy (etap 0)

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

-- workflows.current_version_id → workflow_versions (dodane po utworzeniu obu tabel)
alter table public.workflows
  add constraint workflows_current_version_id_fkey
  foreign key (current_version_id) references public.workflow_versions on delete set null;

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

-- Indeksy na kluczach obcych
create index workflows_user_id_idx on public.workflows (user_id);
create index workflows_parent_id_idx on public.workflows (parent_id);
create index workflows_current_version_id_idx on public.workflows (current_version_id);
create index clarifications_version_id_idx on public.clarifications (version_id);

-- RLS
alter table public.workflows enable row level security;
alter table public.workflow_versions enable row level security;
alter table public.clarifications enable row level security;
alter table public.usage enable row level security;

create policy "workflows: own rows" on public.workflows
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "workflow_versions: own rows" on public.workflow_versions
  for all to authenticated
  using (exists (
    select 1 from public.workflows w
    where w.id = workflow_id and w.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.workflows w
    where w.id = workflow_id and w.user_id = (select auth.uid())
  ));

create policy "clarifications: own rows" on public.clarifications
  for all to authenticated
  using (exists (
    select 1 from public.workflow_versions v
    join public.workflows w on w.id = v.workflow_id
    where v.id = version_id and w.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.workflow_versions v
    join public.workflows w on w.id = v.workflow_id
    where v.id = version_id and w.user_id = (select auth.uid())
  ));

-- usage: użytkownik tylko odczytuje; liczniki zmieniają Edge Functions (service role),
-- inaczej użytkownik mógłby sam wyzerować swój limit generowań.
create policy "usage: read own" on public.usage
  for select to authenticated
  using (user_id = (select auth.uid()));
