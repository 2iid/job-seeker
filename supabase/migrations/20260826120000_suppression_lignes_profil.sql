-- =============================================================================
--  JOB-034 — ferme le constat F22 : retirer une ligne saisie par erreur.
--
--  JOB-030 n'accordait DELETE à aucun rôle client, et la raison était bonne :
--  REQ-014 exige d'ARRÊTER l'automatisation avant d'effacer, et un DELETE
--  direct court-circuiterait cette garantie.
--
--  Mais cette raison vise la suppression du COMPTE. Elle ne dit rien d'une
--  ligne de parcours saisie par erreur. Or l'appliquer là revenait à dire à
--  quelqu'un : vous pouvez remplacer cette expérience, jamais la retirer. Sur
--  de la donnée personnelle, c'est un défaut de maîtrise, pas une protection —
--  et le règlement dont OBL-1 dépend parle d'effacement, pas de réécriture.
--
--  Ce qui reste interdit ne bouge pas d'un pouce :
--    · `criteres_recherche`  — une version ne se supprime pas plus qu'elle ne
--                              se modifie ; REQ-002 en dépend.
--    · `profil_versions`     — un historique effaçable ne prouve rien.
--    · `candidatures`        — une candidature envoyée a eu lieu. La retirer
--                              de la base ne la retire pas de la boîte mail du
--                              recruteur, et l'agent doit pouvoir dire ce qu'il
--                              a fait en votre nom.
--    · `profiles`            — passe par le parcours de REQ-014.
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array['experiences', 'formations', 'competences', 'employeurs_exclus'] loop
    execute format($p$
      create policy %1$s_delete_mien on public.%1$I for delete to authenticated
        using (exists (select 1 from public.profiles p
                        where p.id = %1$I.profile_id and p.user_id = (select auth.uid())))
    $p$, t);
    execute format('grant delete on public.%I to authenticated', t);
  end loop;
end $$;
