export { verifierDestination, adresseDe, estVerifiee } from './destination.ts'
export type {
  DestinationVerifiee, Provenance, RefusDestination, ResultatDestination, SourcesServeur,
} from './destination.ts'
export { evaluerDossier, annoncerPrepare } from './dossier.ts'
export type { Dossier, EtatDossier, Piece } from './dossier.ts'
/**
 * `executer` n'est PAS exporté ici, et c'est le point de JOB-051 : il envoie
 * sans réclamer. `traiterEnvoi` est le seul chemin par lequel quelque chose
 * sort — un garde-fou qu'on peut contourner en important l'étage du dessous
 * ne garde rien.
 */
export { PanneAvantEnvoi, IssueIncertaine } from './envoyer.ts'
export { traiterEnvoi } from './traiter.ts'
export type { Travail } from './traiter.ts'
export {
  deciderReprise, normaliserTitre, republicationProbable, FENETRE_REPUBLICATION_JOURS,
} from './idempotence.ts'
export type { EtatReclamation, Reprise } from './idempotence.ts'
export type { Confirmation, Contexte, Issue, Transport } from './envoyer.ts'
export { enregistrer, statutPour } from './enregistrer.ts'
export type { Enregistrement, Statut } from './enregistrer.ts'
