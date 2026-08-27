-- =============================================================================
--  JOB-045 — la bibliothèque de réponses aux questions de screening.
--
--  REQ-008 : « une question de screening sans réponse validée BLOQUE la
--  soumission automatique et part en file d'approbation — elle n'est jamais
--  inventée ».
--
--  D'où la colonne `validee_le`. Une réponse extraite d'un CV ou proposée par
--  un modèle n'est PAS une réponse validée : c'est une suggestion. Tant que la
--  personne ne l'a pas confirmée, elle ne peut pas être envoyée en son nom.
--
--  Sans cette distinction, la bibliothèque se remplirait toute seule de
--  réponses plausibles — « disponible immédiatement », « prétentions selon
--  profil » — et l'agent les enverrait. Ce sont exactement les réponses qu'un
--  recruteur retient contre quelqu'un.
-- =============================================================================

create table public.reponses_reference (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Une clé canonique (« pretentions », « disponibilite »…) ou `null` pour une
  -- question libre que la personne a choisi de conserver.
  cle text,
  question text not null,
  reponse text not null,
  -- Nul = suggestion. Non nul = la personne l'a lue et confirmée.
  validee_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, cle)
);

comment on column public.reponses_reference.validee_le is
  'Nul = suggestion, jamais envoyable. Une réponse extraite d un CV ou proposée par un modèle n est PAS validée : sans cette distinction, la bibliothèque se remplirait de « disponible immédiatement » que l agent enverrait.';

create index reponses_reference_profil_idx on public.reponses_reference (profile_id, cle);

alter table public.reponses_reference enable row level security;
alter table public.reponses_reference force row level security;

do $$
begin
  execute $p$
    create policy reponses_select_mien on public.reponses_reference for select to authenticated
      using (exists (select 1 from public.profiles p
                      where p.id = reponses_reference.profile_id and p.user_id = (select auth.uid())))
  $p$;
  execute $p$
    create policy reponses_insert_mien on public.reponses_reference for insert to authenticated
      with check (exists (select 1 from public.profiles p
                           where p.id = reponses_reference.profile_id and p.user_id = (select auth.uid())))
  $p$;
  execute $p$
    create policy reponses_update_mien on public.reponses_reference for update to authenticated
      using (exists (select 1 from public.profiles p
                      where p.id = reponses_reference.profile_id and p.user_id = (select auth.uid())))
      with check (exists (select 1 from public.profiles p
                           where p.id = reponses_reference.profile_id and p.user_id = (select auth.uid())))
  $p$;
  execute $p$
    create policy reponses_delete_mien on public.reponses_reference for delete to authenticated
      using (exists (select 1 from public.profiles p
                      where p.id = reponses_reference.profile_id and p.user_id = (select auth.uid())))
  $p$;
end $$;

grant select, insert, update, delete on public.reponses_reference to authenticated;
revoke all on public.reponses_reference from anon;

create trigger reponses_reference_set_updated_at before update on public.reponses_reference
  for each row execute function public.set_updated_at();
