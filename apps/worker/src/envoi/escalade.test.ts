import { describe, expect, it } from 'vitest'
import {
  champsBloquants, detecterAntiRobot, escaladeAntiRobot, escaladeChampInconnu,
  escaladePlateforme, escaladeQuestion, escaladeReessaisEpuises, type Champ,
} from './escalade.ts'

describe('détecter un dispositif anti-robot', () => {
  const AVEC = [
    ['reCAPTCHA v2', '<script src="https://www.google.com/recaptcha/api.js"></script>'],
    ['reCAPTCHA champ', '<textarea name="g-recaptcha-response"></textarea>'],
    ['hCaptcha', '<script src="https://js.hcaptcha.com/1/api.js"></script>'],
    ['hCaptcha champ', '<input name="h-captcha-response">'],
    ['Turnstile', '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>'],
    ['Turnstile champ', '<input name="cf-turnstile-response">'],
    ['DataDome', '<script src="https://dd.captcha-delivery.com/x.js"></script>'],
    ['Incapsula', '<script src="/_Incapsula_Resource?SWJIYLWA=1"></script>'],
    ['PerimeterX', '<script src="https://client.perfdrive.com/px.js"></script>'],
    ['Arkose', '<script src="https://client-api.arkoselabs.com/v2/api.js"></script>'],
  ] as const

  it.each(AVEC)('reconnaît %s', (_nom, html) => {
    expect(detecterAntiRobot(html).present).toBe(true)
  })

  it('NE se déclenche PAS sur une simple MENTION du mot', () => {
    // Une page de politique de confidentialité qui explique « nous utilisons
    // reCAPTCHA » n'est pas une page protégée par reCAPTCHA. Le faux positif
    // coûte une escalade inutile, donc on cherche le widget, pas le mot.
    const politique =
      '<p>Ce site utilise reCAPTCHA et hCaptcha pour certaines pages. ' +
      'Consultez notre politique sur les captcha et le turnstile.</p>'
    expect(detecterAntiRobot(politique).present).toBe(false)
  })

  it('nomme le dispositif — pour le journal, pas pour choisir une stratégie', () => {
    const d = detecterAntiRobot('<div class="g-recaptcha" data-sitekey="x"></div>')
    expect(d.present).toBe(true)
    if (d.present) expect(d.nom).toBe('reCAPTCHA')
  })

  it('rend « absent » sur une page ordinaire', () => {
    expect(detecterAntiRobot('<form><input name="email"><button>Postuler</button></form>').present)
      .toBe(false)
  })
})

describe('ce que le produit DIT face à un anti-robot', () => {
  const e = escaladeAntiRobot('reCAPTCHA', 'Northwind Analytics')

  it('affirme le refus comme une décision, pas comme une impuissance', () => {
    expect(e.constat).toMatch(/je ne le franchis pas/i)
    expect(e.constat).not.toMatch(/impossible|je ne peux pas|erreur/i)
  })

  it('ne propose NI contournement NI « réessayez plus tard »', () => {
    // Réessayer ne changerait rien, et le dire ferait attendre pour rien.
    const tout = `${e.constat} ${e.conduite}`.toLowerCase()
    for (const interdit of ['réessay', 'contourn', 'captcha solver', 'automatiquement'])
      expect(tout, interdit).not.toContain(interdit)
  })

  it('dit ce qui EST fait, pas seulement ce qui ne l’est pas', () => {
    expect(e.conduite).toMatch(/dossier est prêt/i)
  })
})

