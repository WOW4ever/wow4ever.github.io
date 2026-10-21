-- Base de l'outil de guilde WoW Forever (projet Supabase izflnnbkxolndzmuhnui)
-- Une table de documents : col = collection (joueurs, reponses, guilde...), id = document, data = contenu.
-- Lecture ouverte à tous ; écriture réservée aux joueurs connectés avec Discord.
-- Une fiche reliée (joueurs.data.uid) et ses réponses ne sont modifiables que par son propriétaire ou un admin.
-- La collection guilde (rôles, accès, réglages Discord) est réservée aux admins ; discord_in à la fonction serveur.

create table public.docs (
  col text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (col, id),
  constraint docs_col_ok check (col in ('joueurs','reponses','guilde','sorties','inscriptions','equipes','discord_in','discord_out')),
  constraint docs_id_ok check (id ~ '^[A-Za-z0-9_-]{1,120}$'),
  constraint docs_size_ok check (pg_column_size(data) < 200000)
);
alter table public.docs enable row level security;

create table public.admins (
  uid uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;
create policy admins_self_read on public.admins for select to authenticated using (uid = (select auth.uid()));

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where uid = (select auth.uid()));
$$;

create or replace function public.sheet_free_for_me(pid text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.docs j
    where j.col = 'joueurs' and j.id = pid
      and coalesce(j.data->>'uid', '') <> ''
      and j.data->>'uid' <> (select auth.uid())::text
  );
$$;

create or replace function public.docs_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
create trigger docs_touch before insert or update on public.docs
for each row execute function public.docs_touch();

create policy docs_read on public.docs for select to anon, authenticated using (true);

create policy docs_insert on public.docs for insert to authenticated with check (
  (select public.is_admin()) or (
    col not in ('guilde', 'discord_in')
    and (col <> 'joueurs' or coalesce(data->>'uid', '') in ('', (select auth.uid())::text))
    and (col <> 'reponses' or id = 'reglages' or public.sheet_free_for_me(id))
  )
);

create policy docs_update on public.docs for update to authenticated
using (
  (select public.is_admin()) or (
    col not in ('guilde', 'discord_in')
    and (col <> 'joueurs' or coalesce(data->>'uid', '') in ('', (select auth.uid())::text))
    and (col <> 'reponses' or id = 'reglages' or public.sheet_free_for_me(id))
  )
)
with check (
  (select public.is_admin()) or (
    col not in ('guilde', 'discord_in')
    and (col <> 'joueurs' or coalesce(data->>'uid', '') in ('', (select auth.uid())::text))
    and (col <> 'reponses' or id = 'reglages' or public.sheet_free_for_me(id))
  )
);

create policy docs_delete on public.docs for delete to authenticated using (
  (select public.is_admin()) or (
    col not in ('guilde', 'discord_in')
    and (col <> 'joueurs' or coalesce(data->>'uid', '') in ('', (select auth.uid())::text))
    and (col <> 'reponses' or id = 'reglages' or public.sheet_free_for_me(id))
  )
);

alter publication supabase_realtime add table public.docs;
