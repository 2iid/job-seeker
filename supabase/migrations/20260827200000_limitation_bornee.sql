-- =============================================================================
--  JOB-073 — deux constats de ma propre revue de sécurité (F24, F25).
--
--  Ils viennent tous les deux de la même erreur de raisonnement : j'ai traité
--  `consommer_jeton` comme si elle n'était appelée que par mon code. Elle est
--  `security definer` et accordée à `anon` — donc elle est appelable
--  DIRECTEMENT, avec les arguments que l'appelant veut.
-- =============================================================================

-- ── F25 — purger_limitation était exécutable par tout le monde ──
--
-- Postgres accorde EXECUTE à PUBLIC par défaut sur une fonction nouvelle. Je
-- l'avais révoqué pour `consommer_jeton` et pas pour celle-ci : une exception
-- qu'on applique à la main s'oublie à la deuxième occasion.
--
-- L'impact était faible — elle ne supprime que des lignes déjà expirées — mais
-- une fonction `security definer` atteignable par un visiteur anonyme sans que
-- ce soit voulu est exactement ce qu'une revue doit attraper.
revoke execute on function public.purger_limitation() from public;
grant execute on function public.purger_limitation() to service_role;

-- ── F24 — la table de limitation n'était pas elle-même bornée ──
--
-- Un appelant anonyme pouvait faire :
--     select consommer_jeton('clé-que-j-invente', 999999999, 1)
-- en boucle. Chaque appel INSÈRE une ligne dont `expire_le` est dans dix ans,
-- que `purger_limitation` ne réclamera jamais. Le limiteur de débit servait
-- donc à remplir le disque — sans même contourner une limite, ce qui est
-- l'ironie : la protection était le vecteur.
--
-- Trois bornes, et une seule idée : la fonction n'accepte que ce que le serveur
-- lui envoie réellement.
create or replace function public.consommer_jeton(
  p_cle text,
  p_fenetre_secondes integer,
  p_plafond integer
)
returns table (compte integer, fin_fenetre timestamptz, autorise boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_maintenant timestamptz := now();
  v_debut timestamptz;
  v_compte integer;
begin
  -- La clé est TOUJOURS un condensat HMAC-SHA-256 : 64 caractères hexadécimaux.
  -- Refuser tout le reste ne gêne aucun appelant légitime et supprime la
  -- possibilité d'insérer des lignes de forme arbitraire.
  if p_cle !~ '^[0-9a-f]{64}$' then
    raise exception 'clé de limitation invalide' using errcode = '22023';
  end if;
  -- Une fenêtre plus longue qu'un jour n'existe dans aucune politique, et c'est
  -- elle qui décide combien de temps une ligne survit à la purge.
  if p_fenetre_secondes < 1 or p_fenetre_secondes > 86400 then
    raise exception 'fenêtre de limitation hors bornes' using errcode = '22023';
  end if;
  if p_plafond < 1 or p_plafond > 100000 then
    raise exception 'plafond de limitation hors bornes' using errcode = '22023';
  end if;

  insert into public.limitation_debit (cle, fenetre_debut, compte, expire_le)
  values (p_cle, v_maintenant, 1, v_maintenant + make_interval(secs => p_fenetre_secondes))
  on conflict (cle) do update
    set
      fenetre_debut = case
        when public.limitation_debit.fenetre_debut + make_interval(secs => p_fenetre_secondes) <= v_maintenant
        then v_maintenant else public.limitation_debit.fenetre_debut end,
      compte = case
        when public.limitation_debit.fenetre_debut + make_interval(secs => p_fenetre_secondes) <= v_maintenant
        then 1 else public.limitation_debit.compte + 1 end,
      expire_le = case
        when public.limitation_debit.fenetre_debut + make_interval(secs => p_fenetre_secondes) <= v_maintenant
        then v_maintenant + make_interval(secs => p_fenetre_secondes)
        else public.limitation_debit.expire_le end
  returning public.limitation_debit.compte, public.limitation_debit.fenetre_debut
    into v_compte, v_debut;

  return query select
    v_compte,
    v_debut + make_interval(secs => p_fenetre_secondes),
    v_compte <= p_plafond;
end;
$$;

-- Une ligne inutile ne survit plus qu'une heure après sa fenêtre, quelle que
-- soit la façon dont elle a été créée.
comment on function public.consommer_jeton is
  'Atomique, et bornée : la clé doit être un condensat, la fenêtre au plus un jour. Sans ces bornes, un appelant anonyme se sert du limiteur pour remplir le disque.';
