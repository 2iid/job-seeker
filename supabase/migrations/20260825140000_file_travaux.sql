-- =============================================================================
--  JOB-009 — la file de travaux durable.
--
--  Elle vit dans Postgres, pas en mémoire, pour une raison qui décide de tout :
--  ADR-0001 confie au worker des actions SORTANTES faites au nom de quelqu'un.
--  Un travail perdu au redémarrage, c'est une candidature qui ne part jamais ;
--  un travail rejoué, c'est une candidature envoyée deux fois. Les deux sont
--  des fautes visibles par l'utilisateur, donc la durabilité et l'idempotence
--  sont des propriétés du CADRE, jamais de chaque appelant.
--
--  Le schéma `worker` n'est pas exposé par l'API : aucun rôle client n'y a le
--  moindre privilège, et c'est vérifié par un test.
-- =============================================================================

create schema if not exists worker;

create type worker.job_state as enum ('queued', 'running', 'done', 'failed');

create table worker.jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,

  -- L'idempotence est OBLIGATOIRE, pas optionnelle. Un appelant qui n'a pas de
  -- clé naturelle doit en fabriquer une : c'est ce qui empêche un rejeu après
  -- incident de produire une seconde action sortante.
  idempotency_key text not null unique,

  state worker.job_state not null default 'queued',
  attempts integer not null default 0,
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),

  run_at timestamptz not null default now(),
  -- Bail : un travail « running » dont le bail a expiré est repris. C'est ce
  -- qui fait qu'un worker tué au milieu d'un travail ne le perd pas.
  lease_until timestamptz,
  locked_by text,

  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint locked_coherent check (
    (state = 'running') = (locked_by is not null and lease_until is not null)
  )
);

comment on table worker.jobs is
  'File durable. Durabilité et idempotence sont des propriétés du cadre : un travail perdu est une candidature qui ne part pas, un travail rejoué est une candidature envoyée deux fois.';

create trigger jobs_set_updated_at
  before update on worker.jobs
  for each row execute function public.set_updated_at();

-- Index de réclamation : seuls les travaux réellement réclamables y entrent.
create index jobs_a_reclamer on worker.jobs (run_at)
  where state = 'queued';

-- Index de reprise : les baux expirés, pour qu'un balayage ne parcoure pas la file.
create index jobs_baux_expires on worker.jobs (lease_until)
  where state = 'running';

create index jobs_kind_state on worker.jobs (kind, state);

-- --------------------------------------------------------------------------
--  Réclamer un travail. `for update skip locked` est ce qui rend deux workers
--  concurrents sûrs sans verrou applicatif : chacun saute ce que l'autre tient.
-- --------------------------------------------------------------------------
create or replace function worker.claim_job(
  p_worker text,
  p_lease_seconds integer default 60,
  p_kinds text[] default null
)
returns worker.jobs
language sql
volatile
set search_path = ''
as $$
  update worker.jobs j
     set state = 'running',
         locked_by = p_worker,
         lease_until = now() + make_interval(secs => p_lease_seconds),
         attempts = j.attempts + 1
   where j.id = (
     select c.id from worker.jobs c
      -- Les parenthèses extérieures ne sont pas décoratives : `and` lie plus
      -- fort que `or`, et sans elles le filtre par `kind` ne s'appliquerait
      -- qu'à la branche de reprise. Un worker spécialisé aurait alors réclamé
      -- des travaux qui ne le concernent pas.
      where ((c.state = 'queued' and c.run_at <= now())
             -- Reprise : un bail expiré appartient de nouveau à la file.
             or (c.state = 'running' and c.lease_until < now()))
        and (p_kinds is null or c.kind = any (p_kinds))
      order by c.run_at
      for update skip locked
      limit 1
   )
  returning j.*;
$$;

comment on function worker.claim_job is
  'Réclame un travail avec un bail. Reprend aussi les travaux dont le bail a expiré — un worker tué au milieu d''un travail ne le perd pas.';

-- --------------------------------------------------------------------------
--  Aucun rôle client n'approche cette file. Le worker s'y connecte sous une
--  identité de service, jamais sous une session utilisateur (ADR-0001).
-- --------------------------------------------------------------------------
revoke all on schema worker from anon, authenticated;
revoke all on all tables in schema worker from anon, authenticated;
revoke all on all functions in schema worker from anon, authenticated;
alter default privileges in schema worker revoke all on tables from anon, authenticated;
