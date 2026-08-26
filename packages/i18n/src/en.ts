/**
 * The shared vocabulary, in English.
 *
 * The type is `Record<Cle, string>` derived from the French file, so a key
 * added there and forgotten here does not compile. That is the point: a
 * missing translation must be a build failure, not a French word appearing in
 * an English screen three weeks later.
 *
 * English is NOT a word-for-word rendering of the French. Two places where it
 * deliberately differs, because the French sentence would read as a
 * translation:
 *   · « Je vous assiste, je ne postule pas » → "I help you here; I don't apply."
 *   · « Ce n'est pas votre échec » → "That's the market, not you."
 * The product speaks in the first person and must sound like it means it in
 * both languages.
 */

import type { Cle } from './cles.ts'

export const en: Record<Cle, string> = {
  'statut.detectee': 'Spotted',
  'statut.detectee.sens': 'I’ve seen it. I haven’t judged it yet.',
  'statut.en-file': 'Queued — your call',
  'statut.en-file.sens': 'Ready. Nothing has been sent. I’m waiting.',
  'statut.escalade': 'Handing back to you',
  'statut.escalade.sens': 'The form stopped me. Here’s where, and why.',
  'statut.envoyee': 'Sent',
  'statut.envoyee.sens': 'Gone, with a timestamped receipt.',
  'statut.consultee': 'Opened',
  'statut.consultee.sens': 'Someone opened your application.',
  'statut.entretien': 'Interview',
  'statut.entretien.sens': 'A meeting is booked. I’m preparing your brief.',
  'statut.sans-reponse': 'No reply',
  'statut.sans-reponse.sens': 'The market didn’t answer. That’s the market, not you.',
  'statut.echec-technique': 'Technical failure',
  'statut.echec-technique.sens': 'The send didn’t go through. Here’s what, why, and what to do.',

  'palier.a': 'Tier A',
  'palier.a.promesse': 'You’re among the first applications in.',
  'palier.a.releve': 'The company’s own board, checked every 2 to 5 minutes.',
  'palier.b': 'Tier B',
  'palier.b.promesse': 'Posted earlier — I can’t say how much earlier.',
  'palier.b.releve': 'An aggregator, checked every 15 to 60 minutes.',
  'palier.c': 'Tier C',
  'palier.c.promesse': 'I help you here; I don’t apply.',
  'palier.c.releve': 'A platform I can’t browse.',
  'fraicheur.sans-releve': 'not checked',
  'fraicheur.a-l-instant': 'just now',
  'fraicheur.minutes': '{n} min ago',
  'fraicheur.heures': '{n} h ago',
  'fraicheur.jours': '{n} d ago',
  'fraicheur.vue': 'seen {age}',

  'score.titre': 'Match {valeur} out of 100',
  'score.deplier': 'See what I based this on',
  'score.replier': 'Hide the detail',
  'score.correspondances': 'What matches',
  'score.manques': 'What’s missing',
  'score.aucune-preuve': 'I couldn’t quote anything from the posting to back this score.',
  'score.citations-rejetees': '{n} quote(s) dropped: not found in the posting.',
  'score.exclue': 'You asked me not to show you this one.',
  'score.bloquants': 'Why I won’t apply on my own',

  'approbation.titre': 'Ready to go — waiting for your call',
  'approbation.envoyer': 'Send',
  'approbation.refuser': 'Don’t send',
  'approbation.modifier': 'Edit before sending',
  'approbation.rien-parti': 'Nothing has been sent. I only send once you say so.',
  'approbation.annulable': 'You can undo for {n} s after sending.',

  'agent.ligne-de-vie': 'What I’ve done',
  'agent.en-veille': 'Watching',
  'agent.au-travail': 'Working',
  'agent.arrete': 'Stopped',
  'agent.arrete.sens': 'I’m not searching, and I’m not sending anything.',
  'agent.rien-a-montrer': 'Nothing since {age}. That’s not a fault — the market is quiet.',

  'commun.chargement': 'Loading',
  'commun.reessayer': 'Try again',
  'commun.fermer': 'Close',
  'commun.annuler': 'Cancel',
  'commun.et-n-autres': 'and {n} more',
}
