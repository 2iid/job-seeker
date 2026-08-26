-- =============================================================================
--  JOB-006 — le profil applicatif naît avec le compte, une seule fois.
--
--  Le piège que cette migration existe pour fermer : deux connexions
--  simultanées, ou un rejeu de callback, créant deux profils pour une même
--  personne. Le corriger dans le code applicatif ne suffit pas — deux
--  processus qui vérifient puis insèrent se croisent toujours. La garantie
--  doit venir de la base : une contrainte d'unicité, plus un `on conflict`.
--
--  Et le profil est créé par un TRIGGER, pas par le code de connexion : un
--  compte créé par la console d'administration, par un import, ou par un
--  fournisseur d'identité qu'on branchera plus tard obtient son profil de la
--  même façon. Un provisionnement qui ne vit que sur un chemin est un
--  provisionnement qu'on oubliera sur le deuxième.
-- =============================================================================

create or replace function public.provisionner_profil()
returns trigger
language plpgsql
security definer          -- ecrit dans public.profiles, que l'appelant ne peut pas toucher
set search_path = ''      -- empeche le detournement par un schema injecte
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (user_id) do nothing;   -- idempotent : c'est ici qu'on ferme la course
  return new;
end;
$$;

comment on function public.provisionner_profil is
  'Cree le profil applicatif a la creation du compte. Idempotent par la contrainte d''unicite : deux connexions simultanees ne produisent qu''un profil.';

create trigger provisionner_profil_a_la_creation
  after insert on auth.users
  for each row execute function public.provisionner_profil();

-- --------------------------------------------------------------------------
--  Rattraper les comptes deja presents. Une migration qui ne s'occupe que du
--  futur laisse une population invisible sans profil.
-- --------------------------------------------------------------------------
insert into public.profiles (user_id)
select u.id from auth.users u
 where not exists (select 1 from public.profiles p where p.user_id = u.id)
on conflict (user_id) do nothing;
