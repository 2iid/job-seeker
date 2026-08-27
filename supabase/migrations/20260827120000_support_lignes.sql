-- =============================================================================
--  JOB-057 — la RLS dit QUELLES LIGNES, le privilège de colonne dit LESQUELLES.
--
--  La migration précédente accordait au support des privilèges de COLONNE
--  soigneusement choisis. Elle oubliait que ces tables portent
--  `force row level security` et aucune politique pour lui : le support avait
--  donc le droit de lire des colonnes de zéro ligne.
--
--  Les deux mécanismes répondent à deux questions différentes, et chacun sans
--  l'autre est une demi-garantie :
--
--    la RLS répond « de QUI puis-je voir les lignes ? » ;
--    le privilège de colonne répond « QUOI, dans ces lignes ? ».
--
--  Le support a besoin de voir les lignes de TOUT LE MONDE — c'est ce qui fait
--  de lui un support. Ce qu'il ne doit pas voir, ce sont certaines COLONNES, et
--  c'est là que la garantie de REQ-014 se joue. Confondre les deux mène à l'un
--  des deux échecs : un support qui ne peut rien faire, ou un support qui peut
--  tout lire.
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array['profiles', 'recus', 'opportunites', 'documents', 'mandats'] loop
    execute format($p$
      create policy %1$s_support on public.%1$I for select to support using (true)
    $p$, t);
  end loop;
end $$;

comment on policy profiles_support on public.profiles is
  'Le support voit les lignes de tout le monde — c est ce qui fait de lui un support. Ce qu il ne voit pas, ce sont des COLONNES, et c est là que la garantie de REQ-014 se joue.';
