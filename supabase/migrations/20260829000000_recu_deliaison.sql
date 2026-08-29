-- =============================================================================
--  Le schéma et le déclencheur se contredisaient.
--
--  `public.recus.opportunite_id` est déclaré `on delete set null` : l'intention
--  écrite est qu'un reçu SURVIVE à la disparition de l'opportunité. C'est la
--  bonne intention — REQ-013 dit que le reçu est la preuve de ce qui est parti
--  au nom de quelqu'un, et retirer une candidature de son tableau ne doit pas
--  détruire cette preuve.
--
--  Mais `on delete set null` est un UPDATE, et `recu_immuable()` refusait tout
--  UPDATE sans exception. Supprimer une opportunité portant un reçu était donc
--  IMPOSSIBLE, y compris sous le drapeau d'effacement de compte.
--
--  Deux mécanismes qui s'opposent, et l'un des deux avait tort. C'est le
--  déclencheur : il gardait « le contenu du reçu ne change pas » et refusait au
--  passage « le reçu se délie de ce qui n'existe plus ».
--
--  ── Le trouvé, et comment ──
--
--  Par le semoir de démonstration, en réessayant de semer sur une base déjà
--  semée. La suppression de compte, elle, fonctionnait : le reçu part par la
--  cascade du profil avant que la mise à null ne soit tentée. Le défaut ne se
--  voyait donc que sur le chemin qu'aucun test n'empruntait.
--
--  ── La forme de l'exception ──
--
--  La même qu'en JOB-057 pour l'anonymisation du journal d'audit : on autorise
--  EXACTEMENT une transformation et rien d'autre. Ici, passer `opportunite_id`
--  à NULL, à condition que toutes les autres colonnes soient inchangées. Un
--  `update` qui en profiterait pour toucher `cv_texte` reste refusé.
-- =============================================================================

create or replace function public.recu_immuable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.suppression_compte', true), 'false') = 'true' then
    -- REQ-014 : la personne reprend ses données. Ce n'est pas une correction.
    return old;
  end if;

  -- La DÉLIAISON, et elle seule : l'opportunité disparaît, le reçu reste.
  --
  -- La comparaison retire `opportunite_id` des DEUX côtés et exige que tout le
  -- reste soit identique. Énumérer les colonnes autorisées à ne pas bouger
  -- laisserait passer la prochaine colonne ajoutée à la table — et personne ne
  -- penserait à revenir ici.
  --
  -- `to_jsonb` plutôt que `hstore` : le second demanderait une extension, et
  -- ajouter une extension à une base pour comparer deux lignes est un prix
  -- disproportionné. jsonb est natif et fait exactement le même travail.
  if tg_op = 'UPDATE'
     and new.opportunite_id is null
     and old.opportunite_id is not null
     and (to_jsonb(new) - 'opportunite_id') = (to_jsonb(old) - 'opportunite_id') then
    return new;
  end if;

  raise exception
    'Un reçu ne se modifie pas (REQ-013) : il documente ce qui est parti au nom de quelqu un, et le retoucher effacerait la seule preuve qu il en avait. Sa suppression passe par le parcours d effacement de compte (REQ-014).'
    using errcode = '42501';
end;
$$;

comment on function public.recu_immuable is
  'UPDATE refusé, SAUF la déliaison d une opportunité supprimee (opportunite_id -> NULL, tout le reste inchange). DELETE possible uniquement sous app.suppression_compte.';
