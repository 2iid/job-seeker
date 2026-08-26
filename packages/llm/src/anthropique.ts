import Anthropic from '@anthropic-ai/sdk'
import { readOptionalSecret } from '@job-seeker/env'
import { ErreurFournisseur, categoriser, type Demande, type Fournisseur, type Reponse } from './types.ts'

/** Le modèle par défaut du produit. Un seul endroit le nomme. */
export const MODELE = 'claude-opus-5'

export function fournisseurAnthropique(options: { cle?: string; client?: Anthropic } = {}): Fournisseur {
  const cle = options.cle ?? readOptionalSecret('ANTHROPIC_API_KEY')
  const client = options.client ?? (cle === undefined ? undefined : new Anthropic({ apiKey: cle }))

  return {
    nom: 'anthropic',
    disponible: client !== undefined,

    async completer(d: Demande): Promise<Reponse> {
      if (client === undefined) throw new ErreurFournisseur('anthropic', 'auth', 'aucune clé')
      try {
        const r = await client.messages.create({
          model: MODELE,
          max_tokens: d.maxTokens,
          // La pensée adaptative est le mode courant de ce modèle ; l'effort
          // règle la profondeur et donc la dépense.
          thinking: { type: 'adaptive' },
          output_config: { effort: d.effort ?? 'high' },
          system: d.systeme,
          messages: d.messages.map((m) => ({ role: m.role, content: m.content })),
        })

        // Un refus est une RÉPONSE, pas une exception. Le lire avant le contenu
        // évite de traiter un déclin comme du texte utilisable.
        if (r.stop_reason === 'refusal') {
          return {
            texte: '',
            fournisseur: 'anthropic',
            modele: r.model,
            tokensEntree: r.usage.input_tokens,
            tokensSortie: r.usage.output_tokens,
            refus: true,
            motifRefus: r.stop_details?.category ?? 'inconnu',
          }
        }

        const texte = r.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('')

        return {
          texte,
          fournisseur: 'anthropic',
          modele: r.model,
          tokensEntree: r.usage.input_tokens,
          tokensSortie: r.usage.output_tokens,
          refus: false,
        }
      } catch (cause) {
        const statut = cause instanceof Anthropic.APIError ? cause.status : undefined
        throw new ErreurFournisseur(
          'anthropic',
          categoriser(statut),
          cause instanceof Error ? cause.message : String(cause),
          statut,
        )
      }
    },
  }
}
