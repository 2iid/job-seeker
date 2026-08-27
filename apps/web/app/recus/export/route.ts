import { NextResponse } from 'next/server'
import { clientServeur, utilisateurCourant } from '@/lib/supabase/server'
import { nomFichierLot } from '../nom-fichier'

/**
 * L'ensemble des reçus, en JSON.
 *
 * REQ-014 demande un export « lisible par une machine » ; REQ-013 demande que
 * le reçu soit exportable. Le LOT est donc en JSON — on l'emporte pour le
 * garder ou le traiter — tandis qu'un reçu isolé est en texte, parce qu'on
 * l'ouvre pour le LIRE, ou pour le montrer à quelqu'un.
 */
export async function GET() {
  const utilisateur = await utilisateurCourant()
  if (utilisateur === null) {
    // 401, et non une redirection vers la connexion. Une redirection est
    // confortable pour un humain et trompeuse pour un script : `curl -L` la
    // suit et enregistre une page HTML sous le nom d'un fichier de reçus. Ce
    // n'est pas une page, c'est un téléchargement — il refuse ou il rend.
    return new NextResponse(null, { status: 401 })
  }

  const supabase = await clientServeur()
  // Le client de SESSION, donc la RLS. Une clé de service ici rendrait cette
  // route capable d'exporter les reçus de n'importe qui, au service d'un
  // besoin qui n'en a aucunement l'usage.
  const { data, error } = await supabase
    .from('recus')
    .select('id, canal, resultat, envoye_le, cv_texte, message_texte, cran_au_moment, opportunite_id')
    .order('envoye_le', { ascending: false })

  if (error !== null) {
    return NextResponse.json({ erreur: 'Export indisponible pour le moment.' }, { status: 503 })
  }

  return new NextResponse(JSON.stringify({ exporte_le: new Date().toISOString(), recus: data }, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${nomFichierLot(new Date())}"`,
      'cache-control': 'no-store',
    },
  })
}
