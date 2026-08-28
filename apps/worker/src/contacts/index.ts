/**
 * REQ-016 — « L'envoi part de la boîte du candidat, après son approbation
 * explicite, message par message. Aucun envoi automatique, aucune relance
 * automatique, aucun envoi groupé — LA FONCTION D'ENVOI N'EXISTE SIMPLEMENT
 * PAS CÔTÉ SERVEUR AU MVP. »
 *
 * Ce module identifie, qualifie et conserve. Il n'expédie rien, et il n'expose
 * rien qui expédie : `etancheite.test.ts` le vérifie sur le code plutôt que sur
 * l'intention.
 *
 * La distinction avec l'envoi autonome de l'ADR-0003 est nette et vaut d'être
 * dite : là-bas, le produit écrit à une ADRESSE DE CANDIDATURE publiée par
 * l'employeur ; ici, il s'agirait d'écrire à une PERSONNE, parfois à une
 * adresse devinée. Le second geste engage bien davantage.
 */
export { evaluer, annoncer, utilisablesCommeDestination, CERTITUDE_MAX } from './certitude.ts'
export type { Certitude, Contact, Signal, SourceContact } from './certitude.ts'
export { deviner, decouper, normaliser, MOTIFS } from './motif.ts'
export type { Personne } from './motif.ts'
export {
  empreinteOpposition, enregistrerOpposition, retirerLesOpposes, purgerContactsExpires,
} from './opposition.ts'
export type { Origine } from './opposition.ts'
export { deposer, lireContacts, sourcesServeurPour } from './depot.ts'
