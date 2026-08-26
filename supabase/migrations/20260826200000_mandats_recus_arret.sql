-- =============================================================================
--  JOB-046, JOB-047, JOB-053, JOB-054 — la chaîne de sûreté.
--
--  Quatre pièces, et chacune ne vaut que si les trois autres tiennent :
--
--    · le MANDAT dit ce que l'agent a le droit d'envoyer, canal par canal ;
--    · le QUOTA borne combien, et à quelles heures ;
--    · l'ARRÊT coupe tout, sans négociation ;
--    · le REÇU prouve ce qui est parti.
--
--  Sans reçu, un mandat est une promesse invérifiable. Sans arrêt, un quota
--  est un plafond qu'on atteint quand même. Sans mandat, un reçu documente une
--  chose que personne n'a autorisée.
-- =============================================================================

create type public.canal_envoi as enum (
  'ats',        -- formulaire de candidature d'un ATS
  'email',      -- message direct à un recruteur (REQ-016)
  'formulaire'  -- formulaire propre à un employeur
);

-- --------------------------------------------------------------------------
--  MANDATS — REQ-009. Journal d'octrois et de révocations, en insertion seule.
--
--  Un mandat ne se MODIFIE pas : on en accorde un nouveau, ou on le révoque
--  par une nouvelle ligne. C'est la même raison que les versions de critères —
--  « depuis quand l'agent avait-il le droit d'envoyer sur ce canal ? » est une
--  question dont la réponse ne doit pas dépendre de la dernière écriture.
--
--  `apercu_empreinte` est ce qui rend le mandat SÉRIEUX. REQ-009 exige que
--  l'octroi soit « précédé d'un aperçu intégral de ce qui sera envoyé ».
--  Conserver l'empreinte de cet aperçu permet de dire, plus tard, que la
--  personne a bien vu CE contenu-là — et pas un autre.
-- --------------------------------------------------------------------------
create table public.mandats (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  canal public.canal_envoi not null,
  cran public.cran_autonomie not null,
  -- SHA-256 de l'aperçu montré au moment de l'octroi.
  apercu_empreinte text,
  accorde_le timestamptz not null default now(),
  -- Un mandat sans échéance est un mandat qu'on oublie d'avoir donné.
  expire_le timestamptz,
  revoque_le timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.mandats is
  'Insertion seule. « Depuis quand l agent avait-il le droit d envoyer ici ? » est une question dont la réponse ne doit pas dépendre de la dernière écriture.';

create index mandats_courant_idx on public.mandats (profile_id, canal, accorde_le desc);

-- Un mandat « agir-seul » DOIT porter l'empreinte de son aperçu et une
-- échéance. Les autres crans n'autorisent aucun envoi autonome et n'en ont pas
-- besoin. La contrainte est en base parce qu'un mandat mal formé est
-- exactement ce qu'on ne veut pas découvrir au moment de s'en servir.
alter table public.mandats add constraint mandat_agir_seul_complet check (
  cran <> 'agir-seul' or (apercu_empreinte is not null and expire_le is not null)
);

-- --------------------------------------------------------------------------
--  QUOTAS ET PLAGES — REQ-009.
--
--  Les heures sont stockées en minutes depuis minuit, DANS LE FUSEAU DU
--  CANDIDAT (`profiles.fuseau`). Stocker un instant UTC obligerait à convertir
--  pour comparer, et un décalage horaire saisonnier ferait glisser la plage
--  d'une heure deux fois par an — l'agent enverrait à 8 h un matin de
--  novembre à quelqu'un qui avait dit « pas avant 9 h ».
-- --------------------------------------------------------------------------
alter table public.profiles
  add column quota_quotidien integer not null default 10 check (quota_quotidien between 0 and 200),
  add column plage_debut_minutes integer not null default 8 * 60 check (plage_debut_minutes between 0 and 1439),
  add column plage_fin_minutes integer not null default 19 * 60 check (plage_fin_minutes between 0 and 1439),
  -- REQ-012 : l'arrêt d'urgence. Nul = l'agent peut travailler.
  add column arret_urgence_le timestamptz;

comment on column public.profiles.plage_debut_minutes is
  'Minutes depuis minuit, dans le fuseau du candidat. Un instant UTC glisserait d une heure deux fois par an.';
comment on column public.profiles.arret_urgence_le is
  'REQ-012. Non nul = tout est arrêté. La reprise est un acte explicite : rien ne redémarre seul, y compris après un redéploiement.';

-- --------------------------------------------------------------------------
--  REÇUS — REQ-013. Immuables, pour de vrai.
--
--  « Ni le candidat, ni le support, ni le worker ne peuvent le modifier après
--  écriture. » Une politique RLS ne suffit pas : `service_role` la contourne,
--  et c'est justement le rôle du worker. La garantie est donc portée par un
--  DÉCLENCHEUR, qui s'applique à tout le monde — y compris à `postgres`.
-- --------------------------------------------------------------------------
create table public.recus (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  opportunite_id uuid references public.opportunites (id) on delete set null,
  canal public.canal_envoi not null,
  -- Le contenu EXACT envoyé, pas une référence vers quelque chose qui bougera.
  cv_texte text not null,
  message_texte text,
  -- Le cran en vigueur AU MOMENT de l'envoi. Le lire aujourd'hui sur le profil
  -- donnerait le cran d'aujourd'hui, ce qui n'explique rien.
  cran_au_moment public.cran_autonomie not null,
  mandat_id uuid references public.mandats (id) on delete set null,
  resultat text not null,
  envoye_le timestamptz not null default now()
);

comment on table public.recus is
  'Immuable par DÉCLENCHEUR et non par politique : service_role contourne la RLS, et c est le rôle du worker.';

create index recus_profil_idx on public.recus (profile_id, envoye_le desc);

create or replace function public.recu_immuable()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Un reçu est immuable (REQ-013). Il documente ce qui est parti au nom de quelqu un : le corriger après coup effacerait la seule preuve qu il en avait.'
    using errcode = '42501';
end;
$$;

create trigger recus_pas_de_modification
  before update or delete on public.recus
  for each row execute function public.recu_immuable();

-- --------------------------------------------------------------------------
--  Autorisation.
-- --------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['mandats', 'recus'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format($p$
      create policy %1$s_select_mien on public.%1$I for select to authenticated
        using (exists (select 1 from public.profiles p
                        where p.id = %1$I.profile_id and p.user_id = (select auth.uid())))
    $p$, t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- La personne ACCORDE et RÉVOQUE ses mandats : c'est son consentement, il ne
-- se donne pas à sa place. Elle n'écrit pas de reçus : un reçu qu'on peut
-- fabriquer ne prouve rien, et c'est le worker qui constate un envoi.
create policy mandats_insert_mien on public.mandats for insert to authenticated
  with check (exists (select 1 from public.profiles p
                       where p.id = mandats.profile_id and p.user_id = (select auth.uid())));
grant insert on public.mandats to authenticated;
