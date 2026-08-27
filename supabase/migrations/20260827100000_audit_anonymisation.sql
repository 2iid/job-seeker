-- =============================================================================
--  JOB-057 — ce qu'une suppression de compte fait au journal d'audit.
--
--  La première version portait `profile_id ... on delete cascade` et un
--  déclencheur d'immuabilité absolu. Les deux ensemble rendaient la suppression
--  d'un compte impossible — le même conflit que les reçus, mais sa résolution
--  n'est PAS la même, et c'est le point de cette migration.
--
--  ── Un reçu se supprime, un journal d'audit s'ANONYMISE ──
--
--  Un reçu appartient à la personne : il documente ce qui est parti EN SON NOM,
--  et le droit à l'effacement de REQ-014 le couvre entièrement.
--
--  Un journal d'audit ne lui appartient pas de la même façon. Il documente
--  QUI A ACCÉDÉ À QUOI — y compris les accès du support. L'effacer avec le
--  compte reviendrait à effacer la trace des accès d'AUTRES personnes à ses
--  données, et c'est précisément la trace qu'un audit existe pour garder. Un
--  support qui saurait qu'une suppression de compte efface ses propres accès
--  aurait un moyen très simple de les faire disparaître.
--
--  REQ-014 prévoit ce cas : « avec confirmation de ce qui subsiste en
--  obligation légale ET POURQUOI ». Voici le pourquoi.
--
--  La ligne reste, son LIEN avec la personne part. Elle ne dit plus « le
--  support a lu le dossier d'Amina Diallo » ; elle dit « le support a lu un
--  dossier, ce jour-là, sur ce ticket ». La responsabilité reste vérifiable,
--  la personne n'est plus dedans.
-- =============================================================================

alter table audit.acces drop constraint acces_profile_id_fkey;
alter table audit.acces
  add constraint acces_profile_id_fkey
  foreign key (profile_id) references public.profiles (id) on delete set null;

comment on column audit.acces.profile_id is
  'Mis à NULL quand le compte est supprimé, jamais effacé avec lui : la ligne documente qui a accédé, y compris le support, et effacer cette trace donnerait un moyen très simple de la faire disparaître.';

-- --------------------------------------------------------------------------
--  Le déclencheur laisse passer l'anonymisation, et RIEN d'autre.
-- --------------------------------------------------------------------------
create or replace function audit.immuable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.profile_id is null
     and old.profile_id is not null
     -- Toutes les autres colonnes doivent être identiques. On compare les
     -- lignes entières en neutralisant `profile_id` : sans ça, une « suppression
     -- de compte » pourrait réécrire l'action au passage, et l'anonymisation
     -- deviendrait une porte pour corriger un journal.
     and to_jsonb(new) - 'profile_id' = to_jsonb(old) - 'profile_id' then
    return new;
  end if;

  raise exception
    'Le journal d audit est en insertion seule (REQ-014). Seule l anonymisation liée à une suppression de compte est permise, et elle ne peut rien changer d autre.'
    using errcode = '42501';
end;
$$;

comment on function audit.immuable is
  'Laisse passer UNIQUEMENT la mise à NULL de profile_id, toutes autres colonnes identiques. Sans cette égalité stricte, l anonymisation deviendrait une porte pour corriger un journal.';
