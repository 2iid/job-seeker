-- =============================================================================
--  JOB-049 / REQ-011 / ADR-0003 — le dossier prêt à envoyer.
--
--  ── Ce que le schéma disait encore, et qui n'est plus vrai ──
--
--  `statut_opportunite` allait de 'en-file' à 'envoyee'. Il n'y avait rien
--  entre les deux, parce qu'au moment où il a été écrit, « terminé » voulait
--  dire « envoyé ». Depuis l'ADR-0003, l'issue NOMINALE sur un canal ATS est
--  « préparée, à vous de cliquer » : le livrable principal du produit n'avait
--  pas d'état. Un tableau de bord l'aurait affiché comme « en file », donc
--  comme quelque chose qui traîne, alors que c'est quelque chose qui attend la
--  personne.
-- =============================================================================

alter type public.statut_opportunite add value if not exists 'prete-a-envoyer' before 'envoyee';

-- 'incertaine' n'est PAS 'echec-technique'. Une panne technique dit « rien
-- n'est parti, je réessaie ». Une issue incertaine dit « je ne sais pas si
-- c'est parti, et je ne réessaierai pas ». Les confondre ferait disparaître
-- la seule information qui compte pour la personne : faut-il vérifier ?
alter type public.statut_opportunite add value if not exists 'incertaine' after 'echec-technique';
