-- =============================================================================
--  JOB-057 — le journal d'audit, et le rôle du support.
--
--  REQ-014 : « journal d'audit sur les accès et actions sensibles, Y COMPRIS
--  ceux du support » et « le support ne peut pas lire le contenu des documents
--  et des messages, quel que soit son rôle applicatif — TESTÉ AU NIVEAU DE LA
--  BASE ».
--
--  Les quatre derniers mots décident de toute la migration.
--
--  Un contrôle applicatif — « l'écran du support n'affiche pas le CV » — tient
--  tant que personne n'écrit une seconde requête. Il ne tient pas contre un
--  export improvisé, un script de dépannage, une console ouverte un soir
--  d'incident. Or c'est exactement dans ces moments-là qu'on lit un CV « juste
--  pour comprendre le problème ».
--
--  La garantie est donc un PRIVILÈGE DE COLONNE. Le rôle `support` n'a pas le
--  droit de lire `recus.cv_texte` : ce n'est pas qu'il ne le fait pas, c'est
--  que Postgres refuse. Aucune requête, aucun outil, aucun soir d'incident ne
--  contourne ça.
--
--  ── Ce que le support DOIT pouvoir voir ──
--
--  Son travail est réel : comprendre pourquoi une candidature est bloquée,
--  pourquoi un connecteur échoue, pourquoi un quota est atteint. Tout ça vit
--  dans des colonnes techniques — état, horodatage, code d'erreur — et aucune
--  n'exige de lire le contenu d'un document.
--
--  Un rôle qui ne peut rien faire serait contourné le premier jour par un accès
--  `postgres` partagé. Le bon dosage n'est pas « le moins possible » : c'est
--  « exactement ce qu'il faut, et rien qui donne envie de demander plus ».
-- =============================================================================

-- --------------------------------------------------------------------------
--  Le journal. Insertion seule, comme les reçus, et pour la même raison.
-- --------------------------------------------------------------------------
create schema if not exists audit;

create type audit.acteur as enum ('candidat', 'support', 'worker', 'systeme');

create table audit.acces (
  id bigint generated always as identity primary key,
  survenu_le timestamptz not null default now(),
  acteur audit.acteur not null,
  -- Qui, quand on le sait. Nul pour le worker et le système.
  acteur_id uuid,
  action text not null,
  -- Sur quoi. On note la TABLE et l'identifiant, jamais le contenu : un
  -- journal d'audit qui recopie ce qu'il protège est une seconde fuite.
  objet_table text not null,
  objet_id text,
  -- Le profil concerné, pour qu'une personne puisse lire SON journal.
  profile_id uuid references public.profiles (id) on delete cascade,
  detail jsonb not null default '{}'::jsonb
);

comment on table audit.acces is
  'Insertion seule. On note la table et l identifiant, JAMAIS le contenu : un journal d audit qui recopie ce qu il protège est une seconde fuite.';

create index acces_profil_idx on audit.acces (profile_id, survenu_le desc);
create index acces_acteur_idx on audit.acces (acteur, survenu_le desc);

create or replace function audit.immuable()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Le journal d audit est en insertion seule (REQ-014). Un journal qu on peut corriger ne prouve rien — et le premier à vouloir le corriger serait celui qui a quelque chose à effacer.'
    using errcode = '42501';
end;
$$;

create trigger acces_pas_de_modification
  before update or delete on audit.acces
  for each row execute function audit.immuable();

-- --------------------------------------------------------------------------
--  Le rôle du support.
-- --------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'support') then
    -- `nologin` : on ne se connecte pas EN TANT QUE support, on l'endosse
    -- depuis un compte nominatif. Un rôle partagé avec mot de passe rend
    -- l'audit inutile — « le support » n'est le nom de personne.
    create role support nologin;
  end if;
end $$;

grant usage on schema public to support;
grant usage on schema audit to support;

-- Le support LIT le journal, et n'y écrit pas lui-même : ses écritures
-- viennent de l'application, qui l'horodate et le nomme.
grant select on audit.acces to support;

-- ── Ce que le support peut voir : l'état technique, jamais le contenu ──
--
-- Colonne par colonne. `grant select on <table>` donnerait tout, y compris les
-- colonnes ajoutées demain — et c'est ainsi qu'une garantie se perd sans que
-- personne ait rien décidé.
grant select (id, profile_id, opportunite_id, canal, cran_au_moment, mandat_id, resultat, envoye_le)
  on public.recus to support;

grant select (id, profile_id, offre_id, statut, score, exclue, citations_rejetees,
              archivee_le, archivage_raison, motif_refus, created_at, updated_at)
  on public.opportunites to support;

grant select (id, profile_id, genre, type_mime, taille_octets, created_at)
  on public.documents to support;

grant select (id, user_id, locale, fuseau, cran_autonomie, parcours_termine_le,
              quota_quotidien, arret_urgence_le, created_at, updated_at)
  on public.profiles to support;

grant select (id, profile_id, canal, cran, accorde_le, expire_le, revoque_le)
  on public.mandats to support;

-- Les offres sont publiques : rien à cloisonner.
grant select on public.offres to support;

-- La file de travaux du worker : c'est le cœur du dépannage.
grant usage on schema worker to support;
grant select on worker.jobs to support;

-- ── Et ce qu'il ne peut PAS voir ──
--
-- Aucun `grant` sur : recus.cv_texte, recus.message_texte,
-- opportunites.correspondances/manques/redhibitoires (elles citent l'offre ET
-- le profil), documents.nom_origine et chemin_stockage (le nom d'un fichier
-- dit déjà beaucoup, et le chemin y donne accès), profiles.titre_accroche,
-- experiences, formations, competences, criteres_recherche, reponses_reference.
--
-- Rien n'est révoqué ici : ces droits n'ont jamais été accordés. Une garantie
-- qui repose sur un `revoke` se perd au prochain `grant all`.
