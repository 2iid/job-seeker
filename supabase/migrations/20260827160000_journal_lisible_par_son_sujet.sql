-- =============================================================================
--  JOB-058 — la personne lit SON journal d'accès.
--
--  La migration de JOB-057 n'accordait le journal qu'au support. C'était une
--  supposition de ma part, pas une exigence — et la fonction d'export l'a
--  révélée en butant dessus.
--
--  REQ-014 place le journal d'audit dans les droits de la personne : « journal
--  d'audit sur les accès et actions sensibles, y compris ceux du support ». Le
--  « y compris » n'a de sens que si quelqu'un peut le lire, et ce quelqu'un est
--  d'abord celui dont on a lu le dossier.
--
--  Le cacher derrière une fonction aurait été moins honnête, pas plus sûr : la
--  personne y a droit, et une politique qui le lui donne directement se relit
--  en trois lignes là où une fonction `security definer` demanderait de faire
--  confiance à son corps.
--
--  Ce qu'elle voit : ses propres lignes. Y compris — surtout — celles qui
--  disent qu'un support a ouvert son dossier, quand, et sur quel ticket.
-- =============================================================================

alter table audit.acces enable row level security;
alter table audit.acces force row level security;

grant usage on schema audit to authenticated;
grant select on audit.acces to authenticated;

create policy acces_les_miens on audit.acces for select to authenticated
  using (profile_id in (select id from public.profiles where user_id = (select auth.uid())));

comment on policy acces_les_miens on audit.acces is
  'La personne lit SES lignes — y compris, et surtout, celles qui disent qu un support a ouvert son dossier, quand, et sur quel ticket.';

-- Le support garde son accès complet : la politique de JOB-057 ne le couvrait
-- pas puisque la RLS n'était pas active. Elle l'est maintenant.
create policy acces_support on audit.acces for select to support using (true);

-- Une ligne ANONYMISÉE — `profile_id` à null — n'appartient plus à personne.
-- Elle reste lisible par le support, invisible pour tout candidat. C'est
-- exactement ce qu'on voulait : la responsabilité reste vérifiable, la personne
-- n'est plus dedans.
