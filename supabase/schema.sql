


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE SCHEMA IF NOT EXISTS "worker";


ALTER SCHEMA "worker" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."etat_candidature" AS ENUM (
    'detectee',
    'en_file',
    'escalade',
    'envoyee',
    'consultee',
    'entretien',
    'offre',
    'sans_reponse',
    'refusee',
    'echec_technique'
);


ALTER TYPE "public"."etat_candidature" OWNER TO "postgres";


CREATE TYPE "public"."genre_document" AS ENUM (
    'cv_source',
    'cv_adapte',
    'lettre',
    'autre'
);


ALTER TYPE "public"."genre_document" OWNER TO "postgres";


CREATE TYPE "worker"."job_state" AS ENUM (
    'queued',
    'running',
    'done',
    'failed'
);


ALTER TYPE "worker"."job_state" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provisionner_profil"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (user_id) do nothing;   -- idempotent : c'est ici qu'on ferme la course
  return new;
end;
$$;


ALTER FUNCTION "public"."provisionner_profil"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."provisionner_profil"() IS 'Cree le profil applicatif a la creation du compte. Idempotent par la contrainte d''unicite : deux connexions simultanees ne produisent qu''un profil.';



CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_updated_at"() IS 'Trigger BEFORE UPDATE : impose updated_at côté base. search_path vide pour empêcher le détournement par un schéma injecté.';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "worker"."jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "state" "worker"."job_state" DEFAULT 'queued'::"worker"."job_state" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 5 NOT NULL,
    "run_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lease_until" timestamp with time zone,
    "locked_by" "text",
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "jobs_max_attempts_check" CHECK ((("max_attempts" >= 1) AND ("max_attempts" <= 20))),
    CONSTRAINT "locked_coherent" CHECK ((("state" = 'running'::"worker"."job_state") = (("locked_by" IS NOT NULL) AND ("lease_until" IS NOT NULL))))
);


ALTER TABLE "worker"."jobs" OWNER TO "postgres";


COMMENT ON TABLE "worker"."jobs" IS 'File durable. Durabilité et idempotence sont des propriétés du cadre : un travail perdu est une candidature qui ne part pas, un travail rejoué est une candidature envoyée deux fois.';



CREATE OR REPLACE FUNCTION "worker"."claim_job"("p_worker" "text", "p_lease_seconds" integer DEFAULT 60, "p_kinds" "text"[] DEFAULT NULL::"text"[]) RETURNS "worker"."jobs"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  update worker.jobs j
     set state = 'running',
         locked_by = p_worker,
         lease_until = now() + make_interval(secs => p_lease_seconds),
         attempts = j.attempts + 1
   where j.id = (
     select c.id from worker.jobs c
      -- Les parenthèses extérieures ne sont pas décoratives : `and` lie plus
      -- fort que `or`, et sans elles le filtre par `kind` ne s'appliquerait
      -- qu'à la branche de reprise. Un worker spécialisé aurait alors réclamé
      -- des travaux qui ne le concernent pas.
      where ((c.state = 'queued' and c.run_at <= now())
             -- Reprise : un bail expiré appartient de nouveau à la file.
             or (c.state = 'running' and c.lease_until < now()))
        and (p_kinds is null or c.kind = any (p_kinds))
      order by c.run_at
      for update skip locked
      limit 1
   )
  returning j.*;
$$;


ALTER FUNCTION "worker"."claim_job"("p_worker" "text", "p_lease_seconds" integer, "p_kinds" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "worker"."claim_job"("p_worker" "text", "p_lease_seconds" integer, "p_kinds" "text"[]) IS 'Réclame un travail avec un bail. Reprend aussi les travaux dont le bail a expiré — un worker tué au milieu d''un travail ne le perd pas.';



CREATE OR REPLACE FUNCTION "worker"."maj_suivi_par"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if tg_op = 'INSERT' then
    insert into worker.employeurs (nom_canonique, nom_affiche)
    values (new.nom_canonique, new.nom_canonique)
    on conflict (nom_canonique) do nothing;
    update worker.employeurs set suivi_par = suivi_par + 1 where nom_canonique = new.nom_canonique;
  elsif tg_op = 'DELETE' then
    update worker.employeurs set suivi_par = greatest(0, suivi_par - 1) where nom_canonique = old.nom_canonique;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "worker"."maj_suivi_par"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."candidatures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "employeur" "text" NOT NULL,
    "intitule" "text" NOT NULL,
    "url_offre" "text" NOT NULL,
    "source" "text" NOT NULL,
    "palier" character(1) NOT NULL,
    "offre_publiee_le" timestamp with time zone,
    "score" smallint,
    "etat" "public"."etat_candidature" DEFAULT 'detectee'::"public"."etat_candidature" NOT NULL,
    "etat_depuis" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "candidatures_palier_check" CHECK (("palier" = ANY (ARRAY['a'::"bpchar", 'b'::"bpchar", 'c'::"bpchar"]))),
    CONSTRAINT "candidatures_score_check" CHECK ((("score" >= 0) AND ("score" <= 100)))
);

