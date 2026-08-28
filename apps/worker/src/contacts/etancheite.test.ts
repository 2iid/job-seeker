import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * REQ-016 — « la fonction d'envoi n'existe simplement pas côté serveur au
 * MVP », et « l'adresse de destination ne peut jamais provenir du contenu
 * récupéré d'une offre ».
 *
 * Deux interdits, tous deux vérifiés sur le CODE. Le second est la fermeture de
 * F26 : la défense de `destination.ts` ne vaut que ce que vaut le module qui
 * construit ses sources, et c'est celui-ci.
 */
const RACINE = new URL('.', import.meta.url).pathname

function sources(): string[] {
  return readdirSync(RACINE)
    .filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
    .map((f) => join(RACINE, f))
}

describe('la fonction d’envoi n’existe pas dans ce module', () => {
  it('aucune source ne sait parler à un serveur de messagerie', () => {
    // Une relance automatique ou un envoi groupé demanderaient un transport.
    // Il n'y en a pas — et un `import` en ajouterait un visiblement.
    for (const f of sources()) {
      const t = readFileSync(f, 'utf8').toLowerCase()
      for (const transport of ['nodemailer', 'smtp', 'sendgrid', 'mailgun', 'postmark', 'resend'])
        expect(t, `${f.slice(RACINE.length)} mentionne ${transport}`).not.toContain(transport)
    }
  })

  it('aucune source ne sait parler au réseau du tout', () => {
    for (const f of sources()) {
      const t = readFileSync(f, 'utf8')
      for (const acces of ['fetch(', 'axios', 'undici', 'node:http', 'playwright'])
        expect(t, `${f.slice(RACINE.length)} : ${acces}`).not.toContain(acces)
    }
  })

  it('rien de ce qui est exporté ne ressemble à un envoi', () => {
    const index = readFileSync(join(RACINE, 'index.ts'), 'utf8')
    for (const verbe of ['envoyer', 'expedier', 'relancer', 'sendMail', 'envoiGroupe'])
      expect(index.toLowerCase(), verbe).not.toContain(verbe.toLowerCase())
  })

  it('le test regarde bien quelque chose', () => {
    expect(sources().length).toBeGreaterThan(3)
  })
})

describe('F26 — une adresse ne peut pas venir du texte d’une annonce', () => {
  it('aucune source ne lit un champ de corps d’annonce', () => {
    // Même sceau que `apps/worker/src/envoi`. `titre` reste permis — il ne
    // porte pas d'adresse et sert à composer des phrases —, `description` non.
    const CORPS = /\b(texteComplet|texteOffre|descriptionOffre|contenuAnnonce|description)\b/
    const coupables = sources().filter((f) => CORPS.test(readFileSync(f, 'utf8')))
    expect(coupables.map((f) => f.slice(RACINE.length))).toEqual([])
  })

  it('l’énumération des sources ne contient rien de récupéré', () => {
    const c = readFileSync(join(RACINE, 'certitude.ts'), 'utf8')
    const bloc = /export type SourceContact =[\s\S]*?\n\n/.exec(c)?.[0] ?? ''
    expect(bloc.length).toBeGreaterThan(50)
    for (const mot of ['offre', 'annonce', 'description', 'scrap'])
      expect(bloc.toLowerCase(), mot).not.toContain(mot)
  })

  it('le domaine sur lequel on devine vient du REGISTRE, pas de l’annonce', () => {
    // Le paramètre s'appelle `domaineVerifie` pour que l'appelant remarque ce
    // qu'il affirme en le passant. Le renommer en `domaine` ferait disparaître
    // l'avertissement sans rien changer au type.
    const m = readFileSync(join(RACINE, 'motif.ts'), 'utf8')
    expect(m).toContain('domaineVerifie')
  })
})
