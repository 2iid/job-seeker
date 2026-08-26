-- =============================================================================
--  JOB-038 — les offres, et ce qu'elles valent POUR QUELQU'UN.
--
--  Deux tables, et la séparation porte tout le reste.
--
--  `offres` est ce que le moteur a vu dans le monde. Une annonce publiée par
--  un employeur n'appartient à personne : la stocker une fois par candidat
--  multiplierait la même ligne par le nombre d'utilisateurs, et rendrait
--  impossible la seule question que le produit doit savoir répondre vite —
--  « cette offre, l'ai-je déjà vue ailleurs ? ».
--
--  `opportunites` est ce que cette offre vaut pour UN profil : son score, ses
--  preuves, ses rédhibitoires, son statut. C'est de la donnée personnelle —
--  savoir quelles offres quelqu'un s'est vu proposer en dit long sur lui — et
--  c'est donc là que la RLS mord.
--
--  ── Deux dates, jamais une ──
--
--  `publiee_le` est ce que la SOURCE affirme. `vue_le` est ce que NOUS avons
--  constaté. Sur un palier A elles se confondent presque ; sur un palier B
--  elles peuvent différer d'un jour. N'en garder qu'une obligerait l'interface
--  à choisir, et elle choisirait la plus flatteuse — ce que le langage de
--  fraîcheur du système interdit explicitement.
--
--  ── Pourquoi les preuves sont figées en JSON ──
--
--  Un score est le résultat d'un appel de modèle à un instant donné, sur une
--  version de profil donnée. Le recalculer pour l'afficher donnerait un autre
--  nombre, et l'explication ne correspondrait plus à la décision qui a été
--  prise. On fige donc ce qui a servi, avec la version de profil et de critères
--  qui l'ont produit : c'est REQ-002, « expliquer a posteriori ».
-- =============================================================================

create type public.palier_veille as enum ('a', 'b', 'c');

create table public.offres (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  palier public.palier_veille not null,
  identifiant_source text not null,
  employeur_canonique text not null,
  employeur_affiche text not null,
  titre text not null,
  url_candidature text not null,
  lieu text,
  pays text,
  teletravail_texte text,
  description text,
  -- Money = unités mineures entières, comme partout dans ce projet.
  salaire_min_unites_mineures bigint,
  salaire_max_unites_mineures bigint,
  salaire_devise text,
  salaire_periode text,
  -- Ce que la source AFFIRME.
  publiee_le timestamptz,
  -- Ce que NOUS avons constaté. Jamais nul : on sait toujours quand on a vu.
  vue_le timestamptz not null default now(),
  expire_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, identifiant_source)
);

comment on column public.offres.publiee_le is
  'Ce que la SOURCE affirme. Une page carrières peut rafraîchir sa date chaque nuit pour le référencement : ce n est pas un relevé.';
comment on column public.offres.vue_le is
  'Ce que NOUS avons constaté. C est la seule des deux dates dont nous répondons.';

create index offres_vue_le_idx on public.offres (vue_le desc);
create index offres_employeur_idx on public.offres (employeur_canonique);

create type public.statut_opportunite as enum (
  'detectee', 'en-file', 'escalade', 'envoyee', 'consultee', 'entretien',
  'sans-reponse', 'echec-technique', 'ecartee'
);

create table public.opportunites (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  offre_id uuid not null references public.offres (id) on delete cascade,
  statut public.statut_opportunite not null default 'detectee',
  score integer check (score between 0 and 100),
  -- Preuves VÉRIFIÉES en amont : chaque citation figure mot pour mot dans
  -- l'annonce, sans quoi elle a été écartée et comptée.
  correspondances jsonb not null default '[]'::jsonb,
  manques jsonb not null default '[]'::jsonb,
  redhibitoires jsonb not null default '[]'::jsonb,
  citations_rejetees integer not null default 0,
  -- Une offre exclue n'est ni présentée ni scorée (REQ-002). La ligne existe
  -- pour ne pas la re-proposer demain, et l'interface ne la montre pas.
  exclue boolean not null default false,
  -- Ce qui a produit ce score. Sans ces deux-là, l'explication d'hier ne peut
  -- plus être rattachée à la décision d'hier.
  profil_version_id uuid references public.profil_versions (id) on delete set null,
  criteres_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, offre_id)
);

create index opportunites_flux_idx
  on public.opportunites (profile_id, exclue, score desc nulls last, created_at desc);

create table public.recherches_sauvegardees (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  nom text not null,
  filtres jsonb not null default '{}'::jsonb,
  -- Le filtre que l'écran rouvre par défaut. Un seul par profil.
  actif boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, nom)
);

create unique index recherches_un_seul_actif
  on public.recherches_sauvegardees (profile_id) where actif;

-- --------------------------------------------------------------------------
--  Autorisation.
-- --------------------------------------------------------------------------

-- `offres` : lisible par toute personne authentifiée. Ce sont des annonces
-- PUBLIQUES — les cloisonner par profil dupliquerait la même ligne autant de
-- fois qu'il y a de candidats, sans rien protéger que le monde ne sache déjà.
-- Ce qui est personnel, c'est le LIEN entre une personne et une offre, et il
-- vit dans `opportunites`.
alter table public.offres enable row level security;
alter table public.offres force row level security;
grant select on public.offres to authenticated;

create policy "offres — lisibles par les personnes authentifiees"
  on public.offres for select to authenticated using (true);

-- Aucune écriture pour un rôle client : le moteur écrit, l'interface lit.
-- `service_role` contourne la RLS et n'a besoin d'aucune politique ici.

do $$
declare t text;
begin
  foreach t in array array['opportunites', 'recherches_sauvegardees'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format($p$
      create policy %1$s_select_mien on public.%1$I for select to authenticated
        using (exists (select 1 from public.profiles p
                        where p.id = %1$I.profile_id and p.user_id = (select auth.uid())))
    $p$, t);
    execute format($p$
      create policy %1$s_update_mien on public.%1$I for update to authenticated
        using (exists (select 1 from public.profiles p
                        where p.id = %1$I.profile_id and p.user_id = (select auth.uid())))
        with check (exists (select 1 from public.profiles p
                             where p.id = %1$I.profile_id and p.user_id = (select auth.uid())))
    $p$, t);
    execute format('grant select, update on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create trigger %1$s_set_updated_at before update on public.%1$I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Une recherche sauvegardée est créée ET supprimée par la personne : c'est son
-- outil de travail, pas une trace. `opportunites`, elle, est écrite par le
-- moteur — une personne qui pourrait s'en inventer une se proposerait une offre
-- que rien n'a jugée.
create policy recherches_insert_mien on public.recherches_sauvegardees for insert to authenticated
  with check (exists (select 1 from public.profiles p
                       where p.id = recherches_sauvegardees.profile_id and p.user_id = (select auth.uid())));
create policy recherches_delete_mien on public.recherches_sauvegardees for delete to authenticated
  using (exists (select 1 from public.profiles p
                  where p.id = recherches_sauvegardees.profile_id and p.user_id = (select auth.uid())));
grant insert, delete on public.recherches_sauvegardees to authenticated;

create trigger offres_set_updated_at before update on public.offres
  for each row execute function public.set_updated_at();
