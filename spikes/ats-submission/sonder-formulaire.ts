/**
 * JOB-002 — mesurer un formulaire de candidature SANS RIEN ENVOYER.
 *
 * ── La clause qui définit ce fichier ──
 *
 * **Ce harnais ne clique jamais sur un bouton de soumission.** Pas une fois,
 * sur aucun fournisseur, dans aucune circonstance. Vingt vraies candidatures
 * fictives feraient perdre leur temps à vingt recruteurs, et la pointe peut
 * répondre à sa question sans ça.
 *
 * Ce qu'on veut savoir est : **un formulaire de candidature est-il remplissable
 * par une machine ?** Les champs inattendus, les pièces jointes exigées, les
 * questions de screening, les anti-robots et le temps de remplissage se
 * constatent tous AVANT la soumission. Ce qui reste inconnu — ce que le serveur
 * fait d'une soumission bien formée — est étroit, et la conclusion le dira.
 *
 * ── Aucun contournement d'anti-robot ──
 *
 * Quand un dispositif est détecté, on s'arrête et on le consigne. On ne le
 * résout pas, on ne le contourne pas, on ne cherche pas de porte de service.
 * Un produit qui apprend à franchir ces dispositifs se ferme lui-même les
 * portes qu'il veut ouvrir tous les jours.
 */

import type { Browser, Frame, Page } from 'playwright'

/** Les mots qui désignent un bouton d'envoi. On les cherche pour les ÉVITER. */
const MOTS_SOUMISSION = [
  'submit', 'apply', 'send application', 'postuler', 'envoyer',
  'soumettre', 'candidater', 'bewerben', 'solicitar',
]

const ANTI_ROBOT = [
  'recaptcha', 'hcaptcha', 'turnstile', 'datadome', 'perfdrive',
  'px-captcha', 'incapsula', 'arkoselabs', 'funcaptcha',
]

/** Ce qu'on sait remplir depuis un profil canonique. */
const CHAMPS_CONNUS: Readonly<Record<string, RegExp>> = {
  nom: /(^|[^a-z])(first.?name|last.?name|full.?name|nom|pr[ée]nom|name)([^a-z]|$)/i,
  email: /e.?mail|courriel/i,
  telephone: /phone|t[ée]l[ée]phone|mobile/i,
  cv: /resume|cv|curriculum/i,
  lettre: /cover.?letter|lettre|motivation/i,
  linkedin: /linkedin/i,
  localisation: /location|ville|city|adresse|address/i,
  siteweb: /website|portfolio|github|site/i,
}

export type Champ = {
  readonly etiquette: string
  readonly type: string
  readonly requis: boolean
  /** La catégorie qu'on sait remplir, ou `null` — c'est ça, un champ inattendu. */
  readonly connu: string | null
}

export type Resultat = {
  readonly url: string
  readonly fournisseur: string
  readonly etat: 'remplissable' | 'escalade' | 'anti-robot' | 'inatteignable'
  readonly champs: readonly Champ[]
  readonly inattendus: readonly string[]
  readonly piecesJointes: number
  readonly antiRobot: string | null
  readonly boutonSoumission: boolean
  readonly msJusquAuPret: number
  readonly note: string
}

function categoriser(texte: string): string | null {
  for (const [nom, motif] of Object.entries(CHAMPS_CONNUS)) {
    if (motif.test(texte)) return nom
  }
  return null
}

/**
 * Lit les champs de TOUTES les trames, pas seulement de la page parente.
 *
 * Ce détail a failli faire mentir la pointe. La première version n'interrogeait
 * que `page` — et Greenhouse rend son formulaire dans une IFRAME
 * (`job-boards.greenhouse.io/embed/job_app`). On mesurait donc la page
 * carrières de l'employeur, on y trouvait sa barre de recherche, et on
 * concluait « un champ, remplissable ».
 *
 * Le verdict était faux dans la direction la plus flatteuse : il annonçait un
 * formulaire simple là où on n'avait pas regardé le formulaire.
 */
async function lireChamps(page: Page): Promise<Champ[]> {
  const parTrame = await Promise.all(page.frames().map((f) => lireChampsDUneTrame(f)))
  return parTrame.flat()
}

