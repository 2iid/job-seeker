-- =============================================================================
--  JOB-054 — l'immuabilité d'un reçu s'arrête au droit à l'effacement.
--
--  La première version du déclencheur refusait TOUTE suppression, à tout le
--  monde. C'était trop, et c'est un test de nettoyage qui l'a révélé : la
--  suppression d'un compte casse en cascade sur `recus`, donc REQ-014 —
--  « emporter ou effacer mes données quand je veux » — devenait impossible.
--
--  Deux exigences se rencontrent ici, et elles ne se contredisent pas une fois
--  qu'on nomme précisément ce que chacune protège :
--
--    REQ-013 protège de la CORRECTION SILENCIEUSE. Un reçu documente ce qui
--    est parti au nom de quelqu'un ; le retoucher après coup effacerait la
--    seule preuve qu'il en avait. Ça, c'est interdit à tout le monde, pour
--    toujours.
--
--    REQ-014 protège le DROIT D'EFFACER. Ce n'est pas une correction : c'est
--    la personne qui reprend ses données, en bloc, en connaissance de cause —
--    et le parcours de suppression doit d'abord ARRÊTER l'automatisation.
--
--  L'UPDATE reste donc refusé sans exception. La SUPPRESSION devient possible
--  uniquement sous un drapeau de session que seul le parcours de suppression
--  pose. Le drapeau n'est pas une porte dérobée : il est explicite, il ne
--  survit pas à la transaction, et il rend l'intention lisible dans le code
--  qui l'emploie.
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

  raise exception
    'Un reçu ne se modifie pas (REQ-013) : il documente ce qui est parti au nom de quelqu un, et le retoucher effacerait la seule preuve qu il en avait. Sa suppression passe par le parcours d effacement de compte (REQ-014).'
    using errcode = '42501';
end;
$$;

comment on function public.recu_immuable is
  'UPDATE refusé sans exception. DELETE possible uniquement sous app.suppression_compte, que seul le parcours d effacement pose — un drapeau explicite, qui ne survit pas à la transaction.';
