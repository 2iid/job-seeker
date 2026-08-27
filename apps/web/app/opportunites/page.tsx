import { redirect } from 'next/navigation'
import { creerTraducteur } from '@job-seeker/i18n'
import { evaluer, expliquerFluxVide } from '@job-seeker/couverture'
import { Erreur, TropDeDonnees, Vide, type TierName } from '@job-seeker/ui'
import { clientServeur, utilisateurCourant } from '@/lib/supabase/server'
import { LigneOffre, type EntreeFlux } from './LigneOffre'
import { BarreFiltres } from './BarreFiltres'
import { compte, ecrireFiltres, estVide, lireFiltres, motifLike } from './filtres.ts'
import { observations } from './couverture.ts'

export const metadata = { title: 'Opportunités — Cabine' }
export const dynamic = 'force-dynamic'

/**
 * JOB-038 — le flux, et ses quatre états.
 *
 * Le plafond de 200 n'est pas une pagination déguisée : le système exige que le
 * flux reste utilisable à 500 entrées sur 390 px, et l'état « afflux » du
 * design dit ce qui est montré, ce qui est écarté et pourquoi — « le reste est
 * consultable, pas caché ».
 *
 * Le tri met le PLUS RÉCENT en premier, pas le mieux noté. C'est un choix :
 * un flux trié par score se lit comme un classement, et la promesse de ce
 * produit est la primeur. Le score sert à filtrer, pas à ordonner.
 */
const PLAFOND = 200

type LigneOpportunite = {
  id: string
  score: number | null
  redhibitoires: unknown[]
  offres: {
    titre: string
    employeur_affiche: string
    palier: TierName
    vue_le: string
    lieu: string | null
    source: string
    salaire_min_unites_mineures: string | null
    salaire_max_unites_mineures: string | null
    salaire_devise: string | null
    salaire_periode: string | null
  } | null
}

const minutesDepuis = (iso: string): number =>
  Math.max(0, (Date.now() - new Date(iso).getTime()) / 60_000)

