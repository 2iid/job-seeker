-- =============================================================================
--  JOB-034 — le numéro de version des critères ne vient plus du client.
--
--  `criteres_recherche` est en insertion seule et porte `unique (profile_id,
--  version)`. Jusqu'ici, c'est l'appelant qui calculait le numéro : lire le
--  maximum, ajouter un, insérer. Trois problèmes dans cet ordre-là.
--
--  1. Deux enregistrements simultanés lisent le même maximum. L'un des deux
--     échoue sur la contrainte — ce qui est le bon comportement, mais il
--     échoue en montrant une erreur de base de données à quelqu'un qui vient
--     de cliquer sur « Enregistrer ».
--  2. Rien n'oblige un client à respecter la suite. Une version 999 posée à la
--     main casse la lecture « la dernière version est la plus grande » pour
--     toujours.
--  3. Chaque nouveau client — l'écran, le worker, un script d'import — doit se
--     souvenir de la règle. Celui qui l'oubliera ne le saura pas.
--
--  Le numéro est donc attribué par la base, qui est le seul endroit à voir
--  toutes les écritures.
-- =============================================================================

create or replace function public.numeroter_version_criteres()
returns trigger
language plpgsql
as $$
begin
  if new.version is null or new.version = 0 then
    -- Un verrou sur la ligne de profil sérialise les enregistrements
    -- concurrents du MÊME profil, et d'aucun autre : deux personnes qui
    -- enregistrent en même temps ne s'attendent pas l'une l'autre.
    perform 1 from public.profiles where id = new.profile_id for update;
    select coalesce(max(version), 0) + 1 into new.version
      from public.criteres_recherche where profile_id = new.profile_id;
  end if;
  return new;
end;
$$;

comment on function public.numeroter_version_criteres is
  'Le numéro vient de la base, seul endroit qui voit toutes les écritures. Un client qui l oublierait ne le saurait pas.';

alter table public.criteres_recherche alter column version drop not null;

create trigger criteres_recherche_numerote
  before insert on public.criteres_recherche
  for each row execute function public.numeroter_version_criteres();