describe('champs inconnus', () => {
  const champ = (o: Partial<Champ>): Champ => ({ etiquette: 'x', requis: true, connu: null, ...o })

  it('un champ FACULTATIF inconnu ne bloque pas', () => {
    // Sinon le produit réveillerait quelqu'un pour un « comment nous avez-vous
    // connus ? ». Le laisser vide est ce qu'un humain ferait.
    expect(champsBloquants([champ({ requis: false })])).toHaveLength(0)
  })

  it('un champ REQUIS et connu ne bloque pas', () => {
    expect(champsBloquants([champ({ connu: 'email' })])).toHaveLength(0)
  })

  it('un champ REQUIS et inconnu bloque', () => {
    expect(champsBloquants([champ({ etiquette: 'Numéro RPPS' })])).toHaveLength(1)
  })

  it('l’escalade NOMME les champs plutôt que d’en donner le nombre', () => {
    const e = escaladeChampInconnu(
      [champ({ etiquette: 'Numéro RPPS' }), champ({ etiquette: 'Matricule interne' })],
      'Clinique du Parc',
    )
    expect(e.constat).toContain('Numéro RPPS')
    expect(e.constat).toContain('Matricule interne')
  })

  it('promet de RETENIR la réponse — sinon on redemande à chaque offre', () => {
    const e = escaladeChampInconnu([champ({ etiquette: 'Numéro RPPS' })], 'Clinique du Parc')
    expect(e.conduite).toMatch(/retiendrai/i)
    expect(e.conduite).toMatch(/préfère vous déranger une fois/i)
  })

  it('accorde en nombre au singulier comme au pluriel', () => {
    expect(escaladeChampInconnu([champ({ etiquette: 'A' })], 'X').constat).toContain('un champ')
    expect(escaladeChampInconnu([champ({ etiquette: 'A' }), champ({ etiquette: 'B' })], 'X').constat)
      .toContain('des champs')
  })
})

describe('questions de screening', () => {
  it('distingue « je ne comprends pas » de « vous ne l’avez pas relue »', () => {
    // Deux problèmes différents, deux gestes différents. Les confondre ferait
    // réécrire une réponse qui existe déjà.
    const inconnue = escaladeQuestion('Quel est votre matricule ?', false, 'X')
    const nonValidee = escaladeQuestion('Prétentions salariales ?', true, 'X')
    expect(inconnue.motif).toBe('question-non-reconnue')
    expect(nonValidee.motif).toBe('reponse-non-validee')
    expect(nonValidee.constat).toMatch(/jamais relue/i)
  })
})

describe('plateforme illisible et réessais épuisés', () => {
  it('la plateforme assistée reprend la formule du palier C', () => {
    const e = escaladePlateforme('Taleo', 'Fondation Clairval')
    expect(e.conduite).toMatch(/je vous assiste, je ne postule pas/i)
  })

  it('les réessais épuisés ne recopient PAS l’erreur technique dans le constat', () => {
    // Elle ne dit rien à qui la lit, et elle peut contenir une URL interne ou
    // un jeton. Elle va au journal, pas à l'écran.
    const e = escaladeReessaisEpuises('Vireo', 5, 'ECONNRESET https://interne.vireo/x?token=abcd')
    expect(e.constat).not.toContain('token')
    expect(e.constat).not.toContain('ECONNRESET')
    expect(e.detail).toContain('ECONNRESET')
    expect(e.constat).toContain('5 tentatives')
  })

  it('déculpabilise : ce n’est pas le fait de la personne', () => {
    expect(escaladeReessaisEpuises('Vireo', 5, 'x').conduite).toMatch(/pas de votre fait/i)
  })
})

describe('toute escalade porte une conduite à tenir', () => {
  it('aucune n’est un constat sec', () => {
    // Un constat sans quoi-faire est une angoisse sans issue — même règle que
    // pour les incidents de JOB-055.
    const toutes = [
      escaladeAntiRobot('reCAPTCHA', 'X'),
      escaladeChampInconnu([{ etiquette: 'A', requis: true, connu: null }], 'X'),
      escaladeQuestion('q', false, 'X'),
      escaladeQuestion('q', true, 'X'),
      escaladePlateforme('Taleo', 'X'),
      escaladeReessaisEpuises('X', 3, 'e'),
    ]
    for (const e of toutes) {
      expect(e.conduite.length, e.motif).toBeGreaterThan(40)
      expect(e.constat.length, e.motif).toBeGreaterThan(30)
    }
  })
})
