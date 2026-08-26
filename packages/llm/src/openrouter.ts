import { readOptionalSecret } from '@job-seeker/env'
import { ErreurFournisseur, categoriser, type Demande, type Fournisseur, type Reponse } from './types.ts'

/**
 * Le fournisseur de SECOURS.
 *
 * OpenRouter n'a pas de SDK Anthropic : on parle à son API REST, ce qui est
 * l'usage correct — ce n'est pas un adaptateur pour joindre Anthropic, c'est un
 * autre fournisseur avec sa propre interface.
 *
 * Il n'existe que si la clé est renseignée. Sans elle, le produit fonctionne :
 * il n'a simplement pas de filet.
 */

const URL_API = 'https://openrouter.ai/api/v1/chat/completions'

/** Le même modèle, servi par un autre chemin — la bascule ne change pas la qualité. */
export const MODELE_SECOURS = 'anthropic/claude-opus-4.1'

type ReponseOpenRouter = {
  model?: string
  choices?: { message?: { content?: string }; finish_reason?: string }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { message?: string; code?: number }
}

export function fournisseurOpenRouter(
  options: { cle?: string; fetch?: typeof globalThis.fetch; modele?: string } = {},
): Fournisseur {
  const cle = options.cle ?? readOptionalSecret('OPENROUTER_API_KEY')
  const f = options.fetch ?? globalThis.fetch
  const modele = options.modele ?? MODELE_SECOURS

  return {
    nom: 'openrouter',
    disponible: cle !== undefined,

    async completer(d: Demande): Promise<Reponse> {
      if (cle === undefined) throw new ErreurFournisseur('openrouter', 'auth', 'aucune clé')

      let reponse: Response
      try {
        reponse = await f(URL_API, {
          method: 'POST',
          signal: AbortSignal.timeout(120_000),
          headers: {
            authorization: `Bearer ${cle}`,
            'content-type': 'application/json',
            // OpenRouter demande d'identifier l'application appelante.
            'x-title': 'job-seeker',
          },
          body: JSON.stringify({
            model: modele,
            max_tokens: d.maxTokens,
            messages: [
              { role: 'system', content: d.systeme },
              ...d.messages.map((m) => ({ role: m.role, content: m.content })),
            ],
          }),
        })
      } catch (cause) {
        // Réseau ou délai : c'est une panne, donc la bascule a le droit de jouer.
        throw new ErreurFournisseur(
          'openrouter', 'panne', cause instanceof Error ? cause.message : String(cause),
        )
      }

      if (!reponse.ok) {
        throw new ErreurFournisseur(
          'openrouter', categoriser(reponse.status), `HTTP ${reponse.status}`, reponse.status,
        )
      }

      let charge: ReponseOpenRouter
      try {
        charge = (await reponse.json()) as ReponseOpenRouter
      } catch {
        throw new ErreurFournisseur('openrouter', 'panne', 'réponse illisible')
      }

      if (charge.error !== undefined) {
        throw new ErreurFournisseur(
          'openrouter', categoriser(charge.error.code), charge.error.message ?? 'erreur', charge.error.code,
        )
      }

      const choix = charge.choices?.[0]
      const texte = choix?.message?.content ?? ''
      // Un refus reste un refus, quel que soit le chemin qui l'a produit.
      const refus = choix?.finish_reason === 'content_filter'

      return {
        texte: refus ? '' : texte,
        fournisseur: 'openrouter',
        modele: charge.model ?? modele,
        tokensEntree: charge.usage?.prompt_tokens ?? 0,
        tokensSortie: charge.usage?.completion_tokens ?? 0,
        refus,
        ...(refus ? { motifRefus: 'content_filter' } : {}),
      }
    },
  }
}
