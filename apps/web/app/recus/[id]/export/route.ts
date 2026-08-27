import { NextResponse } from 'next/server'
import { clientServeur, utilisateurCourant } from '@/lib/supabase/server'
import { nomFichierRecu } from '../../nom-fichier'

type Recu = {
  id: string
  canal: string
  resultat: string
  envoye_le: string
  cv_texte: string
  message_texte: string | null
  cran_au_moment: string
  opportunites: { offres: { titre: string; employeur_affiche: string } } | null
}

/**
 * Un reçu, en texte brut.
 *
 * Le format est celui qu'on peut ouvrir n'importe où et joindre à un courriel.
 * Un PDF serait plus présentable et moins vérifiable : ce fichier existe pour
 * qu'on puisse comparer, pas pour faire joli.
 */
function rendre(r: Recu): string {
  const entete = [
    'REÇU DE CANDIDATURE',
    '',
    `Offre       : ${r.opportunites?.offres.titre ?? '(offre supprimée)'}`,
    `Employeur   : ${r.opportunites?.offres.employeur_affiche ?? '—'}`,
    `Envoyé le   : ${r.envoye_le}`,
    `Canal       : ${r.canal}`,
    `Résultat    : ${r.resultat}`,
    `Réglage     : ${r.cran_au_moment}`,
    `Référence   : ${r.id}`,
    '',
    '--- CV ENVOYÉ ---',
    '',
  ].join('\n')

  const message =
    r.message_texte !== null && r.message_texte.trim() !== ''
      ? `\n\n--- MESSAGE ENVOYÉ ---\n\n${r.message_texte}`
      : ''

  return `${entete}${r.cv_texte}${message}\n`
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const utilisateur = await utilisateurCourant()
  if (utilisateur === null) {
    return new NextResponse(null, { status: 401 })
  }

  const { id } = await ctx.params
  const supabase = await clientServeur()
  const { data } = await supabase
    .from('recus')
    .select(
      'id, canal, resultat, envoye_le, cv_texte, message_texte, cran_au_moment, opportunites(offres(titre, employeur_affiche))',
    )
    .eq('id', id)
    .maybeSingle<Recu>()

  // 404 et non 403 : distinguer « ce reçu n'existe pas » de « ce reçu n'est pas
  // le vôtre » dirait à un inconnu quels identifiants existent.
  if (data === null) return new NextResponse(null, { status: 404 })

  return new NextResponse(rendre(data), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'content-disposition': `attachment; filename="${nomFichierRecu(data.id, data.envoye_le, 'txt')}"`,
      'cache-control': 'no-store',
    },
  })
}