ALTER TABLE ONLY "public"."candidatures" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."candidatures" OWNER TO "postgres";


COMMENT ON COLUMN "public"."candidatures"."etat_depuis" IS 'Depuis quand la candidature est dans cet etat. « Envoyee » ne dit rien ; « envoyee depuis 3 jours » dit s il faut relancer.';



CREATE TABLE IF NOT EXISTS "public"."competences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "libelle" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."competences" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."competences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."criteres_recherche" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "intitules" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "seniorite" "text",
    "presence" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "zones" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "salaire_min_unites_mineures" bigint,
    "salaire_devise" "text",
    "secteurs" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "langues" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "mots_redhibitoires" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."criteres_recherche" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."criteres_recherche" OWNER TO "postgres";


COMMENT ON TABLE "public"."criteres_recherche" IS 'Insertion seule et versionne : REQ-002 exige d expliquer a posteriori pourquoi une offre a matche a un instant donne. Un UPDATE effacerait cette explication.';



CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "genre" "public"."genre_document" NOT NULL,
    "nom_origine" "text",
    "chemin_stockage" "text" NOT NULL,
    "type_mime" "text" NOT NULL,
    "taille_octets" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "documents_taille_octets_check" CHECK ((("taille_octets" > 0) AND ("taille_octets" <= ((10 * 1024) * 1024))))
);

ALTER TABLE ONLY "public"."documents" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" OWNER TO "postgres";


COMMENT ON COLUMN "public"."documents"."taille_octets" IS 'Plafond a 10 Mo, aligne sur REQ-001 : au-dela, l import est refuse avec un message qui dit quoi faire.';



CREATE TABLE IF NOT EXISTS "public"."employeurs_exclus" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "employeur_canonique" "text" NOT NULL,
    "motif" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."employeurs_exclus" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."employeurs_exclus" OWNER TO "postgres";


COMMENT ON TABLE "public"."employeurs_exclus" IS 'Une offre d un employeur exclu n est JAMAIS presentee, jamais scoree, jamais soumise (REQ-002).';



CREATE TABLE IF NOT EXISTS "public"."employeurs_suivis" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "nom_canonique" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."employeurs_suivis" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."employeurs_suivis" OWNER TO "postgres";


COMMENT ON TABLE "public"."employeurs_suivis" IS 'Savoir quelles entreprises quelqu un surveille en dit long sur sa recherche : RLS obligatoire.';



CREATE TABLE IF NOT EXISTS "public"."experiences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "employeur" "text" NOT NULL,
    "intitule" "text" NOT NULL,
    "lieu" "text",
    "debut" "date" NOT NULL,
    "fin" "date",
    "description" "text",
    "ordre" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fin_apres_debut" CHECK ((("fin" IS NULL) OR ("fin" >= "debut")))
);

ALTER TABLE ONLY "public"."experiences" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."experiences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."formations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "etablissement" "text" NOT NULL,
    "intitule" "text" NOT NULL,
    "obtenue_en" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "formations_obtenue_en_check" CHECK ((("obtenue_en" >= 1950) AND ("obtenue_en" <= 2100)))
);

ALTER TABLE ONLY "public"."formations" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."formations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "titre_accroche" "text",
    "locale" "text" DEFAULT 'fr'::"text" NOT NULL,
    "fuseau" "text" DEFAULT 'Europe/Paris'::"text" NOT NULL,
    "autorisation_travail" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "profiles_locale_check" CHECK (("locale" = ANY (ARRAY['fr'::"text", 'en'::"text"])))
);

