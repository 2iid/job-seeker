/**
 * Ce que le NAVIGATEUR a le droit de connaître de ce paquet.
 *
 * L'entrée principale tire `node:zlib` (lecture d'un .docx) et pdf.js : rien de
 * tout cela n'a sa place dans un bundle client, et le build échoue — c'est un
 * bon échec, mieux vaut qu'il tombe ici qu'à l'exécution.
 *
 * Cette porte n'existe donc pas pour « alléger » : elle existe pour que la
 * frontière entre ce qui LIT un fichier et ce qui l'AFFICHE soit posée dans la
 * structure du paquet plutôt que dans la discipline de celui qui l'importe.
 * Les valeurs partagées — le plafond, les types MIME, les messages de refus —
 * restent en un seul exemplaire des deux côtés.
 */

export { MIME, PLAFOND_OCTETS } from './type-fichier.ts'
export type { Refus, TypeFichier, Verdict } from './type-fichier.ts'
export { messageDeRefus } from './messages.ts'
export type { Locale } from './messages.ts'
export type { Champ, Confiance, ExperienceProposee, Proposition } from './extraction.ts'
export { afficherDate } from './dates.ts'
export type { DateCv, Precision } from './dates.ts'
