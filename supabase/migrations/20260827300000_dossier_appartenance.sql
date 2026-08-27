-- =============================================================================
--  JOB-051 (revue) — F27 : le dossier et l'opportunité doivent appartenir à la
--  MÊME personne, et rien ne l'imposait.
--
--  `public.dossiers` porte `profile_id` ET `opportunite_id`. La politique de
--  lecture s'appuie sur le premier ; le contenu appartient au second. Le worker
--  écrit avec `service_role`, qui contourne la RLS — donc deux paramètres
--  incohérents suffisaient à créer un dossier contenant le CV et la lettre
--  d'Alice, mais VISIBLE PAR BOB.
--
--  Aucun code ne le fait aujourd'hui. C'est précisément pourquoi il faut une
--  contrainte : la garantie ne doit pas dépendre de la vigilance de l'appelant
--  suivant, qui aura deux identifiants sous la main et une raison d'être pressé.
--
--  La forme retenue est une clé étrangère COMPOSITE. Un `check` ne peut pas
--  faire de sous-requête ; un déclencheur se contourne au prochain
--  `alter table ... disable trigger`. Une clé étrangère, non.
-- =============================================================================

alter table public.opportunites
  add constraint opportunites_id_profile_key unique (id, profile_id);

-- Nettoyage préalable : s'il existait déjà des lignes incohérentes, la
-- contrainte les révélerait à la création. Il ne doit pas y en avoir, et si
-- c'est le cas, on veut le savoir bruyamment plutôt que de les effacer.
do $$
declare n integer;
begin
  select count(*) into n
    from public.dossiers d join public.opportunites o on o.id = d.opportunite_id
   where d.profile_id <> o.profile_id;
  if n > 0 then
    raise exception '% dossier(s) rattachés à la mauvaise personne — à examiner avant de contraindre', n;
  end if;
end $$;

alter table public.dossiers
  add constraint dossiers_appartiennent_a_leur_opportunite
  foreign key (opportunite_id, profile_id)
  references public.opportunites (id, profile_id)
  on delete cascade;

comment on constraint dossiers_appartiennent_a_leur_opportunite on public.dossiers is
  'Le CV et la lettre d un dossier appartiennent au proprietaire de l opportunite. Sans cette cle, deux parametres incoherents rendaient le dossier d Alice visible par Bob.';