ALTER TABLE ONLY "public"."profiles" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'Un profil par compte. Porte de la donnée personnelle : RLS obligatoire (OBL-1, REQ-014).';



COMMENT ON COLUMN "public"."profiles"."fuseau" IS 'Fuseau du candidat. Les plages horaires de l agent (REQ-009) et l age affiche d une offre (REQ-004) s y expriment.';



COMMENT ON COLUMN "public"."profiles"."autorisation_travail" IS 'Codes pays ou la personne peut travailler sans demarche. Critere REDHIBITOIRE (REQ-005) : une offre hors de cette liste ne part jamais en automatique.';



CREATE TABLE IF NOT EXISTS "worker"."employeurs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nom_canonique" "text" NOT NULL,
    "nom_affiche" "text" NOT NULL,
    "site_carriere" "text",
    "ats_fournisseur" "text",
    "ats_slug" "text",
    "palier" character(1) DEFAULT 'b'::"bpchar" NOT NULL,
    "suivi_par" integer DEFAULT 0 NOT NULL,
    "dernier_releve" timestamp with time zone,
    "dernier_etat" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "employeurs_ats_fournisseur_check" CHECK (("ats_fournisseur" = ANY (ARRAY['greenhouse'::"text", 'ashby'::"text", 'lever'::"text", 'workable'::"text", 'smartrecruiters'::"text"]))),
    CONSTRAINT "employeurs_palier_check" CHECK (("palier" = ANY (ARRAY['a'::"bpchar", 'b'::"bpchar", 'c'::"bpchar"]))),
    CONSTRAINT "employeurs_suivi_par_check" CHECK (("suivi_par" >= 0)),
    CONSTRAINT "palier_a_exige_un_board" CHECK ((("palier" <> 'a'::"bpchar") OR (("ats_fournisseur" IS NOT NULL) AND ("ats_slug" IS NOT NULL))))
);


ALTER TABLE "worker"."employeurs" OWNER TO "postgres";


COMMENT ON TABLE "worker"."employeurs" IS 'Registre PARTAGE. Ne contient que des donnees publiques d entreprise : aucune colonne n y designe un utilisateur.';



ALTER TABLE ONLY "public"."candidatures"
    ADD CONSTRAINT "candidatures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."candidatures"
    ADD CONSTRAINT "candidatures_profile_id_url_offre_key" UNIQUE ("profile_id", "url_offre");



COMMENT ON CONSTRAINT "candidatures_profile_id_url_offre_key" ON "public"."candidatures" IS 'Anti-doublon : la meme offre ne peut pas produire deux candidatures pour la meme personne (REQ-011).';



ALTER TABLE ONLY "public"."competences"
    ADD CONSTRAINT "competences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competences"
    ADD CONSTRAINT "competences_profile_id_libelle_key" UNIQUE ("profile_id", "libelle");



ALTER TABLE ONLY "public"."criteres_recherche"
    ADD CONSTRAINT "criteres_recherche_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."criteres_recherche"
    ADD CONSTRAINT "criteres_recherche_profile_id_version_key" UNIQUE ("profile_id", "version");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employeurs_exclus"
    ADD CONSTRAINT "employeurs_exclus_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employeurs_exclus"
    ADD CONSTRAINT "employeurs_exclus_profile_id_employeur_canonique_key" UNIQUE ("profile_id", "employeur_canonique");



ALTER TABLE ONLY "public"."employeurs_suivis"
    ADD CONSTRAINT "employeurs_suivis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employeurs_suivis"
    ADD CONSTRAINT "employeurs_suivis_profile_id_nom_canonique_key" UNIQUE ("profile_id", "nom_canonique");



ALTER TABLE ONLY "public"."experiences"
    ADD CONSTRAINT "experiences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."formations"
    ADD CONSTRAINT "formations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "worker"."employeurs"
    ADD CONSTRAINT "employeurs_nom_canonique_key" UNIQUE ("nom_canonique");



ALTER TABLE ONLY "worker"."employeurs"
    ADD CONSTRAINT "employeurs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "worker"."jobs"
    ADD CONSTRAINT "jobs_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "worker"."jobs"
    ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");



CREATE INDEX "employeurs_a_relever" ON "worker"."employeurs" USING "btree" ("palier", "dernier_releve" NULLS FIRST, "suivi_par" DESC);



