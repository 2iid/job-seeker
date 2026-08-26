-- =============================================================================
--  JOB-033 — l'historique du profil canonique.
--
--  REQ-002 : « on peut expliquer a posteriori pourquoi une offre a matché à un
--  instant donné ». Le profil est la moitié de cette explication — l'autre
--  moitié, les critères, est déjà versionnée par JOB-030. Un profil qui écrase
--  sa version précédente rend la promesse intenable : six mois plus tard, on
--  ne sait plus si l'agent a jugé sur l'expérience que la personne a ajoutée
--  depuis, ou sur celle qu'elle a retirée.
--
--  Trois décisions.
--
--  1. INSERTION SEULE. Aucune politique `update` ni `delete` pour un rôle
--     client. Un historique modifiable ne prouve rien — il documente
--     seulement ce que quelqu'un a bien voulu laisser.
--
--  2. FIGÉ À LA DEMANDE, pas à chaque écriture. Enregistrer cinq compétences,
--     c'est cinq INSERT ; un instantané par écriture produirait cinq versions
--     identiques à la seconde près, et l'historique deviendrait illisible
--     exactement au moment où il devient long. `figer_profil()` ne crée une
--     version que si le profil a bougé depuis la dernière — sinon il rend
--     celle qui existe.
--
--  3. `touche_profil()` remonte la modification d'une table fille vers le
--     profil. Sans ça, ajouter une expérience ne changerait pas
--     `profiles.updated_at`, et la version suivante manquerait précisément ce
--     que la personne vient d'ajouter — le pire cas possible pour un
--     historique : présent, daté, et faux.
-- =============================================================================

create table public.profil_versions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  version integer not null,
  instantane jsonb not null,
  fige_le timestamptz not null default now(),
  unique (profile_id, version)
);

comment on table public.profil_versions is
  'Insertion seule. Un historique modifiable ne prouve rien. La suppression suit celle du compte (REQ-014), par cascade.';

create index profil_versions_profil_idx on public.profil_versions (profile_id, version desc);

-- Le privilège de table D'ABORD. Une politique RLS s'applique AU-DESSUS d'un
-- privilège, elle ne le remplace pas : sans ce `grant`, la table est
-- inaccessible et les politiques ci-dessous ne sont jamais consultées. Le
-- refus a alors l'air d'un cloisonnement qui marche, alors que c'est un mur.
-- `update` et `delete` sont délibérément absents, et c'est la garantie
-- principale de cette table.
grant select, insert on public.profil_versions to authenticated;

alter table public.profil_versions enable row level security;
alter table public.profil_versions force row level security;

create policy "profil_versions — lire les siennes"
  on public.profil_versions for select to authenticated
  using (profile_id in (select id from public.profiles where user_id = (select auth.uid())));

create policy "profil_versions — figer les siennes"
  on public.profil_versions for insert to authenticated
  with check (profile_id in (select id from public.profiles where user_id = (select auth.uid())));

-- --------------------------------------------------------------------------
--  Remonter la modification d'une table fille vers le profil.
-- --------------------------------------------------------------------------
create or replace function public.touche_profil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set updated_at = now()
   where id = coalesce(new.profile_id, old.profile_id);
  return coalesce(new, old);
end;
$$;

comment on function public.touche_profil is
  'Sans ceci, ajouter une expérience ne changerait pas profiles.updated_at, et la version figée juste après manquerait ce que la personne vient d ajouter — un historique présent, daté, et faux.';

do $$
declare t text;
begin
  foreach t in array array['experiences', 'formations', 'competences'] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.touche_profil()',
      't_touche_' || t, t);
  end loop;
end $$;

-- --------------------------------------------------------------------------
--  Figer — ou rendre la version en cours si rien n'a bougé.
-- --------------------------------------------------------------------------
create or replace function public.figer_profil(p_profile_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_derniere public.profil_versions%rowtype;
  v_modifie timestamptz;
  v_instantane jsonb;
  v_id uuid;
begin
  -- Pas de SECURITY DEFINER : la fonction s'exécute avec les droits de
  -- l'appelant, donc la RLS de `profiles` et de `profil_versions` s'applique.
  -- Une fonction qui fige le profil de n'importe qui serait un contournement
  -- de toutes les politiques posées jusqu'ici.
  select updated_at into v_modifie from public.profiles where id = p_profile_id;
  if v_modifie is null then
    raise exception 'profil introuvable ou inaccessible';
  end if;

  select * into v_derniere
    from public.profil_versions
   where profile_id = p_profile_id
   order by version desc
   limit 1;

  if found and v_derniere.fige_le >= v_modifie then
    return v_derniere.id;
  end if;

  select jsonb_build_object(
    'profil', to_jsonb(p) - 'created_at' - 'updated_at',
    'experiences', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.ordre, e.debut desc)
        from public.experiences e where e.profile_id = p_profile_id), '[]'::jsonb),
    'formations', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.obtenue_en desc)
        from public.formations f where f.profile_id = p_profile_id), '[]'::jsonb),
    'competences', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.libelle)
        from public.competences c where c.profile_id = p_profile_id), '[]'::jsonb)
  ) into v_instantane
    from public.profiles p where p.id = p_profile_id;

  insert into public.profil_versions (profile_id, version, instantane)
  values (p_profile_id, coalesce(v_derniere.version, 0) + 1, v_instantane)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.figer_profil is
  'Rend l identifiant de la version courante, en la créant seulement si le profil a bougé depuis la dernière. Enregistrer cinq compétences ne doit pas produire cinq versions identiques.';