export default async function Opportunites({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const utilisateur = await utilisateurCourant()
  if (utilisateur === null) redirect('/connexion?next=%2Fopportunites')

  const params = await searchParams
  const filtres = lireFiltres(params)
  const supabase = await clientServeur()

  const [profilRes, critRes] = await Promise.all([
    supabase.from('profiles').select('id, locale, autorisation_travail').single(),
    supabase
      .from('criteres_recherche')
      .select('intitules, zones, presence')
      .order('version', { ascending: false })
      .limit(1),
  ])
  if (profilRes.data === null) redirect('/connexion?next=%2Fopportunites')
  const t = creerTraducteur(profilRes.data.locale === 'en' ? 'en' : 'fr')

  let requete = supabase
    .from('opportunites')
    .select(
      'id, score, redhibitoires, offres!inner(titre, employeur_affiche, palier, vue_le, lieu, source, ' +
        'salaire_min_unites_mineures, salaire_max_unites_mineures, salaire_devise, salaire_periode)',
      { count: 'exact' },
    )
    // REQ-002 : une offre exclue n'est jamais présentée. Le filtre est ici et
    // non dans l'affichage — une ligne qui traverse la requête finit un jour
    // par apparaître quelque part.
    .eq('exclue', false)
    .order('vue_le', { referencedTable: 'offres', ascending: false })
    .limit(PLAFOND)

  if (filtres.paliers.length > 0) requete = requete.in('offres.palier', filtres.paliers)
  if (filtres.statuts.length > 0) requete = requete.in('statut', filtres.statuts)
  if (filtres.scoreMin !== null) requete = requete.gte('score', filtres.scoreMin)
  if (filtres.recherche !== '') {
    // `ilike` sur le titre : la recherche plein texte viendra avec un index
    // dédié, et l'annoncer plein texte aujourd'hui serait promettre autre
    // chose que ce qu'elle fait.
    //
    // Les jokers de la SAISIE sont neutralisés : « % » demanderait à la base
    // de balayer toute la table, depuis l'URL et sans rien exploiter.
    requete = requete.ilike('offres.titre', `%${motifLike(filtres.recherche)}%`)
  }

  const { data, error, count } = await requete

  const lignes = (data ?? []) as unknown as LigneOpportunite[]
  const entrees: EntreeFlux[] = lignes
    .filter((l): l is LigneOpportunite & { offres: NonNullable<LigneOpportunite['offres']> } => l.offres !== null)
    .map((l) => ({
      id: l.id,
      titre: l.offres.titre,
      employeur: l.offres.employeur_affiche,
      palier: l.offres.palier,
      // L'âge vient de NOTRE relevé, jamais de la date que la source affirme.
      minutesDepuisReleve: minutesDepuis(l.offres.vue_le),
      score: l.score,
      bloquants: Array.isArray(l.redhibitoires) ? l.redhibitoires.length : 0,
      lieu: l.offres.lieu,
      source: l.offres.source,
      salaire:
        l.offres.salaire_devise === null
          ? null
          : {
              min: l.offres.salaire_min_unites_mineures === null ? null : Number(l.offres.salaire_min_unites_mineures),
              max: l.offres.salaire_max_unites_mineures === null ? null : Number(l.offres.salaire_max_unites_mineures),
              devise: l.offres.salaire_devise,
              periode: (l.offres.salaire_periode as EntreeFlux['salaire'] extends null ? never : 'an') ?? null,
            },
    }))
    .filter((e) => !filtres.seulementSansBloquant || e.bloquants === 0)

  const criteres = critRes.data?.[0] ?? null
  const aDesCriteres = (criteres?.intitules ?? []).length > 0

  // JOB-090 — « aucune offre ne correspond » et « aucune source ne couvre ce
  // que vous cherchez » sont deux phrases différentes, et la personne n'a
  // aucun moyen de faire la différence si on ne la lui dit pas. La première la
  // renvoie à son profil ; la seconde nous renvoie à notre travail.
  const cible = {
    pays: (profilRes.data.autorisation_travail as string[] | null)?.[0] ?? null,
    accepteDistanciel: (criteres?.presence ?? []).includes('distanciel'),
  }
  const verdictCouverture = entrees.length === 0 ? evaluer(await observations(), cible) : null

  return (
    <main
      style={{
        padding: 'var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        maxWidth: '860px',
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 600, letterSpacing: '-0.02em' }}>
          Opportunités
        </h1>
        <p style={{ margin: 'var(--space-2) 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
          Le plus récent d’abord. L’âge est celui de <strong style={{ fontWeight: 600 }}>mon relevé</strong>,
          pas de ce que la source affirme.
        </p>
      </div>

      <BarreFiltres filtres={filtres} nombre={compte(filtres)} />

      {error !== null ? (
        // REQ-003 dans sa forme la plus littérale : ce qui a échoué, depuis
        // quand, et ce que ça N'IMPLIQUE PAS.
        <Erreur
          quoi="Je n’ai pas pu lire vos opportunités."
          depuis="à l’instant"
          ceQueCaNImpliquePas="Ce n’est pas une absence d’offres : je n’ai pas su regarder. Vos candidatures en cours ne sont pas affectées."
          action={{ libelle: 'Réessayer', href: `/opportunites${ecrireFiltres(filtres)}` }}
        />
      ) : entrees.length === 0 ? (
        estVide(filtres) ? (
          <Vide
            titre={
              !aDesCriteres
                ? 'Je ne sais pas encore ce que je cherche pour vous.'
                : verdictCouverture?.aucuneSourceLocale === true
                  ? 'Je n’ai pas de source pour ce marché.'
                  : 'Je n’ai encore rien trouvé qui vous corresponde.'
            }
            explication={
              !aDesCriteres
                ? 'Donnez-moi un intitulé de poste et une zone, et je commence à chercher. Vous pourrez tout changer ensuite.'
                : verdictCouverture !== null
                  ? expliquerFluxVide(verdictCouverture, cible)
                  : 'Je relève les sources en continu. Dès qu’une offre correspond à vos critères, elle apparaît ici.'
            }
            action={
              verdictCouverture?.aucuneSourceLocale === true
                ? { libelle: 'Ouvrir le distanciel', href: '/criteres' }
                : { libelle: 'Revoir mes critères', href: '/criteres' }
            }
          />
        ) : (
          <Vide
            titre="Aucune offre ne passe ces filtres."
            explication="Les offres sont là, ce sont vos filtres qui les écartent. Retirez-en un pour voir ce qu’il masquait."
            action={{ libelle: 'Retirer tous les filtres', href: '/opportunites' }}
          />
        )
      ) : (
        <>
          {(count ?? 0) > entrees.length && (
            <TropDeDonnees
              total={count ?? 0}
              montres={entrees.length}
              critere="plus récentes"
              action={{ libelle: 'Affiner par score' }}
            />
          )}
          <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {entrees.map((e) => (
              <LigneOffre key={e.id} e={e} t={t} taux={null} />
            ))}
          </ol>
        </>
      )}
    </main>
  )
}
