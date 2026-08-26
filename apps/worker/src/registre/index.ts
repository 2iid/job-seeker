import pg from 'pg'
import { canoniserEmployeur } from '../sources/dedupe.ts'
import { detecterBoard, type Board } from '../sources/ats/decouverte.ts'

/**
 * JOB-025 / JOB-026 — le registre partagé, et la promotion vers le palier A.
 *
 * « La découverte alimente la surveillance » (ADR-0002) : quand une offre
 * remonte du palier B, on tente de résoudre le board de son employeur. En cas
 * de succès, l'entreprise MONTE au palier A et sa prochaine offre sera vue en
 * quelques minutes au lieu d'une heure.
 *
 * Le produit devient donc plus rapide à mesure qu'il est utilisé, sans que
 * personne n'intervienne. C'est le seul mécanisme du système qui s'améliore
 * tout seul, et c'est pour cela qu'il mérite d'être écrit à part.
 */

export type EmployeurRegistre = {
  readonly nomCanonique: string
  readonly nomAffiche: string
  readonly palier: 'a' | 'b' | 'c'
  readonly board: Board | null
  readonly suiviPar: number
  readonly dernierReleve: Date | null
}

type Ligne = {
  nom_canonique: string
  nom_affiche: string
  palier: 'a' | 'b' | 'c'
  ats_fournisseur: Board['fournisseur'] | null
  ats_slug: string | null
  suivi_par: number
  dernier_releve: Date | null
}

const versEmployeur = (l: Ligne): EmployeurRegistre => ({
  nomCanonique: l.nom_canonique,
  nomAffiche: l.nom_affiche,
  palier: l.palier,
  board: l.ats_fournisseur !== null && l.ats_slug !== null
    ? { fournisseur: l.ats_fournisseur, slug: l.ats_slug }
    : null,
  suiviPar: l.suivi_par,
  dernierReleve: l.dernier_releve,
})

/** Enregistre un employeur croisé. Idempotent : le registre est partagé. */
export async function enregistrer(
  db: pg.Client | pg.Pool,
  nomAffiche: string,
  siteCarriere?: string,
): Promise<EmployeurRegistre> {
  const canonique = canoniserEmployeur(nomAffiche)
  const { rows } = await db.query<Ligne>(
    `insert into worker.employeurs (nom_canonique, nom_affiche, site_carriere)
     values ($1, $2, $3)
     on conflict (nom_canonique) do update
       set site_carriere = coalesce(worker.employeurs.site_carriere, excluded.site_carriere)
     returning *`,
    [canonique, nomAffiche, siteCarriere ?? null],
  )
  const l = rows[0]
  if (l === undefined) throw new Error('enregistrement impossible')
  return versEmployeur(l)
}

/**
 * JOB-026 — tente de promouvoir un employeur au palier A en lisant sa page
 * carrière. Ne promeut QUE si un board est réellement publié : une promotion
 * sur un slug deviné ferait afficher les offres d'un homonyme.
 */
export async function promouvoir(
  db: pg.Client | pg.Pool,
  nomAffiche: string,
  htmlPageCarriere: string,
): Promise<{ promu: boolean; board: Board | null }> {
  const board = detecterBoard(htmlPageCarriere)
  if (board === null) return { promu: false, board: null }

  const canonique = canoniserEmployeur(nomAffiche)
  const { rowCount } = await db.query(
    `update worker.employeurs
        set ats_fournisseur = $2, ats_slug = $3, palier = 'a'
      where nom_canonique = $1
        -- On ne rétrograde jamais et on ne réécrit pas un board déjà résolu :
        -- une page carrière refaite pourrait pointer ailleurs le temps d'un
        -- déploiement, et on perdrait une source qui marchait.
        and (ats_slug is null or ats_slug = $3)`,
    [canonique, board.fournisseur, board.slug],
  )
  return { promu: (rowCount ?? 0) > 0, board }
}

/**
 * Les employeurs à relever maintenant, les plus attendus d'abord.
 *
 * L'ordre est : jamais relevés, puis les plus anciens, à priorité de suivi
 * égale. Un employeur que personne ne suit n'est pas relevé du tout — c'est ce
 * qui fait que le coût suit les employeurs suivis, pas les inscrits.
 */
export async function aRelever(
  db: pg.Client | pg.Pool,
  options: { palier?: 'a' | 'b'; ageMinimumSecondes?: number; limite?: number } = {},
): Promise<readonly EmployeurRegistre[]> {
  const { rows } = await db.query<Ligne>(
    `select * from worker.employeurs
      where palier = coalesce($1, palier)
        and suivi_par > 0
        and (dernier_releve is null or dernier_releve < now() - make_interval(secs => $2))
      order by suivi_par desc, dernier_releve nulls first
      limit $3`,
    [options.palier ?? null, options.ageMinimumSecondes ?? 300, options.limite ?? 50],
  )
  return rows.map(versEmployeur)
}

export async function noterReleve(
  db: pg.Client | pg.Pool,
  nomCanonique: string,
  etat: string,
): Promise<void> {
  await db.query(
    'update worker.employeurs set dernier_releve = now(), dernier_etat = $2 where nom_canonique = $1',
    [nomCanonique, etat],
  )
}