CREATE INDEX "jobs_a_reclamer" ON "worker"."jobs" USING "btree" ("run_at") WHERE ("state" = 'queued'::"worker"."job_state");



CREATE INDEX "jobs_baux_expires" ON "worker"."jobs" USING "btree" ("lease_until") WHERE ("state" = 'running'::"worker"."job_state");



CREATE INDEX "jobs_kind_state" ON "worker"."jobs" USING "btree" ("kind", "state");



CREATE OR REPLACE TRIGGER "candidatures_set_updated_at" BEFORE UPDATE ON "public"."candidatures" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "competences_set_updated_at" BEFORE UPDATE ON "public"."competences" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "documents_set_updated_at" BEFORE UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "employeurs_exclus_set_updated_at" BEFORE UPDATE ON "public"."employeurs_exclus" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "employeurs_suivis_set_updated_at" BEFORE UPDATE ON "public"."employeurs_suivis" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "experiences_set_updated_at" BEFORE UPDATE ON "public"."experiences" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "formations_set_updated_at" BEFORE UPDATE ON "public"."formations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "suivis_maj_compteur" AFTER INSERT OR DELETE ON "public"."employeurs_suivis" FOR EACH ROW EXECUTE FUNCTION "worker"."maj_suivi_par"();



CREATE OR REPLACE TRIGGER "employeurs_set_updated_at" BEFORE UPDATE ON "worker"."employeurs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "jobs_set_updated_at" BEFORE UPDATE ON "worker"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."candidatures"
    ADD CONSTRAINT "candidatures_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competences"
    ADD CONSTRAINT "competences_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."criteres_recherche"
    ADD CONSTRAINT "criteres_recherche_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employeurs_exclus"
    ADD CONSTRAINT "employeurs_exclus_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employeurs_suivis"
    ADD CONSTRAINT "employeurs_suivis_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."experiences"
    ADD CONSTRAINT "experiences_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."formations"
    ADD CONSTRAINT "formations_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."candidatures" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "candidatures_insert_mien" ON "public"."candidatures" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "candidatures"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "candidatures_select_mien" ON "public"."candidatures" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "candidatures"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "candidatures_update_mien" ON "public"."candidatures" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "candidatures"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "candidatures"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."competences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "competences_insert_mien" ON "public"."competences" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "competences"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "competences_select_mien" ON "public"."competences" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "competences"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "competences_update_mien" ON "public"."competences" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "competences"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "competences"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."criteres_recherche" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "criteres_recherche_insert_mien" ON "public"."criteres_recherche" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "criteres_recherche"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "criteres_recherche_select_mien" ON "public"."criteres_recherche" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "criteres_recherche"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "documents_insert_mien" ON "public"."documents" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "documents"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "documents_select_mien" ON "public"."documents" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "documents"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "documents_update_mien" ON "public"."documents" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "documents"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "documents"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."employeurs_exclus" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employeurs_exclus_insert_mien" ON "public"."employeurs_exclus" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "employeurs_exclus"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "employeurs_exclus_select_mien" ON "public"."employeurs_exclus" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "employeurs_exclus"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "employeurs_exclus_update_mien" ON "public"."employeurs_exclus" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "employeurs_exclus"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "employeurs_exclus"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."employeurs_suivis" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employeurs_suivis_insert_mien" ON "public"."employeurs_suivis" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "employeurs_suivis"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "employeurs_suivis_select_mien" ON "public"."employeurs_suivis" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "employeurs_suivis"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "employeurs_suivis_update_mien" ON "public"."employeurs_suivis" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "employeurs_suivis"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "employeurs_suivis"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."experiences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "experiences_insert_mien" ON "public"."experiences" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "experiences"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "experiences_select_mien" ON "public"."experiences" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "experiences"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "experiences_update_mien" ON "public"."experiences" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "experiences"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "experiences"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."formations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "formations_insert_mien" ON "public"."formations" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "formations"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "formations_select_mien" ON "public"."formations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "formations"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "formations_update_mien" ON "public"."formations" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "formations"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "formations"."profile_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."candidatures" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."candidatures" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."competences" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."competences" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."criteres_recherche" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."criteres_recherche" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."documents" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."documents" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."employeurs_exclus" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."employeurs_exclus" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."employeurs_suivis" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."employeurs_suivis" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."experiences" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."experiences" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."formations" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."formations" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";































