-- =============================================================================
--  JOB-031 — le bucket des documents, et les politiques qui le gardent.
--
--  Ceci ferme le constat F14 de la revue de sécurité. JOB-030 avait cloisonné
--  la table `documents` ligne par ligne, et c'était insuffisant : cette table
--  ne contient qu'un CHEMIN. Une ligne parfaitement cloisonnée qui pointe vers
--  un fichier lisible par tout le monde ne protège rien — c'est le FICHIER qui
--  porte le CV, l'adresse, le parcours et le numéro de téléphone.
--
--  Avant cette migration, `storage.objects` ne portait AUCUNE politique. Ce
--  n'est pas « le défaut est sûr » : sur un bucket public, l'absence de
--  politique se lit « tout le monde », et le mode public s'active en un clic
--  dans l'interface. La sûreté vient de ce qui est écrit ici, pas d'un défaut.
--
--  Trois décisions qui ne sont pas des détails :
--
--  1. Le premier segment du chemin est `auth.uid()`, PAS l'identifiant de
--     profil. La politique devient une comparaison de chaînes qui se relit en
--     une ligne — sans jointure vers `profiles`, donc sans dépendre de la RLS
--     d'une autre table ni de l'existence d'une ligne de profil. Une garde de
--     fichier qui a besoin d'une jointure pour savoir dire non est une garde
--     qu'on peut casser depuis ailleurs. La forme du chemin est produite par
--     `cheminStockage()` et verrouillée par son test : les deux se relisent
--     ensemble, ou pas du tout.
--
--  2. Le propriétaire PEUT supprimer son fichier — alors qu'aucune table du
--     modèle ne donne DELETE à un rôle client. La divergence est voulue :
--     l'interdiction de JOB-030 protège la garantie de REQ-014 (arrêter
--     l'automatisation avant d'effacer), et un fichier de CV n'automatise
--     rien. Refuser ici voudrait dire qu'une personne ne peut pas retirer un
--     document personnel qu'elle a envoyée par erreur — ce serait un défaut de
--     confidentialité, pas une protection.
--
--  3. Le bucket est privé ET plafonné ET restreint en types. Les trois font le
--     même travail à trois endroits différents : le code refuse, le bucket
--     refuse, la colonne `taille_octets` refuse. Le contrôle applicatif de
--     `examiner()` reste le contrôle utile — c'est lui qui produit un message
--     qui dit quoi faire — mais il n'est pas le seul.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  10485760, -- 10 Mo, la même borne que REQ-001 et que documents.taille_octets
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public             = false,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- `storage.objects` porte déjà la RLS ; ce qui lui manquait, ce sont les
-- politiques. Sans une seule politique, le refus par défaut n'était pas une
-- décision, seulement un vide — et un vide bascule en « tout le monde » dès
-- que le bucket passe en public, ce qui est un clic dans l'interface.
--
-- Poser une politique demande d'être propriétaire de la table, donc d'être
-- membre de `supabase_storage_admin`. C'est le cas sur un projet hébergé ; ce
-- ne l'est pas sur la pile locale du CLI. On le dit ICI, avec la commande à
-- lancer, plutôt que de laisser Postgres répondre « must be owner of table
-- objects » — un message qui envoie chercher un bug dans un SQL qui est bon.
do $$
begin
  if not pg_has_role(current_user, 'supabase_storage_admin', 'member') then
    raise exception
      'Le role % ne peut pas poser de politique sur storage.objects. Lancez d abord : bash scripts/db-bootstrap.sh',
      current_user;
  end if;
end $$;

set local role supabase_storage_admin;

drop policy if exists "documents — lire les siens"      on storage.objects;
drop policy if exists "documents — deposer les siens"   on storage.objects;
drop policy if exists "documents — remplacer les siens" on storage.objects;
drop policy if exists "documents — supprimer les siens" on storage.objects;

-- Le prédicat est écrit une fois par opération plutôt que factorisé dans une
-- fonction : une politique de stockage doit pouvoir se lire seule, et une
-- indirection de plus est une occasion de plus de se tromper d'opération.
create policy "documents — lire les siens"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "documents — deposer les siens"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- USING et WITH CHECK, tous les deux. Sans WITH CHECK, un UPDATE peut RENOMMER
-- un objet qu'on possède vers le dossier de quelqu'un d'autre : on a le droit
-- de toucher la ligne de départ, et plus rien ne contrôle l'arrivée.
create policy "documents — remplacer les siens"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "documents — supprimer les siens"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Aucune politique pour `anon`, et c'est le point : un visiteur non authentifié
-- n'a aucune opération sur ce bucket, y compris en connaissant le chemin exact.

reset role;
