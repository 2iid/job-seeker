/**
 * JOB-090 — ce que l'agent a réellement regardé, lu depuis les offres relevées.
 *
 * La portée déclarée d'un connecteur (`pays: 'monde'`) est une affirmation du
 * fournisseur. Ce qu'on a le droit de dire à quelqu'un, c'est ce qu'on a
 * OBSERVÉ — et l'observation vit dans la table `offres`, pas dans une constante.
 *
 * C'est pour ça que cette lecture se fait en base plutôt que depuis le registre
 * de connecteurs : le registre dit ce qu'on espère couvrir, la table dit ce
 * qu'on a rapporté.
 */

import type { Observation } from '@job-seeker/couverture'
import { clientServeur } from '@/lib/supabase/server'

export async function observations(): Promise<readonly Observation[]> {
  const supabase = await clientServeur()
  // Un échantillon suffit pour établir les pays servis par chaque source : on
  // cherche la portée, pas un inventaire.
  const { data } = await supabase
    .from('offres')
    .select('source, palier, pays, teletravail_texte')
    .order('vue_le', { ascending: false })
    .limit(1000)

  type Ligne = { source: string; palier: 'a' | 'b' | 'c'; pays: string | null; teletravail_texte: string | null }
  const parSource = new Map<string, { palier: 'a' | 'b' | 'c'; pays: Set<string>; offres: number }>()

  for (const l of (data ?? []) as Ligne[]) {
    const e = parSource.get(l.source) ?? { palier: l.palier, pays: new Set<string>(), offres: 0 }
    e.offres += 1
    if (l.pays !== null && l.pays !== '') e.pays.add(l.pays.toUpperCase())
    // Le distanciel est une « zone » à part entière : une source qui n'en rend
    // que couvre quelqu'un qui l'accepte, où qu'il soit.
    if (l.teletravail_texte !== null && /distanciel|remote/i.test(l.teletravail_texte)) e.pays.add('REMOTE')
    parSource.set(l.source, e)
  }

  return [...parSource].map(([source, e]) => ({
    source,
    palier: e.palier,
    offres: e.offres,
    paysObserves: [...e.pays],
    // Toutes nos sources actuelles se déclarent mondiales. Le conserver permet
    // à `evaluer` de montrer l'écart plutôt que de le taire.
    paysDeclares: 'monde' as const,
  }))
}
