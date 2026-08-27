import { empreinte } from './empreinte.ts'
import type { Politique } from './politique.ts'

export type Compteur = (
  cle: string,
  fenetreSecondes: number,
  plafond: number,
) => Promise<{ compte: number; finFenetre: Date; autorise: boolean }>

export type Cle = { readonly politique: Politique; readonly valeur: string }

export type Verdict =
  | { autorise: true }
  | {
      autorise: false
      /** La portée qui a refusé. Pour le journal, JAMAIS pour la réponse. */
      portee: string
      /** Secondes avant de réessayer. Rendue à l'appelant : c'est de la
       *  correction élémentaire, et cela réduit les rafales de reprise. */
      reessayerDans: number
      /** Vrai quand le refus vient d'une panne et non d'un dépassement. */
      parPanne: boolean
    }

/**
 * Consomme un jeton sur CHAQUE clé, dans l'ORDRE DONNÉ, et s'arrête au premier
 * refus.
 *
 * ── Pourquoi l'ordre est une décision de sécurité, et pas un détail ──
 *
 * Limiter `/auth/lien` sur l'adresse protège la boîte de quelqu'un contre le
 * pilonnage. Mais un plafond bas par adresse est aussi une façon d'EMPÊCHER une
 * personne précise de se connecter : je brûle ses cinq jetons, elle ne reçoit
 * plus de lien. La protection devient l'attaque.
 *
 * D'où le court-circuit : l'IP est évaluée EN PREMIER, et un refus sur l'IP ne
 * consomme PAS le jeton d'adresse. Une seule source ne peut donc pas brûler les
 * quotas de mille personnes — elle épuise son propre quota d'abord.
 *
 * Les appelants passent donc leurs clés du plus « à moi » au plus « à la
 * victime ». Ce n'est pas une convention de style.
 */
export async function limiter(
  cles: readonly Cle[],
  compteur: Compteur,
  sel: string,
): Promise<Verdict> {
  for (const { politique, valeur } of cles) {
    const cle = empreinte(politique.portee, valeur, sel)
    let r: Awaited<ReturnType<Compteur>>
    try {
      r = await compteur(cle, politique.fenetreSecondes, politique.plafond)
    } catch {
      // Le magasin est injoignable. `siIndisponible` a déjà tranché, par route
      // et par écrit ; on ne redécide pas ici, dans le `catch`, à chaud.
      if (politique.siIndisponible === 'refuser') {
        return {
          autorise: false,
          portee: politique.portee,
          reessayerDans: 30,
          parPanne: true,
        }
      }
      continue
    }
    if (!r.autorise) {
      const dans = Math.max(1, Math.ceil((r.finFenetre.getTime() - Date.now()) / 1000))
      return { autorise: false, portee: politique.portee, reessayerDans: dans, parPanne: false }
    }
  }
  return { autorise: true }
}
