import { creerJournal, enregistrerUsage, type Journal } from '@job-seeker/observability'
import { ErreurFournisseur, type Demande, type Fournisseur, type Reponse } from './types.ts'

/**
 * La bascule.
 *
 * Elle essaie les fournisseurs dans l'ordre et s'arrête au premier qui répond.
 * Trois cas ne déclenchent JAMAIS de bascule, et chacun pour une raison
 * différente :
 *
 *  - un REFUS du modèle : c'est une réponse, pas une panne. Aller chercher un
 *    autre fournisseur reviendrait à contourner une décision.
 *  - une DEMANDE INVALIDE : la rejouer ailleurs brûlerait le second fournisseur
 *    pour la même erreur, et masquerait le vrai bug.
 *  - une AUTH refusée : la clé du premier est mauvaise ; celle du second l'est
 *    peut-être aussi, mais surtout ce n'est pas une panne à contourner en
 *    silence — il faut qu'on l'apprenne.
 */

export type ResultatBascule = Reponse & { readonly essais: readonly string[] }

const TARIFS: Record<string, { inputEurParMillion: number; outputEurParMillion: number }> = {
  // Tarifs saisis à la main, jamais relevés sur le web : ils doivent rester
  // auditables et ne pas changer sous nos pieds. À corriger quand ils bougent.
  'claude-opus-5': { inputEurParMillion: 4.6, outputEurParMillion: 23 },
}

export function creerBascule(
  fournisseurs: readonly Fournisseur[],
  journal: Journal = creerJournal({ runtime: 'worker' }),
): { completer: (d: Demande) => Promise<ResultatBascule> } {
  const utilisables = fournisseurs.filter((f) => f.disponible)

  return {
    async completer(d: Demande): Promise<ResultatBascule> {
      if (utilisables.length === 0) {
        throw new Error(
          'Aucun fournisseur de modèle configuré. Renseignez ANTHROPIC_API_KEY, ' +
            'et OPENROUTER_API_KEY si vous voulez une bascule.',
        )
      }

      const essais: string[] = []
      let derniere: unknown

      for (const f of utilisables) {
        essais.push(f.nom)
        try {
          const r = await f.completer(d)
          const tarif = TARIFS[r.modele]
          if (tarif !== undefined) {
            enregistrerUsage(journal, {
              model: r.modele,
              inputTokens: r.tokensEntree,
              outputTokens: r.tokensSortie,
              applicationId: d.imputableA,
            }, tarif)
          }
          // Un refus est une RÉPONSE : on la rend telle quelle et on s'arrête.
          return { ...r, essais }
        } catch (cause) {
          derniere = cause
          const categorie = cause instanceof ErreurFournisseur ? cause.categorie : 'panne'
          journal.erreur('fournisseur en echec', cause, { source: f.nom, state: categorie })

          if (categorie !== 'panne') {
            // Rejouer ailleurs brûlerait le second pour la même raison, et
            // masquerait le vrai problème.
            throw cause
          }
        }
      }

      throw new Error(
        `Tous les fournisseurs ont echoue (${essais.join(', ')}). ` +
          `Derniere cause : ${derniere instanceof Error ? derniere.message : String(derniere)}`,
      )
    },
  }
}
