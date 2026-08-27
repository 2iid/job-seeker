import type { Verdict } from './limiter.ts'

/**
 * Une seule phrase, pour tous les refus.
 *
 * F10 dit que `/auth/lien` répond identiquement que l'adresse existe ou non.
 * Poser une limitation PAR ADRESSE au-dessus recrée l'oracle par la fenêtre :
 * si le refus disait « trop de demandes pour cette adresse » quand elle existe
 * et « trop de demandes depuis cette machine » sinon, il suffirait de lire le
 * message pour savoir qui cherche un emploi.
 *
 * Donc : le message ne nomme jamais la portée qui a refusé, ni si c'était un
 * dépassement ou une panne. La portée part au journal, où seul l'exploitant la
 * lit. `Retry-After` révèle une durée — jamais laquelle des deux fenêtres.
 */
export const MESSAGE_UNIFORME = 'Trop de demandes. Réessayez dans un moment.'

export function reponseTropDeRequetes(v: Extract<Verdict, { autorise: false }>): Response {
  return new Response(JSON.stringify({ erreur: MESSAGE_UNIFORME }), {
    status: 429,
    headers: {
      'content-type': 'application/json',
      'retry-after': String(v.reessayerDans),
      // Une réponse de limitation ne doit jamais être resservie par un cache
      // partagé à quelqu'un d'autre.
      'cache-control': 'no-store',
    },
  })
}