async function lireChampsDUneTrame(page: Frame): Promise<Champ[]> {
  return page.evaluate(() => {
    const sortie: { etiquette: string; type: string; requis: boolean }[] = []
    const vus = new Set<Element>()
    for (const el of document.querySelectorAll('input, textarea, select')) {
      if (vus.has(el)) continue
      vus.add(el)
      const e = el as HTMLInputElement
      const type = (e.getAttribute('type') ?? el.tagName).toLowerCase()
      if (['hidden', 'submit', 'button', 'image'].includes(type)) continue
      // L'étiquette peut venir de trois endroits selon le générateur de
      // formulaire ; aucun n'est majoritaire.
      const parLabel = e.id !== '' ? document.querySelector(`label[for="${e.id}"]`)?.textContent : null
      const etiquette = (
        parLabel ??
        e.getAttribute('aria-label') ??
        e.getAttribute('placeholder') ??
        e.getAttribute('name') ??
        el.closest('label')?.textContent ??
        ''
      ).trim().replace(/\s+/g, ' ').slice(0, 80)
      sortie.push({
        etiquette,
        type,
        requis: e.required || e.getAttribute('aria-required') === 'true',
      })
    }
    return sortie
  }).then((bruts) =>
    bruts
      .filter((c) => c.etiquette !== '')
      .map((c) => ({ ...c, connu: null as string | null })),
  )
}

export async function sonderFormulaire(
  navigateur: Browser,
  cible: { url: string; fournisseur: string },
  options: { delaiMs?: number } = {},
): Promise<Resultat> {
  const debut = Date.now()
  const page = await navigateur.newPage({
    userAgent: 'Mozilla/5.0 (compatible; job-seeker-spike/0.1; mesure sans soumission)',
  })
  const vide = (etat: Resultat['etat'], note: string): Resultat => ({
    url: cible.url, fournisseur: cible.fournisseur, etat, champs: [], inattendus: [],
    piecesJointes: 0, antiRobot: null, boutonSoumission: false,
    msJusquAuPret: Date.now() - debut, note,
  })

  try {
    const r = await page.goto(cible.url, {
      waitUntil: 'domcontentloaded',
      timeout: options.delaiMs ?? 30_000,
    })
    if (r === null || !r.ok()) {
      await page.close()
      return vide('inatteignable', `statut ${r?.status() ?? 'aucun'}`)
    }

    // Les formulaires ATS sont rendus par script : on laisse le réseau se
    // calmer, sinon on mesure un squelette vide et on conclut « aucun champ ».
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // Le contenu de TOUTES les trames : un anti-robot posé dans l'iframe du
    // formulaire ne se voit pas dans la page parente.
    const contenus = await Promise.all(
      page.frames().map((f) => f.content().catch(() => '')),
    )
    const html = contenus.join('\n').toLowerCase()

    const antiRobot = ANTI_ROBOT.find((m) => html.includes(m)) ?? null
    if (antiRobot !== null) {
      // On S'ARRÊTE. On ne le résout pas, on ne le contourne pas. Un produit
      // qui apprend à franchir ces dispositifs se ferme lui-même les portes
      // qu'il veut ouvrir tous les jours.
      await page.close()
      return { ...vide('anti-robot', `dispositif détecté : ${antiRobot}`), antiRobot }
    }

    const bruts = await lireChamps(page)
    const champs: Champ[] = bruts.map((c) => ({ ...c, connu: categoriser(`${c.etiquette} ${c.type}`) }))
    const inattendus = champs.filter((c) => c.connu === null && c.requis).map((c) => c.etiquette)
    const piecesJointes = champs.filter((c) => c.type === 'file').length

    // On CHERCHE le bouton de soumission uniquement pour constater qu'il
    // existe. Il n'est jamais cliqué : ce fichier n'appelle `click()` nulle
    // part, et un test le vérifie sur le code plutôt que sur la mémoire de
    // celui qui l'exécute.
    const parTrame = await Promise.all(
      page.frames().map((f) =>
        f.evaluate((mots) => {
          for (const b of document.querySelectorAll('button, input[type="submit"]')) {
            const t = (b.textContent ?? (b as HTMLInputElement).value ?? '').toLowerCase()
            if (mots.some((m) => t.includes(m))) return true
          }
          return false
        }, MOTS_SOUMISSION).catch(() => false),
      ),
    )
    const boutonSoumission = parTrame.some(Boolean)

    await page.close()

    const etat: Resultat['etat'] =
      champs.length === 0 ? 'escalade'
      : inattendus.length > 0 ? 'escalade'
      : 'remplissable'

    return {
      url: cible.url, fournisseur: cible.fournisseur, etat, champs, inattendus,
      piecesJointes, antiRobot: null, boutonSoumission,
      msJusquAuPret: Date.now() - debut,
      note:
        champs.length === 0 ? 'aucun champ lisible — formulaire probablement derrière une navigation'
        : inattendus.length > 0 ? `${inattendus.length} champ(s) requis non prévus`
        : '',
    }
  } catch (e) {
    await page.close().catch(() => {})
    return vide('inatteignable', e instanceof Error ? e.message.slice(0, 90) : 'erreur')
  }
}
